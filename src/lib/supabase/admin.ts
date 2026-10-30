import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig, getSecretKey } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

/**
 * Privileged client using the Supabase secret (service-role) key.
 * Bypasses RLS — only call it after server-side authorization checks.
 * Never import this module from client components.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const { url } = getPublicSupabaseConfig();
    adminClient = createClient(url, getSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-application-name": "cyber-ctf-arena-server" } },
    });
  }
  return adminClient;
}
