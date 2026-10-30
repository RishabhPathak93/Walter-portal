import "server-only";
import { getViewer, type Viewer } from "@/lib/auth";
import { getCompetition } from "@/lib/services/queries";
import { isSupabaseConfigured } from "@/lib/env";
import type { CompetitionPublic } from "@/lib/types";

export const DEFAULT_NAME = "Cyber CTF Arena";
export const DEFAULT_TAGLINE = "Find the Flag. Solve the Challenge. Claim Your Rank.";

/** Layout data that degrades gracefully when Supabase is unreachable or unconfigured. */
export async function getShellData(): Promise<{
  viewer: Viewer | null;
  competition: CompetitionPublic | null;
  configured: boolean;
}> {
  const configured = isSupabaseConfigured();
  if (!configured) return { viewer: null, competition: null, configured };
  const [viewer, competition] = await Promise.all([
    getViewer().catch((e) => {
      console.error("[shell:viewer]", e instanceof Error ? e.message : e);
      return null;
    }),
    getCompetition().catch(() => null),
  ]);
  return { viewer, competition, configured };
}
