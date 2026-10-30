import { Alert, Card, CardHeader, PageHeader } from "@/components/ui";
import { ResetForm } from "@/components/admin/reset-form";
import { requireAdminPage } from "@/lib/admin-page";

export default async function AdminResetPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader title="Reset competition" description="For test runs before the real event." />
      <Alert tone="danger" title="This cannot be undone" className="mb-6">
        Resetting permanently deletes <strong>every accepted solve, every submission attempt and every score adjustment</strong>. All
        participant scores return to zero and solving positions restart at #1. Participants, challenges, flags, scoring and settings are kept.
        The reset runs in a single database transaction and is recorded in the audit log.
      </Alert>
      <Card>
        <CardHeader title="Confirm reset" />
        <ResetForm />
      </Card>
    </>
  );
}
