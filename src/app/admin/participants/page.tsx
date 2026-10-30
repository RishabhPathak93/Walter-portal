import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { DisableToggle, ScoreAdjustmentForm } from "@/components/admin/participant-actions";
import { requireAdminPage } from "@/lib/admin-page";
import { listParticipants } from "@/lib/services/admin";

export default async function AdminParticipantsPage() {
  const viewer = await requireAdminPage();
  const participants = await listParticipants(viewer.user.id);
  return (
    <>
      <PageHeader title="Participants" description="Registered individuals, scores and attempt statistics. Passwords and tokens are never accessible." />
      <Card>
        <CardHeader title={`${participants.length} registered`} />
        {participants.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No participants yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={thClass}>Rank</th>
                  <th scope="col" className={thClass}>Username</th>
                  <th scope="col" className={thClass}>Email</th>
                  <th scope="col" className={`${thClass} text-right`}>Score</th>
                  <th scope="col" className={`${thClass} text-right`}>Solved</th>
                  <th scope="col" className={`${thClass} text-right`}>Wrong / total</th>
                  <th scope="col" className={thClass}>Last attempt</th>
                  <th scope="col" className={`${thClass} text-right`}>Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {participants.map((p) => (
                  <tr key={p.id} className={p.isDisabled ? "opacity-70" : undefined}>
                    <td className={`${tdClass} font-mono`}>{p.rank ? `#${p.rank}` : "—"}</td>
                    <td className={tdClass}>
                      <Link href={`/admin/submissions?userId=${p.id}`} className="font-mono hover:text-accent">
                        {p.username}
                      </Link>
                      <span className="ml-2 inline-flex gap-1">
                        {p.isAdmin ? <Badge tone="info">admin</Badge> : null}
                        {p.isDisabled ? <Badge tone="danger" title={p.disabledReason ?? undefined}>disabled</Badge> : null}
                      </span>
                    </td>
                    <td className={`${tdClass} max-w-48 truncate text-muted`}>{p.email}</td>
                    <td className={`${tdClass} text-right font-mono tabular-nums`}>{p.score}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{p.solvedCount}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      <span className={p.incorrectCount > 50 ? "text-warn" : undefined}>{p.incorrectCount}</span> / {p.attemptCount}
                    </td>
                    <td className={`${tdClass} text-muted`}>
                      <LocalTime iso={p.lastSubmissionAt} mode="relative" />
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <DisableToggle id={p.id} username={p.username} disabled={p.isDisabled} isSelf={p.id === viewer.user.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Manual score adjustment" description="For corrections only. Each adjustment is permanent, visible to that participant and audited." />
        <ScoreAdjustmentForm participants={participants.filter((p) => !p.isAdmin).map((p) => ({ id: p.id, username: p.username }))} />
      </Card>
    </>
  );
}
