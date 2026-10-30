import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Card, Container, DifficultyBadge, EmptyState, PageHeader } from "@/components/ui";
import { CompetitionStatusBadge, STATE_META } from "@/components/competition-status";
import { getCompetition, getMySolves, getPublicChallenges } from "@/lib/services/queries";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Challenges" };
export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  let loadError = false;
  const user = await getCurrentUser().catch(() => null);
  const [competition, challenges, solves] = await Promise.all([
    getCompetition().catch(() => {
      loadError = true;
      return null;
    }),
    getPublicChallenges().catch(() => {
      loadError = true;
      return [];
    }),
    user ? getMySolves().catch(() => []) : Promise.resolve([]),
  ]);
  const solved = new Map(solves.map((s) => [s.challengeId, s]));

  return (
    <Container>
      <PageHeader
        eyebrow="ls ./challenges"
        title="Challenges"
        description="Investigate each target, find the hidden flag and submit it. The first three correct solvers of each challenge earn points."
        actions={competition ? <CompetitionStatusBadge state={competition.state} /> : null}
      />

      {loadError ? (
        <Alert tone="danger" title="Could not load challenges" className="mb-6">
          Please refresh the page in a moment.
        </Alert>
      ) : null}
      {competition && competition.state !== "running" ? (
        <Alert tone={STATE_META[competition.state].tone} className="mb-6">
          {STATE_META[competition.state].message}
        </Alert>
      ) : null}
      {!user && !loadError ? (
        <Alert tone="info" className="mb-6">
          <Link href="/login?next=/challenges" className="text-accent underline">
            Sign in
          </Link>{" "}
          to submit flags and track your progress.
        </Alert>
      ) : null}

      {competition && !competition.challengesVisible ? (
        <EmptyState title="Challenges are hidden until the competition starts">
          Come back at the start time. Registration may already be open.
        </EmptyState>
      ) : challenges.length === 0 && !loadError ? (
        <EmptyState title="No active challenges yet">The organizer has not published any challenges.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {challenges.map((c) => {
            const mine = solved.get(c.id);
            return (
              <li key={c.id}>
                <Link
                  href={`/challenges/${c.slug}`}
                  className="group block h-full rounded-xl border border-line bg-surface/80 p-5 transition-colors hover:border-accent/60 hover:bg-surface-2/80 animate-fade-in"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-mono text-xs uppercase tracking-wider text-muted">{c.category}</p>
                    {mine ? (
                      <Badge tone="accent" aria-label="Solved">
                        ✓ solved
                      </Badge>
                    ) : (
                      <Badge>unsolved</Badge>
                    )}
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-fg group-hover:text-accent">{c.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <DifficultyBadge difficulty={c.difficulty} />
                    <Badge tone={competition?.state === "running" ? "accent" : "neutral"}>
                      {competition?.state === "running" ? "open" : "closed"}
                    </Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
                    <div>
                      <dt className="text-muted">Solves</dt>
                      <dd className="mt-0.5 font-mono text-sm tabular-nums">{c.solveCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{mine ? "You earned" : "Next solver earns"}</dt>
                      <dd className="mt-0.5 font-mono text-sm tabular-nums text-accent">{mine ? mine.points : c.nextPoints} pts</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
