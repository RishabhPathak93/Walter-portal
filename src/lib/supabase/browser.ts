"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let realtimeClient: SupabaseClient | null = null;

/**
 * Browser client used ONLY for the public Realtime leaderboard signal.
 * It holds the public URL and publishable key, runs as `anon`, and never
 * touches the user's session (auth cookies are httpOnly).
 */
export function getRealtimeClient(url: string, publishableKey: string): SupabaseClient {
  if (!realtimeClient) {
    realtimeClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return realtimeClient;
}
