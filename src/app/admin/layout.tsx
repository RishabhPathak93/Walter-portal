import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, Container } from "@/components/ui";
import { AdminNav } from "@/components/admin/admin-nav";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Server-side gate for every /admin page. Admin status comes only from the
 * protected `admins` table — never from usernames, query params or the client.
 * Each admin API route re-checks independently.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin");
  if (!viewer.isAdmin) {
    return (
      <Container className="max-w-xl">
        <Alert tone="danger" title="403 · Forbidden">
          This area is restricted to competition administrators.
        </Alert>
      </Container>
    );
  }
  return (
    <Container>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">sudo ./admin</p>
      <AdminNav />
      {children}
    </Container>
  );
}
