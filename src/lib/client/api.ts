"use client";

import type { ApiResponse } from "@/lib/types";

/** JSON fetch helper for client components. Never throws; returns a uniform shape. */
export async function apiRequest<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResponse<T> & { httpStatus: number }> {
  try {
    const res = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
    });
    let json: ApiResponse<T>;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      json = { ok: false, code: "bad_response", message: "Unexpected response from the server." };
    }
    return { ...json, httpStatus: res.status };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, code: "network_error", message: "Network error. Check your connection and try again.", httpStatus: 0 };
  }
}
