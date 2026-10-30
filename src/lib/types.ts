/** Shared types (safe for client and server). */

export type CompetitionState = "not_started" | "running" | "paused" | "ended";

export type CompetitionPublic = {
  name: string;
  tagline: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  state: CompetitionState;
  registrationOpen: boolean;
  challengesVisible: boolean;
  defaultPoints: number;
  serverTime: string;
};

export type PublicStats = {
  participants: number;
  activeChallenges: number;
  acceptedSolves: number;
};

export type ScoringRule = { position: number; points: number };

export type PublicChallenge = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  solveCount: number;
  nextPoints: number;
  createdAt: string;
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  solvedCount: number;
  score: number;
  lastSolveAt: string | null;
  scoreReachedAt: string | null;
};

export type MySolve = {
  challengeId: string;
  slug: string | null;
  title: string | null;
  category: string | null;
  position: number;
  points: number;
  solvedAt: string;
};

export type MySubmission = {
  id: number;
  challengeId: string;
  slug: string | null;
  title: string | null;
  outcome: "correct" | "incorrect" | "already_solved";
  createdAt: string;
};

export type MyStanding = {
  rank: number;
  username: string;
  solvedCount: number;
  score: number;
  lastSolveAt: string | null;
  totalRanked: number;
};

export type ApiResponse<T = unknown> = {
  ok: boolean;
  code: string;
  message: string;
  data?: T;
  [key: string]: unknown;
};
