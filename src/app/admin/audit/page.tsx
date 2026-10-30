import { Badge, Card, CardHeader, EmptyState, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Pagination } from "@/components/pagination";
import { requireAdminPage } from "@/lib/admin-page";
import { listAuditLogs } from "@/lib/services/admin";

const PAGE_SIZE = 50;

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));
  const log = await listAuditLogs(page, PAGE_SIZE);
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of administrative actions. Flags and secrets are never logged." />
      <Card>
        <CardHeader title={`${log.total} entries`} />
        {log.items.length === 0 ? (
          <div className="p-5"><EmptyState title="No administrative actions yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={thClass}>Time</th>
                  <th scope="col" className={thClass}>Actor</th>
                  <th scope="col" className={thClass}>Action</th>
                  <th scope="col" className={thClass}>Target</th>
                  <th scope="col" className={thClass}>Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {log.items.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className={`${tdClass} whitespace-nowrap text-muted`}><LocalTime iso={e.createdAt} /></td>
                    <td className={`${tdClass} font-mono`}>{e.actor}</td>
                    <td className={tdClass}>
                      <Badge tone={e.action.includes("reset") || e.action.includes("disable") ? "danger" : e.action.startsWith("score") ? "warn" : "info"}>
                        {e.action}
                      </Badge>
                    </td>
                    <td className={`${tdClass} font-mono text-xs text-muted`}>
                      {e.targetType}
                      {e.targetId ? `:${e.targetId.slice(0, 8)}` : ""}
                    </td>
                    <td className={tdClass}>
                      <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-muted">
                        {JSON.stringify(e.details)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={log.total} basePath="/admin/audit" />
      </Card>
    </>
  );
}
