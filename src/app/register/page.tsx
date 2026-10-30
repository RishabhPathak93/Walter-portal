import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Container } from "@/components/ui";
import { RegisterForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";
import { getCompetition } from "@/lib/services/queries";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Register" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  let open = false;
  if (isSupabaseConfigured()) {
    try {
      open = (await getCompetition()).registrationOpen;
    } catch {
      open = false;
    }
  }
  return (
    <Container className="max-w-md">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">auth://register</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-2 text-muted">One account per person. Teams are not allowed.</p>
      <Card className="mt-6 p-6">
        <RegisterForm registrationOpen={open} />
      </Card>
    </Container>
  );
}
