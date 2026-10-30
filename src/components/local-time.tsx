"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the viewer's local time zone. The server renders the
 * UTC value (no hydration mismatch); the browser swaps in local time.
 */
export function LocalTime({
  iso,
  mode = "datetime",
  fallback = "—",
}: {
  iso: string | null | undefined;
  mode?: "datetime" | "time" | "relative";
  fallback?: string;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) return;
    const d = new Date(iso);
    const format = () => {
      if (mode === "relative") return relative(d);
      if (mode === "time") return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    };
    setText(format());
    if (mode !== "relative") return;
    const t = setInterval(() => setText(format()), 15_000);
    return () => clearInterval(t);
  }, [iso, mode]);

  if (!iso) return <span className="text-subtle">{fallback}</span>;
  const utc = new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return (
    <time dateTime={iso} title={utc} suppressHydrationWarning>
      {text ?? utc}
    </time>
  );
}

function relative(d: Date): string {
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 45) return rtf.format(Math.round(diff), "second");
  if (abs < 2700) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
