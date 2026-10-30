"use client";

import { Button, Container } from "@/components/ui";

/** Generic error boundary — never shows stack traces or internal details. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="max-w-xl text-center">
      <p className="font-mono text-sm text-danger">error</p>
      <h1 className="mt-2 text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">The page could not be loaded. Please try again in a moment.</p>
      <div className="mt-6">
        <Button onClick={reset}>Try again</Button>
      </div>
    </Container>
  );
}
