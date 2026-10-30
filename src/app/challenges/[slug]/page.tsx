import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, CardHeader, Container, DifficultyBadge, tableClass, tdClass, thClass } from "@/components/ui";
import { CompetitionStatusBadge, STATE_META } from "@/components/competition-status";
import { LinkifiedText } from "@/components/linkified-text";
import { LocalTime } from "@/components/local-time";
import { SubmitFlagForm } from "@/components/submit-flag-form";
import { getCompetition, getMySolves, getMySubmissions, getPublicChallenge } from "@/lib/services/queries";
import { getViewer } from "@/lib/auth";
import { slugSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/challenges/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return { title: "Challenge" };
  const c = await getPublicChallenge(parsed.data).catch(() => null);
  return { title: c?.title ?? "Challenge" };
}

const OUTCOME: Record<string, { label: string; tone: "accent" | "danger" | "info" }> = {
  correct: { label: "correct", tone: "accent" },
  incorrect: { label: "incorrect", tone: "danger" },
  already_solved: { label: "re-submitted", tone: "info" },
};

export default async function ChallengePage({ params }: PageProps<"/challenges/[slug]">) {
  const { slug } = await params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) notFound();

  const [competition, challenge, viewer] = await Promise.all([
    getCompetition(),
    getPublicChallenge(parsed.data),
    getViewer().catch(() => null),
  ]);
  if (!challenge) notFound();

  const [solves, history] = viewer
    ? await Promise.all([getMySolves(), getMySubmissions(1, 10, challenge.id)])
    : [[], { items: [], total: 0 }];
  const mine = solves.find((s) => s.challengeId === challenge.id);
  const open = competition.state === "running";

  return (
    <Container className="max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-6 font-mono text-sm text-muted">
        <Link href="/challenges" className="hover:text-accent">
          challenges
        </Link>{" "}
        / <span className="text-fg">{challenge.slug}</span>
      </nav>

      <div className="mb-6 animate-fade-in">
        <p className="font-mono text-xs uppercase tracking-wider text-accent">{challenge.category}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{challenge.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={challenge.difficulty} />
          <CompetitionStatusBadge state={competition.state} />
          {mine ? <Badge tone="accent">✓ solved by you</Badge> : null}
          <Badge>{challenge.solveCount} solve{challenge.solveCount === 1 ? "" : "s"}</Badge>
          {!mine ? <Badge tone="info">next solver: {challenge.nextPoints} pts</Badge> : null}
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader title="Briefing" />
          <div className="p-5">
            {challenge.description.trim() ? (
              <LinkifiedText text={challenge.description} />
            ) : (
              <p className="text-muted">No description has been published for this challenge yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Flag submission" description="Flags are verified on the server. Surrounding spaces are ignored; everything else must match exactly." />
          <div className="space-y-4 p-5">
            {mine ? (
              <Alert tone="accent" title="You solved this challenge">
                You were solver #{mine.position} and earned {mine.points} points on <LocalTime iso={mine.solvedAt} />.
              </Alert>
            ) : null}
            {!viewer ? (
              <Alert tone="info">
                <Link href={`/login?next=/challenges/${challenge.slug}`} className="text-accent underline">
                  Sign in
                </Link>{" "}
                to submit a flag.
              </Alert>
            ) : viewer.isDisabled ? (
              <Alert tone="danger">Your competition access is disabled.</Alert>
            ) : !open ? (
              <Alert tone={STATE_META[competition.state].tone}>{STATE_META[competition.state].message}</Alert>
            ) : (
              <SubmitFlagForm slug={challenge.slug} alreadySolved={Boolean(mine)} />
            )}
          </div>
        </Card>

        {viewer ? (
          <Card>
            <CardHeader title="Your attempts" description={`${history.total} attempt${history.total === 1 ? "" : "s"} on this challenge`} />
            {history.items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No attempts yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead className="border-b border-line">
                    <tr>
                      <th scope="col" className={thClass}>Time</th>
                      <th scope="col" className={thClass}>Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {history.items.map((s) => (
                      <tr key={s.id}>
                        <td className={tdClass}>
                          <LocalTime iso={s.createdAt} />
                        </td>
                        <td className={tdClass}>
                          <Badge tone={OUTCOME[s.outcome]?.tone ?? "neutral"}>{OUTCOME[s.outcome]?.label ?? s.outcome}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}
      </div>
    </Container>
  );
}
