import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ChallengeAdminRow, CreateChallengeForm, type AdminChallengeView } from "@/components/admin/challenge-forms";
import { requireAdminPage } from "@/lib/admin-page";
import { listChallenges } from "@/lib/services/admin";

export default async function AdminChallengesPage() {
  const viewer = await requireAdminPage();
  const challenges = await listChallenges(viewer.user.id);
  return (
    <>
      <PageHeader title="Challenges" description="Create, edit, activate and rotate flags. Flags are write-only: they are hashed on the server and never displayed." />
      <Card>
        <CardHeader title={`All challenges (${challenges.length})`} />
        {challenges.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No challenges">Run the seed script or create one below.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {challenges.map((c) => (
              <li key={`${c.id}:${c.updatedAt}`}>
                <ChallengeAdminRow challenge={c as AdminChallengeView} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Create challenge" />
        <CreateChallengeForm />
      </Card>
    </>
  );
}
