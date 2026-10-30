import "server-only";

/**
 * Server-side environment access. Secret values are only read here, and this
 * module is marked `server-only` so a client component importing it fails the
 * build instead of leaking secrets into the browser bundle.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new ConfigError(`Missing required environment variable ${name}`);
  }
  return value.trim();
}

export function getPublicSupabaseConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

export function getSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return required("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)", key);
}

export function getFlagSecret(): string {
  const secret = required("FLAG_HMAC_SECRET", process.env.FLAG_HMAC_SECRET);
  if (secret.length < 32) {
    throw new ConfigError("FLAG_HMAC_SECRET must be at least 32 characters (use `npm run secret:generate`)");
  }
  return secret;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
