-- =============================================================================
-- Cyber CTF Arena — 0002 functions
-- All privileged logic lives in SECURITY DEFINER functions with an empty
-- search_path. Execute permissions are granted explicitly in 0003.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Current competition state derived from settings and the database clock.
create or replace function private.competition_state(s public.competition_settings, at_time timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when s.start_at is not null and at_time < s.start_at then 'not_started'
    when s.end_at is not null and at_time >= s.end_at then 'ended'
    when s.is_paused then 'paused'
    else 'running'
  end;
$$;

create or replace function private.challenges_visible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (s.hide_challenges_before_start
              and private.competition_state(s, now()) = 'not_started')
  from public.competition_settings s
  where s.id = 1;
$$;

create or replace function private.points_for_position(p_position integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select r.points from public.scoring_rules r where r.position = p_position),
    (select s.default_points from public.competition_settings s where s.id = 1),
    0
  );
$$;

create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and exists (select 1 from public.admins a where a.user_id = p_user_id);
$$;

create or replace function private.assert_admin(p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(p_actor) then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.audit(p_actor uuid, p_action text, p_target_type text, p_target_id text, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_actor, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- Leaderboard
-- Ranking: score DESC, time the participant reached their current score ASC
-- (NULLS LAST, i.e. zero-score participants after everyone who scored), then
-- participant id ASC as a stable deterministic tie-breaker.
-- "Reached current score" = the latest event that changed the score
-- (a solve worth > 0 points or a manual adjustment).
-- Disabled participants and administrators are excluded.
-- -----------------------------------------------------------------------------
create or replace function private.leaderboard()
returns table (
  rank              bigint,
  user_id           uuid,
  username          text,
  solved_count      integer,
  score             integer,
  last_solve_at     timestamptz,
  score_reached_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select p.id, p.username
    from public.profiles p
    where not p.is_disabled
      and not exists (select 1 from public.admins a where a.user_id = p.id)
  ),
  solve_agg as (
    select s.user_id,
           count(*)::integer                                  as solved_count,
           coalesce(sum(s.points), 0)::integer                as solve_points,
           max(s.solved_at)                                   as last_solve_at,
           max(s.solved_at) filter (where s.points <> 0)      as last_scoring_solve_at
    from public.solves s
    group by s.user_id
  ),
  adj_agg as (
    select a.user_id,
           coalesce(sum(a.points), 0)::integer as adj_points,
           max(a.created_at)                   as last_adj_at
    from public.score_adjustments a
    group by a.user_id
  ),
  scored as (
    select e.id,
           e.username,
           coalesce(sa.solved_count, 0)                                   as solved_count,
           coalesce(sa.solve_points, 0) + coalesce(aa.adj_points, 0)      as score,
           sa.last_solve_at,
           greatest(sa.last_scoring_solve_at, aa.last_adj_at)              as score_reached_at
    from eligible e
    left join solve_agg sa on sa.user_id = e.id
    left join adj_agg aa on aa.user_id = e.id
  )
  select row_number() over (order by sc.score desc, sc.score_reached_at asc nulls last, sc.id asc) as rank,
         sc.id, sc.username, sc.solved_count, sc.score, sc.last_solve_at, sc.score_reached_at
  from scored sc
  order by sc.score desc, sc.score_reached_at asc nulls last, sc.id asc;
$$;

-- Public leaderboard (no user ids).
create or replace function public.get_leaderboard(p_limit integer default 100, p_offset integer default 0)
returns table (
  rank              bigint,
  username          text,
  solved_count      integer,
  score             integer,
  last_solve_at     timestamptz,
  score_reached_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.rank, l.username, l.solved_count, l.score, l.last_solve_at, l.score_reached_at
  from private.leaderboard() l
  order by l.rank
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- The signed-in participant's own standing (uses auth.uid(); no id parameter).
create or replace function public.get_my_standing()
returns table (
  rank              bigint,
  username          text,
  solved_count      integer,
  score             integer,
  last_solve_at     timestamptz,
  total_ranked      bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with lb as (select * from private.leaderboard())
  select lb.rank, lb.username, lb.solved_count, lb.score, lb.last_solve_at,
         (select count(*) from lb) as total_ranked
  from lb
  where lb.user_id = (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Public read models
-- -----------------------------------------------------------------------------
create or replace function public.get_competition_public()
returns table (
  name                          text,
  tagline                       text,
  description                   text,
  start_at                      timestamptz,
  end_at                        timestamptz,
  state                         text,
  registration_open             boolean,
  challenges_visible            boolean,
  default_points                integer,
  server_time                   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.tagline, s.description, s.start_at, s.end_at,
         private.competition_state(s, now()),
         s.registration_open,
         private.challenges_visible(),
         s.default_points,
         now()
  from public.competition_settings s
  where s.id = 1;
$$;

create or replace function public.get_public_stats()
returns table (participants bigint, active_challenges bigint, accepted_solves bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.profiles p
       where not p.is_disabled and not exists (select 1 from public.admins a where a.user_id = p.id)),
    (select count(*) from public.challenges c where c.is_active),
    (select count(*) from public.solves);
$$;

create or replace function public.get_scoring_public()
returns table (solve_position integer, points integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.position, r.points from public.scoring_rules r order by r.position;
$$;

-- Active challenges visible to the public, with solve counts and the points
-- the next solver would receive. Returns nothing while challenges are hidden.
create or replace function public.get_public_challenges()
returns table (
  id            uuid,
  slug          text,
  title         text,
  description   text,
  category      text,
  difficulty    text,
  solve_count   integer,
  next_points   integer,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.slug, c.title, c.description, c.category, c.difficulty,
         coalesce(sc.n, 0)::integer,
         private.points_for_position(coalesce(sc.n, 0)::integer + 1),
         c.created_at
  from public.challenges c
  left join lateral (select count(*) as n from public.solves s where s.challenge_id = c.id) sc on true
  where c.is_active and private.challenges_visible()
  order by c.sort_order, c.created_at;
$$;

-- -----------------------------------------------------------------------------
-- Leaderboard change notifications
-- -----------------------------------------------------------------------------
create or replace function private.bump_leaderboard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leaderboard_state
     set version = version + 1, updated_at = now()
   where id = 1;
  return null;
end;
$$;

create trigger solves_bump_leaderboard
  after insert or update or delete on public.solves
  for each statement execute function private.bump_leaderboard();

create trigger adjustments_bump_leaderboard
  after insert or update or delete on public.score_adjustments
  for each statement execute function private.bump_leaderboard();

create trigger profiles_bump_leaderboard
  after insert or delete or update of username, is_disabled on public.profiles
  for each statement execute function private.bump_leaderboard();

create trigger admins_bump_leaderboard
  after insert or delete on public.admins
  for each statement execute function private.bump_leaderboard();

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger challenges_touch before update on public.challenges
  for each row execute function private.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger settings_touch before update on public.competition_settings
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Registration: create a profile for every new auth user.
-- Enforced here (not only in the API) so that direct calls to Supabase Auth
-- with the publishable key cannot bypass username rules or closed registration.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_bypass   boolean := coalesce((new.raw_app_meta_data ->> 'ctf_bypass_registration')::boolean, false);
begin
  if not v_bypass and not coalesce((select s.registration_open from public.competition_settings s where s.id = 1), false) then
    raise exception 'REGISTRATION_CLOSED' using errcode = 'P0001';
  end if;

  if v_username !~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$' then
    raise exception 'INVALID_USERNAME' using errcode = 'P0001';
  end if;

  if lower(v_username) in ('admin', 'administrator', 'root', 'system', 'moderator', 'support', 'organizer', 'staff')
     and not v_bypass then
    raise exception 'RESERVED_USERNAME' using errcode = 'P0001';
  end if;

  begin
    insert into public.profiles (id, username) values (new.id, v_username);
  exception when unique_violation then
    raise exception 'USERNAME_TAKEN' using errcode = 'P0001';
  end;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Username availability check used by the registration form (boolean only).
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$'
     and lower(p_username) not in ('admin', 'administrator', 'root', 'system', 'moderator', 'support', 'organizer', 'staff')
     and not exists (select 1 from public.profiles p where lower(p.username) = lower(p_username));
$$;

-- -----------------------------------------------------------------------------
-- FLAG SUBMISSION — atomic, serialized solving order.
--
-- Called only by trusted server code (service role). The server authenticates
-- the participant, computes HMAC(FLAG_HMAC_SECRET, ...) of the submitted flag
-- and passes the digest; the plaintext never reaches the database.
--
-- Concurrency design:
--   * pg_advisory_xact_lock per participant serializes one participant's
--     submissions (exact rate limiting, no double-solve race).
--   * SELECT ... FOR UPDATE on the challenge row serializes solving-order
--     assignment per challenge, so two participants can never receive the
--     same position. Different challenges do not block each other.
--   * The solve timestamp is clock_timestamp() taken *after* the lock, so
--     positions and timestamps are always in the same order.
--   * UNIQUE (user_id, challenge_id) and UNIQUE (challenge_id, position)
--     remain the final safety net.
-- -----------------------------------------------------------------------------
-- Server-side helper: the flag digest is bound to the challenge id, so the
-- server resolves the id before hashing the submitted flag.
create or replace function public.resolve_challenge_id(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.challenges c where c.slug = p_slug;
$$;

create or replace function public.submit_flag(
  p_user_id       uuid,
  p_challenge_id  uuid,
  p_digest        text,
  p_ip_hash       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile    public.profiles%rowtype;
  v_challenge  public.challenges%rowtype;
  v_settings   public.competition_settings%rowtype;
  v_state      text;
  v_expected   text;
  v_existing   public.solves%rowtype;
  v_attempts   integer;
  v_ip_attempts integer;
  v_oldest     timestamptz;
  v_position   integer;
  v_points     integer;
  v_now        timestamptz;
begin
  if p_user_id is null or p_challenge_id is null or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    p_ip_hash := null;
  end if;

  -- 1. Participant
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('status', 'profile_missing');
  end if;
  if v_profile.is_disabled then
    return jsonb_build_object('status', 'account_disabled');
  end if;

  -- 2-3. Challenge exists and is active
  select * into v_challenge from public.challenges where id = p_challenge_id;
  if not found then
    return jsonb_build_object('status', 'challenge_not_found');
  end if;
  if not v_challenge.is_active then
    return jsonb_build_object('status', 'challenge_unavailable');
  end if;

  -- 4. Competition window (database clock is authoritative)
  select * into v_settings from public.competition_settings where id = 1;
  v_state := private.competition_state(v_settings, now());
  if v_state <> 'running' then
    return jsonb_build_object('status', 'competition_not_open', 'state', v_state);
  end if;

  -- 5. Serialize this participant's submissions, then rate limit.
  perform pg_advisory_xact_lock(hashtextextended('ctf-submit:' || p_user_id::text, 0));

  select count(*), min(created_at) into v_attempts, v_oldest
  from public.submissions
  where user_id = p_user_id
    and created_at > clock_timestamp() - make_interval(secs => v_settings.rate_limit_window_seconds);

  if v_attempts >= v_settings.rate_limit_max_attempts then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after', greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => v_settings.rate_limit_window_seconds) - clock_timestamp())))::integer)
    );
  end if;

  if p_ip_hash is not null then
    select count(*) into v_ip_attempts
    from public.submissions
    where ip_hash = p_ip_hash
      and created_at > clock_timestamp() - make_interval(secs => v_settings.rate_limit_window_seconds);
    if v_ip_attempts >= v_settings.ip_rate_limit_max_attempts then
      return jsonb_build_object('status', 'rate_limited', 'retry_after', v_settings.rate_limit_window_seconds);
    end if;
  end if;

  -- 6. Verify the flag digest
  select f.flag_digest into v_expected from private.challenge_flags f where f.challenge_id = v_challenge.id;
  if v_expected is null then
    return jsonb_build_object('status', 'challenge_unavailable');
  end if;

  if v_expected <> p_digest then
    insert into public.submissions (user_id, challenge_id, outcome, ip_hash, created_at)
    values (p_user_id, v_challenge.id, 'incorrect', p_ip_hash, clock_timestamp());
    return jsonb_build_object('status', 'incorrect');
  end if;

  -- 7. Correct. Already solved? (participant lock held, so this is race-free)
  select * into v_existing from public.solves where user_id = p_user_id and challenge_id = v_challenge.id;
  if found then
    insert into public.submissions (user_id, challenge_id, outcome, ip_hash, created_at)
    values (p_user_id, v_challenge.id, 'already_solved', p_ip_hash, clock_timestamp());
    return jsonb_build_object(
      'status', 'already_solved',
      'position', v_existing.position,
      'points', v_existing.points,
      'solved_at', v_existing.solved_at
    );
  end if;

  -- 8. Serialize solving-order assignment for this challenge.
  perform 1 from public.challenges where id = v_challenge.id for update;

  -- Re-check state under the lock (an admin may have just deactivated it).
  if not (select c.is_active from public.challenges c where c.id = v_challenge.id) then
    return jsonb_build_object('status', 'challenge_unavailable');
  end if;

  select coalesce(max(s.position), 0) + 1 into v_position
  from public.solves s where s.challenge_id = v_challenge.id;

  v_points := private.points_for_position(v_position);
  v_now    := clock_timestamp();

  insert into public.solves (user_id, challenge_id, position, points, solved_at)
  values (p_user_id, v_challenge.id, v_position, v_points, v_now);

  insert into public.submissions (user_id, challenge_id, outcome, ip_hash, created_at)
  values (p_user_id, v_challenge.id, 'correct', p_ip_hash, v_now);

  return jsonb_build_object(
    'status', 'correct',
    'position', v_position,
    'points', v_points,
    'solved_at', v_now
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Seeding (service role only; used by scripts/seed.mjs)
-- -----------------------------------------------------------------------------
create or replace function public.seed_challenge(
  p_id           uuid,
  p_slug         text,
  p_title        text,
  p_description  text,
  p_category     text,
  p_difficulty   text,
  p_is_active    boolean,
  p_sort_order   integer,
  p_digest       text,
  p_overwrite_metadata boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_DIGEST' using errcode = '22023';
  end if;

  select id into v_id from public.challenges where slug = p_slug;

  if v_id is null then
    insert into public.challenges (id, slug, title, description, category, difficulty, is_active, sort_order)
    values (p_id, p_slug, p_title, p_description, p_category, p_difficulty, p_is_active, p_sort_order)
    returning id into v_id;
  elsif p_overwrite_metadata then
    update public.challenges
       set title = p_title, description = p_description, category = p_category,
           difficulty = p_difficulty, is_active = p_is_active, sort_order = p_sort_order
     where id = v_id;
  end if;

  if v_id <> p_id then
    -- Digest must be bound to the real id; caller recomputes and retries.
    return v_id;
  end if;

  insert into private.challenge_flags (challenge_id, flag_digest, updated_at)
  values (v_id, p_digest, now())
  on conflict (challenge_id) do update set flag_digest = excluded.flag_digest, updated_at = now();

  perform private.audit(null, 'seed.challenge', 'challenge', v_id::text,
                        jsonb_build_object('slug', p_slug, 'flag_digest_set', true));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Administrative operations (service role only, and actor must be an admin).
-- Each runs in one transaction together with its audit-log entry.
-- -----------------------------------------------------------------------------

create or replace function public.admin_update_competition(
  p_actor                        uuid,
  p_name                         text,
  p_tagline                      text,
  p_description                  text,
  p_start_at                     timestamptz,
  p_end_at                       timestamptz,
  p_is_paused                    boolean,
  p_registration_open            boolean,
  p_hide_challenges_before_start boolean,
  p_rate_limit_max_attempts      integer,
  p_rate_limit_window_seconds    integer,
  p_ip_rate_limit_max_attempts   integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.competition_settings%rowtype;
begin
  perform private.assert_admin(p_actor);
  select * into v_before from public.competition_settings where id = 1 for update;

  update public.competition_settings set
    name = p_name,
    tagline = p_tagline,
    description = p_description,
    start_at = p_start_at,
    end_at = p_end_at,
    is_paused = p_is_paused,
    registration_open = p_registration_open,
    hide_challenges_before_start = p_hide_challenges_before_start,
    rate_limit_max_attempts = p_rate_limit_max_attempts,
    rate_limit_window_seconds = p_rate_limit_window_seconds,
    ip_rate_limit_max_attempts = p_ip_rate_limit_max_attempts
  where id = 1;

  perform private.audit(p_actor, 'competition.update', 'competition', '1', jsonb_build_object(
    'before', jsonb_build_object('name', v_before.name, 'start_at', v_before.start_at, 'end_at', v_before.end_at,
                                 'is_paused', v_before.is_paused, 'registration_open', v_before.registration_open),
    'after',  jsonb_build_object('name', p_name, 'start_at', p_start_at, 'end_at', p_end_at,
                                 'is_paused', p_is_paused, 'registration_open', p_registration_open)
  ));
end;
$$;

create or replace function public.admin_create_challenge(
  p_actor        uuid,
  p_id           uuid,
  p_slug         text,
  p_title        text,
  p_description  text,
  p_category     text,
  p_difficulty   text,
  p_is_active    boolean,
  p_sort_order   integer,
  p_digest       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_actor);
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_DIGEST' using errcode = '22023';
  end if;

  insert into public.challenges (id, slug, title, description, category, difficulty, is_active, sort_order)
  values (p_id, p_slug, p_title, coalesce(p_description, ''), p_category, p_difficulty, p_is_active, coalesce(p_sort_order, 0));

  insert into private.challenge_flags (challenge_id, flag_digest) values (p_id, p_digest);

  perform private.audit(p_actor, 'challenge.create', 'challenge', p_id::text,
    jsonb_build_object('slug', p_slug, 'title', p_title, 'category', p_category,
                       'difficulty', p_difficulty, 'is_active', p_is_active, 'flag_set', true));
  return p_id;
end;
$$;

create or replace function public.admin_update_challenge(
  p_actor        uuid,
  p_id           uuid,
  p_slug         text,
  p_title        text,
  p_description  text,
  p_category     text,
  p_difficulty   text,
  p_is_active    boolean,
  p_sort_order   integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.challenges%rowtype;
begin
  perform private.assert_admin(p_actor);
  select * into v_before from public.challenges where id = p_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.challenges set
    slug = coalesce(p_slug, slug),
    title = coalesce(p_title, title),
    description = coalesce(p_description, description),
    category = coalesce(p_category, category),
    difficulty = coalesce(p_difficulty, difficulty),
    is_active = coalesce(p_is_active, is_active),
    sort_order = coalesce(p_sort_order, sort_order)
  where id = p_id;

  perform private.audit(p_actor, 'challenge.update', 'challenge', p_id::text, jsonb_build_object(
    'slug', coalesce(p_slug, v_before.slug),
    'changed', jsonb_strip_nulls(jsonb_build_object(
      'slug', case when p_slug is distinct from v_before.slug and p_slug is not null then p_slug end,
      'title', case when p_title is distinct from v_before.title and p_title is not null then p_title end,
      'description', case when p_description is distinct from v_before.description and p_description is not null then true end,
      'category', case when p_category is distinct from v_before.category and p_category is not null then p_category end,
      'difficulty', case when p_difficulty is distinct from v_before.difficulty and p_difficulty is not null then p_difficulty end,
      'is_active', case when p_is_active is distinct from v_before.is_active and p_is_active is not null then p_is_active end,
      'sort_order', case when p_sort_order is distinct from v_before.sort_order and p_sort_order is not null then p_sort_order end
    ))
  ));
end;
$$;

create or replace function public.admin_set_flag(p_actor uuid, p_id uuid, p_digest text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_actor);
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_DIGEST' using errcode = '22023';
  end if;
  if not exists (select 1 from public.challenges where id = p_id) then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into private.challenge_flags (challenge_id, flag_digest, updated_at)
  values (p_id, p_digest, now())
  on conflict (challenge_id) do update set flag_digest = excluded.flag_digest, updated_at = now();

  -- Never log the flag or its digest.
  perform private.audit(p_actor, 'challenge.flag_changed', 'challenge', p_id::text, '{}'::jsonb);
end;
$$;

-- Admin view of challenges (adds solve/attempt counts and whether a flag is set).
create or replace function public.admin_list_challenges(p_actor uuid)
returns table (
  id uuid, slug text, title text, description text, category text, difficulty text,
  is_active boolean, sort_order integer, created_at timestamptz, updated_at timestamptz,
  has_flag boolean, solve_count integer, attempt_count integer, incorrect_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_actor);
  return query
  select c.id, c.slug, c.title, c.description, c.category, c.difficulty, c.is_active, c.sort_order,
         c.created_at, c.updated_at,
         exists (select 1 from private.challenge_flags f where f.challenge_id = c.id),
         (select count(*)::integer from public.solves s where s.challenge_id = c.id),
         (select count(*)::integer from public.submissions su where su.challenge_id = c.id),
         (select count(*)::integer from public.submissions su where su.challenge_id = c.id and su.outcome = 'incorrect')
  from public.challenges c
  order by c.sort_order, c.created_at;
end;
$$;

-- Replace the scoring table. Applies to FUTURE solves only unless
-- p_recalculate = true, which rewrites points on existing solves based on their
-- recorded positions (positions and timestamps never change).
create or replace function public.admin_update_scoring(
  p_actor           uuid,
  p_rules           jsonb,
  p_default_points  integer,
  p_recalculate     boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before   jsonb;
  v_changed  integer := 0;
  v_rule     jsonb;
begin
  perform private.assert_admin(p_actor);
  if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) > 100 then
    raise exception 'INVALID_RULES' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('position', position, 'points', points) order by position), '[]'::jsonb)
    into v_before from public.scoring_rules;

  -- Lock settings row to serialize concurrent scoring edits.
  perform 1 from public.competition_settings where id = 1 for update;

  delete from public.scoring_rules where true;
  for v_rule in select * from jsonb_array_elements(p_rules) loop
    insert into public.scoring_rules (position, points)
    values ((v_rule ->> 'position')::integer, (v_rule ->> 'points')::integer);
  end loop;

  update public.competition_settings set default_points = p_default_points where id = 1;

  if p_recalculate then
    with recalculated as (
      select s.id, private.points_for_position(s.position) as new_points
      from public.solves s
    )
    update public.solves s
       set points = r.new_points
      from recalculated r
     where r.id = s.id and s.points <> r.new_points;
    get diagnostics v_changed = row_count;
  end if;

  perform private.audit(p_actor, 'scoring.update', 'scoring', null, jsonb_build_object(
    'before', v_before,
    'after', p_rules,
    'default_points', p_default_points,
    'recalculated', p_recalculate,
    'solves_changed', v_changed
  ));

  return jsonb_build_object('solves_changed', v_changed);
end;
$$;

create or replace function public.admin_set_participant_disabled(
  p_actor     uuid,
  p_user_id   uuid,
  p_disabled  boolean,
  p_reason    text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_actor);
  if p_user_id = p_actor then
    raise exception 'CANNOT_DISABLE_SELF' using errcode = '22023';
  end if;

  update public.profiles
     set is_disabled = p_disabled,
         disabled_reason = case when p_disabled then nullif(btrim(coalesce(p_reason, '')), '') else null end
   where id = p_user_id;
  if not found then
    raise exception 'PARTICIPANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform private.audit(p_actor, case when p_disabled then 'participant.disable' else 'participant.enable' end,
                        'participant', p_user_id::text,
                        jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

create or replace function public.admin_adjust_score(
  p_actor    uuid,
  p_user_id  uuid,
  p_points   integer,
  p_reason   text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.assert_admin(p_actor);
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'PARTICIPANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.score_adjustments (user_id, points, reason, created_by)
  values (p_user_id, p_points, btrim(p_reason), p_actor)
  returning id into v_id;

  perform private.audit(p_actor, 'score.adjust', 'participant', p_user_id::text,
                        jsonb_build_object('points', p_points, 'reason', btrim(p_reason), 'adjustment_id', v_id));
  return v_id;
end;
$$;

-- Deletes ALL solves, submissions and score adjustments. Participants,
-- challenges, flags and settings are kept. Requires typing RESET.
create or replace function public.admin_reset_competition(p_actor uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solves bigint;
  v_submissions bigint;
  v_adjustments bigint;
begin
  perform private.assert_admin(p_actor);
  if p_confirmation is distinct from 'RESET' then
    raise exception 'CONFIRMATION_REQUIRED' using errcode = '22023';
  end if;

  -- Block concurrent submissions while resetting.
  lock table public.solves, public.submissions, public.score_adjustments in exclusive mode;

  delete from public.solves where true;
  get diagnostics v_solves = row_count;
  delete from public.submissions where true;
  get diagnostics v_submissions = row_count;
  delete from public.score_adjustments where true;
  get diagnostics v_adjustments = row_count;

  perform private.audit(p_actor, 'competition.reset', 'competition', '1', jsonb_build_object(
    'solves_deleted', v_solves, 'submissions_deleted', v_submissions, 'adjustments_deleted', v_adjustments));

  return jsonb_build_object('solves_deleted', v_solves, 'submissions_deleted', v_submissions,
                            'adjustments_deleted', v_adjustments);
end;
$$;

-- Admin participant list with scores (single query, no N+1).
create or replace function public.admin_list_participants(p_actor uuid)
returns table (
  id uuid, username text, email text, is_disabled boolean, disabled_reason text, is_admin boolean,
  created_at timestamptz, solved_count integer, score integer, rank bigint,
  attempt_count integer, incorrect_count integer, last_submission_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_actor);
  return query
  with lb as (select * from private.leaderboard()),
  sub as (
    select su.user_id, count(*)::integer as n,
           count(*) filter (where su.outcome = 'incorrect')::integer as bad,
           max(su.created_at) as last_at
    from public.submissions su group by su.user_id
  ),
  sol as (
    select s.user_id, count(*)::integer as n, sum(s.points)::integer as pts
    from public.solves s group by s.user_id
  ),
  adj as (
    select a.user_id, sum(a.points)::integer as pts from public.score_adjustments a group by a.user_id
  )
  select p.id, p.username, u.email::text, p.is_disabled, p.disabled_reason,
         exists (select 1 from public.admins ad where ad.user_id = p.id),
         p.created_at,
         coalesce(sol.n, 0), coalesce(sol.pts, 0) + coalesce(adj.pts, 0),
         lb.rank,
         coalesce(sub.n, 0), coalesce(sub.bad, 0), sub.last_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lb on lb.user_id = p.id
  left join sub on sub.user_id = p.id
  left join sol on sol.user_id = p.id
  left join adj on adj.user_id = p.id
  order by lb.rank nulls last, p.created_at;
end;
$$;

-- Admin leaderboard with ids (for CSV export and admin tables).
create or replace function public.admin_leaderboard(p_actor uuid)
returns table (
  rank bigint, user_id uuid, username text, solved_count integer, score integer,
  last_solve_at timestamptz, score_reached_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_actor);
  return query select * from private.leaderboard();
end;
$$;
