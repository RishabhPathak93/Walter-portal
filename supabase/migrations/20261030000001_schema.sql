-- =============================================================================
-- Cyber CTF Arena — 0001 schema
-- Tables, constraints and indexes. Security (RLS / grants) is in 0003.
-- =============================================================================

-- `private` holds data that must never be reachable through the Supabase Data
-- API (flag digests). Only SECURITY DEFINER functions owned by `postgres` read it.
create schema if not exists private;

-- -----------------------------------------------------------------------------
-- competition_settings: single-row table with the competition configuration.
-- -----------------------------------------------------------------------------
create table public.competition_settings (
  id                            smallint primary key default 1 check (id = 1),
  name                          text not null default 'Cyber CTF Arena'
                                  check (char_length(name) between 1 and 80),
  tagline                       text not null default 'Find the Flag. Solve the Challenge. Claim Your Rank.'
                                  check (char_length(tagline) <= 160),
  description                   text not null default 'An individual Capture The Flag competition. Investigate each challenge, find the hidden flag and submit it before anyone else to climb the leaderboard.'
                                  check (char_length(description) <= 4000),
  start_at                      timestamptz,
  end_at                        timestamptz,
  is_paused                     boolean not null default false,
  registration_open             boolean not null default true,
  hide_challenges_before_start  boolean not null default true,
  -- Points for any solving position that has no explicit row in scoring_rules.
  default_points                integer not null default 0 check (default_points between 0 and 10000),
  -- Lightweight, database-backed rate limiting (see submit_flag).
  rate_limit_max_attempts       integer not null default 10 check (rate_limit_max_attempts between 1 and 1000),
  rate_limit_window_seconds     integer not null default 60 check (rate_limit_window_seconds between 5 and 3600),
  ip_rate_limit_max_attempts    integer not null default 60 check (ip_rate_limit_max_attempts between 1 and 10000),
  updated_at                    timestamptz not null default now(),
  constraint competition_window_valid check (start_at is null or end_at is null or end_at > start_at)
);
comment on table public.competition_settings is 'Single-row competition configuration (name, schedule, registration, rate limits).';

insert into public.competition_settings (id) values (1);

-- -----------------------------------------------------------------------------
-- profiles: one row per participant, linked 1:1 to auth.users.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null check (username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$'),
  is_disabled  boolean not null default false,
  disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'Public participant identity (unique username). Auth credentials live in auth.users.';

-- Case-insensitive uniqueness: "Alice" and "alice" cannot both exist.
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- -----------------------------------------------------------------------------
-- admins: trusted role mapping. Only rows here grant admin rights.
-- -----------------------------------------------------------------------------
create table public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  note        text
);
comment on table public.admins is 'Administrator role mapping. Never writable from the browser; bootstrap via scripts/bootstrap-admin.mjs or SQL.';

-- -----------------------------------------------------------------------------
-- challenges: public metadata only. Flags are NOT stored here.
-- -----------------------------------------------------------------------------
create table public.challenges (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64),
  title        text not null check (char_length(title) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 10000),
  category     text not null check (char_length(category) between 1 and 40),
  difficulty   text not null check (difficulty in ('Easy', 'Medium', 'Hard', 'Expert')),
  is_active    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.challenges is 'Challenge metadata. Contains no secrets; flag digests are in private.challenge_flags.';

create index challenges_active_sort_idx on public.challenges (is_active, sort_order, created_at);

-- -----------------------------------------------------------------------------
-- private.challenge_flags: keyed HMAC-SHA256 digests of the flags.
-- -----------------------------------------------------------------------------
create table private.challenge_flags (
  challenge_id    uuid primary key references public.challenges (id) on delete cascade,
  flag_digest     text not null check (flag_digest ~ '^[0-9a-f]{64}$'),
  digest_version  smallint not null default 1,
  updated_at      timestamptz not null default now()
);
comment on table private.challenge_flags is 'HMAC-SHA256(FLAG_HMAC_SECRET, "ctf-flag:v1:" || challenge_id || ":" || flag). Plaintext flags are never stored.';

-- -----------------------------------------------------------------------------
-- scoring_rules: points per solving position (1st, 2nd, 3rd, ...).
-- -----------------------------------------------------------------------------
create table public.scoring_rules (
  position    integer primary key check (position between 1 and 100),
  points      integer not null check (points between 0 and 10000),
  updated_at  timestamptz not null default now()
);
comment on table public.scoring_rules is 'Points awarded by solving position. Positions without a row receive competition_settings.default_points.';

insert into public.scoring_rules (position, points) values (1, 20), (2, 30), (3, 50);

-- -----------------------------------------------------------------------------
-- solves: accepted (first) correct submissions. Authoritative score source.
-- -----------------------------------------------------------------------------
create table public.solves (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  challenge_id  uuid not null references public.challenges (id) on delete restrict,
  position      integer not null check (position >= 1),
  points        integer not null check (points between 0 and 10000),
  solved_at     timestamptz not null default now(),
  constraint solves_user_challenge_key unique (user_id, challenge_id),
  constraint solves_challenge_position_key unique (challenge_id, position)
);
comment on table public.solves is 'One row per (participant, challenge) first correct solve, with its atomic solving position and points.';

create index solves_user_idx on public.solves (user_id, solved_at desc);
create index solves_solved_at_idx on public.solves (solved_at desc);

-- -----------------------------------------------------------------------------
-- submissions: every processed attempt (for history, monitoring, rate limits).
-- The submitted text itself is never stored.
-- -----------------------------------------------------------------------------
create table public.submissions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  challenge_id  uuid not null references public.challenges (id) on delete restrict,
  outcome       text not null check (outcome in ('correct', 'incorrect', 'already_solved')),
  is_correct    boolean generated always as (outcome <> 'incorrect') stored,
  ip_hash       text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now()
);
comment on table public.submissions is 'Flag submission attempts (outcome + server timestamp). Never stores the submitted value.';

create index submissions_user_created_idx on public.submissions (user_id, created_at desc);
create index submissions_challenge_created_idx on public.submissions (challenge_id, created_at desc);
create index submissions_ip_created_idx on public.submissions (ip_hash, created_at desc) where ip_hash is not null;
create index submissions_created_idx on public.submissions (created_at desc);

-- -----------------------------------------------------------------------------
-- score_adjustments: audited manual corrections by administrators.
-- -----------------------------------------------------------------------------
create table public.score_adjustments (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  points      integer not null check (points between -100000 and 100000 and points <> 0),
  reason      text not null check (char_length(reason) between 3 and 500),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.score_adjustments is 'Manual, audited score corrections. Added to solve points on the leaderboard.';

create index score_adjustments_user_idx on public.score_adjustments (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- audit_logs: administrative actions. Never contains secrets or flags.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references auth.users (id) on delete set null,
  action       text not null check (char_length(action) between 1 and 80),
  target_type  text,
  target_id    text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
comment on table public.audit_logs is 'Append-only log of administrative actions (no secrets).';

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- -----------------------------------------------------------------------------
-- leaderboard_state: a single public row whose version bumps whenever scores
-- change. Browsers subscribe to it via Supabase Realtime and then refetch the
-- leaderboard — no private data is ever broadcast.
-- -----------------------------------------------------------------------------
create table public.leaderboard_state (
  id          smallint primary key default 1 check (id = 1),
  version     bigint not null default 0,
  updated_at  timestamptz not null default now()
);
comment on table public.leaderboard_state is 'Change counter broadcast via Realtime so clients know to refetch the leaderboard.';

insert into public.leaderboard_state (id) values (1);
