import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeFlagDigest } from "@/lib/flags";
import type { DbError } from "@/lib/services/rpc";

/**
 * Administrative operations. Every function receives the *verified* actor id
 * (from requireAdmin / the admin layout). Mutations run inside SECURITY DEFINER
 * database functions that re-check the actor's admin role and write the audit
 * log in the same transaction.
 */

export class AdminDbError extends Error {
  constructor(public readonly db: DbError) {
    super(db.message);
  }
}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new AdminDbError({ message: res.error.message, code: res.error.code });
  return res.data;
}

const db = () => getSupabaseAdmin();

// ---------------------------------------------------------------- overview
export async function getAdminOverview() {
  const [participants, challenges, activeChallenges, solves, attempts, incorrect, recent] = await Promise.all([
    db().from("profiles").select("id", { count: "exact", head: true }),
    db().from("challenges").select("id", { count: "exact", head: true }),
    db().from("challenges").select("id", { count: "exact", head: true }).eq("is_active", true),
    db().from("solves").select("id", { count: "exact", head: true }),
    db().from("submissions").select("id", { count: "exact", head: true }),
    db().from("submissions").select("id", { count: "exact", head: true }).eq("outcome", "incorrect"),
    db()
      .from("solves")
      .select("id, position, points, solved_at, profiles(username), challenges(slug, title)")
      .order("solved_at", { ascending: false })
      .limit(10),
  ]);
  for (const r of [participants, challenges, activeChallenges, solves, attempts, incorrect, recent]) {
    if (r.error) throw new AdminDbError({ message: r.error.message, code: r.error.code });
  }
  return {
    participants: participants.count ?? 0,
    challenges: challenges.count ?? 0,
    activeChallenges: activeChallenges.count ?? 0,
    acceptedSolves: solves.count ?? 0,
    totalAttempts: attempts.count ?? 0,
    incorrectAttempts: incorrect.count ?? 0,
    recentSolves: (recent.data ?? []).map((s) => normalizeSolveRow(s as unknown as RawSolveRow)),
  };
}

// --------------------------------------------------------------- challenges
export type AdminChallenge = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  hasFlag: boolean;
  solveCount: number;
  attemptCount: number;
  incorrectCount: number;
};

export async function listChallenges(actor: string): Promise<AdminChallenge[]> {
  const rows = check(await db().rpc("admin_list_challenges", { p_actor: actor })) as Record<string, unknown>[] | null;
  return (rows ?? []).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    description: r.description as string,
    category: r.category as string,
    difficulty: r.difficulty as string,
    isActive: Boolean(r.is_active),
    sortOrder: Number(r.sort_order),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    hasFlag: Boolean(r.has_flag),
    solveCount: Number(r.solve_count),
    attemptCount: Number(r.attempt_count),
    incorrectCount: Number(r.incorrect_count),
  }));
}

export async function createChallenge(
  actor: string,
  input: {
    slug: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
    isActive: boolean;
    sortOrder: number;
    flag: string;
  },
) {
  const id = randomUUID();
  const digest = computeFlagDigest(id, input.flag);
  check(
    await db().rpc("admin_create_challenge", {
      p_actor: actor,
      p_id: id,
      p_slug: input.slug,
      p_title: input.title,
      p_description: input.description,
      p_category: input.category,
      p_difficulty: input.difficulty,
      p_is_active: input.isActive,
      p_sort_order: input.sortOrder,
      p_digest: digest,
    }),
  );
  return { id };
}

export async function updateChallenge(
  actor: string,
  id: string,
  patch: Partial<{
    slug: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
    isActive: boolean;
    sortOrder: number;
  }>,
) {
  check(
    await db().rpc("admin_update_challenge", {
      p_actor: actor,
      p_id: id,
      p_slug: patch.slug ?? null,
      p_title: patch.title ?? null,
      p_description: patch.description ?? null,
      p_category: patch.category ?? null,
      p_difficulty: patch.difficulty ?? null,
      p_is_active: patch.isActive ?? null,
      p_sort_order: patch.sortOrder ?? null,
    }),
  );
}

/** The plaintext flag only exists in memory long enough to compute its HMAC. */
export async function setChallengeFlag(actor: string, id: string, flag: string) {
  check(await db().rpc("admin_set_flag", { p_actor: actor, p_id: id, p_digest: computeFlagDigest(id, flag) }));
}

// -------------------------------------------------------------- competition
export type AdminCompetition = {
  name: string;
  tagline: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  isPaused: boolean;
  registrationOpen: boolean;
  hideChallengesBeforeStart: boolean;
  defaultPoints: number;
  rateLimitMaxAttempts: number;
  rateLimitWindowSeconds: number;
  ipRateLimitMaxAttempts: number;
  updatedAt: string;
};

export async function getCompetitionAdmin(): Promise<AdminCompetition> {
  const row = check(await db().from("competition_settings").select("*").eq("id", 1).single()) as Record<string, unknown>;
  return {
    name: row.name as string,
    tagline: row.tagline as string,
    description: row.description as string,
    startAt: (row.start_at as string | null) ?? null,
    endAt: (row.end_at as string | null) ?? null,
    isPaused: Boolean(row.is_paused),
    registrationOpen: Boolean(row.registration_open),
    hideChallengesBeforeStart: Boolean(row.hide_challenges_before_start),
    defaultPoints: Number(row.default_points),
    rateLimitMaxAttempts: Number(row.rate_limit_max_attempts),
    rateLimitWindowSeconds: Number(row.rate_limit_window_seconds),
    ipRateLimitMaxAttempts: Number(row.ip_rate_limit_max_attempts),
    updatedAt: row.updated_at as string,
  };
}

export async function updateCompetition(
  actor: string,
  input: Omit<AdminCompetition, "defaultPoints" | "updatedAt">,
) {
  check(
    await db().rpc("admin_update_competition", {
      p_actor: actor,
      p_name: input.name,
      p_tagline: input.tagline,
      p_description: input.description,
      p_start_at: input.startAt,
      p_end_at: input.endAt,
      p_is_paused: input.isPaused,
      p_registration_open: input.registrationOpen,
      p_hide_challenges_before_start: input.hideChallengesBeforeStart,
      p_rate_limit_max_attempts: input.rateLimitMaxAttempts,
      p_rate_limit_window_seconds: input.rateLimitWindowSeconds,
      p_ip_rate_limit_max_attempts: input.ipRateLimitMaxAttempts,
    }),
  );
}

// ------------------------------------------------------------------ scoring
export async function getScoringAdmin() {
  const [rules, settings] = await Promise.all([
    db().from("scoring_rules").select("position, points").order("position"),
    db().from("competition_settings").select("default_points").eq("id", 1).single(),
  ]);
  const ruleRows = check(rules) as { position: number; points: number }[] | null;
  const s = check(settings) as { default_points: number };
  return {
    rules: (ruleRows ?? []).map((r) => ({ position: Number(r.position), points: Number(r.points) })),
    defaultPoints: Number(s.default_points),
  };
}

export async function updateScoring(
  actor: string,
  input: { rules: { position: number; points: number }[]; defaultPoints: number; recalculate: boolean },
) {
  const result = check(
    await db().rpc("admin_update_scoring", {
      p_actor: actor,
      p_rules: input.rules,
      p_default_points: input.defaultPoints,
      p_recalculate: input.recalculate,
    }),
  ) as { solves_changed: number } | null;
  return { solvesChanged: Number(result?.solves_changed ?? 0) };
}

// ------------------------------------------------------------- participants
export type AdminParticipant = {
  id: string;
  username: string;
  email: string | null;
  isDisabled: boolean;
  disabledReason: string | null;
  isAdmin: boolean;
  createdAt: string;
  solvedCount: number;
  score: number;
  rank: number | null;
  attemptCount: number;
  incorrectCount: number;
  lastSubmissionAt: string | null;
};

export async function listParticipants(actor: string): Promise<AdminParticipant[]> {
  const rows = check(await db().rpc("admin_list_participants", { p_actor: actor })) as Record<string, unknown>[] | null;
  return (rows ?? []).map((r) => ({
    id: r.id as string,
    username: r.username as string,
    email: (r.email as string | null) ?? null,
    isDisabled: Boolean(r.is_disabled),
    disabledReason: (r.disabled_reason as string | null) ?? null,
    isAdmin: Boolean(r.is_admin),
    createdAt: r.created_at as string,
    solvedCount: Number(r.solved_count),
    score: Number(r.score),
    rank: r.rank == null ? null : Number(r.rank),
    attemptCount: Number(r.attempt_count),
    incorrectCount: Number(r.incorrect_count),
    lastSubmissionAt: (r.last_submission_at as string | null) ?? null,
  }));
}

export async function setParticipantDisabled(actor: string, userId: string, disabled: boolean, reason?: string) {
  check(
    await db().rpc("admin_set_participant_disabled", {
      p_actor: actor,
      p_user_id: userId,
      p_disabled: disabled,
      p_reason: reason ?? null,
    }),
  );
}

export async function adjustScore(actor: string, userId: string, points: number, reason: string) {
  const id = check(
    await db().rpc("admin_adjust_score", { p_actor: actor, p_user_id: userId, p_points: points, p_reason: reason }),
  );
  return { id: Number(id) };
}

// -------------------------------------------------------------- submissions
type RawSolveRow = {
  id: number;
  position: number;
  points: number;
  solved_at: string;
  user_id?: string;
  challenge_id?: string;
  profiles: { username: string } | null;
  challenges: { slug: string; title: string } | null;
};

function normalizeSolveRow(s: RawSolveRow) {
  return {
    id: Number(s.id),
    userId: s.user_id ?? null,
    challengeId: s.challenge_id ?? null,
    username: s.profiles?.username ?? "(deleted)",
    challengeSlug: s.challenges?.slug ?? null,
    challengeTitle: s.challenges?.title ?? "(unknown)",
    position: Number(s.position),
    points: Number(s.points),
    solvedAt: s.solved_at,
  };
}

export type SubmissionFilters = {
  view: "attempts" | "solves";
  page: number;
  pageSize: number;
  userId?: string;
  challengeId?: string;
  outcome?: "correct" | "incorrect" | "already_solved";
};

export async function listSubmissions(f: SubmissionFilters) {
  const from = (f.page - 1) * f.pageSize;
  const to = from + f.pageSize - 1;

  if (f.view === "solves") {
    let q = db()
      .from("solves")
      .select("id, user_id, challenge_id, position, points, solved_at, profiles(username), challenges(slug, title)", {
        count: "exact",
      })
      .order("solved_at", { ascending: false })
      .range(from, to);
    if (f.userId) q = q.eq("user_id", f.userId);
    if (f.challengeId) q = q.eq("challenge_id", f.challengeId);
    const res = await q;
    const rows = check(res) as unknown as RawSolveRow[] | null;
    return { view: "solves" as const, total: res.count ?? 0, items: (rows ?? []).map(normalizeSolveRow) };
  }

  let q = db()
    .from("submissions")
    .select("id, user_id, challenge_id, outcome, created_at, profiles(username), challenges(slug, title)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (f.userId) q = q.eq("user_id", f.userId);
  if (f.challengeId) q = q.eq("challenge_id", f.challengeId);
  if (f.outcome) q = q.eq("outcome", f.outcome);
  const res = await q;
  type Raw = {
    id: number;
    user_id: string;
    challenge_id: string;
    outcome: string;
    created_at: string;
    profiles: { username: string } | null;
    challenges: { slug: string; title: string } | null;
  };
  const rows = check(res) as unknown as Raw[] | null;
  return {
    view: "attempts" as const,
    total: res.count ?? 0,
    items: (rows ?? []).map((r) => ({
      id: Number(r.id),
      userId: r.user_id,
      challengeId: r.challenge_id,
      username: r.profiles?.username ?? "(deleted)",
      challengeSlug: r.challenges?.slug ?? null,
      challengeTitle: r.challenges?.title ?? "(unknown)",
      outcome: r.outcome,
      createdAt: r.created_at,
    })),
  };
}

// -------------------------------------------------------------------- audit
export async function listAuditLogs(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const res = await db()
    .from("audit_logs")
    .select("id, actor_id, action, target_type, target_id, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  const rows = check(res) as Record<string, unknown>[] | null;
  const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data } = await db().from("profiles").select("id, username").in("id", actorIds);
    for (const p of data ?? []) names.set(p.id as string, p.username as string);
  }
  return {
    total: res.count ?? 0,
    items: (rows ?? []).map((r) => ({
      id: Number(r.id),
      actor: r.actor_id ? (names.get(r.actor_id as string) ?? (r.actor_id as string)) : "system",
      action: r.action as string,
      targetType: (r.target_type as string | null) ?? null,
      targetId: (r.target_id as string | null) ?? null,
      details: r.details as Record<string, unknown>,
      createdAt: r.created_at as string,
    })),
  };
}

// -------------------------------------------------------------- leaderboard
export async function adminLeaderboard(actor: string) {
  const rows = check(await db().rpc("admin_leaderboard", { p_actor: actor })) as Record<string, unknown>[] | null;
  return (rows ?? []).map((r) => ({
    rank: Number(r.rank),
    userId: r.user_id as string,
    username: r.username as string,
    solvedCount: Number(r.solved_count),
    score: Number(r.score),
    lastSolveAt: (r.last_solve_at as string | null) ?? null,
    scoreReachedAt: (r.score_reached_at as string | null) ?? null,
  }));
}

/** CSV-escapes a cell and neutralises spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function leaderboardToCsv(
  rows: { rank: number; username: string; solvedCount: number; score: number; lastSolveAt: string | null }[],
): string {
  const header = ["rank", "username", "challenges_solved", "total_score", "last_accepted_solve_utc"];
  const lines = rows.map((r) => [r.rank, r.username, r.solvedCount, r.score, r.lastSolveAt ?? ""].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}

export async function resetCompetition(actor: string) {
  const result = check(await db().rpc("admin_reset_competition", { p_actor: actor, p_confirmation: "RESET" })) as Record<
    string,
    number
  > | null;
  return {
    solvesDeleted: Number(result?.solves_deleted ?? 0),
    submissionsDeleted: Number(result?.submissions_deleted ?? 0),
    adjustmentsDeleted: Number(result?.adjustments_deleted ?? 0),
  };
}
