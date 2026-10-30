"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { useAdminAction } from "@/components/admin/use-admin-action";

export function DisableToggle({ id, username, disabled, isSelf }: { id: string; username: string; disabled: boolean; isSelf: boolean }) {
  const { busy, feedback, run } = useAdminAction();
  if (isSelf) return <span className="text-xs text-muted">you</span>;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={disabled ? "secondary" : "danger"}
        disabled={busy}
        onClick={() => {
          if (disabled) {
            void run(`/api/admin/participants/${id}`, "PATCH", { disabled: false });
            return;
          }
          const reason = window.prompt(`Disable competition access for @${username}? Optional reason:`, "");
          if (reason === null) return;
          void run(`/api/admin/participants/${id}`, "PATCH", { disabled: true, reason });
        }}
      >
        {busy ? <Spinner /> : null}
        {disabled ? "Re-enable" : "Disable"}
      </Button>
      {feedback?.tone === "danger" ? <span className="text-xs text-danger">{feedback.message}</span> : null}
    </div>
  );
}

export function ScoreAdjustmentForm({ participants }: { participants: { id: string; username: string }[] }) {
  const [userId, setUserId] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const { busy, feedback, run } = useAdminAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(points);
    const who = participants.find((p) => p.id === userId)?.username ?? "participant";
    if (!window.confirm(`Apply ${n > 0 ? "+" : ""}${n} points to @${who}? This is recorded in the audit log.`)) return;
    const res = await run("/api/admin/score-adjustments", "POST", { userId, points: n, reason });
    if (res.ok) {
      setPoints("");
      setReason("");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Participant" htmlFor="adj-user">
          <Select id="adj-user" value={userId} onChange={(e) => setUserId(e.target.value)} required>
            <option value="">Select…</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.username}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Points (+/-)" htmlFor="adj-points">
          <Input id="adj-points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} required min={-100000} max={100000} />
        </Field>
        <Field label="Reason" htmlFor="adj-reason">
          <Input id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={500} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={busy || !userId || !points || Number(points) === 0}>
          {busy ? <Spinner /> : null} Apply adjustment
        </Button>
        {feedback ? <Alert tone={feedback.tone} className="flex-1">{feedback.message}</Alert> : null}
      </div>
    </form>
  );
}
