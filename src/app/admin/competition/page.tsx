import { PageHeader } from "@/components/ui";
import { CompetitionForm } from "@/components/admin/competition-form";
import { requireAdminPage } from "@/lib/admin-page";
import { getCompetitionAdmin } from "@/lib/services/admin";

export default async function AdminCompetitionPage() {
  await requireAdminPage();
  const s = await getCompetitionAdmin();
  return (
    <>
      <PageHeader title="Competition" description="Name, schedule, registration and submission limits. Every change is audited." />
      <CompetitionForm
        initial={{
          name: s.name,
          tagline: s.tagline,
          description: s.description,
          startAt: s.startAt,
          endAt: s.endAt,
          isPaused: s.isPaused,
          registrationOpen: s.registrationOpen,
          hideChallengesBeforeStart: s.hideChallengesBeforeStart,
          rateLimitMaxAttempts: s.rateLimitMaxAttempts,
          rateLimitWindowSeconds: s.rateLimitWindowSeconds,
          ipRateLimitMaxAttempts: s.ipRateLimitMaxAttempts,
        }}
      />
    </>
  );
}
