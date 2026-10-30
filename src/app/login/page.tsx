import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Container } from "@/components/ui";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  confirmation_failed: "That confirmation link is invalid or has expired. Try signing in, or register again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  if (await getCurrentUser()) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  return (
    <Container className="max-w-md">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">auth://login</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-muted">Welcome back. Your flags are waiting.</p>
      <Card className="mt-6 p-6">
        <LoginForm next={next} initialError={error} />
      </Card>
    </Container>
  );
}
