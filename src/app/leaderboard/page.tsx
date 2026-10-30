import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { CompetitionStatusBadge } from "@/components/competition-status";
import { LiveLeaderboard } from "@/components/live-leaderboard";
import { getCompetition, getLeaderboard } from "@/lib/services/queries";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [entries, competition, viewer] = await Promise.all([
    getLeaderboard(200, 0).catch(() => null),
    getCompetition().catch(() => null),
    getViewer().catch(() => null),
  ]);

  return (
    <Container className="max-w-5xl">
      <PageHeader
        eyebrow="cat /var/log/scores"
        title="Leaderboard"
        description="Sorted by total score, then by who reached that score first. Updates automatically."
        actions={competition ? <CompetitionStatusBadge state={competition.state} /> : null}
      />
      <LiveLeaderboard
        initialEntries={entries ?? []}
        initialGeneratedAt={new Date().toISOString()}
        initialError={entries === null}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null}
        supabaseKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null}
        highlightUsername={viewer?.username ?? null}
      />
    </Container>
  );
}
