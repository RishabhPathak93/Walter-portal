import "server-only";
import { createHmac } from "node:crypto";
import { getFlagSecret } from "@/lib/env";

/** Maximum accepted flag length (after trimming). */
export const MAX_FLAG_LENGTH = 256;

/**
 * Only surrounding whitespace is removed. The inside of the flag is never
 * altered (no case folding, no Unicode normalisation), so the comparison is
 * exact and predictable.
 */
export function normalizeFlag(raw: string): string {
  return raw.trim();
}

/**
 * Keyed digest of a flag, bound to the challenge id so the same flag text on
 * two challenges yields different digests. Format version "v1" allows future
 * migration of the scheme.
 *
 *   HMAC-SHA256(FLAG_HMAC_SECRET, "ctf-flag:v1:" + challengeId + ":" + flag)
 */
export function computeFlagDigest(challengeId: string, flag: string, secret: string = getFlagSecret()): string {
  return createHmac("sha256", secret).update(`ctf-flag:v1:${challengeId}:${normalizeFlag(flag)}`, "utf8").digest("hex");
}

/** Pseudonymous IP identifier for rate limiting (raw IPs are never stored). */
export function hashIp(ip: string | null | undefined, secret: string = getFlagSecret()): string | null {
  if (!ip) return null;
  return createHmac("sha256", secret).update(`ctf-ip:v1:${ip}`, "utf8").digest("hex");
}
