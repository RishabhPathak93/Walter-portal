import { PageHeader } from "@/components/ui";
import { ScoringForm } from "@/components/admin/scoring-form";
import { requireAdminPage } from "@/lib/admin-page";
import { getScoringAdmin } from "@/lib/services/admin";

export default async function AdminScoringPage() {
  await requireAdminPage();
  const scoring = await getScoringAdmin();
  return (
    <>
      <PageHeader title="Scoring" description="Default: 1st solver 20, 2nd 30, 3rd 50, everyone after 0. These values are intentional." />
      <ScoringForm initialRules={scoring.rules} initialDefault={scoring.defaultPoints} />
    </>
  );
}
