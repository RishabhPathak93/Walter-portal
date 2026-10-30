import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Container,
  DifficultyBadge,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
  tableClass,
  tdClass,
  thClass,
} from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Pagination } from "@/components/pagination";
import { getViewer } from "@/lib/auth";
import {
  getCompetition,
  getMyScoreAdjustments,
  getMySolves,
  getMyStanding,
  getMySubmissions,
  getPublicChallenges,
} from "@/lib/services/queries";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;
const OUTCOME: Record<string, { label: string; tone: "accent" | "danger" | "info" }> = {
  correct: { label: "correct", tone: "accent" },
  incorrect: { label: "incorrect", tone: "danger" },
  already_solved: { label: "re-submitted", tone: "info" },
};

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));

  const [competition, standing, solves, challenges, history, adjustments] = await Promise.all([
    getCompetition(),
    getMyStanding(),
    getMySolves(),
    getPublicChallenges(),
    getMySubmissions(page, PAGE_SIZE),
    getMyScoreAdjustments(),
  ]);

  const solvedIds = new Set(solves.map((s) => s.challengeId));
  const unsolved = challenges.filter((c) => !solvedIds.has(c.id));
  const totalActive = challenges.length;
  const solvedActive = challenges.filter((c) => solvedIds.has(c.id)).length;
  const totalPoints = standing?.score ?? solves.reduce((a, s) => a + s.points, 0) + adjustments.reduce((a, s) => a + s.points, 0);

  return (
    <Container>
      <PageHeader
        eyebrow={`whoami → ${viewer.username ?? "participant"}`}
        title={<span className="font-mono">@{viewer.username ?? "participant"}</span>}
        description="Your personal progress. Scores and timestamps are recorded by the server and cannot be edited."
      />

      {viewer.isAdmin ? (
        <Alert tone="info" className="mb-6">
          Administrator accounts are excluded from the public leaderboard. Manage the competition from the{" "}
          <Link href="/admin" className="text-accent underline">
            admin dashboard
          </Link>
          .
        </Alert>
      ) : null}

      <section aria-label="Your stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Current rank"
          value={standing ? `#${standing.rank}` : "—"}
          hint={standing ? `of ${standing.totalRanked} participants` : viewer.isAdmin ? "admins are not ranked" : "not ranked"}
        />
        <StatCard label="Total points" value={totalPoints} />
        <StatCard label="Solved" value={solves.length} hint="challenges" />
        <StatCard label="Remaining" value={unsolved.length} hint="active challenges" />
      </section>

      <Card className="mt-6 p-5">
        <ProgressBar value={solvedActive} max={totalActive} label="Active challenges solved" />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Accepted solves" description="Your first correct submission for each challenge" />
          {solves.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No solves yet">Pick a challenge and capture your first flag.</EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead className="border-b border-line">
                  <tr>
                    <th scope="col" className={thClass}>Challenge</th>
                    <th scope="col" className={`${thClass} text-right`}>Position</th>
                    <th scope="col" className={`${thClass} text-right`}>Points</th>
                    <th scope="col" className={`${thClass} text-right`}>Solved at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {solves.map((s) => (
                    <tr key={s.challengeId}>
                      <td className={tdClass}>
                        {s.slug ? (
                          <Link href={`/challenges/${s.slug}`} className="hover:text-accent">
                            {s.title}
                          </Link>
                        ) : (
                          s.title ?? "(removed)"
                        )}
                        {s.category ? <span className="ml-2 font-mono text-xs text-muted">{s.category}</span> : null}
                      </td>
                      <td className={`${tdClass} text-right font-mono tabular-nums`}>#{s.position}</td>
                      <td className={`${tdClass} text-right font-mono font-semibold tabular-nums text-accent`}>{s.points}</td>
                      <td className={`${tdClass} text-right text-muted`}>
                        <LocalTime iso={s.solvedAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {adjustments.length > 0 ? (
            <div className="border-t border-line px-5 py-4">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted">Organizer score adjustments</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {adjustments.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2">
                    <span className="text-muted">{a.reason}</span>
                    <span className={`font-mono tabular-nums ${a.points > 0 ? "text-accent" : "text-danger"}`}>
                      {a.points > 0 ? "+" : ""}
                      {a.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Unsolved challenges" />
          {!competition.challengesVisible ? (
            <p className="px-5 py-6 text-sm text-muted">Challenges unlock when the competition starts.</p>
          ) : unsolved.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">{totalActive > 0 ? "All active challenges solved. Impressive." : "No active challenges."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {unsolved.map((c) => (
                <li key={c.id}>
                  <Link href={`/challenges/${c.slug}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2/60">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="font-mono text-xs text-muted">{c.category}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <DifficultyBadge difficulty={c.difficulty} />
                      <span className="font-mono text-xs text-accent">{c.nextPoints} pts</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6" id="history">
        <CardHeader title="Submission history" description="Every flag you submitted (the submitted text is never stored)" />
        {history.items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={thClass}>Time</th>
                  <th scope="col" className={thClass}>Challenge</th>
                  <th scope="col" className={thClass}>Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.items.map((s) => (
                  <tr key={s.id}>
                    <td className={`${tdClass} text-muted`}>
                      <LocalTime iso={s.createdAt} />
                    </td>
                    <td className={tdClass}>{s.title ?? "(removed)"}</td>
                    <td className={tdClass}>
                      <Badge tone={OUTCOME[s.outcome]?.tone ?? "neutral"}>{OUTCOME[s.outcome]?.label ?? s.outcome}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={history.total} basePath="/dashboard" />
      </Card>
    </Container>
  );
}
