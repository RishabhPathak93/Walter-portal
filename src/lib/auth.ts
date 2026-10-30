import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

export type SessionUser = {
  id: string;
  email: string | null;
};

export type Viewer = {
  user: SessionUser;
  username: string | null;
  isDisabled: boolean;
  isAdmin: boolean;
};

/**
 * Returns the verified current user, or null.
 * `auth.getUser()` validates the access token with the Supabase Auth server,
 * so a forged or revoked cookie never yields a user. The participant id is
 * always taken from here — never from the request body or query string.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
});

/** Admin status comes only from the protected `admins` table. */
export const isAdminUser = cache(async (userId: string): Promise<boolean> => {
  const { data, error } = await getSupabaseAdmin()
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Failed to verify administrator role");
  return Boolean(data);
});

/** Current user plus profile and role, for rendering navigation and pages. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const [{ data: profile }, isAdmin] = await Promise.all([
    getSupabaseAdmin().from("profiles").select("username, is_disabled").eq("id", user.id).maybeSingle(),
    isAdminUser(user.id),
  ]);
  return {
    user,
    username: profile?.username ?? null,
    isDisabled: Boolean(profile?.is_disabled),
    isAdmin,
  };
});
