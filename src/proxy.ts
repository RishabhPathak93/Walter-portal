import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

/**
 * Runs before every matched request:
 *  1. CSRF: rejects state-changing API requests that are not same-origin.
 *  2. Refreshes the Supabase session cookies (Supabase SSR pattern).
 *  3. Adds a per-request nonce-based Content-Security-Policy to pages.
 *  4. Optimistically redirects signed-out visitors away from /dashboard and
 *     /admin. (Real authorization is enforced again in every page and route.)
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Public, CDN-cacheable GET endpoints: never touch cookies here, so a cached
// response can never carry someone's Set-Cookie header.
const PUBLIC_CACHEABLE = [/^\/api\/leaderboard$/, /^\/api\/stats$/, /^\/api\/challenges(\/[a-z0-9-]+)?$/];

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  // Browsers always send Origin on cross-site POSTs; fall back to Fetch Metadata.
  return request.headers.get("sec-fetch-site") === "same-origin";
}

function buildCsp(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let supabaseOrigins = "";
  try {
    const u = new URL(supabaseUrl);
    supabaseOrigins = ` ${u.origin} ${u.protocol === "http:" ? "ws" : "wss"}://${u.host}`;
  } catch {
    // not configured
  }
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes (e.g. progress bar widths) are low-risk; scripts stay nonce-only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${supabaseOrigins}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && !SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
    return NextResponse.json(
      { ok: false, code: "csrf_rejected", message: "Cross-origin request rejected." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (isApi && request.method === "GET" && PUBLIC_CACHEABLE.some((re) => re.test(pathname))) {
    return NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = isApi ? null : buildCsp(nonce);

  const forward = () => {
    const headers = new Headers(request.headers);
    if (csp) {
      headers.set("x-nonce", nonce);
      headers.set("Content-Security-Policy", csp);
    }
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();
  let signedIn = false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = forward();
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
        },
      },
    });
    // Validates the JWT (and refreshes an expired session). Do not put code
    // between client creation and this call.
    try {
      const { data } = await supabase.auth.getClaims();
      signedIn = Boolean(data?.claims?.sub);
    } catch {
      signedIn = false;
    }
  }

  const needsAuth = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/");
  if (needsAuth && !signedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(loginUrl);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  if (csp) response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
