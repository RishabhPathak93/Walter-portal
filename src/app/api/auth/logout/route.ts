import { jsonOk, serverError } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** POST /api/auth/logout — clears the session cookies. */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return jsonOk({ signedOut: true }, { message: "Signed out." });
  } catch (error) {
    return serverError("logout", error);
  }
}
