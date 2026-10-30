"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Spinner, Textarea } from "@/components/ui";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { isoToLocalInput, localInputToIso } from "@/lib/client/datetime";

type Settings = {
  name: string;
  tagline: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  isPaused: boolean;
  registrationOpen: boolean;
  hideChallengesBeforeStart: boolean;
  rateLimitMaxAttempts: number;
  rateLimitWindowSeconds: number;
  ipRateLimitMaxAttempts: number;
};

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-bg/40 p-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[#3ee08a]" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function CompetitionForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const { busy, feedback, run } = useAdminAction();

  // datetime-local values depend on the browser time zone: set after mount.
  useEffect(() => {
    setStart(isoToLocalInput(initial.startAt));
    setEnd(isoToLocalInput(initial.endAt));
  }, [initial.startAt, initial.endAt]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run("/api/admin/competition", "PATCH", { ...s, startAt: localInputToIso(start), endAt: localInputToIso(end) });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader title="Branding" />
        <div className="grid gap-4 p-5">
          <Field label="Competition name" htmlFor="name">
            <Input id="name" value={s.name} maxLength={80} required onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Tagline" htmlFor="tagline">
            <Input id="tagline" value={s.tagline} maxLength={160} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="description">
            <Textarea id="description" value={s.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Schedule & status" description="Times are entered in your browser's time zone and stored in UTC. Leave empty for no limit." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Start time" htmlFor="start">
            <Input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End time" htmlFor="end">
            <Input id="end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Toggle id="paused" label="Pause submissions" hint="Temporarily rejects all flag submissions." checked={s.isPaused} onChange={(v) => set("isPaused", v)} />
          <Toggle id="registration" label="Registration open" hint="Allow new participants to sign up." checked={s.registrationOpen} onChange={(v) => set("registrationOpen", v)} />
          <Toggle
            id="hide"
            label="Hide challenges before start"
            hint="Participants see challenges only once the start time is reached."
            checked={s.hideChallengesBeforeStart}
            onChange={(v) => set("hideChallengesBeforeStart", v)}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Rate limiting" description="Applied per participant and per IP within a sliding window." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Attempts per participant" htmlFor="rl-max">
            <Input id="rl-max" type="number" min={1} max={1000} value={s.rateLimitMaxAttempts} onChange={(e) => set("rateLimitMaxAttempts", Number(e.target.value))} />
          </Field>
          <Field label="Window (seconds)" htmlFor="rl-win">
            <Input id="rl-win" type="number" min={5} max={3600} value={s.rateLimitWindowSeconds} onChange={(e) => set("rateLimitWindowSeconds", Number(e.target.value))} />
          </Field>
          <Field label="Attempts per IP" htmlFor="rl-ip" hint="Keep higher than per-participant: venues often share one IP.">
            <Input id="rl-ip" type="number" min={1} max={10000} value={s.ipRateLimitMaxAttempts} onChange={(e) => set("ipRateLimitMaxAttempts", Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner /> : null} Save settings
        </Button>
        {feedback ? <Alert tone={feedback.tone} className="flex-1">{feedback.message}</Alert> : null}
      </div>
    </form>
  );
}
