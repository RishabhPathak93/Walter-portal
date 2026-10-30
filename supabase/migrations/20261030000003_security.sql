-- =============================================================================
-- Cyber CTF Arena — 0003 security: grants, Row Level Security, Realtime
--
-- Model:
--   * The browser only ever talks to Supabase directly for (a) Auth and
--     (b) a Realtime subscription to public.leaderboard_state.
--   * Everything else goes through Next.js Route Handlers, which use either
--     the participant's own session (RLS applies) or the secret/service key
--     for operations that are additionally guarded by server-side checks.
--   * Supabase grants broad table privileges to anon/authenticated by default,
--     so we revoke first and then grant back exactly what is needed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schema `private`: never reachable by API roles.
-- ---------------------------------------------------------------------------
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges (defence in depth on top of RLS)
-- ---------------------------------------------------------------------------
revoke all on table
  public.competition_settings, public.profiles, public.admins, public.challenges,
  public.scoring_rules, public.solves, public.submissions, public.score_adjustments,
  public.audit_logs, public.leaderboard_state
from anon, authenticated;

-- Read-only grants; RLS policies below decide which rows are visible.
grant select on public.competition_settings to anon, authenticated;
grant select on public.challenges           to anon, authenticated;
grant select on public.scoring_rules        to anon, authenticated;
grant select on public.leaderboard_state    to anon, authenticated;
grant select on public.profiles             to authenticated;
grant select on public.solves               to authenticated;
grant select on public.submissions          to authenticated;
grant select on public.score_adjustments    to authenticated;
-- admins, audit_logs: no access at all for API roles.

-- Trusted server code (secret key / service_role) needs full table access.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled on every table in the exposed schema.
-- No INSERT / UPDATE / DELETE policies exist for anon or authenticated, so
-- participants cannot write scores, solves, positions, profiles or admin rows.
-- ---------------------------------------------------------------------------
alter table public.competition_settings enable row level security;
alter table public.profiles             enable row level security;
alter table public.admins               enable row level security;
alter table public.challenges           enable row level security;
alter table public.scoring_rules        enable row level security;
alter table public.solves               enable row level security;
alter table public.submissions          enable row level security;
alter table public.score_adjustments    enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.leaderboard_state    enable row level security;
alter table private.challenge_flags     enable row level security;

-- Competition settings contain no secrets.
create policy "settings are public"
  on public.competition_settings for select
  to anon, authenticated
  using (true);

-- Active challenges are readable once the competition makes them visible.
create policy "visible active challenges are public"
  on public.challenges for select
  to anon, authenticated
  using (is_active and private.challenges_visible());

create policy "scoring rules are public"
  on public.scoring_rules for select
  to anon, authenticated
  using (true);

create policy "leaderboard state is public"
  on public.leaderboard_state for select
  to anon, authenticated
  using (true);

-- Participants can read only their own private records.
create policy "participants read own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "participants read own solves"
  on public.solves for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "participants read own submissions"
  on public.submissions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "participants read own adjustments"
  on public.score_adjustments for select
  to authenticated
  using (user_id = (select auth.uid()));

-- admins, audit_logs, private.challenge_flags: RLS enabled with no policies
-- => no rows for anon/authenticated even if a grant were added by mistake.

-- `private.challenges_visible()` is referenced by a policy, so API roles need
-- to be able to execute it (it returns a boolean only). Usage on the schema
-- is required to resolve the function; tables there remain inaccessible.
grant usage on schema private to anon, authenticated;
grant execute on function private.challenges_visible() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges. Supabase grants EXECUTE on new functions to anon and
-- authenticated by default; revoke everything, then grant explicitly.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Public read models (safe aggregates only).
grant execute on function public.get_leaderboard(integer, integer)  to anon, authenticated, service_role;
grant execute on function public.get_competition_public()           to anon, authenticated, service_role;
grant execute on function public.get_public_stats()                 to anon, authenticated, service_role;
grant execute on function public.get_scoring_public()               to anon, authenticated, service_role;
grant execute on function public.get_public_challenges()            to anon, authenticated, service_role;
grant execute on function public.username_available(text)           to anon, authenticated, service_role;

-- Signed-in participant only (identity from the verified JWT via auth.uid()).
grant execute on function public.get_my_standing()                  to authenticated, service_role;

-- Trusted server code only.
grant execute on function public.resolve_challenge_id(text)         to service_role;
grant execute on function public.submit_flag(uuid, uuid, text, text) to service_role;
grant execute on function public.seed_challenge(uuid, text, text, text, text, text, boolean, integer, text, boolean) to service_role;
grant execute on function public.admin_update_competition(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, boolean, integer, integer, integer) to service_role;
grant execute on function public.admin_create_challenge(uuid, uuid, text, text, text, text, text, boolean, integer, text) to service_role;
grant execute on function public.admin_update_challenge(uuid, uuid, text, text, text, text, text, boolean, integer) to service_role;
grant execute on function public.admin_set_flag(uuid, uuid, text)    to service_role;
grant execute on function public.admin_list_challenges(uuid)         to service_role;
grant execute on function public.admin_update_scoring(uuid, jsonb, integer, boolean) to service_role;
grant execute on function public.admin_set_participant_disabled(uuid, uuid, boolean, text) to service_role;
grant execute on function public.admin_adjust_score(uuid, uuid, integer, text) to service_role;
grant execute on function public.admin_reset_competition(uuid, text) to service_role;
grant execute on function public.admin_list_participants(uuid)       to service_role;
grant execute on function public.admin_leaderboard(uuid)             to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes to the public leaderboard_state row only.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leaderboard_state'
    ) then
      alter publication supabase_realtime add table public.leaderboard_state;
    end if;
  end if;
end;
$$;
