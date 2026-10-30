import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createChallenge, createTestDb, createUser, hasDb, HMAC_SECRET, pgRpc, type TestDb } from "./helpers";

/**
 * End-to-end through the real Next.js route handler → submission service
 * (HMAC in Node) → submit_flag on PostgreSQL. Only the session lookup and the
 * Supabase transport are substituted.
 */
const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  pool: null as unknown,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => state.user,
  isAdminUser: async () => false,
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { pgRpc: makeRpc } = await import("./helpers");
  return {
    getSupabaseAdmin: () => {
      const rpc = makeRpc(state.pool as never);
      return { rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args) };
    },
  };
});

describe.skipIf(!hasDb)("POST /api/challenges/:slug/submit (route → service → PostgreSQL)", () => {
  let db: TestDb;
  const FLAG = "flag{test_only_exif_ninja}";
  const users: Record<string, string> = {};

  beforeAll(async () => {
    process.env.FLAG_HMAC_SECRET = HMAC_SECRET;
    db = await createTestDb();
    state.pool = db.pool;
    await createChallenge(db.pool, "exif-ninja", FLAG, { category: "Forensics" });
    await createChallenge(db.pool, "inactive-one", FLAG, { active: false });
    for (const n of ["first", "second", "third", "fourth", "limited"]) users[n] = await createUser(db.pool, n);
  });
  afterAll(async () => {
    await db?.drop();
  });

  async function submit(username: string, slug: string, flag: string, ip = "203.0.113.7") {
    state.user = { id: users[username]!, email: `${username}@example.test` };
    const { POST } = await import("@/app/api/challenges/[slug]/submit/route");
    const res = await POST(
      new NextRequest(`http://localhost:3000/api/challenges/${slug}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-real-ip": ip },
        body: JSON.stringify({ flag, userId: users.first, points: 1000 }), // forged fields are ignored
      }),
      { params: Promise.resolve({ slug }) } as never,
    );
    const text = await res.text();
    return { status: res.status, body: JSON.parse(text), text, headers: res.headers };
  }

  it("scores 1st/2nd/3rd/4th solvers as 20/30/50/0 through the API", async () => {
    const r1 = await submit("first", "exif-ninja", FLAG);
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ ok: true, code: "correct", position: 1, points: 20 });
    expect((await submit("second", "exif-ninja", `  ${FLAG}  `)).body).toMatchObject({ position: 2, points: 30 });
    expect((await submit("third", "exif-ninja", FLAG)).body).toMatchObject({ position: 3, points: 50 });
    expect((await submit("fourth", "exif-ninja", FLAG)).body).toMatchObject({ position: 4, points: 0 });
  });

  it("ignores a forged userId in the body (the session decides who solved)", async () => {
    const { rows } = await db.pool.query("select count(*)::int as n from public.solves where user_id = $1", [users.first]);
    expect(rows[0].n).toBe(1);
  });

  it("returns already_solved (200) without extra points on repeat", async () => {
    const r = await submit("first", "exif-ninja", FLAG);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, code: "already_solved", position: 1, points: 20 });
    const lb = await pgRpc(db.pool)<{ username: string; score: number }[]>("get_leaderboard", {});
    expect(lb.data!.find((e) => e.username === "first")!.score).toBe(20);
  });

  it("rejects incorrect flags with 422 and never reveals the correct flag", async () => {
    const r = await submit("limited", "exif-ninja", "flag{guess}");
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ ok: false, code: "incorrect" });
    expect(r.text).not.toContain("test_only_exif");
    expect(r.text).not.toMatch(/[0-9a-f]{64}/);
  });

  it("maps unavailable challenges and unknown slugs", async () => {
    expect((await submit("limited", "inactive-one", FLAG)).status).toBe(403);
    expect((await submit("limited", "does-not-exist", FLAG)).body.code).toBe("challenge_not_found");
  });

  it("maps a closed competition to 403 competition_not_open", async () => {
    await db.pool.query("update public.competition_settings set end_at = now() - interval '1 minute', start_at = now() - interval '1 hour'");
    try {
      const r = await submit("limited", "exif-ninja", FLAG);
      expect(r.status).toBe(403);
      expect(r.body).toMatchObject({ code: "competition_not_open", state: "ended" });
    } finally {
      await db.pool.query("update public.competition_settings set start_at = null, end_at = null");
    }
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    await db.pool.query("update public.competition_settings set rate_limit_max_attempts = 3");
    let last;
    for (let i = 0; i < 4; i++) last = await submit("limited", "exif-ninja", `flag{wrong-${i}}`, "198.51.100.9");
    expect(last!.status).toBe(429);
    expect(last!.body.code).toBe("rate_limited");
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("stores only a keyed hash of the client IP", async () => {
    const { rows } = await db.pool.query("select distinct ip_hash from public.submissions");
    for (const r of rows) {
      expect(r.ip_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.ip_hash).not.toContain("203.0.113.7");
    }
  });
});
