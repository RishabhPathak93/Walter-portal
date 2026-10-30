import { describe, expect, it } from "vitest";
import { mapSubmissionResult } from "@/lib/services/submissions";

describe("submission result mapping", () => {
  it.each([
    [{ status: "correct", position: 1, points: 20, solved_at: "2026-01-01T00:00:00Z" }, 201, "correct"],
    [{ status: "already_solved", position: 2, points: 30 }, 200, "already_solved"],
    [{ status: "incorrect" }, 422, "incorrect"],
    [{ status: "challenge_not_found" }, 404, "challenge_not_found"],
    [{ status: "challenge_unavailable" }, 403, "challenge_unavailable"],
    [{ status: "competition_not_open", state: "ended" }, 403, "competition_not_open"],
    [{ status: "rate_limited", retry_after: 12 }, 429, "rate_limited"],
    [{ status: "account_disabled" }, 403, "account_disabled"],
    [{ status: "invalid_request" }, 400, "invalid_request"],
    [{ status: "something_unexpected" }, 500, "server_error"],
  ])("%o → %i %s", (input, http, code) => {
    const out = mapSubmissionResult(input);
    expect(out.httpStatus).toBe(http);
    expect(out.body.code).toBe(code);
    expect(out.body.ok).toBe(http < 300);
  });

  it("formats positions and points for the participant", () => {
    expect(mapSubmissionResult({ status: "correct", position: 1, points: 20 }).body.message).toContain("1st solver and earned 20 points");
    expect(mapSubmissionResult({ status: "correct", position: 2, points: 30 }).body.message).toContain("2nd");
    expect(mapSubmissionResult({ status: "correct", position: 3, points: 50 }).body.message).toContain("3rd");
    expect(mapSubmissionResult({ status: "correct", position: 4, points: 0 }).body.message).toContain("4th solver. No points");
    expect(mapSubmissionResult({ status: "correct", position: 11, points: 0 }).body.message).toContain("11th");
  });

  it("sets Retry-After for rate limiting", () => {
    expect(mapSubmissionResult({ status: "rate_limited", retry_after: 7 }).headers).toEqual({ "Retry-After": "7" });
  });
});
