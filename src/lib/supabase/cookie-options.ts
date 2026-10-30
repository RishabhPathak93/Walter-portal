/**
 * Auth cookies are httpOnly: this app never uses the Supabase browser client
 * for authentication (all auth goes through server routes), so JavaScript in
 * the page never needs to read the tokens. Secure in production, SameSite=Lax.
 */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
