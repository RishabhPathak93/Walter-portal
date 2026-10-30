import type { NextRequest } from "next/server";
import { loginSchema } from "@/lib/validation";
import { jsonError, jsonOk, parseJson, serverError } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** POST /api/auth/login  { email, password } — sets secure httpOnly session cookies. */
export async function POST(request: NextRequest) {
  const body = await parseJson(request, loginSchema);
  if (body.response) return body.response;

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(body.data);
    if (error) {
      if (error.code === "email_not_confirmed") {
        return jsonError(403, "email_not_confirmed", "Please confirm your email address before signing in.");
      }
      if (error.status === 429) {
        return jsonError(429, "rate_limited", "Too many sign-in attempts. Please wait and try again.");
      }
      // Same message for unknown email and wrong password (no account enumeration).
      return jsonError(401, "invalid_credentials", "Invalid email or password.");
    }
    return jsonOk({ signedIn: true }, { message: "Signed in." });
  } catch (error) {
    return serverError("login", error);
  }
}
