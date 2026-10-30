import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createChallenge,
  createTestDb,
  createUser,
  hasDb,
  makeAdmin,
  pgRpc,
  submitDirect,
  type TestDb,
} from "./helpers";

/**
 * Flag submission engine, scoring, atomic solving order and leaderboard —
 * executed against real PostgreSQL with the project's real migrations.
 */
describe.skipIf(!hasDb)("submission engine & scoring (PostgreSQL)", () => {
  let db: TestDb;
  const FLAG = "flag{test_only_locked_folder}";

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db?.drop();
  });
  beforeEach(async () => {
    // Clean state for each test (order respects foreign keys).
    await db.pool.query(
      "truncate public.solves, public.submissions, public.score_adjustments, public.audit_logs, public.admins restart identity cascade",
    );
    await db.pool.query("delete from private.challenge_flags; delete from public.challenges; delete from auth.users;");
    await db.pool.query(
      "update public.competition_settings set start_at = null, end_at = null, is_paused = false, registration_open = true, default_points = 0, rate_limit_max_attempts = 10, rate_limit_window_seconds = 60, ip_rate_limit_max_attempts = 60",
    );
    await db.pool.query("delete from public.scoring_rules; insert into public.scoring_rules (position, points) values (1,20),(2,30),(3,50)");
  });

  // ------------------------------------------------------------ flag checks
  it("accepts a correct flag and rejects an incorrect one", async () => {
    const ch = await createChallenge(db.pool, "locked-folder", FLAG);
    const u = await createUser(db.pool, "alice");

    const wrong = await submitDirect(db.pool, u, ch, "flag{nope}");
    expect(wrong).toEqual({ status: "incorrect" });

    const right = await submitDirect(db.pool, u, ch, FLAG);
    expect(right.status).toBe("correct");
    expect(right.position).toBe(1);
    expect(right.points).toBe(20);

    const { rows } = await db.pool.query("select outcome from public.submissions where user_id = $1 order by id", [u]);
    expect(rows.map((r) => r.outcome)).toEqual(["incorrect", "correct"]);
  });

  it("is case-sensitive and does not alter the inside of the flag", async () => {
    const ch = await createChallenge(db.pool, "exif-ninja", "flag{Exif_Ninja}");
    const u = await createUser(db.pool, "bob");
    expect((await submitDirect(db.pool, u, ch, "flag{exif_ninja}")).status).toBe("incorrect");
    expect((await submitDirect(db.pool, u, ch, "flag{Exif_ Ninja}")).status).toBe("incorrect");
    // surrounding whitespace is trimmed
    expect((await submitDirect(db.pool, u, ch, "  flag{Exif_Ninja}\n")).status).toBe("correct");
  });

  it("never stores the submitted flag text", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const u = await createUser(db.pool, "carol");
    await submitDirect(db.pool, u, ch, "flag{secret-guess}");
    const cols = await db.pool.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='submissions'",
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(
      ["challenge_id", "created_at", "id", "ip_hash", "is_correct", "outcome", "user_id"].sort(),
    );
  });

  // ---------------------------------------------------------------- scoring
  it("awards 20 / 30 / 50 / 0 points to the 1st / 2nd / 3rd / 4th solvers", async () => {
    const ch = await createChallenge(db.pool, "php-object-injection", FLAG);
    const users = [];
    for (const n of ["user1", "user2", "user3", "user4", "user5"]) users.push(await createUser(db.pool, n));
    const results = [];
    for (const u of users) results.push(await submitDirect(db.pool, u, ch, FLAG));
    expect(results.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
    expect(results.map((r) => r.points)).toEqual([20, 30, 50, 0, 0]);
  });

  it("does not award points twice and keeps the original position", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const a = await createUser(db.pool, "alice");
    const b = await createUser(db.pool, "bob");
    await submitDirect(db.pool, a, ch, FLAG);
    await submitDirect(db.pool, b, ch, FLAG);
    const again = await submitDirect(db.pool, a, ch, FLAG);
    expect(again.status).toBe("already_solved");
    expect(again.position).toBe(1);
    expect(again.points).toBe(20);
    const { rows } = await db.pool.query("select count(*)::int as n, sum(points)::int as pts from public.solves where user_id = $1", [a]);
    expect(rows[0]).toEqual({ n: 1, pts: 20 });
    // Next solver still gets position 3.
    const c = await createUser(db.pool, "carol");
    expect((await submitDirect(db.pool, c, ch, FLAG)).position).toBe(3);
  });

  it("uses the scoring rules recorded at solve time (future-only changes)", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const admin = await createUser(db.pool, "organizer01", { bypass: true });
    await makeAdmin(db.pool, admin);
    const a = await createUser(db.pool, "alice");
    await submitDirect(db.pool, a, ch, FLAG); // 20
    const rpc = pgRpc(db.pool);
    const upd = await rpc("admin_update_scoring", {
      p_actor: admin,
      p_rules: [{ position: 1, points: 100 }, { position: 2, points: 75 }],
      p_default_points: 5,
      p_recalculate: false,
    });
    expect(upd.error).toBeNull();
    const b = await createUser(db.pool, "bob");
    const c = await createUser(db.pool, "carol");
    expect((await submitDirect(db.pool, b, ch, FLAG)).points).toBe(75);
    expect((await submitDirect(db.pool, c, ch, FLAG)).points).toBe(5); // default for position 3
    const { rows } = await db.pool.query("select points from public.solves where user_id = $1", [a]);
    expect(rows[0].points).toBe(20); // unchanged
  });

  it("recalculates historical scores only when explicitly requested", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const admin = await createUser(db.pool, "organizer01", { bypass: true });
    await makeAdmin(db.pool, admin);
    const a = await createUser(db.pool, "alice");
    const b = await createUser(db.pool, "bob");
    await submitDirect(db.pool, a, ch, FLAG);
    await submitDirect(db.pool, b, ch, FLAG);
    const rpc = pgRpc(db.pool);
    const res = await rpc<{ solves_changed: number }>("admin_update_scoring", {
      p_actor: admin,
      p_rules: [{ position: 1, points: 50 }, { position: 2, points: 30 }, { position: 3, points: 20 }],
      p_default_points: 0,
      p_recalculate: true,
    });
    expect(res.data?.solves_changed).toBe(1); // only position 1 changed (20 -> 50)
    const { rows } = await db.pool.query("select position, points from public.solves order by position");
    expect(rows).toEqual([{ position: 1, points: 50 }, { position: 2, points: 30 }]);
    const audit = await db.pool.query("select details from public.audit_logs where action = 'scoring.update'");
    expect(audit.rows[0].details.recalculated).toBe(true);
  });

  // ---------------------------------------------------------- availability
  it("rejects submissions to inactive challenges", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG, { active: false });
    const u = await createUser(db.pool, "alice");
    expect((await submitDirect(db.pool, u, ch, FLAG)).status).toBe("challenge_unavailable");
    const { rows } = await db.pool.query("select count(*)::int as n from public.solves");
    expect(rows[0].n).toBe(0);
  });

  it("rejects submissions outside the competition window and while paused", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const u = await createUser(db.pool, "alice");

    await db.pool.query("update public.competition_settings set start_at = now() + interval '1 hour'");
    expect(await submitDirect(db.pool, u, ch, FLAG)).toEqual({ status: "competition_not_open", state: "not_started" });

    await db.pool.query("update public.competition_settings set start_at = now() - interval '2 hour', end_at = now() - interval '1 hour'");
    expect(await submitDirect(db.pool, u, ch, FLAG)).toEqual({ status: "competition_not_open", state: "ended" });

    await db.pool.query("update public.competition_settings set start_at = null, end_at = null, is_paused = true");
    expect(await submitDirect(db.pool, u, ch, FLAG)).toEqual({ status: "competition_not_open", state: "paused" });

    await db.pool.query("update public.competition_settings set is_paused = false");
    expect((await submitDirect(db.pool, u, ch, FLAG)).status).toBe("correct");
  });

  it("rejects disabled participants", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const u = await createUser(db.pool, "alice");
    await db.pool.query("update public.profiles set is_disabled = true where id = $1", [u]);
    expect((await submitDirect(db.pool, u, ch, FLAG)).status).toBe("account_disabled");
  });

  it("enforces per-participant rate limiting", async () => {
    await db.pool.query("update public.competition_settings set rate_limit_max_attempts = 3, rate_limit_window_seconds = 60");
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const u = await createUser(db.pool, "alice");
    for (let i = 0; i < 3; i++) expect((await submitDirect(db.pool, u, ch, `flag{wrong${i}}`)).status).toBe("incorrect");
    const limited = await submitDirect(db.pool, u, ch, FLAG); // even a correct flag is blocked while limited
    expect(limited.status).toBe("rate_limited");
    expect(limited.retry_after).toBeGreaterThan(0);
    expect(limited.retry_after).toBeLessThanOrEqual(60);
    // rate-limited attempts are not recorded and award nothing
    const { rows } = await db.pool.query("select count(*)::int as n from public.submissions where user_id = $1", [u]);
    expect(rows[0].n).toBe(3);
    // other participants are unaffected
    const v = await createUser(db.pool, "bob");
    expect((await submitDirect(db.pool, v, ch, FLAG)).status).toBe("correct");
  });

  it("enforces per-IP rate limiting", async () => {
    await db.pool.query("update public.competition_settings set ip_rate_limit_max_attempts = 2");
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const ip = "a".repeat(64);
    const a = await createUser(db.pool, "alice");
    const b = await createUser(db.pool, "bob");
    const c = await createUser(db.pool, "carol");
    expect((await submitDirect(db.pool, a, ch, "flag{x}", ip)).status).toBe("incorrect");
    expect((await submitDirect(db.pool, b, ch, "flag{x}", ip)).status).toBe("incorrect");
    expect((await submitDirect(db.pool, c, ch, FLAG, ip)).status).toBe("rate_limited");
    expect((await submitDirect(db.pool, c, ch, FLAG, "b".repeat(64))).status).toBe("correct");
  });

  // ------------------------------------------------------------ concurrency
  it("assigns distinct positions to 50 simultaneous correct submissions", async () => {
    const ch = await createChallenge(db.pool, "race", FLAG);
    const users: string[] = [];
    for (let i = 0; i < 50; i++) users.push(await createUser(db.pool, `racer${i}`));

    const results = await Promise.all(users.map((u) => submitDirect(db.pool, u, ch, FLAG)));

    expect(results.every((r) => r.status === "correct")).toBe(true);
    const positions = results.map((r) => r.position!).sort((x, y) => x - y);
    expect(positions).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

    const { rows } = await db.pool.query(
      "select position, points, solved_at from public.solves where challenge_id = $1 order by position",
      [ch],
    );
    expect(rows).toHaveLength(50);
    expect(new Set(rows.map((r) => r.position)).size).toBe(50);
    expect(rows.slice(0, 4).map((r) => r.points)).toEqual([20, 30, 50, 0]);
    expect(rows.reduce((a, r) => a + r.points, 0)).toBe(100);
    // timestamps are in the same order as positions
    for (let i = 1; i < rows.length; i++) {
      expect(new Date(rows[i].solved_at).getTime()).toBeGreaterThanOrEqual(new Date(rows[i - 1].solved_at).getTime());
    }
    // each result reported to a participant matches what was stored
    for (const [i, r] of results.entries()) {
      const stored = await db.pool.query("select position, points from public.solves where user_id = $1", [users[i]]);
      expect(stored.rows[0]).toEqual({ position: r.position, points: r.points });
    }
  });

  it("records only one solve when the same participant submits concurrently", async () => {
    const ch = await createChallenge(db.pool, "dup", FLAG);
    const u = await createUser(db.pool, "spammer");
    const results = await Promise.all(Array.from({ length: 8 }, () => submitDirect(db.pool, u, ch, FLAG)));
    expect(results.filter((r) => r.status === "correct")).toHaveLength(1);
    expect(results.filter((r) => r.status === "already_solved")).toHaveLength(7);
    const { rows } = await db.pool.query("select count(*)::int as n, sum(points)::int as pts from public.solves where user_id = $1", [u]);
    expect(rows[0]).toEqual({ n: 1, pts: 20 });
  });

  it("handles concurrent solves across several challenges consistently", async () => {
    const chs = [await createChallenge(db.pool, "a1", FLAG), await createChallenge(db.pool, "a2", FLAG), await createChallenge(db.pool, "a3", FLAG)];
    const users: string[] = [];
    for (let i = 0; i < 20; i++) users.push(await createUser(db.pool, `mix${i}`));
    await Promise.all(users.flatMap((u) => chs.map((c) => submitDirect(db.pool, u, c, FLAG))));
    const { rows } = await db.pool.query(
      "select challenge_id, count(*)::int as n, count(distinct position)::int as d, max(position)::int as mx, sum(points)::int as pts from public.solves group by challenge_id",
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toMatchObject({ n: 20, d: 20, mx: 20, pts: 100 });
    const lb = await pgRpc(db.pool)<{ score: number }[]>("get_leaderboard", { p_limit: 100, p_offset: 0 });
    expect(lb.data!.reduce((a, r) => a + Number(r.score), 0)).toBe(300);
  });

  it("database constraints reject duplicate solves and duplicate positions", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const a = await createUser(db.pool, "alice");
    const b = await createUser(db.pool, "bob");
    await submitDirect(db.pool, a, ch, FLAG);
    await expect(
      db.pool.query("insert into public.solves (user_id, challenge_id, position, points) values ($1, $2, 2, 0)", [a, ch]),
    ).rejects.toThrow(/solves_user_challenge_key/);
    await expect(
      db.pool.query("insert into public.solves (user_id, challenge_id, position, points) values ($1, $2, 1, 0)", [b, ch]),
    ).rejects.toThrow(/solves_challenge_position_key/);
    await expect(
      db.pool.query("insert into public.solves (user_id, challenge_id, position, points) values ($1, $2, 2, -5)", [b, ch]),
    ).rejects.toThrow(/check constraint/);
  });

  // ------------------------------------------------------------ leaderboard
  it("calculates scores, counts, timestamps and ranking with tie-breaks", async () => {
    const c1 = await createChallenge(db.pool, "c1", FLAG);
    const c2 = await createChallenge(db.pool, "c2", FLAG);
    const c3 = await createChallenge(db.pool, "c3", FLAG);
    const alice = await createUser(db.pool, "alice");
    const bob = await createUser(db.pool, "bob");
    const carol = await createUser(db.pool, "carol");
    const dave = await createUser(db.pool, "dave");
    const erin = await createUser(db.pool, "erin"); // never solves

    // c1: alice 20, bob 30, carol 50, dave 0
    for (const u of [alice, bob, carol, dave]) await submitDirect(db.pool, u, c1, FLAG);
    // c2: bob 20, alice 30
    await submitDirect(db.pool, bob, c2, FLAG);
    await submitDirect(db.pool, alice, c2, FLAG);
    // c3: dave 20
    await submitDirect(db.pool, dave, c3, FLAG);
    // Totals: alice 50 (reached at c2 solve), bob 50 (reached at c2 solve, earlier than alice), carol 50 (reached at c1, earliest!), dave 20.

    const { data } = await pgRpc(db.pool)<
      { rank: number; username: string; solved_count: number; score: number; last_solve_at: string; score_reached_at: string }[]
    >("get_leaderboard", { p_limit: 100, p_offset: 0 });
    const rows = data!;
    expect(rows.map((r) => [Number(r.rank), r.username, r.score, r.solved_count])).toEqual([
      [1, "carol", 50, 1],
      [2, "bob", 50, 2],
      [3, "alice", 50, 2],
      [4, "dave", 20, 2],
      [5, "erin", 0, 0],
    ]);

    const solves = await db.pool.query("select user_id, max(solved_at) as last from public.solves group by user_id");
    const last = new Map(solves.rows.map((r) => [r.user_id, new Date(r.last).toISOString()]));
    const byName = new Map(rows.map((r) => [r.username, r]));
    expect(new Date(byName.get("alice")!.last_solve_at).toISOString()).toBe(last.get(alice));
    expect(new Date(byName.get("dave")!.last_solve_at).toISOString()).toBe(last.get(dave));
    expect(byName.get("erin")!.last_solve_at).toBeNull();
    // dave's 0-point c1 solve does not move his "score reached" time; his c3 solve does.
    expect(new Date(byName.get("dave")!.score_reached_at).toISOString()).toBe(last.get(dave));
    void erin;
  });

  it("orders zero-score participants after scorers, deterministically by id", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const ids = [];
    for (const n of ["zed", "yan", "xia"]) ids.push(await createUser(db.pool, n));
    const scorer = await createUser(db.pool, "winner");
    await submitDirect(db.pool, scorer, ch, FLAG);
    const { data } = await pgRpc(db.pool)<{ username: string }[]>("get_leaderboard", { p_limit: 100, p_offset: 0 });
    const expectedZero = (await db.pool.query("select username from public.profiles where id = any($1) order by id", [ids])).rows.map(
      (r) => r.username,
    );
    expect(data!.map((r) => r.username)).toEqual(["winner", ...expectedZero]);
  });

  it("excludes disabled participants and admins, and includes score adjustments", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const admin = await createUser(db.pool, "organizer01", { bypass: true });
    await makeAdmin(db.pool, admin);
    const a = await createUser(db.pool, "alice");
    const b = await createUser(db.pool, "bob");
    await submitDirect(db.pool, a, ch, FLAG); // 20
    await submitDirect(db.pool, b, ch, FLAG); // 30
    const rpc = pgRpc(db.pool);
    expect((await rpc("admin_adjust_score", { p_actor: admin, p_user_id: a, p_points: 15, p_reason: "appeal granted" })).error).toBeNull();
    let lb = (await rpc<{ username: string; score: number }[]>("get_leaderboard", {})).data!;
    expect(lb.map((r) => [r.username, r.score])).toEqual([
      ["alice", 35],
      ["bob", 30],
    ]);
    expect((await rpc("admin_set_participant_disabled", { p_actor: admin, p_user_id: a, p_disabled: true, p_reason: "cheating" })).error).toBeNull();
    lb = (await rpc<{ username: string; score: number }[]>("get_leaderboard", {})).data!;
    expect(lb.map((r) => r.username)).toEqual(["bob"]);
  });

  it("bumps the realtime leaderboard version when scores change", async () => {
    const ch = await createChallenge(db.pool, "c1", FLAG);
    const u = await createUser(db.pool, "alice");
    const before = (await db.pool.query("select version from public.leaderboard_state")).rows[0].version;
    await submitDirect(db.pool, u, ch, "flag{wrong}");
    const afterWrong = (await db.pool.query("select version from public.leaderboard_state")).rows[0].version;
    expect(afterWrong).toBe(before); // incorrect attempts do not trigger refreshes
    await submitDirect(db.pool, u, ch, FLAG);
    const after = (await db.pool.query("select version from public.leaderboard_state")).rows[0].version;
    expect(Number(after)).toBeGreaterThan(Number(before));
    const pub = await db.pool.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime'");
    expect(pub.rows.map((r) => r.tablename)).toEqual(["leaderboard_state"]);
  });
});
