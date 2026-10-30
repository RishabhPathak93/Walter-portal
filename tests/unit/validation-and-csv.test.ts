import { describe, expect, it } from "vitest";
import {
  competitionSettingsSchema,
  createChallengeSchema,
  registerSchema,
  scoreAdjustmentSchema,
  scoringSchema,
  updateChallengeSchema,
} from "@/lib/validation";
import { csvCell, leaderboardToCsv } from "@/lib/services/admin";

describe("validation schemas", () => {
  it("validates registration input", () => {
    expect(registerSchema.safeParse({ email: "A@Example.com ", password: "longenough", username: "neo_42" }).data).toEqual({
      email: "a@example.com",
      password: "longenough",
      username: "neo_42",
    });
    expect(registerSchema.safeParse({ email: "nope", password: "longenough", username: "neo" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.co", password: "short", username: "neo" }).success).toBe(false);
    for (const bad of ["ab", "-lead", "has space", "x".repeat(25), "émoji"]) {
      expect(registerSchema.safeParse({ email: "a@b.co", password: "longenough", username: bad }).success, bad).toBe(false);
    }
  });

  it("validates scoring changes and requires explicit confirmation to recalculate", () => {
    const base = { rules: [{ position: 1, points: 20 }, { position: 2, points: 30 }], defaultPoints: 0 };
    expect(scoringSchema.safeParse({ ...base, recalculate: false }).success).toBe(true);
    expect(scoringSchema.safeParse({ ...base, recalculate: true }).success).toBe(false);
    expect(scoringSchema.safeParse({ ...base, recalculate: true, confirmRecalculate: "RECALCULATE" }).success).toBe(true);
    expect(scoringSchema.safeParse({ rules: [{ position: 1, points: -1 }], defaultPoints: 0, recalculate: false }).success).toBe(false);
    expect(scoringSchema.safeParse({ rules: [{ position: 1, points: 1 }, { position: 1, points: 2 }], defaultPoints: 0, recalculate: false }).success).toBe(false);
    expect(scoringSchema.safeParse({ ...base, defaultPoints: 1.5, recalculate: false }).success).toBe(false);
  });

  it("validates challenge payloads and rejects unknown fields", () => {
    const ok = { slug: "web-1", title: "T", description: "", category: "Web", difficulty: "Easy", isActive: true, sortOrder: 0, flag: " flag{x} " };
    expect(createChallengeSchema.parse(ok).flag).toBe("flag{x}");
    expect(createChallengeSchema.safeParse({ ...ok, slug: "Bad Slug" }).success).toBe(false);
    expect(createChallengeSchema.safeParse({ ...ok, difficulty: "Trivial" }).success).toBe(false);
    expect(createChallengeSchema.safeParse({ ...ok, flagDigest: "x" }).success).toBe(false);
    expect(updateChallengeSchema.safeParse({}).success).toBe(false);
    expect(updateChallengeSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("validates the competition window", () => {
    const base = {
      name: "Arena",
      tagline: "",
      description: "",
      isPaused: false,
      registrationOpen: true,
      hideChallengesBeforeStart: true,
      rateLimitMaxAttempts: 10,
      rateLimitWindowSeconds: 60,
      ipRateLimitMaxAttempts: 60,
    };
    expect(competitionSettingsSchema.safeParse({ ...base, startAt: null, endAt: null }).success).toBe(true);
    expect(competitionSettingsSchema.safeParse({ ...base, startAt: "2026-11-01T10:00:00Z", endAt: "2026-11-01T09:00:00Z" }).success).toBe(false);
    expect(competitionSettingsSchema.safeParse({ ...base, startAt: "tomorrow", endAt: null }).success).toBe(false);
  });

  it("validates score adjustments", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(scoreAdjustmentSchema.safeParse({ userId: id, points: -10, reason: "penalty" }).success).toBe(true);
    expect(scoreAdjustmentSchema.safeParse({ userId: id, points: 0, reason: "nothing" }).success).toBe(false);
    expect(scoreAdjustmentSchema.safeParse({ userId: "x", points: 5, reason: "valid" }).success).toBe(false);
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formula injection and escapes quotes", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe("");
  });

  it("exports only public leaderboard columns", () => {
    const csv = leaderboardToCsv([{ rank: 1, username: "neo", solvedCount: 2, score: 50, lastSolveAt: "2026-01-01T00:00:00Z" }]);
    expect(csv.split("\r\n")[0]).toBe("rank,username,challenges_solved,total_score,last_accepted_solve_utc");
    expect(csv).toContain("1,neo,2,50,2026-01-01T00:00:00Z");
  });
});
