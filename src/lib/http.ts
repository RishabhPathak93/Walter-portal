import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { firstIssue } from "@/lib/validation";
import { getCurrentUser, isAdminUser, type SessionUser } from "@/lib/auth";

/**
 * Uniform JSON responses:  { ok, code, message, data? }
 * Errors never include stack traces, SQL errors or secret values.
 */

export const PRIVATE_NO_STORE = "private, no-store, max-age=0";

export function publicCache(sMaxAge: number, staleWhileRevalidate = 0): string {
  const swr = staleWhileRevalidate > 0 ? `, stale-while-revalidate=${staleWhileRevalidate}` : "";
  return `public, max-age=0, s-maxage=${sMaxAge}${swr}`;
}

export function jsonOk<T>(data: T, init: { status?: number; cache?: string; message?: string } = {}) {
  return NextResponse.json(
    { ok: true, code: "ok", message: init.message ?? "OK", data },
    { status: init.status ?? 200, headers: { "Cache-Control": init.cache ?? PRIVATE_NO_STORE } },
  );
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return NextResponse.json(
    { ok: false, code, message, ...extra },
    { status, headers: { "Cache-Control": PRIVATE_NO_STORE, ...headers } },
  );
}

export const unauthenticated = () => jsonError(401, "authentication_required", "Please sign in to continue.");
export const forbidden = () => jsonError(403, "forbidden", "You do not have permission to perform this action.");

/** Logs the real error server-side and returns a generic 500. */
export function serverError(context: string, error: unknown) {
  console.error(`[${context}]`, error instanceof Error ? error.message : error);
  return jsonError(500, "server_error", "An unexpected error occurred. Please try again.");
}

/** Parses and validates a JSON body. Returns either data or a 400 response. */
export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T; response?: undefined } | { data?: undefined; response: NextResponse }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { response: jsonError(415, "unsupported_media_type", "Requests must be sent as JSON.") };
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 64 * 1024) {
      return { response: jsonError(413, "payload_too_large", "Request body is too large.") };
    }
    body = JSON.parse(text);
  } catch {
    return { response: jsonError(400, "invalid_json", "Request body must be valid JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { response: jsonError(400, "validation_error", firstIssue(parsed.error)) };
  }
  return { data: parsed.data };
}

/** Requires a verified participant session. */
export async function requireUser(): Promise<{ user: SessionUser; response?: undefined } | { user?: undefined; response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { response: unauthenticated() };
  return { user };
}

/** Requires a verified session AND a row in the protected admins table. */
export async function requireAdmin(): Promise<{ user: SessionUser; response?: undefined } | { user?: undefined; response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { response: unauthenticated() };
  try {
    if (!(await isAdminUser(user.id))) return { response: forbidden() };
  } catch (error) {
    return { response: serverError("requireAdmin", error) };
  }
  return { user };
}

/**
 * Client IP as seen by the platform. On Vercel, x-forwarded-for / x-real-ip are
 * set by the edge network (client-supplied values are overwritten).
 */
export function getClientIp(request: Request): string | null {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return null;
}

/** Maps a few known database exceptions to safe messages. */
export function mapDbError(error: { message?: string; code?: string } | null | undefined) {
  const msg = error?.message ?? "";
  if (msg.includes("NOT_ADMIN")) return jsonError(403, "forbidden", "Administrator privileges are required.");
  if (msg.includes("CHALLENGE_NOT_FOUND")) return jsonError(404, "not_found", "Challenge not found.");
  if (msg.includes("PARTICIPANT_NOT_FOUND")) return jsonError(404, "not_found", "Participant not found.");
  if (msg.includes("CANNOT_DISABLE_SELF")) return jsonError(400, "invalid_request", "You cannot disable your own account.");
  if (msg.includes("CONFIRMATION_REQUIRED")) return jsonError(400, "confirmation_required", "Explicit confirmation is required.");
  if (error?.code === "23505") return jsonError(409, "conflict", "A record with that value already exists (for example, a duplicate slug).");
  if (error?.code === "23514" || error?.code === "22023") return jsonError(400, "validation_error", "One or more values are invalid.");
  return null;
}
