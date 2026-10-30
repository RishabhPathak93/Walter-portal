#!/usr/bin/env node
/**
 * Seeds the three initial challenges and their flag digests.
 *
 *   npm run seed                 # create missing challenges (inactive), set/refresh flag digests
 *   npm run seed -- --activate   # also mark the seeded challenges active
 *   npm run seed -- --overwrite  # also overwrite title/description/category/difficulty
 *
 * Reads plaintext flags from seed/flags.local.json (git-ignored) or the file in
 * SEED_FLAGS_FILE. Only HMAC digests are sent to the database. Flags are never printed.
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), FLAG_HMAC_SECRET.
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const activate = args.has("--activate");
const overwrite = args.has("--overwrite");

function need(name, value) {
  if (!value) {
    console.error(`✗ Missing ${name}. Set it in .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

const url = need("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const secretKey = need("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
const hmacSecret = need("FLAG_HMAC_SECRET", process.env.FLAG_HMAC_SECRET);
if (hmacSecret.length < 32) {
  console.error("✗ FLAG_HMAC_SECRET must be at least 32 characters. Run: npm run secret:generate");
  process.exit(1);
}

const flagsFile = resolve(root, process.env.SEED_FLAGS_FILE || "seed/flags.local.json");
let flags;
try {
  flags = JSON.parse(readFileSync(flagsFile, "utf8"));
} catch {
  console.error(`✗ Could not read ${flagsFile}. Copy seed/flags.example.json to seed/flags.local.json and fill in the real flags.`);
  process.exit(1);
}
const challenges = JSON.parse(readFileSync(resolve(root, "seed/challenges.json"), "utf8"));

// Must match src/lib/flags.ts exactly.
const digestFor = (challengeId, flag) =>
  createHmac("sha256", hmacSecret).update(`ctf-flag:v1:${challengeId}:${String(flag).trim()}`, "utf8").digest("hex");

const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
for (const c of challenges) {
  const flag = flags[c.slug];
  if (!flag || String(flag).includes("replace_me")) {
    console.error(`✗ ${c.slug}: no flag in ${flagsFile}`);
    failures++;
    continue;
  }
  const { data: existing, error: lookupError } = await supabase.from("challenges").select("id").eq("slug", c.slug).maybeSingle();
  if (lookupError) {
    console.error(`✗ ${c.slug}: ${lookupError.message}`);
    failures++;
    continue;
  }
  let id = existing?.id ?? randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: returnedId, error } = await supabase.rpc("seed_challenge", {
      p_id: id,
      p_slug: c.slug,
      p_title: c.title,
      p_description: c.description,
      p_category: c.category,
      p_difficulty: c.difficulty,
      p_is_active: activate,
      p_sort_order: c.sortOrder ?? 0,
      p_digest: digestFor(id, flag),
      p_overwrite_metadata: overwrite,
    });
    if (error) {
      console.error(`✗ ${c.slug}: ${error.message}`);
      failures++;
      break;
    }
    if (returnedId === id) {
      if (activate && existing && !overwrite) {
        await supabase.from("challenges").update({ is_active: true }).eq("id", id);
      }
      console.log(`✓ ${c.slug.padEnd(22)} ${existing ? "updated" : "created"}  flag digest set${activate ? ", active" : ""}`);
      break;
    }
    id = returnedId; // created concurrently: recompute digest bound to the real id
  }
}

if (failures) {
  console.error(`\n${failures} challenge(s) failed.`);
  process.exit(1);
}
console.log(activate ? "\nDone." : "\nDone. Challenges are INACTIVE until you activate them in /admin/challenges (or re-run with --activate).");
