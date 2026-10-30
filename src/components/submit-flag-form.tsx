"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Input, Spinner } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";

type Feedback = { tone: "accent" | "danger" | "warn" | "info"; title: string; message: string };

/**
 * Flag submission form. The flag is sent to the server and compared there —
 * the browser never sees the correct value or its digest.
 */
export function SubmitFlagForm({ slug, alreadySolved }: { slug: string; alreadySolved: boolean }) {
  const router = useRouter();
  const [flag, setFlag] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!flag.trim() || busy || cooldown > 0) return;
    setBusy(true);
    setFeedback(null);
    const res = await apiRequest(`/api/challenges/${encodeURIComponent(slug)}/submit`, { method: "POST", body: { flag } });
    setBusy(false);

    switch (res.code) {
      case "correct":
        setFeedback({ tone: "accent", title: "Flag accepted", message: res.message });
        setFlag("");
        router.refresh();
        break;
      case "already_solved":
        setFeedback({ tone: "info", title: "Already solved", message: res.message });
        setFlag("");
        break;
      case "incorrect":
        setFeedback({ tone: "danger", title: "Incorrect flag", message: res.message });
        inputRef.current?.select();
        break;
      case "rate_limited":
        setCooldown(typeof res.retryAfter === "number" ? res.retryAfter : 30);
        setFeedback({ tone: "warn", title: "Slow down", message: res.message });
        break;
      case "authentication_required":
        setFeedback({ tone: "warn", title: "Signed out", message: "Your session expired. Please sign in again." });
        break;
      default:
        setFeedback({ tone: "danger", title: "Submission not accepted", message: res.message });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <label htmlFor="flag" className="block text-sm font-medium">
        {alreadySolved ? "Submit again (no extra points)" : "Submit flag"}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={inputRef}
          id="flag"
          name="flag"
          value={flag}
          onChange={(e) => setFlag(e.target.value)}
          placeholder="flag{...}"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={256}
          className="font-mono"
          aria-describedby={feedback ? "flag-feedback" : undefined}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || cooldown > 0 || !flag.trim()} className="sm:w-36">
          {busy ? <Spinner /> : null}
          {busy ? "Checking…" : cooldown > 0 ? `Wait ${cooldown}s` : "Submit"}
        </Button>
      </div>
      <div id="flag-feedback" aria-live="polite">
        {feedback ? (
          <Alert tone={feedback.tone} title={feedback.title}>
            {feedback.message}
          </Alert>
        ) : null}
      </div>
    </form>
  );
}
