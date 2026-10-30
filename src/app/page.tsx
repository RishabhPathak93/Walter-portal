import { Alert, Card, CardHeader, Container, LinkButton, StatCard } from "@/components/ui";
import { CompetitionStatusBadge, STATE_META } from "@/components/competition-status";
import { Countdown } from "@/components/countdown";
import { LocalTime } from "@/components/local-time";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { ScoringExplainer } from "@/components/scoring-explainer";
import { getCompetition, getLeaderboard, getPublicStats, getScoringRules } from "@/lib/services/queries";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { DEFAULT_NAME, DEFAULT_TAGLINE } from "@/lib/site";

export const dynamic = "force-dynamic";

async function loadLanding() {
  if (!isSupabaseConfigured()) return null;
  try {
    const [competition, stats, scoring, top, viewer] = await Promise.all([
      getCompetition(),
      getPublicStats(),
      getScoringRules(),
      getLeaderboard(5, 0),
      getViewer(),
    ]);
    return { competition, stats, scoring, top, viewer };
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const data = await loadLanding();
  const c = data?.competition;
  const name = c?.name ?? DEFAULT_NAME;
  const tagline = c?.tagline || DEFAULT_TAGLINE;

  return (
    <Container className="space-y-12">
      {/* Hero */}
      <section className="bg-grid relative overflow-hidden rounded-2xl border border-line bg-surface/60 px-6 py-14 sm:px-12 sm:py-20 animate-fade-in">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            {c ? <CompetitionStatusBadge state={c.state} /> : null}
            <span className="font-mono text-xs text-muted">individual capture the flag</span>
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-fg sm:text-6xl">
            {name}
            <span aria-hidden="true" className="ml-1 text-accent animate-blink">
              _
            </span>
          </h1>
          <p className="mt-4 font-mono text-base text-accent sm:text-lg">{tagline}</p>
          {c?.description ? <p className="mt-5 max-w-2xl text-muted">{c.description}</p> : null}

          {c ? (
            <dl className="mt-6 grid max-w-xl grid-cols-1 gap-3 font-mono text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-bg/50 px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-muted">Starts</dt>
                <dd className="mt-1 text-fg">{c.startAt ? <LocalTime iso={c.startAt} /> : "Open start"}</dd>
              </div>
              <div className="rounded-lg border border-line bg-bg/50 px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-muted">Ends</dt>
                <dd className="mt-1 text-fg">{c.endAt ? <LocalTime iso={c.endAt} /> : "No end time set"}</dd>
              </div>
            </dl>
          ) : null}
          {c?.state === "not_started" && c.startAt ? (
            <div className="mt-4">
              <Countdown target={c.startAt} label="Starts in" />
            </div>
          ) : null}
          {c?.state === "running" && c.endAt ? (
            <div className="mt-4">
              <Countdown target={c.endAt} label="Ends in" />
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            {data?.viewer ? (
              <LinkButton href="/dashboard" size="lg">
                Go to dashboard
              </LinkButton>
            ) : (
              <>
                {c?.registrationOpen !== false ? (
                  <LinkButton href="/register" size="lg">
                    Register
                  </LinkButton>
                ) : null}
                <LinkButton href="/login" size="lg" variant="secondary">
                  Sign in
                </LinkButton>
              </>
            )}
            <LinkButton href="/challenges" size="lg" variant="secondary">
              Explore challenges
            </LinkButton>
            <LinkButton href="/leaderboard" size="lg" variant="ghost">
              View leaderboard →
            </LinkButton>
          </div>
        </div>
      </section>

      {c && c.state !== "running" ? (
        <Alert tone={STATE_META[c.state].tone} title={STATE_META[c.state].label}>
          {STATE_META[c.state].message}
          {c.state === "not_started" && !c.registrationOpen ? " Registration is currently closed." : null}
        </Alert>
      ) : null}
      {c && !c.registrationOpen && c.state !== "not_started" && !data?.viewer ? (
        <Alert tone="warn">Registration is currently closed.</Alert>
      ) : null}
      {!data && isSupabaseConfigured() ? (
        <Alert tone="danger" title="Live data unavailable">
          Competition data could not be loaded right now. Please refresh in a moment.
        </Alert>
      ) : null}

      {/* Stats */}
      {data ? (
        <section aria-label="Competition statistics" className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Participants" value={data.stats.participants} hint="registered individuals" />
          <StatCard label="Active challenges" value={data.stats.activeChallenges} />
          <StatCard label="Accepted solves" value={data.stats.acceptedSolves} hint="first correct submissions" />
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Leaderboard preview */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Top participants"
            description="Live standings"
            action={
              <LinkButton href="/leaderboard" size="sm" variant="secondary">
                Full board
              </LinkButton>
            }
          />
          {data && data.top.length > 0 ? (
            <LeaderboardTable entries={data.top} compact />
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">No participants ranked yet. Be the first on the board.</p>
          )}
        </Card>

        {/* Scoring */}
        <Card className="lg:col-span-3">
          <CardHeader title="How scoring works" description="Speed matters — the order of correct solves decides the points." />
          <div className="p-5">
            <ScoringExplainer
              rules={data?.scoring.rules ?? [
                { position: 1, points: 20 },
                { position: 2, points: 30 },
                { position: 3, points: 50 },
              ]}
              defaultPoints={c?.defaultPoints ?? 0}
            />
          </div>
        </Card>
      </div>
    </Container>
  );
}
