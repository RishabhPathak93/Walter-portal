import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  asRole,
  createChallenge,
  createTestDb,
  createUser,
  digest,
  hasDb,
  makeAdmin,
  pgRpc,
  queryError,
  submitDirect,
  type TestDb,
} from "./helpers";

/**
 * Row Level Security, grants, registration rules and admin authorization —
 * executed as the real Supabase API roles (anon / authenticated) on PostgreSQL.
 */
describe.skipIf(!hasDb)("database security (PostgreSQL)", () => {
  let db: TestDb;
  let alice: string;
  let bob: string;
  let admin: string;
  let ch: string;
  let hidden: string;
  const FLAG = "flag{test_only_php_injection}";

  beforeAll(async () => {
    db = await createTestDb();
    alice = await createUser(db.pool, "alice");
    bob = await createUser(db.pool, "bob");
    admin = await createUser(db.pool, "organizer01", { bypass: true });
    await makeAdmin(db.pool, admin);
    ch = await createChallenge(db.pool, "php-object-injection", FLAG);
    hidden = await createChallenge(db.pool, "hidden-one", "flag{hidden}", { active: false });
    await submitDirect(db.pool, alice, ch, FLAG);
    await submitDirect(db.pool, bob, ch, "flag{wrong}");
  });
  afterAll(async () => {
    await db?.drop();
  });

  // ------------------------------------------------------------ flags
  it("flag digests are not reachable by anon or authenticated roles", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await asRole(db.pool, role, role === "authenticated" ? alice : null, async (c) => {
        expect(await queryError(c, "select * from private.challenge_flags")).toMatch(/permission denied/);
        const cols = await c.query("select * from public.challenges limit 1");
        expect(Object.keys(cols.rows[0] ?? {})).not.toContain("flag_digest");
        // No public function returns digests
        const r = await c.query("select * from public.get_public_challenges()");
        expect(JSON.stringify(r.rows)).not.toMatch(/[0-9a-f]{64}/);
      });
    }
  });

  it("inactive challenges are hidden from API roles", async () => {
    await asRole(db.pool, "anon", null, async (c) => {
      const r = await c.query("select slug from public.challenges");
      expect(r.rows.map((x) => x.slug)).toEqual(["php-object-injection"]);
      void hidden;
    });
  });

  it("challenges are hidden from the public before the start when configured", async () => {
    await db.pool.query("update public.competition_settings set start_at = now() + interval '1 day', hide_challenges_before_start = true");
    try {
      await asRole(db.pool, "anon", null, async (c) => {
        expect((await c.query("select * from public.challenges")).rows).toHaveLength(0);
        expect((await c.query("select * from public.get_public_challenges()")).rows).toHaveLength(0);
      });
    } finally {
      await db.pool.query("update public.competition_settings set start_at = null");
    }
  });

  // ------------------------------------------------------------ participants' private data
  it("participants read only their own solves and submissions", async () => {
    await asRole(db.pool, "authenticated", bob, async (c) => {
      expect((await c.query("select * from public.solves")).rows).toHaveLength(0); // alice's solve invisible
      const subs = await c.query("select user_id from public.submissions");
      expect(subs.rows.every((r) => r.user_id === bob)).toBe(true);
      expect(subs.rows).toHaveLength(1);
      const profiles = await c.query("select id from public.profiles");
      expect(profiles.rows.map((r) => r.id)).toEqual([bob]);
    });
    await asRole(db.pool, "authenticated", alice, async (c) => {
      expect((await c.query("select user_id from public.solves")).rows.map((r) => r.user_id)).toEqual([alice]);
    });
  });

  it("anon cannot read profiles, solves, submissions, adjustments, admins or audit logs", async () => {
    await asRole(db.pool, "anon", null, async (c) => {
      for (const t of ["profiles", "solves", "submissions", "score_adjustments", "admins", "audit_logs"]) {
        expect(await queryError(c, `select * from public.${t}`)).toMatch(/permission denied/);
      }
    });
  });

  it("participants cannot insert solves, assign positions or change scores", async () => {
    await asRole(db.pool, "authenticated", bob, async (c) => {
      expect(
        await queryError(c, "insert into public.solves (user_id, challenge_id, position, points) values ($1, $2, 99, 9999)", [bob, ch]),
      ).toMatch(/permission denied/);
      expect(await queryError(c, "update public.solves set points = 9999")).toMatch(/permission denied/);
      expect(await queryError(c, "delete from public.solves")).toMatch(/permission denied/);
      expect(
        await queryError(c, "insert into public.score_adjustments (user_id, points, reason) values ($1, 500, 'gift')", [bob]),
      ).toMatch(/permission denied/);
      expect(await queryError(c, "insert into public.submissions (user_id, challenge_id, outcome) values ($1, $2, 'correct')", [bob, ch])).toMatch(
        /permission denied/,
      );
    });
  });

  it("participants cannot modify profiles (their own or others') or grant themselves admin", async () => {
    await asRole(db.pool, "authenticated", bob, async (c) => {
      expect(await queryError(c, "update public.profiles set username = 'hacked' where id = $1", [alice])).toMatch(/permission denied/);
      expect(await queryError(c, "update public.profiles set is_disabled = false where id = $1", [bob])).toMatch(/permission denied/);
      expect(await queryError(c, "insert into public.admins (user_id) values ($1)", [bob])).toMatch(/permission denied/);
      expect(await queryError(c, "update public.competition_settings set is_paused = true")).toMatch(/permission denied/);
      expect(await queryError(c, "update public.scoring_rules set points = 1000")).toMatch(/permission denied/);
    });
  });

  it("privileged functions cannot be executed by API roles", async () => {
    const fake = "f".repeat(64);
    const calls: [string, unknown[]][] = [
      ["select public.submit_flag($1, $2, $3, null)", [bob, ch, digest(ch, FLAG)]],
      ["select public.resolve_challenge_id('php-object-injection')", []],
      ["select public.admin_adjust_score($1, $2, 1000, 'self gift')", [bob, bob]],
      ["select public.admin_reset_competition($1, 'RESET')", [admin]],
      ["select public.admin_set_flag($1, $2, $3)", [admin, ch, fake]],
      ["select * from public.admin_list_participants($1)", [admin]],
      ["select public.seed_challenge($1, 'x-x', 't', 'd', 'c', 'Easy', true, 0, $2, false)", [randomUUID(), fake]],
    ];
    for (const role of ["anon", "authenticated"] as const) {
      await asRole(db.pool, role, role === "authenticated" ? bob : null, async (c) => {
        for (const [sql, params] of calls) {
          expect(await queryError(c, sql, params), `${role}: ${sql}`).toMatch(/permission denied/);
        }
      });
    }
  });

  it("public read functions work for anon and expose no private fields", async () => {
    await asRole(db.pool, "anon", null, async (c) => {
      const lb = await c.query("select * from public.get_leaderboard(100, 0)");
      expect(lb.rows.length).toBeGreaterThan(0);
      expect(Object.keys(lb.rows[0])).toEqual(["rank", "username", "solved_count", "score", "last_solve_at", "score_reached_at"]);
      const stats = await c.query("select * from public.get_public_stats()");
      expect(stats.rows[0]).toMatchObject({ participants: "2", accepted_solves: "1" });
      const comp = await c.query("select * from public.get_competition_public()");
      expect(comp.rows[0].state).toBe("running");
      expect((await c.query("select public.username_available('ALICE') as ok")).rows[0].ok).toBe(false);
      expect((await c.query("select public.username_available('newbie') as ok")).rows[0].ok).toBe(true);
    });
  });

  it("get_my_standing uses the verified JWT subject only", async () => {
    await asRole(db.pool, "authenticated", alice, async (c) => {
      const r = await c.query("select * from public.get_my_standing()");
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({ username: "alice", score: 20 });
    });
    await asRole(db.pool, "anon", null, async (c) => {
      expect(await queryError(c, "select * from public.get_my_standing()")).toMatch(/permission denied/);
    });
  });

  // ------------------------------------------------------------ registration
  it("rejects duplicate usernames case-insensitively", async () => {
    await expect(createUser(db.pool, "Alice")).rejects.toThrow(/USERNAME_TAKEN/);
    const n = await db.pool.query("select count(*)::int as n from public.profiles where lower(username) = 'alice'");
    expect(n.rows[0].n).toBe(1);
  });

  it("rejects invalid and reserved usernames, and registration when closed", async () => {
    await expect(createUser(db.pool, "a")).rejects.toThrow(/INVALID_USERNAME/);
    await expect(createUser(db.pool, "-dash")).rejects.toThrow(/INVALID_USERNAME/);
    await expect(createUser(db.pool, "bad name")).rejects.toThrow(/INVALID_USERNAME/);
    await expect(createUser(db.pool, "admin")).rejects.toThrow(/RESERVED_USERNAME/);
    await db.pool.query("update public.competition_settings set registration_open = false");
    try {
      await expect(createUser(db.pool, "latecomer")).rejects.toThrow(/REGISTRATION_CLOSED/);
      // the bootstrap path (app_metadata set only by the service role) still works
      await expect(createUser(db.pool, "organizer02", { bypass: true })).resolves.toBeTruthy();
    } finally {
      await db.pool.query("update public.competition_settings set registration_open = true");
    }
  });

  it("successful registration creates exactly one profile with no admin rights", async () => {
    const id = await createUser(db.pool, "Newcomer_1");
    const p = await db.pool.query("select username, is_disabled from public.profiles where id = $1", [id]);
    expect(p.rows[0]).toEqual({ username: "Newcomer_1", is_disabled: false });
    expect((await db.pool.query("select count(*)::int as n from public.admins where user_id = $1", [id])).rows[0].n).toBe(0);
  });

  // ------------------------------------------------------------ admin functions
  it("admin functions reject non-admin actors", async () => {
    const rpc = pgRpc(db.pool);
    const attempts = [
      rpc("admin_adjust_score", { p_actor: bob, p_user_id: bob, p_points: 100, p_reason: "nope" }),
      rpc("admin_reset_competition", { p_actor: bob, p_confirmation: "RESET" }),
      rpc("admin_update_scoring", { p_actor: bob, p_rules: [], p_default_points: 0, p_recalculate: false }),
      rpc("admin_set_flag", { p_actor: bob, p_id: ch, p_digest: "a".repeat(64) }),
      rpc("admin_list_challenges", { p_actor: bob }),
      rpc("admin_set_participant_disabled", { p_actor: null, p_user_id: alice, p_disabled: true, p_reason: null }),
    ];
    for (const r of await Promise.all(attempts)) {
      expect(r.error?.message).toMatch(/NOT_ADMIN/);
    }
  });

  it("admins can manage challenges, and every change is audited without secrets", async () => {
    const rpc = pgRpc(db.pool);
    const id = randomUUID();
    const secretFlag = "flag{super_secret_new_flag}";
    const created = await rpc("admin_create_challenge", {
      p_actor: admin,
      p_id: id,
      p_slug: "new-chal",
      p_title: "New",
      p_description: "desc",
      p_category: "Crypto",
      p_difficulty: "Hard",
      p_is_active: false,
      p_sort_order: 5,
      p_digest: digest(id, secretFlag),
    });
    expect(created.error).toBeNull();
    expect((await rpc("admin_update_challenge", { p_actor: admin, p_id: id, p_slug: null, p_title: "Renamed", p_description: null, p_category: null, p_difficulty: null, p_is_active: true, p_sort_order: null })).error).toBeNull();
    expect((await rpc("admin_set_flag", { p_actor: admin, p_id: id, p_digest: digest(id, "flag{rotated}") })).error).toBeNull();

    const row = await db.pool.query("select title, is_active from public.challenges where id = $1", [id]);
    expect(row.rows[0]).toEqual({ title: "Renamed", is_active: true });

    // New flag works, old one does not.
    const carol = await createUser(db.pool, "carol");
    expect((await submitDirect(db.pool, carol, id, secretFlag)).status).toBe("incorrect");
    expect((await submitDirect(db.pool, carol, id, "flag{rotated}")).status).toBe("correct");

    const audit = await db.pool.query("select action, details::text as d from public.audit_logs where target_id = $1 order by id", [id]);
    expect(audit.rows.map((r) => r.action)).toEqual(["challenge.create", "challenge.update", "challenge.flag_changed"]);
    const all = (await db.pool.query("select details::text as d from public.audit_logs")).rows.map((r) => r.d).join(" ");
    expect(all).not.toContain("super_secret");
    expect(all).not.toContain("rotated");
    expect(all).not.toMatch(/[0-9a-f]{64}/);
  });

  it("scoring changes are validated by constraints", async () => {
    const rpc = pgRpc(db.pool);
    const bad = await rpc("admin_update_scoring", {
      p_actor: admin,
      p_rules: [{ position: 1, points: -5 }],
      p_default_points: 0,
      p_recalculate: false,
    });
    expect(bad.error?.code).toBe("23514");
    const rules = await db.pool.query("select position, points from public.scoring_rules order by position");
    expect(rules.rows).toEqual([
      { position: 1, points: 20 },
      { position: 2, points: 30 },
      { position: 3, points: 50 },
    ]); // transaction rolled back
  });

  it("admins cannot disable themselves; disabling is audited", async () => {
    const rpc = pgRpc(db.pool);
    expect((await rpc("admin_set_participant_disabled", { p_actor: admin, p_user_id: admin, p_disabled: true, p_reason: null })).error?.message).toMatch(
      /CANNOT_DISABLE_SELF/,
    );
    expect((await rpc("admin_set_participant_disabled", { p_actor: admin, p_user_id: bob, p_disabled: true, p_reason: "test" })).error).toBeNull();
    const a = await db.pool.query("select action from public.audit_logs where action like 'participant.%' and target_id = $1", [bob]);
    expect(a.rows.map((r) => r.action)).toContain("participant.disable");
    await rpc("admin_set_participant_disabled", { p_actor: admin, p_user_id: bob, p_disabled: false, p_reason: null });
  });

  it("reset requires explicit confirmation and wipes scoring history atomically", async () => {
    const rpc = pgRpc(db.pool);
    expect((await rpc("admin_reset_competition", { p_actor: admin, p_confirmation: "yes" })).error?.message).toMatch(/CONFIRMATION_REQUIRED/);
    expect(Number((await db.pool.query("select count(*) from public.solves")).rows[0].count)).toBeGreaterThan(0);

    const res = await rpc<{ solves_deleted: number }>("admin_reset_competition", { p_actor: admin, p_confirmation: "RESET" });
    expect(res.error).toBeNull();
    expect(Number(res.data!.solves_deleted)).toBeGreaterThan(0);
    for (const t of ["solves", "submissions", "score_adjustments"]) {
      expect(Number((await db.pool.query(`select count(*) from public.${t}`)).rows[0].count)).toBe(0);
    }
    // participants, challenges and flags survive; positions restart at 1
    expect(Number((await db.pool.query("select count(*) from public.profiles")).rows[0].count)).toBeGreaterThan(0);
    expect((await submitDirect(db.pool, bob, ch, FLAG)).position).toBe(1);
    const audit = await db.pool.query("select action from public.audit_logs where action = 'competition.reset'");
    expect(audit.rows).toHaveLength(1);
  });
});
