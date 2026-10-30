"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Card, CardHeader, EmptyState, Spinner } from "@/components/ui";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { LocalTime } from "@/components/local-time";
import { getRealtimeClient } from "@/lib/supabase/browser";
import type { LeaderboardEntry } from "@/lib/types";

const FAST_POLL_MS = 5_000; // fallback when Realtime is not connected
const SLOW_POLL_MS = 30_000; // safety net while Realtime is connected

type Status = "connecting" | "live" | "polling";

/**
 * Leaderboard that updates itself:
 *  - Supabase Realtime pushes a tiny "version changed" event (public table,
 *    no private data); the client then refetches /api/leaderboard.
 *  - If Realtime is unavailable, it polls every 5 s while the tab is visible.
 *  - Nothing is fetched while the tab is hidden.
 */
export function LiveLeaderboard({
  initialEntries,
  initialGeneratedAt,
  supabaseUrl,
  supabaseKey,
  highlightUsername,
  initialError,
}: {
  initialEntries: LeaderboardEntry[];
  initialGeneratedAt: string;
  supabaseUrl: string | null;
  supabaseKey: string | null;
  highlightUsername: string | null;
  initialError: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [updatedAt, setUpdatedAt] = useState(initialGeneratedAt);
  const [status, setStatus] = useState<Status>(supabaseUrl && supabaseKey ? "connecting" : "polling");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  const refresh = useCallback(async (version?: number) => {
    if (typeof document !== "undefined" && document.hidden) return;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    try {
      // A version-specific URL lets the CDN serve fresh data right after a change.
      const res = await fetch(`/api/leaderboard${version !== undefined ? `?v=${version}` : ""}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { data?: { entries: LeaderboardEntry[]; generatedAt: string } };
      if (json.data) {
        setEntries(json.data.entries);
        setUpdatedAt(json.data.generatedAt);
        setError(false);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(true);
    } finally {
      if (inflight.current === ctrl) setLoading(false);
    }
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return;
    const client = getRealtimeClient(supabaseUrl, supabaseKey);
    const channel = client
      .channel("public:leaderboard_state")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leaderboard_state" }, (payload) => {
        const v = (payload.new as { version?: number } | null)?.version;
        void refresh(typeof v === "number" ? v : undefined);
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("polling");
      });
    return () => {
      void client.removeChannel(channel);
    };
  }, [supabaseUrl, supabaseKey, refresh]);

  // Polling (fast fallback, slow safety net) + refresh when the tab becomes visible
  useEffect(() => {
    const interval = setInterval(() => void refresh(), status === "live" ? SLOW_POLL_MS : FAST_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, refresh]);

  return (
    <Card>
      <CardHeader
        title="Rankings"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            Last updated <LocalTime iso={updatedAt} mode="time" />
            {loading ? <Spinner className="size-3 text-accent" /> : null}
          </span>
        }
        action={
          status === "live" ? (
            <Badge tone="accent">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current animate-pulse-dot" /> live
            </Badge>
          ) : status === "connecting" ? (
            <Badge>connecting…</Badge>
          ) : (
            <Badge tone="info">auto-refresh 5s</Badge>
          )
        }
      />
      {error ? (
        <div className="p-4">
          <Alert tone="danger">Could not refresh the leaderboard. Retrying automatically…</Alert>
        </div>
      ) : null}
      {entries.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No participants yet">Rankings appear as soon as participants register.</EmptyState>
        </div>
      ) : (
        <LeaderboardTable entries={entries} highlightUsername={highlightUsername} />
      )}
    </Card>
  );
}
