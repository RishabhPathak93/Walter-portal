import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-handler authorization tests. Auth is mocked; the Supabase admin client
 * throws if touched, proving that unauthorized requests are rejected before
 * any privileged database access.
 */
const authState = vi.hoisted(() => ({ user: null as null | { id: string; email: string }, admin: false }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => authState.user,
  isAdminUser: async () => authState.admin,
  getViewer: async () => (authState.user ? { user: authState.user, username: "x", isDisabled: false, isAdmin: authState.admin } : null),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("privileged client must not be used");
  },
}));

const ORIGIN = "http://localhost:3000";
const uid = "11111111-1111-4111-8111-111111111111";

function req(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: { host: "localhost:3000", origin: ORIGIN, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) }) as never;

const adminRoutes = async () => [
  { name: "GET overview", call: async () => (await import("@/app/api/admin/overview/route")).GET() },
  { name: "GET challenges", call: async () => (await import("@/app/api/admin/challenges/route")).GET() },
  {
    name: "POST challenges",
    call: async () =>
      (await import("@/app/api/admin/challenges/route")).POST(
        req("/api/admin/challenges", "POST", { slug: "x-y", title: "t", description: "", category: "c", difficulty: "Easy", isActive: true, sortOrder: 0, flag: "flag{x}" }),
      ),
  },
  {
    name: "PATCH challenge",
    call: async () => (await import("@/app/api/admin/challenges/[id]/route")).PATCH(req(`/api/admin/challenges/${uid}`, "PATCH", { isActive: true }), ctx({ id: uid })),
  },
  {
    name: "PUT flag",
    call: async () => (await import("@/app/api/admin/challenges/[id]/flag/route")).PUT(req(`/api/admin/challenges/${uid}/flag`, "PUT", { flag: "flag{x}" }), ctx({ id: uid })),
  },
  { name: "GET scoring", call: async () => (await import("@/app/api/admin/scoring/route")).GET() },
  {
    name: "PATCH scoring",
    call: async () => (await import("@/app/api/admin/scoring/route")).PATCH(req("/api/admin/scoring", "PATCH", { rules: [], defaultPoints: 0, recalculate: false })),
  },
  { name: "GET competition", call: async () => (await import("@/app/api/admin/competition/route")).GET() },
  { name: "PATCH competition", call: async () => (await import("@/app/api/admin/competition/route")).PATCH(req("/api/admin/competition", "PATCH", {})) },
  { name: "GET participants", call: async () => (await import("@/app/api/admin/participants/route")).GET() },
  {
    name: "PATCH participant",
    call: async () => (await import("@/app/api/admin/participants/[id]/route")).PATCH(req(`/api/admin/participants/${uid}`, "PATCH", { disabled: true }), ctx({ id: uid })),
  },
  { name: "GET submissions", call: async () => (await import("@/app/api/admin/submissions/route")).GET(req("/api/admin/submissions")) },
  {
    name: "POST score-adjustments",
    call: async () => (await import("@/app/api/admin/score-adjustments/route")).POST(req("/api/admin/score-adjustments", "POST", { userId: uid, points: 5, reason: "xyz" })),
  },
  { name: "GET audit", call: async () => (await import("@/app/api/admin/audit/route")).GET(req("/api/admin/audit")) },
  { name: "GET leaderboard csv", call: async () => (await import("@/app/api/admin/leaderboard/route")).GET(req("/api/admin/leaderboard?format=csv")) },
  { name: "POST reset", call: async () => (await import("@/app/api/admin/reset/route")).POST(req("/api/admin/reset", "POST", { confirmation: "RESET" })) },
];

describe("route authorization", () => {
  beforeEach(() => {
    authState.user = null;
    authState.admin = false;
  });

  it("rejects unauthenticated flag submissions with 401", async () => {
    const { POST } = await import("@/app/api/challenges/[slug]/submit/route");
    const res = await POST(req("/api/challenges/locked-folder/submit", "POST", { flag: "flag{x}" }), ctx({ slug: "locked-folder" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: "authentication_required" });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects unauthenticated /api/me requests with 401", async () => {
    for (const mod of [await import("@/app/api/me/route"), await import("@/app/api/me/solves/route")]) {
      expect((await mod.GET()).status).toBe(401);
    }
    const subs = await import("@/app/api/me/submissions/route");
    expect((await subs.GET(req("/api/me/submissions"))).status).toBe(401);
  });

  it("rejects every admin endpoint for anonymous users (401)", async () => {
    for (const r of await adminRoutes()) {
      const res = await r.call();
      expect(res.status, r.name).toBe(401);
    }
  });

  it("rejects every admin endpoint for signed-in non-admins (403)", async () => {
    authState.user = { id: uid, email: "p@example.test" };
    authState.admin = false;
    for (const r of await adminRoutes()) {
      const res = await r.call();
      expect(res.status, r.name).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("forbidden");
    }
  });

  it("validates submission bodies before touching the database", async () => {
    authState.user = { id: uid, email: "p@example.test" };
    const { POST } = await import("@/app/api/challenges/[slug]/submit/route");
    const s = ctx({ slug: "locked-folder" });
    expect((await POST(req("/api/challenges/locked-folder/submit", "POST", {}), s)).status).toBe(400);
    expect((await POST(req("/api/challenges/locked-folder/submit", "POST", { flag: "   " }), s)).status).toBe(400);
    expect((await POST(req("/api/challenges/locked-folder/submit", "POST", { flag: "x".repeat(2000) }), s)).status).toBe(400);
    const notJson = new NextRequest(`${ORIGIN}/api/challenges/locked-folder/submit`, { method: "POST", body: "flag=x", headers: { "content-type": "text/plain" } });
    expect((await POST(notJson, s)).status).toBe(415);
    expect((await POST(req("/api/challenges/BAD_SLUG!/submit", "POST", { flag: "flag{x}" }), ctx({ slug: "BAD_SLUG!" }))).status).toBe(404);
  });

  it("never trusts a participant id, score or timestamp supplied in the body", async () => {
    // Extra fields are ignored by the schema; identity comes from the session only.
    const { flagSubmissionSchema } = await import("@/lib/validation");
    const parsed = flagSubmissionSchema.parse({ flag: "flag{x}", userId: "evil", points: 999, solvedAt: "2000-01-01" });
    expect(parsed).toEqual({ flag: "flag{x}" });
  });
});

describe("proxy CSRF protection", () => {
  it("rejects cross-origin state-changing API requests", async () => {
    const { proxy } = await import("@/proxy");
    const res = await proxy(
      new NextRequest(`${ORIGIN}/api/challenges/x/submit`, { method: "POST", headers: { host: "localhost:3000", origin: "https://evil.example" } }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("csrf_rejected");
  });

  it("rejects state-changing requests without Origin or same-origin fetch metadata", async () => {
    const { proxy } = await import("@/proxy");
    const res = await proxy(new NextRequest(`${ORIGIN}/api/admin/reset`, { method: "POST", headers: { host: "localhost:3000" } }));
    expect(res.status).toBe(403);
  });

  it("allows same-origin requests and adds a nonce-based CSP to pages", async () => {
    const { proxy } = await import("@/proxy");
    const ok = await proxy(new NextRequest(`${ORIGIN}/api/auth/logout`, { method: "POST", headers: { host: "localhost:3000", origin: ORIGIN } }));
    expect(ok.status).toBe(200);
    const page = await proxy(new NextRequest(`${ORIGIN}/challenges`, { headers: { host: "localhost:3000" } }));
    const csp = page.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("redirects signed-out visitors away from /dashboard and /admin", async () => {
    const { proxy } = await import("@/proxy");
    for (const p of ["/dashboard", "/admin/challenges"]) {
      const res = await proxy(new NextRequest(`${ORIGIN}${p}`, { headers: { host: "localhost:3000" } }));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain(`/login?next=${encodeURIComponent(p)}`);
    }
  });
});
