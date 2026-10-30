"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";
import { USERNAME_REGEX } from "@/lib/validation";

function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") },
    });
    if (res.ok) {
      router.push(safeNext(next));
      router.refresh();
      return;
    }
    setBusy(false);
    setError(res.message);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={72} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Spinner /> : null}
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="text-accent underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ registrationOpen }: { registrationOpen: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const usernameValid = username === "" || USERNAME_REGEX.test(username);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiRequest<{ needsEmailConfirmation: boolean }>("/api/auth/register", {
      method: "POST",
      body: { email: String(form.get("email") ?? ""), password, username: username.trim() },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (res.data?.needsEmailConfirmation) {
      setDone(res.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (!registrationOpen) {
    return <Alert tone="warn" title="Registration closed">The organizer has closed registration for this competition.</Alert>;
  }
  if (done) {
    return (
      <Alert tone="accent" title="Check your inbox">
        {done}
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field
        label="Username"
        htmlFor="username"
        hint={usernameValid ? "Public on the leaderboard. 3–24 characters: letters, numbers, _ or -." : undefined}
      >
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={24}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={!usernameValid}
          aria-describedby={!usernameValid ? "username-error" : undefined}
        />
      </Field>
      {!usernameValid ? (
        <p id="username-error" className="-mt-3 text-xs text-danger">
          Use 3–24 letters, numbers, _ or -, starting with a letter or number.
        </p>
      ) : null}
      <Field label="Email" htmlFor="email" hint="Private. Used only to sign in.">
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy || !usernameValid}>
        {busy ? <Spinner /> : null}
        {busy ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="text-accent underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
