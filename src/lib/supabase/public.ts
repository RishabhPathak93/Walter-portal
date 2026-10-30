import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/env";

let publicClient: SupabaseClient | null = null;

/**
 * Stateless client with the publishable key and no user session.
 * Runs as the `anon` role — used for public read models so that even a bug in
 * a public route cannot reach privileged data.
 */
export function getSupabasePublic(): SupabaseClient {
  if (!publicClient) {
    const { url, publishableKey } = getPublicSupabaseConfig();
    publicClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return publicClient;
}
