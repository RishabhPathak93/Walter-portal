import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import pg from "pg";
import type { RpcCaller } from "@/lib/services/rpc";

/**
 * Integration-test harness: creates a throw-away database on a real PostgreSQL
 * server, applies a small Supabase shim (auth schema, API roles, auth.uid())
 * and then the project's REAL migrations from supabase/migrations.
 *
 * Set TEST_DATABASE_URL to a server you can create databases on, e.g.
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres
 * (see scripts/test-db.sh). Without it, DB tests are skipped.
 */

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasDb = Boolean(TEST_DATABASE_URL);
export const HMAC_SECRET = "test-secret-0123456789abcdef0123456789abcdef";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export type TestDb = { pool: pg.Pool; name: string; drop: () => Promise<void> };

export async function createTestDb(): Promise<TestDb> {
  const name = `ctf_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 70 });
  // Idle clients can be terminated when the database is dropped; ignore that.
  pool.on("error", () => undefined);

  const files = [
    join(ROOT, "tests/db/supabase-shim.sql"),
    ...readdirSync(join(ROOT, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join(ROOT, "supabase/migrations", f)),
  ];
  for (const file of files) {
    await pool.query(readFileSync(file, "utf8"));
  }

  return {
    pool,
    name,
    drop: async () => {
      await pool.end();
      const c = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

/** RpcCaller backed directly by PostgreSQL (mirrors supabase-js .rpc semantics). */
export function pgRpc(pool: pg.Pool): RpcCaller {
  const meta = new Map<string, boolean>();
  return async <T,>(fn: string, args: Record<string, unknown> = {}) => {
    try {
      if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error("bad function name");
      if (!meta.has(fn)) {
        const r = await pool.query("select proretset from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [fn]);
        if (!r.rows[0]) throw new Error(`function ${fn} not found`);
        meta.set(fn, r.rows[0].proretset as boolean);
      }
      const keys = Object.keys(args);
      const values = keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
      });
      const named = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
      if (meta.get(fn)) {
        const r = await pool.query(`select * from public.${fn}(${named})`, values);
        return { data: r.rows as T, error: null };
      }
      const r = await pool.query(`select public.${fn}(${named}) as result`, values);
      return { data: (r.rows[0]?.result ?? null) as T, error: null };
    } catch (e) {
      const err = e as { message: string; code?: string };
      return { data: null, error: { message: err.message, code: err.code } };
    }
  };
}

/** Same digest as src/lib/flags.ts (duplicated deliberately to catch drift). */
export function digest(challengeId: string, flag: string): string {
  return createHmac("sha256", HMAC_SECRET).update(`ctf-flag:v1:${challengeId}:${flag.trim()}`, "utf8").digest("hex");
}

/** Creates an auth user; the registration trigger creates the profile. */
export async function createUser(pool: pg.Pool, username: string, opts: { email?: string; bypass?: boolean } = {}) {
  const id = randomUUID();
  await pool.query(
    "insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3, $4)",
    [
      id,
      opts.email ?? `${username.toLowerCase()}-${id.slice(0, 6)}@example.test`,
      JSON.stringify({ username }),
      JSON.stringify(opts.bypass ? { ctf_bypass_registration: true } : {}),
    ],
  );
  return id;
}

export async function makeAdmin(pool: pg.Pool, userId: string) {
  await pool.query("insert into public.admins (user_id) values ($1)", [userId]);
}

export async function createChallenge(
  pool: pg.Pool,
  slug: string,
  flag: string,
  opts: { active?: boolean; title?: string; category?: string; difficulty?: string } = {},
) {
  const id = randomUUID();
  const rpc = pgRpc(pool);
  const { data, error } = await rpc<string>("seed_challenge", {
    p_id: id,
    p_slug: slug,
    p_title: opts.title ?? slug,
    p_description: "test",
    p_category: opts.category ?? "Web Security",
    p_difficulty: opts.difficulty ?? "Easy",
    p_is_active: opts.active ?? true,
    p_sort_order: 0,
    p_digest: digest(id, flag),
    p_overwrite_metadata: false,
  });
  if (error) throw new Error(error.message);
  return data!;
}

/** Calls submit_flag directly (bypassing the Node service). */
export async function submitDirect(pool: pg.Pool, userId: string, challengeId: string, flag: string, ipHash: string | null = null) {
  const r = await pool.query("select public.submit_flag($1, $2, $3, $4) as result", [userId, challengeId, digest(challengeId, flag), ipHash]);
  return r.rows[0].result as { status: string; position?: number; points?: number; solved_at?: string; retry_after?: number; state?: string };
}

/**
 * Runs `fn` as a Supabase API role with optional JWT claims, inside a
 * transaction that is always rolled back.
 */
export async function asRole<T>(
  pool: pg.Pool,
  role: "anon" | "authenticated",
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    if (userId) {
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role })]);
    }
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

/** Expects a query run as an API role to fail (permission denied / RLS). */
export async function queryError(client: pg.PoolClient, sql: string, params: unknown[] = []): Promise<string | null> {
  await client.query("savepoint s");
  try {
    await client.query(sql, params);
    await client.query("release savepoint s");
    return null;
  } catch (e) {
    await client.query("rollback to savepoint s");
    return (e as Error).message;
  }
}
