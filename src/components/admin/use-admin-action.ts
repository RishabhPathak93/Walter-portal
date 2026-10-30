"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client/api";

export type ActionFeedback = { tone: "accent" | "danger"; message: string } | null;

/** Runs an admin API call, shows feedback and refreshes server-rendered data. */
export function useAdminAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback>(null);

  async function run<T = unknown>(path: string, method: string, body?: unknown) {
    setBusy(true);
    setFeedback(null);
    const res = await apiRequest<T>(path, { method, body });
    setBusy(false);
    setFeedback({ tone: res.ok ? "accent" : "danger", message: res.message });
    if (res.ok) router.refresh();
    return res;
  }

  return { busy, feedback, setFeedback, run };
}
