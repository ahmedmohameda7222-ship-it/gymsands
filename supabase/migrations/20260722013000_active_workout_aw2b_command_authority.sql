begin;

-- AW-2B establishes one typed, idempotent, expected-revision command authority
-- for the transient AW-2A execution state. It does not create timeline events.
do $aw2b_preflight$
declare
  v_marker text;
begin
  if to_regclass('public.workout_session_execution_states') is null
     or to_regclass('public.workout_sessions') is null
     or to_regclass('public.profiles') is null then
    raise exception 'AW-2B requires the AW-2A execution state and canonical workout/profile roots.';
  end if;
  if to_regprocedure('private.enforce_workout_session_execution_state()') is null
     or to_regprocedure('private.initialize_workout_session_execution_state(uuid,text,timestamp with time zone)') is null
     or to_regprocedure('private.cleanup_workout_session_execution_state()') is null
     or to_regprocedure('public.assert_workout_actor(uuid)') is null then
    raise exception 'AW-2B requires the reviewed AW-2A lifecycle and actor authority functions.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pgcrypto')
     or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'AW-2B requires the trusted pgcrypto digest(bytea,text) function.';
  end if;
  if to_regclass('public.workout_session_execution_commands') is not null
     or to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)') is not null then
    raise exception 'AW-2B command authority already exists; refusing repeated or partial application.';
  end if;

  select migration_version into strict v_marker
  from public.release_schema_compatibility
  where singleton;
  if (select version from public.release_schema_compatibility where singleton) <> '2'
     or v_marker <> '20260721012814' then
    raise exception 'AW-2B requires compatibility schema version 2 and marker 20260721012814, found %.', v_marker;
  end if;

  if exists (
    select 1 from public.workout_sessions session
    left join public.workout_session_execution_states state on state.workout_session_id = session.id
    where session.status = 'started' and state.workout_session_id is null
  ) then
    raise exception 'AW-2B preflight failed: an open session is missing execution state.';
  end if;
  if exists (
    select 1 from public.workout_session_execution_states state
    join public.workout_sessions session on session.id = state.workout_session_id
    where session.status <> 'started'
  ) then
    raise exception 'AW-2B preflight failed: a terminal session retains execution state.';
  end if;
  if exists (
    select 1 from public.workout_session_execution_states state
    join public.workout_sessions session on session.id = state.workout_session_id
    where state.user_id <> session.user_id
  ) then
    raise exception 'AW-2B preflight failed: execution-state ownership differs from the root session.';
  end if;
end
$aw2b_preflight$;

create temporary table aw2b_baseline on commit drop as
select
  (select version from public.release_schema_compatibility where singleton) as compatibility_version,
  (select migration_version from public.release_schema_compatibility where singleton) as compatibility_marker,
  (select count(*) from public.workout_sessions) as workout_sessions_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by id), ''), 'UTF8'), 'sha256'), 'hex') from public.workout_sessions row_value) as workout_sessions_hash,
  (select count(*) from public.exercise_logs) as exercise_logs_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by id), ''), 'UTF8'), 'sha256'), 'hex') from public.exercise_logs row_value) as exercise_logs_hash,
  (select count(*) from public.workout_session_execution_states) as execution_states_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by workout_session_id), ''), 'UTF8'), 'sha256'), 'hex') from public.workout_session_execution_states row_value) as execution_states_hash,
  (select count(*) from public.workout_session_muscle_snapshots) as snapshots_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by id), ''), 'UTF8'), 'sha256'), 'hex') from public.workout_session_muscle_snapshots row_value) as snapshots_hash,
  (select count(*) from public.workout_session_muscle_snapshot_items) as snapshot_items_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by id), ''), 'UTF8'), 'sha256'), 'hex') from public.workout_session_muscle_snapshot_items row_value) as snapshot_items_hash;

create temporary table aw2b_function_baseline on commit drop as
select p.oid::regprocedure::text as signature,
       p.proowner,
       p.proacl,
       p.prosecdef,
       p.proconfig
from pg_proc p
where p.oid in (
  to_regprocedure('private.enforce_workout_session_execution_state()'),
  to_regprocedure('private.initialize_workout_session_execution_state(uuid,text,timestamp with time zone)'),
  to_regprocedure('private.cleanup_workout_session_execution_state()'),
  to_regprocedure('public.assert_workout_actor(uuid)')
);

create table public.workout_session_execution_commands (
  workout_session_id uuid not null
    references public.workout_session_execution_states(workout_session_id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  command_id uuid not null,
  command_type text not null,
  expected_revision bigint not null,
  request_payload jsonb not null,
  request_hash text not null,
  outcome text not null,
  revision_before bigint not null,
  revision_after bigint not null,
  result_state jsonb not null,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  primary key (workout_session_id, command_id),
  constraint workout_session_execution_commands_expected_revision_check check (expected_revision >= 0),
  constraint workout_session_execution_commands_revision_before_check check (revision_before >= 0),
  constraint workout_session_execution_commands_revision_after_check check (revision_after >= revision_before),
  constraint workout_session_execution_commands_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint workout_session_execution_commands_type_check check (command_type in (
    'move_cursor',
    'complete_set_transition',
    'start_rest',
    'clear_rest',
    'reset_timer',
    'pause',
    'resume',
    'import_legacy_cache'
  )),
  constraint workout_session_execution_commands_outcome_check check (outcome in ('applied', 'no_op', 'revision_conflict')),
  constraint workout_session_execution_commands_reason_check check (reason is null or char_length(reason) <= 128),
  constraint workout_session_execution_commands_request_object_check check (jsonb_typeof(request_payload) = 'object'),
  constraint workout_session_execution_commands_result_object_check check (jsonb_typeof(result_state) = 'object')
);

comment on table public.workout_session_execution_commands is
  'Transient immutable AW-2B command receipts for open workout execution state. Receipts cascade with the transient state and are not timeline events.';
comment on column public.workout_session_execution_commands.request_hash is
  'Lowercase SHA-256 of the canonical session, actor, command ID, command type, expected revision, and JSONB payload identity.';

create index workout_session_execution_commands_user_idx
  on public.workout_session_execution_commands(user_id, created_at desc);

alter table public.workout_session_execution_commands enable row level security;
revoke all on table public.workout_session_execution_commands from public, anon, authenticated, service_role;
grant select on table public.workout_session_execution_commands to service_role;

revoke update on table public.workout_session_execution_states from authenticated;
drop policy if exists workout_session_execution_states_member_update
  on public.workout_session_execution_states;

comment on column public.workout_session_execution_states.revision is
  'Database-maintained effective-update counter used by the AW-2B expected-revision command compare-and-swap contract.';

create or replace function public.apply_workout_session_execution_command_atomic(
  p_user_id uuid,
  p_workout_session_id uuid,
  p_command_id uuid,
  p_expected_revision bigint,
  p_command_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_hash text;
  v_existing public.workout_session_execution_commands%rowtype;
  v_state public.workout_session_execution_states%rowtype;
  v_result public.workout_session_execution_states%rowtype;
  v_root_user_id uuid;
  v_root_status text;
  v_now timestamptz := clock_timestamp();
  v_elapsed integer;
  v_reason text := null;
  v_outcome text;
  v_changed boolean := false;
  v_target_session_state text;
  v_target_view_state text;
  v_target_snapshot_item_id uuid;
  v_target_item_order integer;
  v_target_set_number integer;
  v_target_elapsed integer;
  v_target_running_since timestamptz;
  v_target_rest_started_at timestamptz;
  v_target_rest_duration integer;
  v_target_rest_ends_at timestamptz;
  v_target_device_id text;
  v_target_bootstrap_source text;
  v_allowed_keys text[];
  v_unknown_key text;
  v_view text;
  v_duration integer;
  v_cached_started_at timestamptz;
  v_cached_rest_ends_at timestamptz;
  v_cached_rest_duration integer;
  v_cached_elapsed integer := 0;
  v_valid_started boolean := false;
  v_valid_rest boolean := false;
  v_increases_elapsed boolean := false;
  v_envelope jsonb;
begin
  perform public.assert_workout_actor(p_user_id);

  if p_user_id is null or p_workout_session_id is null or p_command_id is null then
    raise exception 'Workout execution command identity is required.' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Workout execution expected revision must be non-negative.' using errcode = '22023';
  end if;
  if p_command_type not in (
    'move_cursor', 'complete_set_transition', 'start_rest', 'clear_rest',
    'reset_timer', 'pause', 'resume', 'import_legacy_cache'
  ) then
    raise exception 'Unsupported workout execution command type.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'Workout execution command payload must be a JSON object.' using errcode = '22023';
  end if;

  v_allowed_keys := case p_command_type
    when 'move_cursor' then array['active_snapshot_item_id','active_item_order','active_set_number','view_state','controller_device_id']
    when 'complete_set_transition' then array['active_snapshot_item_id','active_item_order','active_set_number','view_state','rest_duration_seconds','controller_device_id']
    when 'start_rest' then array['duration_seconds','controller_device_id']
    when 'clear_rest' then array['view_state','controller_device_id']
    when 'reset_timer' then array['controller_device_id']
    when 'pause' then array['controller_device_id']
    when 'resume' then array['controller_device_id']
    when 'import_legacy_cache' then array['cached_started_at','cached_rest_ends_at','cached_rest_duration_seconds','controller_device_id']
  end;

  select payload_key into v_unknown_key
  from jsonb_object_keys(v_payload) payload_key
  where not (payload_key = any(v_allowed_keys))
  limit 1;
  if v_unknown_key is not null then
    raise exception 'Workout execution command payload contains an unsupported key.' using errcode = '22023';
  end if;

  v_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(
        jsonb_build_object(
          'workout_session_id', p_workout_session_id,
          'user_id', p_user_id,
          'command_id', p_command_id,
          'command_type', p_command_type,
          'expected_revision', p_expected_revision,
          'payload', v_payload
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workout_session_id::text || ':' || p_command_id::text, 0)
  );

  select * into v_existing
  from public.workout_session_execution_commands command
  where command.workout_session_id = p_workout_session_id
    and command.command_id = p_command_id;

  if found then
    if v_existing.user_id <> p_user_id
       or v_existing.command_type <> p_command_type
       or v_existing.expected_revision <> p_expected_revision
       or v_existing.request_hash <> v_hash then
      return jsonb_build_object(
        'schemaVersion', 1,
        'workoutSessionId', p_workout_session_id,
        'commandId', p_command_id,
        'commandType', p_command_type,
        'outcome', 'idempotency_conflict',
        'replayed', false,
        'expectedRevision', p_expected_revision,
        'revisionBefore', v_existing.revision_before,
        'revisionAfter', v_existing.revision_after,
        'reason', 'command_id_reused_with_different_request',
        'state', v_existing.result_state
      );
    end if;

    return jsonb_build_object(
      'schemaVersion', 1,
      'workoutSessionId', p_workout_session_id,
      'commandId', p_command_id,
      'commandType', p_command_type,
      'outcome', v_existing.outcome,
      'replayed', true,
      'expectedRevision', v_existing.expected_revision,
      'revisionBefore', v_existing.revision_before,
      'revisionAfter', v_existing.revision_after,
      'reason', v_existing.reason,
      'state', v_existing.result_state
    );
  end if;

  select * into v_state
  from public.workout_session_execution_states state
  where state.workout_session_id = p_workout_session_id
  for update;
  if not found then
    raise exception 'Workout execution state does not exist.' using errcode = 'P0002';
  end if;

  select session.user_id, session.status::text
    into v_root_user_id, v_root_status
  from public.workout_sessions session
  where session.id = p_workout_session_id;
  if v_root_user_id is null or v_root_user_id <> p_user_id or v_state.user_id <> p_user_id then
    raise exception 'Workout execution command owner mismatch.' using errcode = '42501';
  end if;
  if v_root_status <> 'started' then
    raise exception 'Workout execution commands require a started session.' using errcode = '23514';
  end if;

  if v_state.revision <> p_expected_revision then
    insert into public.workout_session_execution_commands (
      workout_session_id, user_id, command_id, command_type, expected_revision,
      request_payload, request_hash, outcome, revision_before, revision_after,
      result_state, reason
    ) values (
      p_workout_session_id, p_user_id, p_command_id, p_command_type, p_expected_revision,
      v_payload, v_hash, 'revision_conflict', v_state.revision, v_state.revision,
      to_jsonb(v_state), 'expected_revision_mismatch'
    );

    return jsonb_build_object(
      'schemaVersion', 1,
      'workoutSessionId', p_workout_session_id,
      'commandId', p_command_id,
      'commandType', p_command_type,
      'outcome', 'revision_conflict',
      'replayed', false,
      'expectedRevision', p_expected_revision,
      'revisionBefore', v_state.revision,
      'revisionAfter', v_state.revision,
      'reason', 'expected_revision_mismatch',
      'state', to_jsonb(v_state)
    );
  end if;

  v_elapsed := greatest(v_state.session_elapsed_seconds, 0)
    + case
        when v_state.session_state in ('active','review') and v_state.session_running_since is not null
          then greatest(0, floor(extract(epoch from (v_now - v_state.session_running_since)))::integer)
        else 0
      end;

  v_target_session_state := v_state.session_state;
  v_target_view_state := v_state.view_state;
  v_target_snapshot_item_id := v_state.active_snapshot_item_id;
  v_target_item_order := v_state.active_item_order;
  v_target_set_number := v_state.active_set_number;
  v_target_elapsed := v_state.session_elapsed_seconds;
  v_target_running_since := v_state.session_running_since;
  v_target_rest_started_at := v_state.rest_started_at;
  v_target_rest_duration := v_state.rest_duration_seconds;
  v_target_rest_ends_at := v_state.rest_ends_at;
  v_target_device_id := v_state.controller_device_id;
  v_target_bootstrap_source := v_state.bootstrap_source;

  if v_payload ? 'controller_device_id' then
    if v_payload->'controller_device_id' = 'null'::jsonb then
      v_target_device_id := null;
    else
      v_target_device_id := v_payload->>'controller_device_id';
      if v_target_device_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'controller_device_id must be a UUID or null.' using errcode = '22023';
      end if;
    end if;
  end if;

  case p_command_type
    when 'move_cursor' then
      if not (v_payload ? 'active_item_order') or not (v_payload ? 'active_set_number') then
        raise exception 'move_cursor requires active_item_order and active_set_number.' using errcode = '22023';
      end if;
      begin
        v_target_item_order := (v_payload->>'active_item_order')::integer;
        v_target_set_number := (v_payload->>'active_set_number')::integer;
      exception when others then
        raise exception 'move_cursor order and set must be integers.' using errcode = '22023';
      end;
      if v_target_item_order < 1 or v_target_set_number < 1 then
        raise exception 'move_cursor order and set must be positive.' using errcode = '22023';
      end if;
      if v_payload ? 'active_snapshot_item_id' then
        if v_payload->'active_snapshot_item_id' = 'null'::jsonb then
          v_target_snapshot_item_id := null;
        else
          begin
            v_target_snapshot_item_id := (v_payload->>'active_snapshot_item_id')::uuid;
          exception when others then
            raise exception 'move_cursor snapshot item must be a UUID or null.' using errcode = '22023';
          end;
        end if;
      end if;
      if v_payload ? 'view_state' then
        v_view := v_payload->>'view_state';
        if v_view not in ('set_entry','exercise_complete','session_review') then
          raise exception 'move_cursor view_state is invalid.' using errcode = '22023';
        end if;
        v_target_view_state := v_view;
        v_target_rest_started_at := null;
        v_target_rest_duration := null;
        v_target_rest_ends_at := null;
        if v_view = 'session_review' then
          v_target_session_state := 'review';
          v_target_elapsed := v_elapsed;
          v_target_running_since := v_now;
        elsif v_state.session_state = 'review' then
          v_target_session_state := 'active';
          v_target_elapsed := v_elapsed;
          v_target_running_since := v_now;
        end if;
      end if;

    when 'complete_set_transition' then
      if not (v_payload ? 'active_item_order')
         or not (v_payload ? 'active_set_number')
         or not (v_payload ? 'view_state') then
        raise exception 'complete_set_transition requires cursor and view fields.' using errcode = '22023';
      end if;
      begin
        v_target_item_order := (v_payload->>'active_item_order')::integer;
        v_target_set_number := (v_payload->>'active_set_number')::integer;
      exception when others then
        raise exception 'complete_set_transition order and set must be integers.' using errcode = '22023';
      end;
      if v_target_item_order < 1 or v_target_set_number < 1 then
        raise exception 'complete_set_transition order and set must be positive.' using errcode = '22023';
      end if;
      if v_payload ? 'active_snapshot_item_id' then
        if v_payload->'active_snapshot_item_id' = 'null'::jsonb then
          v_target_snapshot_item_id := null;
        else
          begin
            v_target_snapshot_item_id := (v_payload->>'active_snapshot_item_id')::uuid;
          exception when others then
            raise exception 'complete_set_transition snapshot item must be a UUID or null.' using errcode = '22023';
          end;
        end if;
      end if;
      v_view := v_payload->>'view_state';
      if v_view not in ('rest','set_entry','exercise_complete') then
        raise exception 'complete_set_transition view_state is invalid.' using errcode = '22023';
      end if;
      v_target_view_state := v_view;
      if v_state.session_state = 'review' then
        v_target_session_state := 'active';
        v_target_elapsed := v_elapsed;
        v_target_running_since := v_now;
      end if;
      if v_view = 'rest' then
        begin
          v_duration := (v_payload->>'rest_duration_seconds')::integer;
        exception when others then
          raise exception 'complete_set_transition rest duration must be an integer.' using errcode = '22023';
        end;
        if v_duration is null or v_duration < 0 or v_duration > 86400 then
          raise exception 'complete_set_transition rest duration is out of range.' using errcode = '22023';
        end if;
        v_target_rest_started_at := v_now;
        v_target_rest_duration := v_duration;
        v_target_rest_ends_at := v_now + make_interval(secs => v_duration);
      else
        if v_payload ? 'rest_duration_seconds' and v_payload->'rest_duration_seconds' <> 'null'::jsonb then
          raise exception 'complete_set_transition non-rest outcomes require a null rest duration.' using errcode = '22023';
        end if;
        v_target_rest_started_at := null;
        v_target_rest_duration := null;
        v_target_rest_ends_at := null;
      end if;

    when 'start_rest' then
      begin
        v_duration := (v_payload->>'duration_seconds')::integer;
      exception when others then
        raise exception 'start_rest duration_seconds must be an integer.' using errcode = '22023';
      end;
      if v_duration is null or v_duration < 0 or v_duration > 86400 then
        raise exception 'start_rest duration is out of range.' using errcode = '22023';
      end if;
      if v_state.session_state = 'review' then
        v_target_session_state := 'active';
        v_target_elapsed := v_elapsed;
        v_target_running_since := v_now;
      end if;
      v_target_view_state := 'rest';
      v_target_rest_started_at := v_now;
      v_target_rest_duration := v_duration;
      v_target_rest_ends_at := v_now + make_interval(secs => v_duration);

    when 'clear_rest' then
      if not (v_payload ? 'view_state') then
        raise exception 'clear_rest requires view_state.' using errcode = '22023';
      end if;
      v_view := v_payload->>'view_state';
      if v_view not in ('set_entry','exercise_complete','session_review') then
        raise exception 'clear_rest view_state is invalid.' using errcode = '22023';
      end if;
      v_target_view_state := v_view;
      v_target_rest_started_at := null;
      v_target_rest_duration := null;
      v_target_rest_ends_at := null;
      if v_view = 'session_review' then
        v_target_session_state := 'review';
        v_target_elapsed := v_elapsed;
        v_target_running_since := v_now;
      elsif v_state.session_state = 'review' then
        v_target_session_state := 'active';
        v_target_elapsed := v_elapsed;
        v_target_running_since := v_now;
      end if;

    when 'reset_timer' then
      v_target_session_state := 'active';
      if v_target_view_state = 'session_review' then
        v_target_view_state := 'set_entry';
      end if;
      v_target_elapsed := 0;
      v_target_running_since := v_now;
      if v_target_view_state <> 'rest' then
        v_target_rest_started_at := null;
        v_target_rest_duration := null;
        v_target_rest_ends_at := null;
      end if;

    when 'pause' then
      if v_state.session_state = 'review' then
        raise exception 'A workout in session review cannot be paused.' using errcode = '22023';
      elsif v_state.session_state = 'paused' then
        v_reason := 'already_paused';
      else
        v_target_session_state := 'paused';
        v_target_elapsed := v_elapsed;
        v_target_running_since := null;
      end if;

    when 'resume' then
      if v_state.session_state = 'paused' then
        v_target_session_state := 'active';
        v_target_running_since := v_now;
      else
        v_reason := 'already_running';
      end if;

    when 'import_legacy_cache' then
      if v_state.bootstrap_source <> 'legacy_backfill' or v_state.revision <> 0 then
        v_reason := 'not_initial_legacy_state';
      else
        if v_payload ? 'cached_started_at' and v_payload->'cached_started_at' <> 'null'::jsonb then
          begin
            v_cached_started_at := (v_payload->>'cached_started_at')::timestamptz;
            v_valid_started := v_cached_started_at between v_now - interval '24 hours' and v_now + interval '5 minutes';
          exception when others then
            v_valid_started := false;
          end;
        end if;
        if v_valid_started then
          v_cached_elapsed := greatest(0, floor(extract(epoch from (v_now - v_cached_started_at)))::integer);
          v_increases_elapsed := v_cached_elapsed > v_elapsed;
        end if;
        if v_payload ? 'cached_rest_ends_at'
           and v_payload->'cached_rest_ends_at' <> 'null'::jsonb
           and v_payload ? 'cached_rest_duration_seconds'
           and v_payload->'cached_rest_duration_seconds' <> 'null'::jsonb then
          begin
            v_cached_rest_ends_at := (v_payload->>'cached_rest_ends_at')::timestamptz;
            v_cached_rest_duration := (v_payload->>'cached_rest_duration_seconds')::integer;
            v_valid_rest := v_cached_rest_duration between 0 and 86400
              and v_cached_rest_ends_at > v_now
              and v_cached_rest_ends_at <= v_now + interval '24 hours';
          exception when others then
            v_valid_rest := false;
          end;
        end if;
        if not v_increases_elapsed and not v_valid_rest then
          v_reason := case when v_valid_started then 'would_not_increase_elapsed' else 'invalid_or_implausible_cache' end;
        else
          v_target_bootstrap_source := 'client_cache_import';
          if v_increases_elapsed then
            v_target_elapsed := v_cached_elapsed;
            if v_target_session_state <> 'paused' then
              v_target_running_since := v_now;
            end if;
          end if;
          if v_valid_rest then
            if v_target_session_state = 'review' then
              v_target_session_state := 'active';
              v_target_running_since := v_now;
            end if;
            v_target_view_state := 'rest';
            v_target_rest_duration := v_cached_rest_duration;
            v_target_rest_ends_at := v_cached_rest_ends_at;
            v_target_rest_started_at := v_cached_rest_ends_at - make_interval(secs => v_cached_rest_duration);
          end if;
        end if;
  end case;

  -- Commands that are explicitly no-ops must not advance revision through
  -- controller metadata alone.
  if v_reason is not null then
    v_target_device_id := v_state.controller_device_id;
  end if;

  if row(
    v_target_session_state, v_target_view_state, v_target_snapshot_item_id,
    v_target_item_order, v_target_set_number, v_target_elapsed,
    v_target_running_since, v_target_rest_started_at, v_target_rest_duration,
    v_target_rest_ends_at, v_target_device_id, v_target_bootstrap_source
  ) is distinct from row(
    v_state.session_state, v_state.view_state, v_state.active_snapshot_item_id,
    v_state.active_item_order, v_state.active_set_number, v_state.session_elapsed_seconds,
    v_state.session_running_since, v_state.rest_started_at, v_state.rest_duration_seconds,
    v_state.rest_ends_at, v_state.controller_device_id, v_state.bootstrap_source
  ) then
    update public.workout_session_execution_states state
    set session_state = v_target_session_state,
        view_state = v_target_view_state,
        active_snapshot_item_id = v_target_snapshot_item_id,
        active_item_order = v_target_item_order,
        active_set_number = v_target_set_number,
        session_elapsed_seconds = v_target_elapsed,
        session_running_since = v_target_running_since,
        rest_started_at = v_target_rest_started_at,
        rest_duration_seconds = v_target_rest_duration,
        rest_ends_at = v_target_rest_ends_at,
        controller_device_id = v_target_device_id,
        bootstrap_source = v_target_bootstrap_source
    where state.workout_session_id = p_workout_session_id
      and state.user_id = p_user_id
      and state.revision = p_expected_revision
    returning * into v_result;
    if not found then
      raise exception 'Workout execution compare-and-swap update did not affect exactly one row.' using errcode = '40001';
    end if;
    if v_result.revision <> v_state.revision + 1 then
      raise exception 'Workout execution effective update did not advance revision exactly once.' using errcode = '40001';
    end if;
    v_changed := true;
    v_outcome := 'applied';
  else
    v_result := v_state;
    v_outcome := 'no_op';
    v_reason := coalesce(v_reason, 'no_effective_change');
  end if;

  insert into public.workout_session_execution_commands (
    workout_session_id, user_id, command_id, command_type, expected_revision,
    request_payload, request_hash, outcome, revision_before, revision_after,
    result_state, reason
  ) values (
    p_workout_session_id, p_user_id, p_command_id, p_command_type, p_expected_revision,
    v_payload, v_hash, v_outcome, v_state.revision, v_result.revision,
    to_jsonb(v_result), v_reason
  );

  v_envelope := jsonb_build_object(
    'schemaVersion', 1,
    'workoutSessionId', p_workout_session_id,
    'commandId', p_command_id,
    'commandType', p_command_type,
    'outcome', v_outcome,
    'replayed', false,
    'expectedRevision', p_expected_revision,
    'revisionBefore', v_state.revision,
    'revisionAfter', v_result.revision,
    'reason', v_reason,
    'state', to_jsonb(v_result)
  );
  return v_envelope;
end
$function$;

revoke all on function public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)
  from public, anon;
grant execute on function public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)
  to authenticated, service_role;

-- Preserve the reviewed lifecycle functions, ownership, ACLs, and application data.
do $aw2b_postconditions$
declare
  v_baseline aw2b_baseline%rowtype;
  v_rpc oid := to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)');
  v_command_table oid := to_regclass('public.workout_session_execution_commands');
  v_current record;
begin
  select * into strict v_baseline from aw2b_baseline;

  if v_command_table is null or v_rpc is null then
    raise exception 'AW-2B command table or RPC is missing.';
  end if;
  if not (select prosecdef from pg_proc where oid = v_rpc)
     or (select pg_get_userbyid(proowner) from pg_proc where oid = v_rpc) not in ('postgres','supabase_admin')
     or coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = v_rpc), '') not like '%search_path=%' then
    raise exception 'AW-2B RPC ownership or hardening is invalid.';
  end if;
  if has_function_privilege('public', 'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)', 'EXECUTE') then
    raise exception 'AW-2B RPC ACL is invalid.';
  end if;
  if has_table_privilege('authenticated','public.workout_session_execution_states','UPDATE')
     or has_table_privilege('authenticated','public.workout_session_execution_states','INSERT')
     or has_table_privilege('authenticated','public.workout_session_execution_states','DELETE')
     or not has_table_privilege('authenticated','public.workout_session_execution_states','SELECT') then
    raise exception 'AW-2B execution-state ACL is invalid.';
  end if;
  if has_table_privilege('authenticated','public.workout_session_execution_commands','SELECT')
     or has_table_privilege('authenticated','public.workout_session_execution_commands','INSERT')
     or has_table_privilege('authenticated','public.workout_session_execution_commands','UPDATE')
     or has_table_privilege('authenticated','public.workout_session_execution_commands','DELETE') then
    raise exception 'Authenticated clients retain direct AW-2B command-table access.';
  end if;
  if exists (select 1 from pg_policy where polrelid='public.workout_session_execution_states'::regclass and polcmd='w') then
    raise exception 'Authenticated execution-state UPDATE policy still exists.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.workout_session_execution_states'::regclass
      and tgname='workout_session_execution_states_integrity_guard'
      and tgenabled <> 'D'
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='public.workout_sessions'::regclass
      and tgname='workout_session_execution_state_terminal_cleanup'
      and tgenabled <> 'D'
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='public.workout_session_muscle_snapshots'::regclass
      and tgname='workout_session_execution_state_snapshot_initializer'
      and tgenabled <> 'D'
  ) then
    raise exception 'An AW-2A lifecycle trigger is missing or disabled.';
  end if;

  if (select version from public.release_schema_compatibility where singleton) is distinct from v_baseline.compatibility_version
     or (select migration_version from public.release_schema_compatibility where singleton) is distinct from v_baseline.compatibility_marker then
    raise exception 'AW-2B changed the release compatibility marker.';
  end if;
  if (select count(*) from public.workout_sessions) <> v_baseline.workout_sessions_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by id), ''), 'UTF8'), 'sha256'), 'hex') from public.workout_sessions row_value) <> v_baseline.workout_sessions_hash
     or (select count(*) from public.exercise_logs) <> v_baseline.exercise_logs_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by id), ''), 'UTF8'), 'sha256'), 'hex') from public.exercise_logs row_value) <> v_baseline.exercise_logs_hash
     or (select count(*) from public.workout_session_execution_states) <> v_baseline.execution_states_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by workout_session_id), ''), 'UTF8'), 'sha256'), 'hex') from public.workout_session_execution_states row_value) <> v_baseline.execution_states_hash
     or (select count(*) from public.workout_session_muscle_snapshots) <> v_baseline.snapshots_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by id), ''), 'UTF8'), 'sha256'), 'hex') from public.workout_session_muscle_snapshots row_value) <> v_baseline.snapshots_hash
     or (select count(*) from public.workout_session_muscle_snapshot_items) <> v_baseline.snapshot_items_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text, E'\n' order by id), ''), 'UTF8'), 'sha256'), 'hex') from public.workout_session_muscle_snapshot_items row_value) <> v_baseline.snapshot_items_hash then
    raise exception 'AW-2B changed protected application data.';
  end if;
  if (select count(*) from public.workout_session_execution_commands) <> 0 then
    raise exception 'AW-2B fabricated migration-time command receipts.';
  end if;
  if exists (
    select 1 from public.workout_sessions session
    left join public.workout_session_execution_states state on state.workout_session_id=session.id
    where session.status='started' and state.workout_session_id is null
  ) or exists (
    select 1 from public.workout_session_execution_states state
    join public.workout_sessions session on session.id=state.workout_session_id
    where session.status<>'started' or state.user_id<>session.user_id
  ) then
    raise exception 'AW-2B violated execution-state lifecycle coverage.';
  end if;

  for v_current in
    select p.oid::regprocedure::text as signature, p.proowner, p.proacl, p.prosecdef, p.proconfig
    from pg_proc p
    where p.oid in (
      to_regprocedure('private.enforce_workout_session_execution_state()'),
      to_regprocedure('private.initialize_workout_session_execution_state(uuid,text,timestamp with time zone)'),
      to_regprocedure('private.cleanup_workout_session_execution_state()'),
      to_regprocedure('public.assert_workout_actor(uuid)')
    )
  loop
    if not exists (
      select 1 from aw2b_function_baseline baseline
      where baseline.signature=v_current.signature
        and baseline.proowner=v_current.proowner
        and baseline.proacl is not distinct from v_current.proacl
        and baseline.prosecdef=v_current.prosecdef
        and baseline.proconfig is not distinct from v_current.proconfig
    ) then
      raise exception 'AW-2B changed existing function ownership, ACL, or configuration for %.', v_current.signature;
    end if;
  end loop;
end
$aw2b_postconditions$;

commit;
