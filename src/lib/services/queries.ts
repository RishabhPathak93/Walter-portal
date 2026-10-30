import "server-only";
import { cache } from "react";
import { getSupabasePublic } from "@/lib/supabase/public";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CompetitionPublic,
  LeaderboardEntry,
  MySolve,
  MyStanding,
  MySubmission,
  PublicChallenge,
  PublicStats,
  ScoringRule,
} from "@/lib/types";

/**
 * Read models. Public data is read with the publishable (anon) key through
 * narrowly-scoped SECURITY DEFINER functions. Personal data is read with the
 * participant's own session so Row Level Security applies.
 */

class QueryError extends Error {}

function fail(context: string, message: string): never {
  console.error(`[query:${context}]`, message);
  throw new QueryError(`Failed to load ${context}`);
}

type CompetitionRow = {
  name: string;
  tagline: string;
  description: string;
  start_at: string | null;
  end_at: string | null;
  state: CompetitionPublic["state"];
  registration_open: boolean;
  challenges_visible: boolean;
  default_points: number;
  server_time: string;
};

export const getCompetition = cache(async (): Promise<CompetitionPublic> => {
  const { data, error } = await getSupabasePublic().rpc("get_competition_public");
  if (error) fail("competition", error.message);
  const row = (data as CompetitionRow[] | null)?.[0];
  if (!row) fail("competition", "settings row missing");
  return {
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    state: row.state,
    registrationOpen: row.registration_open,
    challengesVisible: row.challenges_visible,
    defaultPoints: Number(row.default_points ?? 0),
    serverTime: row.server_time,
  };
});

export const getPublicStats = cache(async (): Promise<PublicStats> => {
  const { data, error } = await getSupabasePublic().rpc("get_public_stats");
  if (error) fail("stats", error.message);
  const row = (data as { participants: number; active_challenges: number; accepted_solves: number }[] | null)?.[0];
  return {
    participants: Number(row?.participants ?? 0),
    activeChallenges: Number(row?.active_challenges ?? 0),
    acceptedSolves: Number(row?.accepted_solves ?? 0),
  };
});

export const getScoringRules = cache(async (): Promise<{ rules: ScoringRule[] }> => {
  const { data, error } = await getSupabasePublic().rpc("get_scoring_public");
  if (error) fail("scoring", error.message);
  const rules = ((data as { solve_position: number; points: number }[] | null) ?? []).map((r) => ({
    position: Number(r.solve_position),
    points: Number(r.points),
  }));
  return { rules };
});

type ChallengeRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: PublicChallenge["difficulty"];
  solve_count: number;
  next_points: number;
  created_at: string;
};

export const getPublicChallenges = cache(async (): Promise<PublicChallenge[]> => {
  const { data, error } = await getSupabasePublic().rpc("get_public_challenges");
  if (error) fail("challenges", error.message);
  return ((data as ChallengeRow[] | null) ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    category: c.category,
    difficulty: c.difficulty,
    solveCount: Number(c.solve_count),
    nextPoints: Number(c.next_points),
    createdAt: c.created_at,
  }));
});

type LeaderboardRow = {
  rank: number;
  username: string;
  solved_count: number;
  score: number;
  last_solve_at: string | null;
  score_reached_at: string | null;
};

export async function getLeaderboard(limit = 100, offset = 0): Promise<LeaderboardEntry[]> {
  const { data, error } = await getSupabasePublic().rpc("get_leaderboard", { p_limit: limit, p_offset: offset });
  if (error) fail("leaderboard", error.message);
  return ((data as LeaderboardRow[] | null) ?? []).map((r) => ({
    rank: Number(r.rank),
    username: r.username,
    solvedCount: Number(r.solved_count),
    score: Number(r.score),
    lastSolveAt: r.last_solve_at,
    scoreReachedAt: r.score_reached_at,
  }));
}

export async function getMyStanding(): Promise<MyStanding | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_standing");
  if (error) fail("standing", error.message);
  const row = (data as (LeaderboardRow & { total_ranked: number })[] | null)?.[0];
  if (!row) return null;
  return {
    rank: Number(row.rank),
    username: row.username,
    solvedCount: Number(row.solved_count),
    score: Number(row.score),
    lastSolveAt: row.last_solve_at,
    totalRanked: Number(row.total_ranked),
  };
}

/** Titles/slugs of all challenges (not secret) for labelling personal history. */
const getChallengeLabels = cache(async () => {
  const { data, error } = await getSupabaseAdmin().from("challenges").select("id, slug, title, category");
  if (error) fail("challenge labels", error.message);
  return new Map((data ?? []).map((c) => [c.id as string, c as { id: string; slug: string; title: string; category: string }]));
});

export async function getMySolves(): Promise<MySolve[]> {
  const supabase = await createSupabaseServerClient();
  // RLS restricts this to the signed-in participant's own rows.
  const { data, error } = await supabase
    .from("solves")
    .select("challenge_id, position, points, solved_at")
    .order("solved_at", { ascending: false });
  if (error) fail("my solves", error.message);
  const labels = await getChallengeLabels();
  return (data ?? []).map((s) => {
    const c = labels.get(s.challenge_id as string);
    return {
      challengeId: s.challenge_id as string,
      slug: c?.slug ?? null,
      title: c?.title ?? null,
      category: c?.category ?? null,
      position: Number(s.position),
      points: Number(s.points),
      solvedAt: s.solved_at as string,
    };
  });
}

export async function getMySubmissions(page: number, pageSize: number, challengeId?: string) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * pageSize;
  let query = supabase
    .from("submissions")
    .select("id, challenge_id, outcome, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (challengeId) query = query.eq("challenge_id", challengeId);
  const { data, error, count } = await query;
  if (error) fail("my submissions", error.message);
  const labels = await getChallengeLabels();
  const items: MySubmission[] = (data ?? []).map((s) => {
    const c = labels.get(s.challenge_id as string);
    return {
      id: Number(s.id),
      challengeId: s.challenge_id as string,
      slug: c?.slug ?? null,
      title: c?.title ?? null,
      outcome: s.outcome as MySubmission["outcome"],
      createdAt: s.created_at as string,
    };
  });
  return { items, total: count ?? 0, page, pageSize };
}

export async function getMyScoreAdjustments() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("score_adjustments")
    .select("id, points, reason, created_at")
    .order("created_at", { ascending: false });
  if (error) fail("my adjustments", error.message);
  return (data ?? []).map((a) => ({
    id: Number(a.id),
    points: Number(a.points),
    reason: a.reason as string,
    createdAt: a.created_at as string,
  }));
}

/** Single challenge by slug (only if publicly visible). */
export async function getPublicChallenge(slug: string): Promise<PublicChallenge | null> {
  const list = await getPublicChallenges();
  return list.find((c) => c.slug === slug) ?? null;
}
