#!/usr/bin/env node
/**
 * Grants administrator rights to ADMIN_BOOTSTRAP_EMAIL.
 *
 *  - If that account exists, it is added to public.admins.
 *  - If it does not exist and ADMIN_BOOTSTRAP_PASSWORD is set, the account is
 *    created (email pre-confirmed, username ADMIN_BOOTSTRAP_USERNAME) and promoted.
 *
 * Admin rights are stored only in the protected `admins` table; nothing a user
 * can choose at registration (username, metadata) grants them.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */
import { createClient } from "@supabase/supabase-js";

function need(name, value) {
  if (!value) {
    console.error(`✗ Missing ${name}. Set it in .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

const url = need("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const secretKey = need("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = need("ADMIN_BOOTSTRAP_EMAIL", process.env.ADMIN_BOOTSTRAP_EMAIL).trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";
const username = (process.env.ADMIN_BOOTSTRAP_USERNAME || "organizer01").trim();

const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserByEmail(target) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findUserByEmail(email);

if (!user) {
  if (!password) {
    console.error(`✗ No account found for ${email}.`);
    console.error("  Either register that account in the app first, or set ADMIN_BOOTSTRAP_PASSWORD to create it now.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("✗ ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
    // Lets the registration trigger accept this account even if registration is closed.
    app_metadata: { ctf_bypass_registration: true },
  });
  if (error) {
    console.error(`✗ Could not create admin account: ${error.message}`);
    process.exit(1);
  }
  user = data.user;
  console.log(`✓ Created account ${email} (username "${username}")`);
}

const { error: insertError } = await supabase
  .from("admins")
  .upsert({ user_id: user.id, note: "bootstrap" }, { onConflict: "user_id", ignoreDuplicates: true });
if (insertError) {
  console.error(`✗ Could not grant admin role: ${insertError.message}`);
  process.exit(1);
}

await supabase.from("audit_logs").insert({
  actor_id: null,
  action: "admin.bootstrap",
  target_type: "participant",
  target_id: user.id,
  details: { email },
});

console.log(`✓ ${email} is now an administrator. Sign in and open /admin.`);
