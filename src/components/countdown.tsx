"use client";

import { useEffect, useState } from "react";

/** Live countdown to a target time; renders nothing meaningful until mounted. */
export function Countdown({ target, label }: { target: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const ms = Math.max(0, new Date(target).getTime() - now);
  const s = Math.floor(ms / 1000);
  const parts = [
    [Math.floor(s / 86400), "d"],
    [Math.floor((s % 86400) / 3600), "h"],
    [Math.floor((s % 3600) / 60), "m"],
    [s % 60, "s"],
  ] as const;
  return (
    <p className="font-mono text-sm text-muted" aria-live="off">
      {label}{" "}
      <span className="text-fg tabular-nums">
        {parts
          .filter(([v, u], i) => v > 0 || i >= 2 || u === "h")
          .map(([v, u]) => `${String(v).padStart(2, "0")}${u}`)
          .join(" ")}
      </span>
    </p>
  );
}
