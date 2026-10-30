import { LocalTime } from "@/components/local-time";
import { cn, tableClass, tdClass, thClass } from "@/components/ui";
import type { LeaderboardEntry } from "@/lib/types";

const medal: Record<number, { cls: string; label: string }> = {
  1: { cls: "text-gold border-gold/40 bg-gold/10", label: "1st place" },
  2: { cls: "text-silver border-silver/40 bg-silver/10", label: "2nd place" },
  3: { cls: "text-bronze border-bronze/40 bg-bronze/10", label: "3rd place" },
};

export function RankBadge({ rank }: { rank: number }) {
  const m = medal[rank];
  return (
    <span
      className={cn(
        "inline-grid h-8 min-w-8 place-items-center rounded-md border px-1.5 font-mono text-sm font-semibold tabular-nums",
        m ? m.cls : "border-line text-muted",
      )}
      aria-label={m?.label ?? `Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

/** Responsive leaderboard: table on desktop, stacked cards on mobile. */
export function LeaderboardTable({
  entries,
  highlightUsername,
  compact = false,
}: {
  entries: LeaderboardEntry[];
  highlightUsername?: string | null;
  compact?: boolean;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className={tableClass}>
          <caption className="sr-only">Leaderboard rankings</caption>
          <thead className="border-b border-line">
            <tr>
              <th scope="col" className={cn(thClass, "w-20")}>Rank</th>
              <th scope="col" className={thClass}>Participant</th>
              <th scope="col" className={cn(thClass, "text-right")}>Solved</th>
              <th scope="col" className={cn(thClass, "text-right")}>Score</th>
              {!compact ? <th scope="col" className={cn(thClass, "text-right")}>Last correct solve</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((e) => (
              <tr
                key={e.username}
                className={cn(
                  "transition-colors hover:bg-surface-2/60",
                  e.rank <= 3 && "bg-surface-2/40",
                  highlightUsername === e.username && "outline outline-1 -outline-offset-1 outline-accent/60",
                )}
              >
                <td className={tdClass}>
                  <RankBadge rank={e.rank} />
                </td>
                <td className={cn(tdClass, "font-mono")}>
                  {e.username}
                  {highlightUsername === e.username ? <span className="ml-2 text-xs text-accent">(you)</span> : null}
                </td>
                <td className={cn(tdClass, "text-right tabular-nums")}>{e.solvedCount}</td>
                <td className={cn(tdClass, "text-right font-mono font-semibold tabular-nums", e.rank <= 3 ? "text-fg" : "text-fg/90")}>
                  {e.score}
                </td>
                {!compact ? (
                  <td className={cn(tdClass, "text-right text-muted")}>
                    <LocalTime iso={e.lastSolveAt} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="divide-y divide-line sm:hidden">
        {entries.map((e) => (
          <li key={e.username} className={cn("flex items-center gap-3 px-4 py-3", highlightUsername === e.username && "bg-accent-soft")}>
            <RankBadge rank={e.rank} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm">{e.username}</p>
              <p className="text-xs text-muted">
                {e.solvedCount} solved{!compact ? <> · <LocalTime iso={e.lastSolveAt} fallback="no solves" /></> : null}
              </p>
            </div>
            <p className="font-mono text-base font-semibold tabular-nums">{e.score}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
