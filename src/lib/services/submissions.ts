import { computeFlagDigest, hashIp, normalizeFlag } from "@/lib/flags";
import type { RpcCaller } from "@/lib/services/rpc";

/**
 * Flag submission service. The single source of truth for scoring is the
 * `submit_flag` database function; this module only hashes the flag, calls it
 * and maps its result to an HTTP response. No scoring logic lives here.
 */

export type SubmissionCode =
  | "correct"
  | "incorrect"
  | "already_solved"
  | "challenge_not_found"
  | "challenge_unavailable"
  | "competition_not_open"
  | "rate_limited"
  | "account_disabled"
  | "profile_missing"
  | "invalid_request"
  | "server_error";

export type SubmissionOutcome = {
  httpStatus: number;
  body: {
    ok: boolean;
    code: SubmissionCode;
    message: string;
    points?: number;
    position?: number;
    solvedAt?: string;
    state?: string;
    retryAfter?: number;
  };
  headers?: Record<string, string>;
};

type DbResult = {
  status: string;
  position?: number;
  points?: number;
  solved_at?: string;
  state?: string;
  retry_after?: number;
};

const STATE_MESSAGES: Record<string, string> = {
  not_started: "The competition has not started yet.",
  ended: "The competition has ended. Submissions are closed.",
  paused: "The competition is paused. Submissions are temporarily closed.",
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function mapSubmissionResult(result: DbResult): SubmissionOutcome {
  switch (result.status) {
    case "correct":
      return {
        httpStatus: 201,
        body: {
          ok: true,
          code: "correct",
          message:
            (result.points ?? 0) > 0
              ? `Correct flag! You are the ${ordinal(result.position ?? 0)} solver and earned ${result.points} points.`
              : `Correct flag! You are the ${ordinal(result.position ?? 0)} solver. No points remain for this position.`,
          points: result.points ?? 0,
          position: result.position,
          solvedAt: result.solved_at,
        },
      };
    case "already_solved":
      return {
        httpStatus: 200,
        body: {
          ok: true,
          code: "already_solved",
          message: "Correct, but you already solved this challenge. Your score is unchanged.",
          points: result.points ?? 0,
          position: result.position,
          solvedAt: result.solved_at,
        },
      };
    case "incorrect":
      return { httpStatus: 422, body: { ok: false, code: "incorrect", message: "Incorrect flag. Keep investigating." } };
    case "challenge_not_found":
      return { httpStatus: 404, body: { ok: false, code: "challenge_not_found", message: "Challenge not found." } };
    case "challenge_unavailable":
      return {
        httpStatus: 403,
        body: { ok: false, code: "challenge_unavailable", message: "This challenge is not currently accepting submissions." },
      };
    case "competition_not_open":
      return {
        httpStatus: 403,
        body: {
          ok: false,
          code: "competition_not_open",
          message: STATE_MESSAGES[result.state ?? ""] ?? "Submissions are currently closed.",
          state: result.state,
        },
      };
    case "rate_limited": {
      const retryAfter = Math.max(1, Math.ceil(result.retry_after ?? 60));
      return {
        httpStatus: 429,
        body: {
          ok: false,
          code: "rate_limited",
          message: `Too many attempts. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
          retryAfter,
        },
        headers: { "Retry-After": String(retryAfter) },
      };
    }
    case "account_disabled":
      return {
        httpStatus: 403,
        body: { ok: false, code: "account_disabled", message: "Your competition access has been disabled by an administrator." },
      };
    case "profile_missing":
      return { httpStatus: 403, body: { ok: false, code: "profile_missing", message: "Your participant profile was not found." } };
    case "invalid_request":
      return { httpStatus: 400, body: { ok: false, code: "invalid_request", message: "Invalid submission." } };
    default:
      return serverErrorOutcome();
  }
}

export function serverErrorOutcome(): SubmissionOutcome {
  return { httpStatus: 500, body: { ok: false, code: "server_error", message: "An unexpected error occurred. Please try again." } };
}

export async function submitFlag(
  rpc: RpcCaller,
  input: { userId: string; slug: string; flag: string; ip: string | null; secret?: string },
): Promise<SubmissionOutcome> {
  const { data: challengeId, error: lookupError } = await rpc<string | null>("resolve_challenge_id", { p_slug: input.slug });
  if (lookupError) {
    console.error("[submitFlag] lookup failed:", lookupError.message);
    return serverErrorOutcome();
  }
  if (!challengeId) return mapSubmissionResult({ status: "challenge_not_found" });

  const digest = computeFlagDigest(challengeId, normalizeFlag(input.flag), input.secret);
  const ipHash = hashIp(input.ip, input.secret);

  const { data, error } = await rpc<DbResult>("submit_flag", {
    p_user_id: input.userId,
    p_challenge_id: challengeId,
    p_digest: digest,
    p_ip_hash: ipHash,
  });
  if (error || !data || typeof data !== "object") {
    console.error("[submitFlag] rpc failed:", error?.message ?? "empty result");
    return serverErrorOutcome();
  }
  return mapSubmissionResult(data);
}
