# Cyber CTF Arena

[![CI](https://github.com/RishabhPathak93/Walter-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/RishabhPathak93/Walter-portal/actions/workflows/ci.yml)

**Find the Flag. Solve the Challenge. Claim Your Rank.**

An individual Capture The Flag competition portal for 20–50 participants. Built with Next.js 16, Supabase (PostgreSQL + Auth + Realtime) and Tailwind CSS 4. It deploys on the free tiers of Vercel and Supabase, with no always-on server, Redis or paid services.

- Individual accounts only. There are no teams.
- Flags are verified on the server with keyed HMAC-SHA256 digests. Plaintext flags are never stored, logged, or sent to the browser.
- Solving order is assigned atomically inside PostgreSQL, so simultaneous correct submissions can never get the same position.
- The leaderboard updates live through Supabase Realtime, with polling as a fallback.
- The admin dashboard covers competition settings, challenges, flags, scoring, participants, submissions, CSV export, audited score corrections, an audit log and a protected reset.

> Step-by-step deployment for beginners: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**
> Architecture, tables, policies and API reference: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

---

## Features

| Area | What you get |
|---|---|
| Landing page | Name, tagline and description (all configurable); live status; start and end times with a countdown; participant, challenge and solve counts; top-5 preview; scoring rules |
| Auth | Email/password registration and login through Supabase Auth; unique case-insensitive usernames; httpOnly session cookies; optional email confirmation |
| Challenges | List with category, difficulty, open/closed status, solved indicator, solve count and next-solver points. The detail page has the briefing, submission form, feedback and your previous attempts |
| Submissions | `POST /api/challenges/:slug/submit`. Authenticated, schema-validated, rate limited per participant and per IP, checked against the competition window, atomic scoring, structured responses |
| Scoring | 1st = 20, 2nd = 30, 3rd = 50, 4th and later = 0 (intentional and configurable). Points are fixed when the solve is accepted. Recalculating history requires typing `RECALCULATE` |
| Leaderboard | Rank, username, challenges solved, score and last correct solve. Top 3 are highlighted. Updates via Realtime, or polls every 5 s while the tab is visible. Works on mobile |
| Dashboard | Rank, points, solved/remaining counts, a progress bar, accepted solves with positions, unsolved challenges and paginated submission history |
| Admin | Settings, schedule, pause, registration; create and edit challenges, activate/deactivate, rotate flags; scoring table; participants (disable/enable); submission monitor with filters; CSV export; score adjustments; audit log; reset |

## Technology stack

- **Next.js 16** (App Router, Route Handlers, `proxy.ts`), **React 19**, **TypeScript**
- **Tailwind CSS 4**, Geist fonts (bundled locally)
- **Supabase**: PostgreSQL (migrations, RLS, `SECURITY DEFINER` functions), Auth, Realtime
- **@supabase/ssr** for cookie sessions, **zod 4** for validation
- **Vitest** with real-PostgreSQL integration tests

## Project structure

```
src/
  app/                    pages and API route handlers
    api/                  REST API (see docs/ARCHITECTURE.md)
    admin/                admin dashboard pages (server-guarded)
    challenges/ dashboard/ leaderboard/ login/ register/
  components/             UI components (design system in ui.tsx)
    admin/                admin client forms
  lib/
    services/             server-side services (submissions, queries, admin)
    supabase/             Supabase clients (server / secret-key / anon / realtime)
    auth.ts http.ts       session verification, authorization, JSON responses
    flags.ts env.ts       HMAC flag digests, secret handling (server-only)
    validation.ts types.ts
  proxy.ts                CSRF origin check, session refresh, CSP nonce, redirects
supabase/migrations/      schema, functions, RLS/grants/Realtime
scripts/                  seed.mjs, bootstrap-admin.mjs, test-db.sh
seed/                     challenges.json, flags.example.json (flags.local.json is git-ignored)
tests/unit/               unit and route-authorization tests
tests/db/                 PostgreSQL integration tests (scoring, concurrency, RLS, route to DB)
docs/                     DEPLOYMENT.md, ARCHITECTURE.md
vercel.json               Vercel build config (Next.js, npm ci, Mumbai region bom1)
supabase/config.toml      Supabase CLI config (for link / db push)
.github/workflows/ci.yml  CI: typecheck, all tests against a Postgres service container, build
.github/dependabot.yml    weekly dependency update PRs
.nvmrc                    Node 22
```

## Local setup

Requirements: Node.js 20.9+ (22 LTS recommended) and a Supabase project (the free plan works).

```bash
npm install
cp .env.example .env.local          # then fill in the values (see below)
npm run secret:generate             # paste the output into FLAG_HMAC_SECRET
```

1. Apply the database migrations (see [Database setup](#database-setup)).
2. Copy `seed/flags.example.json` to `seed/flags.local.json` and fill in the three real flags. The file is git-ignored; never commit it, because this repository is public.
3. Seed the challenges and create the administrator:

```bash
npm run seed            # creates the 3 challenges INACTIVE with flag digests
npm run admin:bootstrap # makes ADMIN_BOOTSTRAP_EMAIL an administrator
npm run dev             # http://localhost:3000
```

Then sign in as the admin, open **/admin/challenges**, add the target details to each description, and activate the challenges. You can also run `npm run seed:activate` to activate all three immediately.

## Environment configuration

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | local + Vercel | Project URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | local + Vercel | Publishable key `sb_publishable_…` (public; a legacy `anon` key also works) |
| `SUPABASE_SECRET_KEY` | local + Vercel | Secret key `sb_secret_…`. **Server only.** `SUPABASE_SERVICE_ROLE_KEY` (legacy) is accepted instead |
| `FLAG_HMAC_SECRET` | local + Vercel | 32+ random bytes for flag and IP HMACs. **Server only.** |
| `ADMIN_BOOTSTRAP_EMAIL` | local only | Account to promote with `npm run admin:bootstrap` |
| `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_USERNAME` | local only (optional) | Creates the admin account if it does not exist |
| `NEXT_PUBLIC_SITE_URL` | Vercel (optional) | Public URL used in confirmation emails. Defaults to the request origin |

Never prefix secrets with `NEXT_PUBLIC_`. Never commit `.env.local` or `seed/flags.local.json`; both are in `.gitignore`. `src/lib/env.ts` is marked `server-only`, so importing it from a client component fails the build.

**Generating `FLAG_HMAC_SECRET`:** `npm run secret:generate` prints 32 random bytes as base64url. Changing this secret invalidates every stored flag digest. If you rotate it, run `npm run seed` again, or reset each flag in the admin panel.

## Database setup

The migrations live in `supabase/migrations/`, and their filenames are in the order they must run.

Option A uses the Supabase CLI (recommended):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Option B uses the SQL editor. In the Supabase dashboard, open **SQL Editor**, then paste and run each file in order: `…0001_schema.sql`, `…0002_functions.sql`, `…0003_security.sql`.

The migrations create every table, constraint, index, RLS policy and grant. They also add `public.leaderboard_state` to the `supabase_realtime` publication.

## Challenge seeding

`npm run seed` reads `seed/challenges.json` (metadata) and `seed/flags.local.json` (plaintext flags). It computes `HMAC-SHA256(FLAG_HMAC_SECRET, "ctf-flag:v1:<challenge-id>:<flag>")` locally and sends only the digests to the database. The script is safe to re-run; it refreshes the digests. Options: `--activate`, `--overwrite` (overwrites titles and descriptions).

**Changing a flag later:** open Admin → Challenges → *Edit details & flag* → *Replace flag*. The new flag is hashed on the server. It is never stored, logged or displayed, and the audit log records only that it changed. Existing solves are kept.

## Administrator bootstrap

Admin rights come only from rows in the protected `public.admins` table. Nothing a user can choose (username, metadata, query parameters) grants them.

- `npm run admin:bootstrap` promotes `ADMIN_BOOTSTRAP_EMAIL`. If that account does not exist and `ADMIN_BOOTSTRAP_PASSWORD` (12+ characters) is set, the script creates it with the email pre-confirmed.
- SQL alternative: `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`

Administrators are excluded from the public leaderboard.

## Development commands

```bash
npm run dev            # start the dev server
npm run build          # production build
npm start              # run the production build
npm run typecheck      # next typegen + tsc --noEmit
npm run seed           # seed challenges + flag digests
npm run admin:bootstrap
npm run secret:generate
```

## Testing

```bash
npm test                    # unit + route tests; DB tests are skipped without a database
npm run test:local-db       # starts a throw-away local PostgreSQL and runs EVERYTHING
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm test   # use an existing server
```

The DB tests create a temporary database. They apply a small Supabase shim (`tests/db/supabase-shim.sql`: API roles, `auth.users`, `auth.uid()`, Supabase-style default grants) and then the **real migrations**. They cover scoring (20/30/50/0), duplicates, the competition window, rate limits, and 50 simultaneous correct submissions getting distinct positions. They also cover leaderboard ranking and tie-breaks, RLS and grants as the `anon` and `authenticated` roles, registration rules, admin authorization, auditing, reset, and a full route → service → PostgreSQL submission path. **Never point `TEST_DATABASE_URL` at your Supabase project.**

Still needs a real Supabase project (see the checklist in docs/DEPLOYMENT.md): Supabase Auth e-mail flows, Realtime delivery, and the PostgREST/Data API exposure settings of your project.

## Scoring rules (as shown publicly)

- 1st correct solver of a challenge: **20** points. 2nd: **30**. 3rd: **50**. 4th and later: **0**. These values are intentional; admins can change them.
- The solving position is assigned atomically when the server accepts your **first** correct flag. Later correct submissions never change your score or position.
- Incorrect flags score nothing and count toward the rate limit.
- Scoring changes apply to **future** solves only. Rewriting existing points requires an explicit, audited recalculation that uses each solve's recorded position.
- **Ranking:** total score (descending). Ties go to whoever reached that score earliest, by server time; this is the latest event that changed their score. The final tie-breaker is participant ID. Participants with 0 points are listed after everyone who scored, ordered by ID. Disabled participants and admins are not ranked. Manual adjustments count toward the score.

## Security notes

- **Flags:** stored as keyed HMAC digests in the `private` schema, which the Data API cannot reach. Digests are bound to the challenge ID and compared inside the database. Incorrect responses never include the flag. The submitted text is never stored.
- **Identity:** every route gets the participant from `supabase.auth.getUser()`, which is verified by Supabase Auth. Client-supplied user IDs, scores, positions and timestamps are ignored. All timestamps come from the database clock.
- **Authorization:** admin pages and **every** admin API route check the `admins` table. Admin database functions check again and write the audit log in the same transaction.
- **RLS:** enabled on all tables. Participants can read only their own profile, solves, submissions and adjustments. There are no write policies, and API roles have no write grants. Privileged functions can be executed only by `service_role`.
- **CSRF:** state-changing API calls must be same-origin (`Origin` / `Sec-Fetch-Site` checked in `proxy.ts`). Cookies are `SameSite=Lax`.
- **Sessions:** auth cookies are `httpOnly` (and `Secure` in production). The browser never touches tokens; the only Supabase client in the browser is an anonymous Realtime listener.
- **XSS:** React escaping everywhere, no `dangerouslySetInnerHTML`, plain-text descriptions (only `http(s)` links become links), and a nonce-based CSP with `strict-dynamic`.
- **Headers:** CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, COOP.
- **Caching:** personal and admin responses are `private, no-store`. Only public aggregate endpoints are CDN-cacheable, and the proxy never sets cookies on them.
- **CSV export** neutralises spreadsheet formula injection.

**Known limitations**
- Rate limiting is database-backed and counts recorded attempts in a sliding window. It is exact per participant (serialized with an advisory lock) and approximate per IP. Rate-limited attempts are not stored. Login and registration brute-force protection relies on Supabase Auth's own rate limits.
- Behind a shared NAT (classroom or venue Wi-Fi), many participants share one IP. Keep the per-IP limit well above the per-participant limit (default 60 vs 10 per minute).
- Admins see participant emails (needed to contact them). No other auth data is exposed.
- The style CSP allows inline `style` attributes (used for progress bars); scripts are nonce-only.
- Deleting challenges is intentionally not offered (deactivate instead), so historical solves remain consistent.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Setup required" banner | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` missing. On Vercel, set them and **redeploy** |
| Every submission returns 500 | `FLAG_HMAC_SECRET` or `SUPABASE_SECRET_KEY` is missing or too short. Check the Vercel function logs |
| Correct flag is "incorrect" | The flag digests were made with a different `FLAG_HMAC_SECRET`. Re-run `npm run seed` with the production secret, or reset the flag in the admin panel |
| "Challenges are hidden" | The start time is in the future and *Hide challenges before start* is on |
| Registration says "username not available" | Name taken (case-insensitive), reserved, or registration closed |
| Leaderboard badge shows "auto-refresh 5s" | Realtime is not connected. Polling keeps it updated. Check that `leaderboard_state` is in the `supabase_realtime` publication |
| `403 csrf_rejected` from curl | Send `-H "Origin: https://your-app.vercel.app"` |
| Can't reach /admin | Run `npm run admin:bootstrap` for your account, then sign out and back in |
| Project stopped responding after a quiet week | Free Supabase projects pause after inactivity. Restore the project in the dashboard |

## Free-tier limitations (checked October 2026; verify before your event)

- **Supabase Free:** 500 MB database, 50,000 monthly active users, 5 GB egress, and 2 active projects. **Projects pause after 7 days of inactivity**; restore from the dashboard, and data is kept. Daily backups are not included. The built-in email sender is heavily rate-limited and meant for testing. For real confirmation emails, configure custom SMTP or turn confirmation off (see DEPLOYMENT.md).
- **Vercel Hobby:** free, but **restricted to personal, non-commercial use**. A CTF run by or for a company, or for paid clients, needs Vercel Pro. Exceeding Hobby usage limits can block the feature until 30 days have passed.
- For 20–50 participants, usage is tiny: each submission is one indexed lookup plus one database function call. Leaderboard polling hits the CDN cache (`s-maxage=2`).
- **Upgrade path:** Supabase Pro removes pausing. Vercel Pro allows commercial use. No code changes are required.

Sources: [Supabase pricing](https://supabase.com/pricing) · [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) · [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines) · [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)

## GitHub and Vercel

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for creating the repository, Supabase configuration, the Vercel import, environment variables, redeploying, and the production verification checklist.
