"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Spinner } from "@/components/ui";
import { useAdminAction } from "@/components/admin/use-admin-action";

type Rule = { position: number; points: number };

export function ScoringForm({ initialRules, initialDefault }: { initialRules: Rule[]; initialDefault: number }) {
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [defaultPoints, setDefaultPoints] = useState(initialDefault);
  const [recalculate, setRecalculate] = useState(false);
  const [confirm, setConfirm] = useState("");
  const { busy, feedback, run } = useAdminAction();

  const update = (i: number, points: number) => setRules((r) => r.map((x, j) => (j === i ? { ...x, points } : x)));
  const addRow = () => setRules((r) => [...r, { position: (r.at(-1)?.position ?? 0) + 1, points: 0 }]);
  const removeLast = () => setRules((r) => r.slice(0, -1));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await run("/api/admin/scoring", "PATCH", {
      rules,
      defaultPoints,
      recalculate,
      ...(recalculate ? { confirmRecalculate: confirm } : {}),
    });
    if (res.ok) {
      setRecalculate(false);
      setConfirm("");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader title="Points by solving position" description="Applies to every challenge. Positions are assigned atomically by the database." />
        <div className="space-y-3 p-5">
          {rules.map((r, i) => (
            <div key={r.position} className="flex items-center gap-3">
              <label htmlFor={`pos-${r.position}`} className="w-40 font-mono text-sm text-muted">
                Solver #{r.position}
              </label>
              <Input
                id={`pos-${r.position}`}
                type="number"
                min={0}
                max={10000}
                value={r.points}
                onChange={(e) => update(i, Number(e.target.value))}
                className="max-w-36"
              />
              <span className="text-sm text-muted">points</span>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={addRow} disabled={rules.length >= 100}>
              + Add position
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={removeLast} disabled={rules.length === 0}>
              Remove last
            </Button>
          </div>
          <div className="border-t border-line pt-4">
            <Field label="All later positions" htmlFor="default-points" hint="Points for any solver beyond the positions listed above.">
              <Input id="default-points" type="number" min={0} max={10000} value={defaultPoints} onChange={(e) => setDefaultPoints(Number(e.target.value))} className="max-w-36" />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Apply to existing solves?" />
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted">
            By default, new values apply only to <strong className="text-fg">future</strong> solves. Recalculating rewrites the points of every
            existing solve from its recorded position (positions and timestamps never change) and may reorder the leaderboard.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={recalculate} onChange={(e) => setRecalculate(e.target.checked)} className="size-4 accent-[#ff7a7a]" />
            Recalculate historical scores
          </label>
          {recalculate ? (
            <Field label='Type "RECALCULATE" to confirm' htmlFor="confirm-recalc">
              <Input id="confirm-recalc" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="max-w-60 font-mono" autoComplete="off" />
            </Field>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={recalculate ? "danger" : "primary"} disabled={busy || (recalculate && confirm !== "RECALCULATE")}>
          {busy ? <Spinner /> : null}
          {recalculate ? "Save & recalculate" : "Save scoring"}
        </Button>
        {feedback ? <Alert tone={feedback.tone} className="flex-1">{feedback.message}</Alert> : null}
      </div>
    </form>
  );
}
