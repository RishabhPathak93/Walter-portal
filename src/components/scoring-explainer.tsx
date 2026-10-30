import type { ScoringRule } from "@/lib/types";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Public explanation of the current scoring and ranking rules. */
export function ScoringExplainer({ rules, defaultPoints }: { rules: ScoringRule[]; defaultPoints?: number }) {
  const maxPos = rules.reduce((m, r) => Math.max(m, r.position), 0);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="font-mono text-xs uppercase tracking-wider text-muted">Points per challenge</h3>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {rules.map((r) => (
            <li key={r.position} className="flex items-center justify-between bg-surface-2/60 px-4 py-2.5">
              <span className="text-sm">{ordinal(r.position)} correct solver</span>
              <span className="font-mono text-sm font-semibold text-accent tabular-nums">{r.points} pts</span>
            </li>
          ))}
          <li className="flex items-center justify-between bg-surface-2/30 px-4 py-2.5">
            <span className="text-sm text-muted">{maxPos > 0 ? `${ordinal(maxPos + 1)} and later solvers` : "Every solver"}</span>
            <span className="font-mono text-sm tabular-nums text-muted">{defaultPoints ?? 0} pts</span>
          </li>
        </ul>
      </div>
      <div className="space-y-3 text-sm text-muted">
        <h3 className="font-mono text-xs uppercase tracking-wider text-muted">Rules</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>Individual participants only — no teams.</li>
          <li>Your solving position is fixed the moment the server accepts your first correct flag for a challenge.</li>
          <li>Points are awarded once per challenge. Re-submitting a correct flag never changes your score or position.</li>
          <li>Incorrect flags earn nothing and are rate limited.</li>
          <li>
            Ranking: highest total score first. Ties go to whoever reached that score earliest (server time). Participants with
            zero points are listed after everyone who scored.
          </li>
        </ul>
      </div>
    </div>
  );
}
