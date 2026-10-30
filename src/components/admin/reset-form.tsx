"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { useAdminAction } from "@/components/admin/use-admin-action";

export function ResetForm() {
  const [confirmation, setConfirmation] = useState("");
  const { busy, feedback, run } = useAdminAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!window.confirm("Permanently delete ALL solves, submissions and score adjustments?")) return;
    const res = await run("/api/admin/reset", "POST", { confirmation });
    if (res.ok) setConfirmation("");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-5">
      <Field label='Type "RESET" to confirm' htmlFor="reset-confirm">
        <Input id="reset-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" className="max-w-60 font-mono" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" disabled={busy || confirmation !== "RESET"}>
          {busy ? <Spinner /> : null} Reset competition
        </Button>
        {feedback ? <Alert tone={feedback.tone} className="flex-1">{feedback.message}</Alert> : null}
      </div>
    </form>
  );
}
