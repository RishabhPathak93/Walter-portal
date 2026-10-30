import { describe, expect, it } from "vitest";
import { computeFlagDigest, hashIp, normalizeFlag } from "@/lib/flags";

const SECRET = "unit-test-secret-0123456789abcdef0123456789";
const ID = "8f0e7c55-2d4b-4b1a-9f3e-4c7d2a1b0c99";

describe("flag hashing", () => {
  it("is deterministic and keyed", () => {
    const a = computeFlagDigest(ID, "flag{x}", SECRET);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(computeFlagDigest(ID, "flag{x}", SECRET)).toBe(a);
    expect(computeFlagDigest(ID, "flag{x}", SECRET + "different")).not.toBe(a);
  });

  it("binds the digest to the challenge id", () => {
    expect(computeFlagDigest(ID, "flag{x}", SECRET)).not.toBe(computeFlagDigest("00000000-0000-4000-8000-000000000000", "flag{x}", SECRET));
  });

  it("only trims surrounding whitespace; the inside is exact and case-sensitive", () => {
    expect(normalizeFlag("  flag{a b}\n\t")).toBe("flag{a b}");
    const base = computeFlagDigest(ID, "flag{Abc}", SECRET);
    expect(computeFlagDigest(ID, " flag{Abc} ", SECRET)).toBe(base);
    expect(computeFlagDigest(ID, "flag{abc}", SECRET)).not.toBe(base);
    expect(computeFlagDigest(ID, "flag{A bc}", SECRET)).not.toBe(base);
  });

  it("matches the documented scheme (used by scripts/seed.mjs)", async () => {
    const { createHmac } = await import("node:crypto");
    const expected = createHmac("sha256", SECRET).update(`ctf-flag:v1:${ID}:flag{x}`).digest("hex");
    expect(computeFlagDigest(ID, "flag{x}", SECRET)).toBe(expected);
  });

  it("hashes IPs with a separate label and never returns the raw IP", () => {
    const h = hashIp("203.0.113.5", SECRET)!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(computeFlagDigest(ID, "203.0.113.5", SECRET));
    expect(hashIp(null, SECRET)).toBeNull();
  });

  it("refuses weak or missing secrets", async () => {
    const { getFlagSecret } = await import("@/lib/env");
    const old = process.env.FLAG_HMAC_SECRET;
    process.env.FLAG_HMAC_SECRET = "short";
    expect(() => getFlagSecret()).toThrow(/at least 32/);
    delete process.env.FLAG_HMAC_SECRET;
    expect(() => getFlagSecret()).toThrow(/Missing/);
    process.env.FLAG_HMAC_SECRET = old;
  });
});
