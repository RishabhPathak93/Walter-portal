# Deployment guide (GitHub → Supabase → Vercel)

This guide assumes no prior experience and **no custom domain**. You will end up with a free `https://<project>.vercel.app` URL.

Allow about 30–45 minutes. Have three things ready: a GitHub account, a Supabase account and a Vercel account. You can sign in to Vercel with GitHub.

---

## 1. GitHub

The code lives in **https://github.com/RishabhPathak93/Walter-portal**.

- The repository is **public**. Flags are never committed: `seed/flags.local.json` (the real flags) and all `.env*` files except `.env.example` are git-ignored. Keep it that way. Put the real flags into `seed/flags.local.json` only on your own machine (copy `seed/flags.example.json`).
- To work locally: `git clone https://github.com/RishabhPathak93/Walter-portal.git && cd Walter-portal && npm ci`.
- **CI:** `.github/workflows/ci.yml` runs on every push and pull request. It typechecks, runs all tests (including the PostgreSQL integration tests against a throw-away Postgres container, never against Supabase), and does a production build.
- **If a secret is ever pushed by accident**, rotate it: generate a new Supabase secret key and a new `FLAG_HMAC_SECRET`, then re-seed. Deleting the commit is not enough.

## 2. Supabase

### 2.1 Create the project
1. Go to <https://supabase.com/dashboard> → **New project**.
2. Choose a name and a strong database password (store it in a password manager). Pick the region **South Asia (Mumbai) `ap-south-1`**. `vercel.json` pins the Vercel Functions to Mumbai (`bom1`), so the app and the database sit next to each other. If you choose another Supabase region, change `regions` in `vercel.json` to the nearest Vercel region.
3. Wait until the project is ready.

### 2.2 Apply the migrations (configure the database and security policies)
**Option A: CLI (recommended)**
```bash
npx supabase login
npx supabase link --project-ref <project-ref>   # the ref is in Project Settings → General
npx supabase db push
```
**Option B: SQL Editor**
Open **SQL Editor → New query**. Paste the contents of `supabase/migrations/20261030000001_schema.sql` and click **Run**. Repeat with `…0002_functions.sql`, then `…0003_security.sql`, in that order.

These migrations create the tables and indexes, enable RLS with the correct policies and grants, and register `leaderboard_state` for Realtime. You don't need to configure any policies by hand.

Verify with:
- **Table Editor:** every table shows *RLS enabled*.
- **Database → Publications → supabase_realtime:** includes `leaderboard_state`.
- **Project Settings → Data API:** exposed schemas include `public`, and **not** `private`.

### 2.3 Configure authentication
**Authentication → Sign In / Providers → Email:** keep **Email** enabled.

**Email confirmation.** Choose one:
- **Small, trusted event (simplest):** turn **Confirm email** off. Participants are signed in immediately after registering.
- **Confirmation on:** Supabase's built-in email sender is heavily rate-limited and intended for testing, so configure **custom SMTP** first (Authentication → Emails → SMTP Settings; any SMTP provider works). Then:
  1. Under **Authentication → URL Configuration**, set **Site URL** to `https://<your-app>.vercel.app`, and add `https://<your-app>.vercel.app/**` and `http://localhost:3000/**` to **Redirect URLs**.
  2. Under **Authentication → Emails → Templates → Confirm signup**, change the link to:
     ```
     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
     ```
  3. Optionally set `NEXT_PUBLIC_SITE_URL` in Vercel to the same URL.

**Passwords.** Under Authentication → Policies, set a minimum password length of 8 or more. The app enforces 8 to 72 characters.

### 2.4 Get the environment values
**Project Settings → API Keys:**
- **Publishable key** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Secret key** (`sb_secret_…`; create one if none is listed) → `SUPABASE_SECRET_KEY`. Treat it like a root password.
- **Project URL** (Project Settings → Data API, or the *Connect* button) → `NEXT_PUBLIC_SUPABASE_URL`

Older projects that only have *Legacy API keys* can use the `anon` key and the `service_role` key (as `SUPABASE_SERVICE_ROLE_KEY`). Supabase is phasing the legacy keys out, so prefer the new ones.

Generate the flag secret locally with `npm run secret:generate` → `FLAG_HMAC_SECRET`.

### 2.5 Seed the three challenges
On your computer, put the values from 2.4 into `.env.local` and confirm that `seed/flags.local.json` holds the real flags. Then run:
```bash
npm run seed            # creates them INACTIVE (add target details first)
# or: npm run seed:activate
```
⚠️ Use **the same `FLAG_HMAC_SECRET`** locally and in Vercel. Otherwise correct flags will be rejected.

### 2.6 Bootstrap the administrator
Either register the admin account in the deployed app first and then run `npm run admin:bootstrap`, or set `ADMIN_BOOTSTRAP_PASSWORD` (12+ characters) in `.env.local` and run the script to create and promote the account in one step.

## 3. Vercel

1. Go to <https://vercel.com/new> → **Import Git Repository** → select **Walter-portal**. Framework, install command (`npm ci`), build command and region come from `vercel.json`, so leave the build settings at their defaults. The Node.js version comes from `package.json` `engines` (Node 22 is recommended; see Project → Settings → General → Node.js Version).
2. **Environment Variables:** add these for *Production* (and *Preview* if you use it):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `FLAG_HMAC_SECRET`
   - optionally `NEXT_PUBLIC_SITE_URL`

   Do **not** add `ADMIN_BOOTSTRAP_*`; it is only needed locally.
3. Click **Deploy**.
4. **Function region** is set in `vercel.json` (`"regions": ["bom1"]`, Mumbai). It must match your Supabase region; see 2.1.
5. **Redeploy after changing environment variables:** go to Deployments → ⋯ on the latest deployment → **Redeploy**. Values are read at build time (`NEXT_PUBLIC_*`) and at runtime, so an existing deployment does not pick up changes.

### Domain
Vercel gives you a free URL such as `https://cyber-ctf-arena.vercel.app` (shown on the project page). Use it everywhere: Supabase Site URL, redirect URLs and `NEXT_PUBLIC_SITE_URL`. You don't need a custom domain.

### Free-plan reminder
Vercel **Hobby is for personal, non-commercial use only**. For a company-run or client event, use Vercel Pro. Free Supabase projects **pause after 7 days of inactivity**: open the dashboard a day before the event and make sure the project is active. A paused project can be restored, and its data is kept.

## 4. Production verification checklist

Use two browsers (or one normal window and one private window) for two participants.

- [ ] **Landing page** shows the name, status, stats and scoring rules. Viewing the page source shows no `flag{`.
- [ ] **Registration:** create `alice`. Registering `ALICE` with another email is rejected (duplicate username). A 2-character username is rejected.
- [ ] **Login and logout** work. In DevTools → Application → Cookies, the `sb-…-auth-token` cookies are **HttpOnly** and **Secure**.
- [ ] **Admin:** `/admin` as alice shows *403*, and `fetch('/api/admin/overview')` in her console returns 403. As the bootstrapped admin, `/admin` works.
- [ ] **Challenges:** activate them in Admin → Challenges and add the target details.
- [ ] **Incorrect flag** → red "Incorrect flag" message, and the response doesn't contain the flag.
- [ ] **Correct flag** (alice) → "1st solver … 20 points". Bob → 30. A third account → 50. A fourth → 0.
- [ ] **Duplicate prevention:** alice re-submits → "Already solved", and her score is unchanged.
- [ ] **Concurrent submissions:** two people press Submit at the same moment on an unsolved challenge. Admin → Submissions → *Accepted solves* shows distinct positions #1 and #2.
- [ ] **Leaderboard** shows the *live* badge and updates in the other browser within seconds, without a refresh. The tie order follows "reached the score first".
- [ ] **Rate limit:** 11 wrong flags in a minute → "Too many attempts" with a countdown.
- [ ] **Window:** set an end time in the past (Admin → Competition) → submissions show "competition has ended". Restore it afterwards.
- [ ] **Database security:** in the browser console on your site, run:
  ```js
  const u = "<NEXT_PUBLIC_SUPABASE_URL>", k = "<publishable key>";
  await (await fetch(`${u}/rest/v1/solves?select=*`, { headers: { apikey: k } })).json()          // permission denied
  await (await fetch(`${u}/rest/v1/rpc/submit_flag`, { method: "POST", headers: { apikey: k, "content-type": "application/json" }, body: "{}" })).json() // permission denied
  ```
  Neither may return data. `private.challenge_flags` cannot be reached through the API at all.
- [ ] **Audit log** lists the challenge, scoring and participant changes, without any flag values.
- [ ] **CSV export** downloads.
- [ ] **Before the real event:** Admin → Reset (type `RESET`) to clear test solves, then set the real start and end times.
