import { Badge, Card, CardHeader, EmptyState, PageHeader, Select, buttonClass, tableClass, tdClass, thClass } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Pagination } from "@/components/pagination";
import { requireAdminPage } from "@/lib/admin-page";
import { listChallenges, listParticipants, listSubmissions } from "@/lib/services/admin";
import { adminSubmissionsQuerySchema } from "@/lib/validation";

const OUTCOME_TONE: Record<string, "accent" | "danger" | "info"> = { correct: "accent", incorrect: "danger", already_solved: "info" };

export default async function AdminSubmissionsPage({ searchParams }: PageProps<"/admin/submissions">) {
  const viewer = await requireAdminPage();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const parsed = adminSubmissionsQuerySchema.safeParse({
    view: str("view"),
    userId: str("userId"),
    challengeId: str("challengeId"),
    outcome: str("outcome"),
    page: str("page"),
    pageSize: 50,
  });
  const f = parsed.success ? parsed.data : adminSubmissionsQuerySchema.parse({ pageSize: 50 });

  const [result, participants, challenges] = await Promise.all([
    listSubmissions(f),
    listParticipants(viewer.user.id),
    listChallenges(viewer.user.id),
  ]);

  return (
    <>
      <PageHeader title="Submissions" description="Accepted solves with positions and points, or every attempt. Submitted flag text is never stored." />

      <Card className="mb-6">
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-5 sm:items-end">
          <div>
            <label htmlFor="f-view" className="mb-1 block text-xs text-muted">View</label>
            <Select id="f-view" name="view" defaultValue={f.view}>
              <option value="attempts">All attempts</option>
              <option value="solves">Accepted solves</option>
            </Select>
          </div>
          <div>
            <label htmlFor="f-user" className="mb-1 block text-xs text-muted">Participant</label>
            <Select id="f-user" name="userId" defaultValue={f.userId ?? ""}>
              <option value="">All</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.username}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="f-ch" className="mb-1 block text-xs text-muted">Challenge</label>
            <Select id="f-ch" name="challengeId" defaultValue={f.challengeId ?? ""}>
              <option value="">All</option>
              {challenges.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="f-out" className="mb-1 block text-xs text-muted">Outcome (attempts)</label>
            <Select id="f-out" name="outcome" defaultValue={f.outcome ?? ""}>
              <option value="">Any</option>
              <option value="correct">Correct (first)</option>
              <option value="incorrect">Incorrect</option>
              <option value="already_solved">Re-submitted</option>
            </Select>
          </div>
          <button type="submit" className={buttonClass("secondary", "md")}>Apply filters</button>
        </form>
      </Card>

      <Card>
        <CardHeader title={result.view === "solves" ? "Accepted solves" : "Attempts"} description={`${result.total} matching`} />
        {result.items.length === 0 ? (
          <div className="p-5"><EmptyState title="Nothing matches these filters" /></div>
        ) : result.view === "solves" ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={thClass}>Solved at (local)</th>
                  <th scope="col" className={thClass}>Participant</th>
                  <th scope="col" className={thClass}>Challenge</th>
                  <th scope="col" className={`${thClass} text-right`}>Position</th>
                  <th scope="col" className={`${thClass} text-right`}>Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.items.map((s) => (
                  <tr key={s.id}>
                    <td className={`${tdClass} text-muted`}><LocalTime iso={s.solvedAt} /></td>
                    <td className={`${tdClass} font-mono`}>{s.username}</td>
                    <td className={tdClass}>{s.challengeTitle}</td>
                    <td className={`${tdClass} text-right font-mono`}>#{s.position}</td>
                    <td className={`${tdClass} text-right font-mono text-accent`}>{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={thClass}>Time (local)</th>
                  <th scope="col" className={thClass}>Participant</th>
                  <th scope="col" className={thClass}>Challenge</th>
                  <th scope="col" className={thClass}>Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.items.map((s) => (
                  <tr key={s.id}>
                    <td className={`${tdClass} text-muted`}><LocalTime iso={s.createdAt} /></td>
                    <td className={`${tdClass} font-mono`}>{s.username}</td>
                    <td className={tdClass}>{s.challengeTitle}</td>
                    <td className={tdClass}><Badge tone={OUTCOME_TONE[s.outcome] ?? "neutral"}>{s.outcome}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={f.page}
          pageSize={f.pageSize}
          total={result.total}
          basePath="/admin/submissions"
          params={{ view: f.view, userId: f.userId, challengeId: f.challengeId, outcome: f.outcome }}
        />
      </Card>
    </>
  );
}
