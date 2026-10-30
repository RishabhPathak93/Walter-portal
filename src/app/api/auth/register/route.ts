import type { NextRequest } from "next/server";
import { registerSchema } from "@/lib/validation";
import { jsonError, jsonOk, parseJson, serverError } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublic } from "@/lib/supabase/public";
import { getCompetition } from "@/lib/services/queries";

/**
 * POST /api/auth/register  { email, password, username }
 * Uses Supabase Auth (passwords are hashed and stored by Supabase, never here).
 * The database trigger re-validates the username and registration status, so
 * calling Supabase Auth directly cannot bypass these rules.
 */
export async function POST(request: NextRequest) {
  const body = await parseJson(request, registerSchema);
  if (body.response) return body.response;
  const { email, password, username } = body.data;

  try {
    const competition = await getCompetition();
    if (!competition.registrationOpen) {
      return jsonError(403, "registration_closed", "Registration is currently closed.");
    }

    const { data: available, error: availError } = await getSupabasePublic().rpc("username_available", {
      p_username: username,
    });
    if (availError) return serverError("register:username", availError);
    if (!available) return jsonError(409, "username_taken", "That username is not available. Please choose another.");

    const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username }, emailRedirectTo: `${origin}/auth/confirm?next=/dashboard` },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("database error")) {
        // Trigger rejected it: username race, reserved name or registration just closed.
        return jsonError(409, "username_taken", "That username is not available or registration is closed.");
      }
      if (msg.includes("already registered") || error.code === "user_already_exists") {
        return jsonError(409, "email_taken", "An account with this email already exists. Try signing in.");
      }
      if (error.code === "weak_password" || msg.includes("password")) {
        return jsonError(400, "weak_password", "Password does not meet the security requirements.");
      }
      if (error.status === 429) {
        return jsonError(429, "rate_limited", "Too many sign-up attempts. Please wait and try again.");
      }
      console.error("[register]", error.code, error.message);
      return jsonError(400, "registration_failed", "Registration failed. Please check your details and try again.");
    }

    const needsEmailConfirmation = !data.session;
    return jsonOk(
      { needsEmailConfirmation },
      {
        status: 201,
        message: needsEmailConfirmation
          ? "Account created. Check your email to confirm your address, then sign in."
          : "Account created. Welcome to the arena!",
      },
    );
  } catch (error) {
    return serverError("register", error);
  }
}
