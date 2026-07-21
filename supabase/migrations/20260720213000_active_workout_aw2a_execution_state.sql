begin;

-- AW-2A persists only transient execution state beneath the canonical
-- workout_sessions -> exercise_logs performed-workout model.
do $aw2a_preflight$
declare
  v_marker text;
begin
  if to_regclass('public.workout_session_execution_states') is not null then
    raise exception 'AW-2A execution-state table already exists; refusing partial or repeated application.';
  end if;

  if to_regclass('public.workout_sessions') is null
     or to_regclass('public.exercise_logs') is null
     or to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null
     or to_regprocedure('private.is_admin()') is null then
    raise exception 'AW-2A requires the canonical workout, snapshot, and private admin foundations.';
  end if;

  if exists (
    select 1
    from public.workout_sessions session
    left join public.workout_session_muscle_snapshots snapshot
      on snapshot.workout_session_id = session.id
     and snapshot.user_id = session.user_id
    where session.status = 'started'
      and snapshot.id is null
  ) then
    raise exception 'AW-2A preflight failed: an open workout session is missing its authoritative snapshot.';
  end if;

  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_sessions session on session.id = snapshot.workout_session_id
    where snapshot.user_id <> session.user_id
  ) then
    raise exception 'AW-2A preflight failed: snapshot ownership differs from the root workout session.';
  end if;

  select migration_version into strict v_marker
  from public.release_schema_compatibility
  where singleton;

  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted before AW-2A: %.', v_marker;
  end if;
end
$aw2a_preflight$;

create temporary table aw2a_compatibility_marker on commit drop as
select migration_version as marker
from public.release_schema_compatibility
where singleton;

create table public.workout_session_execution_states (
  workout_session_id uuid primary key
    references public.workout_sessions(id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  state_version integer not null default 1,
  revision bigint not null default 0,
  session_state text not null default 'active',
  view_state text not null default 'set_entry',
  active_snapshot_item_id uuid
    references public.workout_session_muscle_snapshot_items(id) on delete set null,
  active_item_order integer not null default 1,
  active_set_number integer not null default 1,
  session_elapsed_seconds integer not null default 0,
  session_running_since timestamptz default clock_timestamp(),
  rest_started_at timestamptz,
  rest_duration_seconds integer,
  rest_ends_at timestamptz,
  controller_device_id text,
  bootstrap_source text not null default 'session_start',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint workout_session_execution_states_version_check
    check (state_version = 1),
  constraint workout_session_execution_states_revision_check
    check (revision >= 0),
  constraint workout_session_execution_states_session_state_check
    check (session_state in ('active', 'paused', 'review')),
  constraint workout_session_execution_states_view_state_check
    check (view_state in ('set_entry', 'rest', 'exercise_complete', 'session_review')),
  constraint workout_session_execution_states_review_relation_check
    check ((session_state = 'review') = (view_state = 'session_review')),
  constraint workout_session_execution_states_cursor_check
    check (active_item_order >= 1 and active_set_number >= 1),
  constraint workout_session_execution_states_elapsed_check
    check (session_elapsed_seconds >= 0),
  constraint workout_session_execution_states_running_relation_check
    check (
      (session_state = 'paused' and session_running_since is null)
      or (session_state in ('active', 'review') and session_running_since is not null)
    ),
  constraint workout_session_execution_states_rest_duration_check
    check (rest_duration_seconds is null or rest_duration_seconds between 0 and 86400),
  constraint workout_session_execution_states_rest_relation_check
    check (
      (
        view_state = 'rest'
        and rest_started_at is not null
        and rest_duration_seconds is not null
        and rest_ends_at is not null
        and rest_ends_at = rest_started_at + make_interval(secs => rest_duration_seconds)
      )
      or (
        view_state <> 'rest'
        and rest_started_at is null
        and rest_duration_seconds is null
        and rest_ends_at is null
      )
    ),
  constraint workout_session_execution_states_device_length_check
    check (controller_device_id is null or char_length(controller_device_id) <= 128),
  constraint workout_session_execution_states_device_uuid_check
    check (
      controller_device_id is null
      or controller_device_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  constraint workout_session_execution_states_bootstrap_check
    check (bootstrap_source in ('session_start', 'legacy_backfill', 'client_cache_import'))
);

comment on table public.workout_session_execution_states is
  'Transient authoritative execution state for one open workout_sessions row; not a performed-session root or event log.';
comment on column public.workout_session_execution_states.revision is
  'Database-maintained effective-update counter. AW-2A does not implement expected-revision compare-and-swap.';
comment on column public.workout_session_execution_states.controller_device_id is
  'Random application-generated UUID metadata only; never browser or hardware fingerprint data.';

create index workout_session_execution_states_user_idx
  on public.workout_session_execution_states(user_id, updated_at desc);

create or replace function private.enforce_workout_session_execution_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_root_user_id uuid;
  v_root_status text;
  v_item_user_id uuid;
  v_item_order integer;
  v_item_session_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.workout_session_id is distinct from old.workout_session_id
       or new.user_id is distinct from old.user_id
       or new.state_version is distinct from old.state_version then
      raise exception 'Execution-state root identity, owner, and version are immutable.' using errcode = '23514';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'Execution-state creation time is immutable.' using errcode = '23514';
    end if;
    if new.bootstrap_source is distinct from old.bootstrap_source
       and not (old.bootstrap_source = 'legacy_backfill' and new.bootstrap_source = 'client_cache_import') then
      raise exception 'Execution-state bootstrap source may change only for one validated legacy cache import.' using errcode = '23514';
    end if;
    if new.revision is distinct from old.revision then
      raise exception 'Execution-state revision is maintained by trusted database logic.' using errcode = '23514';
    end if;
  elsif new.revision <> 0 then
    raise exception 'A new execution-state row must start at revision zero.' using errcode = '23514';
  end if;

  select session.user_id, session.status::text
    into v_root_user_id, v_root_status
  from public.workout_sessions session
  where session.id = new.workout_session_id;

  if v_root_user_id is null then
    raise exception 'Execution-state root workout session does not exist.' using errcode = '23503';
  end if;
  if new.user_id <> v_root_user_id then
    raise exception 'Execution-state owner must equal the root workout-session owner.' using errcode = '23514';
  end if;
  if v_root_status <> 'started' then
    raise exception 'Execution state may exist only for a started workout session.' using errcode = '23514';
  end if;

  if new.active_snapshot_item_id is not null then
    select item.user_id, item.item_order, snapshot.workout_session_id
      into v_item_user_id, v_item_order, v_item_session_id
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where item.id = new.active_snapshot_item_id;

    if v_item_user_id is null then
      raise exception 'Active execution cursor references a missing snapshot item.' using errcode = '23503';
    end if;
    if v_item_user_id <> new.user_id or v_item_session_id <> new.workout_session_id then
      raise exception 'Active execution cursor must reference the same user and workout session.' using errcode = '23514';
    end if;
    if v_item_order <> new.active_item_order then
      raise exception 'Active execution cursor order does not match the snapshot item.' using errcode = '23514';
    end if;
  end if;

  if (new.session_state = 'review') <> (new.view_state = 'session_review') then
    raise exception 'Session review state and view must change together.' using errcode = '23514';
  end if;
  if new.session_elapsed_seconds < 0 or new.active_item_order < 1 or new.active_set_number < 1 then
    raise exception 'Execution timer and cursor values must be non-negative and one-based.' using errcode = '23514';
  end if;
  if (new.session_state = 'paused') <> (new.session_running_since is null) then
    raise exception 'Paused execution state must have no running anchor, while active/review state must have one.' using errcode = '23514';
  end if;
  if new.view_state = 'rest' then
    if new.rest_started_at is null or new.rest_duration_seconds is null or new.rest_ends_at is null
       or new.rest_duration_seconds < 0 or new.rest_duration_seconds > 86400
       or new.rest_ends_at <> new.rest_started_at + make_interval(secs => new.rest_duration_seconds) then
      raise exception 'Rest execution state requires one valid timestamp-based rest tuple.' using errcode = '23514';
    end if;
  elsif new.rest_started_at is not null or new.rest_duration_seconds is not null or new.rest_ends_at is not null then
    raise exception 'Rest timestamps must be null outside the rest view.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'revision' - 'updated_at')
       is not distinct from (to_jsonb(old) - 'revision' - 'updated_at') then
      new.revision := old.revision;
      new.updated_at := old.updated_at;
    else
      new.revision := old.revision + 1;
      new.updated_at := clock_timestamp();
    end if;
  else
    new.revision := 0;
    new.created_at := coalesce(new.created_at, clock_timestamp());
    new.updated_at := coalesce(new.updated_at, new.created_at);
  end if;

  return new;
end
$function$;

revoke all on function private.enforce_workout_session_execution_state()
  from public, anon, authenticated, service_role;

create trigger workout_session_execution_states_integrity_guard
before insert or update on public.workout_session_execution_states
for each row execute function private.enforce_workout_session_execution_state();

create or replace function private.initialize_workout_session_execution_state(
  p_workout_session_id uuid,
  p_bootstrap_source text default 'session_start',
  p_now timestamptz default clock_timestamp()
)
returns public.workout_session_execution_states
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_snapshot_id uuid;
  v_item_id uuid;
  v_item_order integer := 1;
  v_set_number integer := 1;
  v_last_item_id uuid;
  v_last_item_order integer := 1;
  v_last_set_number integer := 1;
  v_all_complete boolean := false;
  v_elapsed integer := 0;
  v_running_since timestamptz;
  v_result public.workout_session_execution_states%rowtype;
begin
  if p_bootstrap_source not in ('session_start', 'legacy_backfill') then
    raise exception 'Initializer bootstrap source must be session_start or legacy_backfill.' using errcode = '22023';
  end if;

  select * into v_session
  from public.workout_sessions session
  where session.id = p_workout_session_id
  for update;

  if not found or v_session.status <> 'started' then
    select * into v_result
    from public.workout_session_execution_states state
    where state.workout_session_id = p_workout_session_id;
    return v_result;
  end if;

  select snapshot.id into strict v_snapshot_id
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id = v_session.id
    and snapshot.user_id = v_session.user_id;

  select candidate.id, candidate.item_order, candidate.set_number
    into v_item_id, v_item_order, v_set_number
  from (
    select item.id,
           item.item_order,
           pending_set.set_number
    from public.workout_session_muscle_snapshot_items item
    cross join lateral generate_series(
      1,
      greatest(
        coalesce(
          item.planned_sets,
          case
            when coalesce(item.planned_prescription->>'sets', '') ~ '^[1-9][0-9]*$'
              then (item.planned_prescription->>'sets')::integer
            else null
          end,
          1
        ),
        1
      )
    ) pending_set(set_number)
    where item.snapshot_id = v_snapshot_id
      and item.user_id = v_session.user_id
      and item.state <> 'skipped'
      and not exists (
        select 1
        from public.exercise_logs log
        where log.workout_session_id = v_session.id
          and log.completed_at is not null
          and log.set_number = pending_set.set_number
          and (
            (item.source_plan_activity_id is not null and log.plan_activity_id = item.source_plan_activity_id)
            or (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
            or (
              item.source_plan_activity_id is null
              and item.source_plan_exercise_id is null
              and log.exercise_order = item.item_order
            )
          )
      )
    order by item.item_order, pending_set.set_number
    limit 1
  ) candidate;

  select item.id,
         item.item_order,
         greatest(
           coalesce(
             item.planned_sets,
             case
               when coalesce(item.planned_prescription->>'sets', '') ~ '^[1-9][0-9]*$'
                 then (item.planned_prescription->>'sets')::integer
               else null
             end,
             1
           ),
           1
         )
    into v_last_item_id, v_last_item_order, v_last_set_number
  from public.workout_session_muscle_snapshot_items item
  where item.snapshot_id = v_snapshot_id
    and item.user_id = v_session.user_id
  order by item.item_order desc
  limit 1;

  if v_item_id is null then
    v_all_complete := true;
    if v_last_item_id is not null then
      v_item_id := v_last_item_id;
      v_item_order := v_last_item_order;
      v_set_number := v_last_set_number;
    end if;
  end if;

  v_elapsed := greatest(coalesce(v_session.duration_minutes, 0) * 60, 0);
  if p_bootstrap_source = 'legacy_backfill' or v_elapsed > 0 then
    v_running_since := p_now;
  elsif v_session.started_at between p_now - interval '24 hours' and p_now + interval '5 minutes' then
    v_running_since := v_session.started_at;
  else
    v_running_since := p_now;
  end if;

  insert into public.workout_session_execution_states (
    workout_session_id,
    user_id,
    state_version,
    revision,
    session_state,
    view_state,
    active_snapshot_item_id,
    active_item_order,
    active_set_number,
    session_elapsed_seconds,
    session_running_since,
    rest_started_at,
    rest_duration_seconds,
    rest_ends_at,
    controller_device_id,
    bootstrap_source,
    created_at,
    updated_at
  ) values (
    v_session.id,
    v_session.user_id,
    1,
    0,
    case when v_all_complete then 'review' else 'active' end,
    case when v_all_complete then 'session_review' else 'set_entry' end,
    v_item_id,
    coalesce(v_item_order, 1),
    coalesce(v_set_number, 1),
    v_elapsed,
    v_running_since,
    null,
    null,
    null,
    null,
    p_bootstrap_source,
    p_now,
    p_now
  )
  on conflict (workout_session_id) do nothing;

  select * into strict v_result
  from public.workout_session_execution_states state
  where state.workout_session_id = v_session.id;

  return v_result;
end
$function$;

revoke all on function private.initialize_workout_session_execution_state(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function private.initialize_workout_session_execution_state(uuid, text, timestamptz)
  to service_role;

create or replace function private.initialize_workout_session_execution_state_from_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.initialize_workout_session_execution_state(
    new.workout_session_id,
    'session_start',
    clock_timestamp()
  );
  return new;
end
$function$;

revoke all on function private.initialize_workout_session_execution_state_from_snapshot()
  from public, anon, authenticated, service_role;

create constraint trigger workout_session_execution_state_snapshot_initializer
  after insert on public.workout_session_muscle_snapshots
  deferrable initially deferred
  for each row execute function private.initialize_workout_session_execution_state_from_snapshot();

create or replace function private.cleanup_workout_session_execution_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'started' and new.status <> 'started' then
    delete from public.workout_session_execution_states state
    where state.workout_session_id = new.id;
  end if;
  return new;
end
$function$;

revoke all on function private.cleanup_workout_session_execution_state()
  from public, anon, authenticated, service_role;

create trigger workout_session_execution_state_terminal_cleanup
  after update of status on public.workout_sessions
  for each row
  when (old.status = 'started' and new.status <> 'started')
  execute function private.cleanup_workout_session_execution_state();

alter table public.workout_session_execution_states enable row level security;

revoke all on table public.workout_session_execution_states
  from public, anon, authenticated, service_role;
grant select, update on table public.workout_session_execution_states
  to authenticated;
grant select, insert, update, delete on table public.workout_session_execution_states
  to service_role;

create policy workout_session_execution_states_member_select
  on public.workout_session_execution_states
  for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy workout_session_execution_states_member_update
  on public.workout_session_execution_states
  for update
  to authenticated
  using (user_id = (select auth.uid()) or private.is_admin())
  with check (user_id = (select auth.uid()) or private.is_admin());

-- Deterministically initialize every open legacy session. The helper is
-- idempotent, and all rows share one migration execution anchor.
do $aw2a_backfill$
declare
  v_now timestamptz := clock_timestamp();
  v_session record;
begin
  for v_session in
    select session.id
    from public.workout_sessions session
    where session.status = 'started'
    order by session.started_at, session.id
  loop
    perform private.initialize_workout_session_execution_state(
      v_session.id,
      'legacy_backfill',
      v_now
    );
  end loop;
end
$aw2a_backfill$;

do $aw2a_postconditions$
declare
  v_marker text;
  v_baseline text;
  v_integrity oid := to_regprocedure('private.enforce_workout_session_execution_state()');
  v_initializer oid := to_regprocedure('private.initialize_workout_session_execution_state(uuid,text,timestamp with time zone)');
  v_cleanup oid := to_regprocedure('private.cleanup_workout_session_execution_state()');
begin
  if to_regclass('public.workout_session_execution_states') is null then
    raise exception 'AW-2A execution-state table was not created.';
  end if;

  if exists (
    select 1
    from public.workout_sessions session
    left join public.workout_session_execution_states state
      on state.workout_session_id = session.id
    where session.status = 'started'
      and state.workout_session_id is null
  ) then
    raise exception 'AW-2A left an open workout session without execution state.';
  end if;

  if exists (
    select 1
    from public.workout_session_execution_states state
    join public.workout_sessions session on session.id = state.workout_session_id
    where session.status <> 'started'
       or state.user_id <> session.user_id
  ) then
    raise exception 'AW-2A execution state exists for a terminal or differently owned session.';
  end if;

  if v_integrity is null or v_initializer is null or v_cleanup is null then
    raise exception 'AW-2A trusted lifecycle functions are missing.';
  end if;
  if not (select prosecdef from pg_proc where oid = v_integrity)
     or not (select prosecdef from pg_proc where oid = v_initializer)
     or not (select prosecdef from pg_proc where oid = v_cleanup) then
    raise exception 'AW-2A trusted lifecycle functions must remain SECURITY DEFINER.';
  end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid = v_integrity) not in ('postgres', 'supabase_admin')
     or (select pg_get_userbyid(proowner) from pg_proc where oid = v_initializer) not in ('postgres', 'supabase_admin')
     or (select pg_get_userbyid(proowner) from pg_proc where oid = v_cleanup) not in ('postgres', 'supabase_admin') then
    raise exception 'AW-2A trusted lifecycle functions are not owned by a trusted database role.';
  end if;
  if coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = v_integrity), '') not like '%search_path=%'
     or coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = v_initializer), '') not like '%search_path=%'
     or coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = v_cleanup), '') not like '%search_path=%' then
    raise exception 'AW-2A trusted lifecycle functions require hardened search paths.';
  end if;

  if has_table_privilege('anon', 'public.workout_session_execution_states', 'SELECT')
     or has_table_privilege('anon', 'public.workout_session_execution_states', 'INSERT')
     or has_table_privilege('anon', 'public.workout_session_execution_states', 'UPDATE')
     or has_table_privilege('anon', 'public.workout_session_execution_states', 'DELETE')
     or has_table_privilege('authenticated', 'public.workout_session_execution_states', 'INSERT')
     or has_table_privilege('authenticated', 'public.workout_session_execution_states', 'DELETE')
     or not has_table_privilege('authenticated', 'public.workout_session_execution_states', 'SELECT')
     or not has_table_privilege('authenticated', 'public.workout_session_execution_states', 'UPDATE') then
    raise exception 'AW-2A execution-state table grants are incorrect.';
  end if;

  if exists (
    select 1
    from pg_proc routine
    cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) grant_acl
    where routine.oid in (v_integrity, v_cleanup)
      and grant_acl.grantee = 0
      and grant_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute an AW-2A trigger function.';
  end if;

  if exists (
    select 1
    from pg_class relation
    cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) grant_acl
    where relation.oid = 'public.workout_session_execution_states'::regclass
      and grant_acl.grantee = 0
  ) then
    raise exception 'PUBLIC retains privileges on the AW-2A execution-state table.';
  end if;

  select migration_version into strict v_marker
  from public.release_schema_compatibility
  where singleton;
  select marker into strict v_baseline from aw2a_compatibility_marker;
  if v_marker is distinct from v_baseline then
    raise exception 'AW-2A changed the release compatibility marker.';
  end if;
end
$aw2a_postconditions$;

commit;
