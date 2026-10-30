import { Badge } from "@/components/ui";
import type { CompetitionState } from "@/lib/types";

export const STATE_META: Record<CompetitionState, { label: string; tone: "accent" | "warn" | "danger" | "info"; message: string }> = {
  running: { label: "LIVE", tone: "accent", message: "The competition is live. Submit flags to score." },
  not_started: { label: "NOT STARTED", tone: "info", message: "The competition has not started yet. Challenges unlock at the start time." },
  paused: { label: "PAUSED", tone: "warn", message: "The competition is paused. Submissions are temporarily closed." },
  ended: { label: "ENDED", tone: "danger", message: "The competition has ended. Final standings are shown below." },
};

export function CompetitionStatusBadge({ state }: { state: CompetitionState }) {
  const meta = STATE_META[state];
  return (
    <Badge tone={meta.tone}>
      <span aria-hidden="true" className={state === "running" ? "size-1.5 rounded-full bg-current animate-pulse-dot" : "size-1.5 rounded-full bg-current"} />
      {meta.label}
    </Badge>
  );
}
