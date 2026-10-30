# Architecture

```
Browser ──HTTPS──▶ Vercel (Next.js: pages, Route Handlers, proxy.ts) ──▶ Supabase PostgreSQL / Auth
   │                                                                          ▲
   └──── wss (anon, Realtime) ── "leaderboard_state changed" ─────────────────┘
```

- There is no long-running server. Each request runs in a Vercel Function and uses Supabase over HTTPS (PostgREST/RPC), so no database connection pool is needed.
- The **database is authoritative** for scores, positions and timestamps. Node only hashes the submitted flag and maps database results to HTTP responses.
- The browser talks to Supabase directly for only one thing: an anonymous Realtime subscription to the public `leaderboard_state` row.

## Supabase clients (`src/lib/supabase/`)

| Client | Key | Role | Used for |
|---|---|---|---|
| `server.ts` | publishable + user session cookie | `authenticated` (RLS) | sign-in/up/out, own solves/submissions, `get_my_standing` |
| `public.ts` | publishable, no session | `anon` | public read models (`get_leaderboard`, `get_public_challenges`, …) |
| `admin.ts` | secret key | `service_role` | `submit_flag`, admin functions, admin reads (always after `requireUser` / `requireAdmin`) |
| `browser.ts` | publishable, no session | `anon` | Realtime only |

## Tables

| Table | Purpose |
|---|---|
| `competition_settings` | Single row: name, tagline, description, start/end, pause, registration, hide-before-start, default points, rate limits |
| `profiles` | One per participant (1:1 with `auth.users`). Unique case-insensitive `username`, `is_disabled` |
| `admins` | Trusted admin role mapping |
| `challenges` | Public metadata (slug, title, description, category, difficulty, active, sort order) |
| `private.challenge_flags` | HMAC-SHA256 flag digests. In a schema the Data API does not expose |
| `scoring_rules` | Points per solving position (default 1→20, 2→30, 3→50) |
| `solves` | Accepted first-correct solves: `position`, `points`, `solved_at`. `UNIQUE(user_id, challenge_id)`, `UNIQUE(challenge_id, position)` |
| `submissions` | Every processed attempt: outcome and server timestamp (no flag text), plus a keyed IP hash for rate limiting |
| `score_adjustments` | Audited manual corrections (±points and a reason) |
| `audit_logs` | Administrative actions (never secrets) |
| `leaderboard_state` | Version counter bumped by triggers and broadcast through Realtime |

Indexes cover participant, challenge and time lookups (`solves_user_idx`, `submissions_user_created_idx`, `submissions_ip_created_idx`, …) and leaderboard aggregation.

## Atomic solving order (`public.submit_flag`)

1. Validate the inputs. Check that the participant exists and is not disabled, that the challenge exists and is active, and that the competition is `running` (database clock).
2. `pg_advisory_xact_lock(user)` serializes one participant's submissions, which gives an exact rate limit and no double-solve race. Then apply the rate limit (per participant and per IP hash, sliding window).
3. Compare the digest. If it is wrong, record `incorrect` and return.
4. If already solved, record `already_solved` and return the original position and points.
5. `SELECT … FOR UPDATE` on the challenge row serializes position assignment **per challenge**.
6. `position = max(position) + 1`, `points = scoring_rules[position]` (or `default_points`), `solved_at = clock_timestamp()` taken after the lock. Insert the solve and the submission. A trigger bumps `leaderboard_state`. Commit.
7. Unique constraints are the final safety net.

The tests submit 50 correct flags concurrently from 50 connections and verify positions 1–50, points 20/30/50/0…, and timestamps in the same order as positions.

## Leaderboard ranking (`private.leaderboard()`)

`ORDER BY score DESC, score_reached_at ASC NULLS LAST, user_id ASC`, where:
- `score` = sum of solve points + sum of adjustments
- `score_reached_at` = time of the latest event that changed the score (a solve worth more than 0 points, or an adjustment)

Zero-score participants have `NULL` and sort last. Disabled participants and admins are excluded. Everything is computed in one aggregate query, with no per-participant queries.

## RLS and grants summary

| Object | anon | authenticated | service_role |
|---|---|---|---|
| `competition_settings`, `scoring_rules`, `leaderboard_state` | SELECT | SELECT | ALL |
| `challenges` | SELECT active and visible | same | ALL |
| `profiles`, `solves`, `submissions`, `score_adjustments` | – | SELECT **own rows** | ALL |
| `admins`, `audit_logs` | – | – | ALL |
| `private.*` tables | – | – | via SECURITY DEFINER functions only |
| `get_leaderboard`, `get_public_*`, `get_competition_public`, `username_available` | EXECUTE | EXECUTE | EXECUTE |
| `get_my_standing` (uses `auth.uid()`) | – | EXECUTE | EXECUTE |
| `submit_flag`, `resolve_challenge_id`, `seed_challenge`, `admin_*` | – | – | EXECUTE |

API roles have no INSERT, UPDATE or DELETE grants anywhere. Admin functions also call `private.assert_admin(actor)`.

## API

All responses are JSON `{ ok, code, message, data? }`. Mutations require a same-origin `Origin`.

| Method & path | Auth | Request → Response |
|---|---|---|
| `POST /api/auth/register` | public | `{email, password, username}` → `201 {needsEmailConfirmation}`; `409 username_taken/email_taken`; `403 registration_closed` |
| `POST /api/auth/login` | public | `{email, password}` → `200`; `401 invalid_credentials`; `403 email_not_confirmed` |
| `POST /api/auth/logout` | any | → `200` |
| `GET /api/stats` | public, cached 5 s | `{competition, stats, scoring}` |
| `GET /api/challenges` | public, cached 10 s | `{state, visible, challenges:[{id, slug, title, category, difficulty, solveCount, nextPoints}]}` |
| `GET /api/challenges/:slug` | public, cached 10 s | challenge details (no flag) or `404` |
| `POST /api/challenges/:slug/submit` | participant | `{flag}` → `201 correct {position, points, solvedAt}` · `200 already_solved` · `422 incorrect` · `404 challenge_not_found` · `403 challenge_unavailable / competition_not_open / account_disabled` · `429 rate_limited` (+`Retry-After`) · `401 authentication_required` · `400 validation_error` · `500 server_error` |
| `GET /api/leaderboard?page&pageSize` | public, cached 2 s | `{entries:[{rank, username, solvedCount, score, lastSolveAt, scoreReachedAt}], generatedAt}` |
| `GET /api/me` | participant | `{id, email, username, isDisabled, isAdmin, standing}` |
| `GET /api/me/solves` | participant | `{solves:[…]}` |
| `GET /api/me/submissions?page&pageSize` | participant | `{items, total, page, pageSize}` |
| `GET /api/admin/overview` | admin | counts and recent solves |
| `GET / POST /api/admin/challenges` | admin | list / create `{slug, title, description, category, difficulty, isActive, sortOrder, flag}` |
| `PATCH /api/admin/challenges/:id` | admin | any subset of the challenge fields |
| `PUT /api/admin/challenges/:id/flag` | admin | `{flag}` (stored as a digest only) |
| `GET / PATCH /api/admin/scoring` | admin | `{rules:[{position, points}], defaultPoints, recalculate, confirmRecalculate?:"RECALCULATE"}` |
| `GET / PATCH /api/admin/competition` | admin | `{name, tagline, description, startAt, endAt, isPaused, registrationOpen, hideChallengesBeforeStart, rateLimitMaxAttempts, rateLimitWindowSeconds, ipRateLimitMaxAttempts}` |
| `GET /api/admin/participants` | admin | list with scores and attempt stats |
| `PATCH /api/admin/participants/:id` | admin | `{disabled, reason?}` |
| `GET /api/admin/submissions` | admin | `?view=attempts\|solves&userId&challengeId&outcome&page&pageSize` |
| `POST /api/admin/score-adjustments` | admin | `{userId, points, reason}` |
| `GET /api/admin/audit` | admin | paginated audit log |
| `GET /api/admin/leaderboard[?format=csv]` | admin | JSON or CSV export |
| `POST /api/admin/reset` | admin | `{confirmation:"RESET"}` |

Unauthenticated requests get `401`; signed-in non-admins get `403` on every `/api/admin/*` route (covered by tests).
