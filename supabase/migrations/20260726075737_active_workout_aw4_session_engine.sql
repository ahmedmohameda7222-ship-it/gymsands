-- AW-4: one canonical Active Workout session engine.
-- This migration is additive for deployed readers, preserves state_version=1,
-- preserves the public RPC signature/envelope, and does not promote compatibility.

do $aw4_preconditions$
begin
  if to_regclass('public.workout_session_execution_states') is null
     or to_regclass('public.workout_session_execution_commands') is null
     or to_regclass('public.workout_session_prescription_sets') is null
     or to_regprocedure('private.aw2c_core_apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)') is null
     or to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)') is null then
    raise exception 'AW-4 requires the reviewed AW-2C and AW-3C authorities.';
  end if;
  if not exists (
    select 1
    from public.release_schema_compatibility compatibility
    where compatibility.singleton
      and compatibility.version = '2'
      and compatibility.migration_version = '20260724232734'
  ) then
    raise exception 'AW-4 compatibility baseline is not the approved version-2 marker.';
  end if;
end
$aw4_preconditions$;

alter table public.workout_session_execution_states
  add column activity_timer_kind text null,
  add column activity_timer_elapsed_seconds integer not null default 0,
  add column activity_timer_running_since timestamptz null,
  add column activity_timer_duration_seconds integer null,
  add column activity_timer_ends_at timestamptz null;

alter table public.workout_session_execution_states
  drop constraint workout_session_execution_states_rest_relation_check;

alter table public.workout_session_execution_states
  add constraint workout_session_execution_states_rest_relation_check
  check (
    (
      view_state = 'rest'
      and rest_duration_seconds is not null
      and (
        (
          session_state = 'paused'
          and rest_started_at is null
          and rest_ends_at is null
        )
        or (
          session_state in ('active', 'review')
          and rest_started_at is not null
          and rest_ends_at is not null
          and rest_ends_at = rest_started_at + make_interval(secs => rest_duration_seconds)
        )
      )
    )
    or (
      view_state <> 'rest'
      and rest_started_at is null
      and rest_duration_seconds is null
      and rest_ends_at is null
    )
  );

alter table public.workout_session_execution_states
  add constraint workout_session_execution_states_activity_timer_check
  check (
    (
      activity_timer_kind is null
      and activity_timer_elapsed_seconds = 0
      and activity_timer_running_since is null
      and activity_timer_duration_seconds is null
      and activity_timer_ends_at is null
    )
    or (
      activity_timer_kind = 'timed_set'
      and activity_timer_elapsed_seconds >= 0
      and activity_timer_duration_seconds is null
      and activity_timer_ends_at is null
      and (
        (session_state = 'paused' and activity_timer_running_since is null)
        or (session_state in ('active', 'review') and activity_timer_running_since is not null)
      )
    )
    or (
      activity_timer_kind in ('timed_set', 'block')
      and activity_timer_elapsed_seconds >= 0
      and activity_timer_duration_seconds between 0 and 86400
      and activity_timer_elapsed_seconds <= activity_timer_duration_seconds
      and (
        (
          session_state = 'paused'
          and activity_timer_running_since is null
          and activity_timer_ends_at is null
        )
        or (
          session_state in ('active', 'review')
          and activity_timer_running_since is not null
          and activity_timer_ends_at is not null
        )
      )
    )
  );

comment on column public.workout_session_execution_states.activity_timer_kind is
  'AW-4 single activity timer kind: timed_set or block. Null means inactive.';
comment on column public.workout_session_execution_states.activity_timer_elapsed_seconds is
  'AW-4 accumulated activity seconds; never a heartbeat counter.';
comment on column public.workout_session_execution_states.activity_timer_running_since is
  'AW-4 server-time running anchor, cleared while the workout is paused.';
comment on column public.workout_session_execution_states.activity_timer_duration_seconds is
  'AW-4 optional bounded duration, limited to one day.';
comment on column public.workout_session_execution_states.activity_timer_ends_at is
  'AW-4 bounded server-time end anchor, cleared while paused.';

alter table public.workout_session_execution_commands
  drop constraint workout_session_execution_commands_type_check;
alter table public.workout_session_execution_commands
  add constraint workout_session_execution_commands_type_check
  check (command_type in (
    'move_cursor',
    'complete_set_transition',
    'start_rest',
    'clear_rest',
    'reset_timer',
    'pause',
    'resume',
    'import_legacy_cache',
    'start_activity_timer',
    'clear_activity_timer',
    'reset_activity_timer'
  ));

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
  v_item_state text;
  v_source_plan_exercise_id uuid;
  v_source_plan_activity_id uuid;
  v_set_count integer;
  v_max_set_order integer;
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
    select item.user_id, item.item_order, snapshot.workout_session_id,
           item.state, item.source_plan_exercise_id, item.source_plan_activity_id
      into v_item_user_id, v_item_order, v_item_session_id,
           v_item_state, v_source_plan_exercise_id, v_source_plan_activity_id
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
    if new.view_state = 'set_entry' and v_item_state in ('skipped', 'completed') then
      raise exception 'A terminal snapshot item cannot become the active set-entry target.' using errcode = '23514';
    end if;

    select count(*)::integer, max(prescription_set.set_order)::integer
      into v_set_count, v_max_set_order
    from public.workout_session_prescription_sets prescription_set
    where prescription_set.snapshot_item_id = new.active_snapshot_item_id
      and prescription_set.workout_session_id = new.workout_session_id
      and prescription_set.user_id = new.user_id;
    if v_set_count > 0 and v_set_count <> v_max_set_order then
      raise exception 'Frozen prescription set order is non-contiguous.' using errcode = '23514';
    end if;
    if v_set_count > 0
       and new.active_set_number > v_set_count
       and not exists (
         select 1
         from public.exercise_logs log
         where log.workout_session_id = new.workout_session_id
           and log.set_number = new.active_set_number
           and (
             (v_source_plan_exercise_id is not null and log.plan_exercise_id = v_source_plan_exercise_id)
             or (v_source_plan_activity_id is not null and log.plan_activity_id = v_source_plan_activity_id)
           )
       ) then
      raise exception 'Active set is outside the frozen prescription without canonical performed identity.' using errcode = '23514';
    end if;
  elsif exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
    where snapshot.workout_session_id = new.workout_session_id
  ) then
    raise exception 'A workout with frozen snapshot items requires an active cursor identity.' using errcode = '23514';
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
    if new.rest_duration_seconds is null
       or new.rest_duration_seconds < 0
       or new.rest_duration_seconds > 86400
       or (
         new.session_state = 'paused'
         and (new.rest_started_at is not null or new.rest_ends_at is not null)
       )
       or (
         new.session_state <> 'paused'
         and (
           new.rest_started_at is null
           or new.rest_ends_at is null
           or new.rest_ends_at <> new.rest_started_at + make_interval(secs => new.rest_duration_seconds)
         )
       ) then
      raise exception 'Rest execution state requires one valid running or frozen rest tuple.' using errcode = '23514';
    end if;
  elsif new.rest_started_at is not null or new.rest_duration_seconds is not null or new.rest_ends_at is not null then
    raise exception 'Rest timestamps must be null outside the rest view.' using errcode = '23514';
  end if;

  if new.activity_timer_kind is null then
    if new.activity_timer_elapsed_seconds <> 0
       or new.activity_timer_running_since is not null
       or new.activity_timer_duration_seconds is not null
       or new.activity_timer_ends_at is not null then
      raise exception 'Inactive activity timer fields must be empty.' using errcode = '23514';
    end if;
  else
    if new.activity_timer_kind not in ('timed_set', 'block')
       or new.activity_timer_elapsed_seconds < 0
       or new.activity_timer_duration_seconds is not null
          and (
            new.activity_timer_duration_seconds < 0
            or new.activity_timer_duration_seconds > 86400
            or new.activity_timer_elapsed_seconds > new.activity_timer_duration_seconds
          )
       or new.activity_timer_kind = 'block' and new.activity_timer_duration_seconds is null
       or new.activity_timer_duration_seconds is null and new.activity_timer_ends_at is not null
       or new.session_state = 'paused'
          and (new.activity_timer_running_since is not null or new.activity_timer_ends_at is not null)
       or new.session_state <> 'paused'
          and (
            new.activity_timer_running_since is null
            or new.activity_timer_duration_seconds is not null and new.activity_timer_ends_at is null
          ) then
      raise exception 'Activity timer state is inconsistent.' using errcode = '23514';
    end if;
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

alter function private.aw2c_core_apply_workout_session_execution_command_atomic(
  uuid, uuid, uuid, bigint, text, jsonb
) rename to aw4_pre_session_engine_apply_workout_session_execution_command_atomic;

revoke all on function private.aw4_pre_session_engine_apply_workout_session_execution_command_atomic(
  uuid, uuid, uuid, bigint, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function private.aw2c_core_apply_workout_session_execution_command_atomic(
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
  v_allowed_keys text[];
  v_unknown_key text;
  v_target_session_state text;
  v_target_view_state text;
  v_target_elapsed integer;
  v_target_running_since timestamptz;
  v_target_rest_started_at timestamptz;
  v_target_rest_duration integer;
  v_target_rest_ends_at timestamptz;
  v_target_activity_kind text;
  v_target_activity_elapsed integer;
  v_target_activity_running_since timestamptz;
  v_target_activity_duration integer;
  v_target_activity_ends_at timestamptz;
  v_target_device_id text;
  v_view text;
  v_completion_reason text;
  v_kind text;
  v_duration integer;
  v_running_delta integer;
  v_remaining integer;
begin
  if p_command_type not in (
    'start_rest', 'clear_rest', 'pause', 'resume',
    'start_activity_timer', 'clear_activity_timer', 'reset_activity_timer'
  ) then
    if p_command_type = 'complete_set_transition' then
      perform public.assert_workout_actor(p_user_id);
      if exists (
        select 1
        from public.workout_session_execution_states state
        where state.workout_session_id = p_workout_session_id
          and state.user_id = p_user_id
          and state.session_state = 'paused'
      ) then
        raise exception 'A paused workout cannot complete a set transition.' using errcode = '22023';
      end if;
    end if;
    return private.aw4_pre_session_engine_apply_workout_session_execution_command_atomic(
      p_user_id,
      p_workout_session_id,
      p_command_id,
      p_expected_revision,
      p_command_type,
      v_payload
    );
  end if;

  perform public.assert_workout_actor(p_user_id);
  if p_user_id is null or p_workout_session_id is null or p_command_id is null then
    raise exception 'Workout execution command identity is required.' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Workout execution expected revision must be non-negative.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload) <> 'object' or pg_column_size(v_payload) > 4096 then
    raise exception 'Workout execution command payload must be one bounded JSON object.' using errcode = '22023';
  end if;

  v_allowed_keys := case p_command_type
    when 'start_rest' then array['duration_seconds','controller_device_id']
    when 'clear_rest' then array['view_state','completion_reason','controller_device_id']
    when 'pause' then array['controller_device_id']
    when 'resume' then array['controller_device_id']
    when 'start_activity_timer' then array['kind','duration_seconds','controller_device_id']
    when 'clear_activity_timer' then array['completion_reason','controller_device_id']
    when 'reset_activity_timer' then array['controller_device_id']
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
        when v_state.session_state in ('active','review')
             and v_state.session_running_since is not null
          then greatest(0, floor(extract(epoch from (v_now - v_state.session_running_since)))::integer)
        else 0
      end;
  v_target_session_state := v_state.session_state;
  v_target_view_state := v_state.view_state;
  v_target_elapsed := v_state.session_elapsed_seconds;
  v_target_running_since := v_state.session_running_since;
  v_target_rest_started_at := v_state.rest_started_at;
  v_target_rest_duration := v_state.rest_duration_seconds;
  v_target_rest_ends_at := v_state.rest_ends_at;
  v_target_activity_kind := v_state.activity_timer_kind;
  v_target_activity_elapsed := v_state.activity_timer_elapsed_seconds;
  v_target_activity_running_since := v_state.activity_timer_running_since;
  v_target_activity_duration := v_state.activity_timer_duration_seconds;
  v_target_activity_ends_at := v_state.activity_timer_ends_at;
  v_target_device_id := v_state.controller_device_id;

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
    when 'start_rest' then
      if v_state.session_state = 'review' then
        raise exception 'A workout in session review cannot start a rest timer.' using errcode = '22023';
      end if;
      begin
        v_duration := (v_payload->>'duration_seconds')::integer;
      exception when others then
        raise exception 'start_rest duration_seconds must be an integer.' using errcode = '22023';
      end;
      if v_duration is null or v_duration < 0 or v_duration > 86400 then
        raise exception 'start_rest duration is out of range.' using errcode = '22023';
      end if;
      v_target_view_state := 'rest';
      if v_state.session_state = 'paused' then
        v_target_rest_started_at := null;
        v_target_rest_duration := v_duration;
        v_target_rest_ends_at := null;
      else
        v_target_rest_started_at := v_now;
        v_target_rest_duration := v_duration;
        v_target_rest_ends_at := v_now + make_interval(secs => v_duration);
      end if;

    when 'clear_rest' then
      if not (v_payload ? 'view_state') then
        raise exception 'clear_rest requires view_state.' using errcode = '22023';
      end if;
      v_view := v_payload->>'view_state';
      if v_view not in ('set_entry','exercise_complete','session_review') then
        raise exception 'clear_rest view_state is invalid.' using errcode = '22023';
      end if;
      if v_payload ? 'completion_reason' then
        v_completion_reason := v_payload->>'completion_reason';
        if v_completion_reason not in ('natural_expiration','user_skipped','transitioned') then
          raise exception 'clear_rest completion_reason is invalid.' using errcode = '22023';
        end if;
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

    when 'pause' then
      if v_state.session_state = 'review' then
        raise exception 'A workout in session review cannot be paused.' using errcode = '22023';
      elsif v_state.session_state = 'paused' then
        v_reason := 'already_paused';
      else
        v_target_session_state := 'paused';
        v_target_elapsed := v_elapsed;
        v_target_running_since := null;
        if v_state.view_state = 'rest' then
          v_target_rest_duration := greatest(
            0,
            ceil(extract(epoch from (v_state.rest_ends_at - v_now)))::integer
          );
          v_target_rest_started_at := null;
          v_target_rest_ends_at := null;
        end if;
        if v_state.activity_timer_kind is not null then
          v_running_delta := case
            when v_state.activity_timer_running_since is null then 0
            else greatest(
              0,
              floor(extract(epoch from (v_now - v_state.activity_timer_running_since)))::integer
            )
          end;
          v_target_activity_elapsed := v_state.activity_timer_elapsed_seconds + v_running_delta;
          if v_state.activity_timer_duration_seconds is not null then
            v_target_activity_elapsed := least(
              v_state.activity_timer_duration_seconds,
              v_target_activity_elapsed
            );
          end if;
          v_target_activity_running_since := null;
          v_target_activity_ends_at := null;
        end if;
      end if;

    when 'resume' then
      if v_state.session_state = 'paused' then
        v_target_session_state := 'active';
        v_target_running_since := v_now;
        if v_state.view_state = 'rest' then
          v_target_rest_started_at := v_now;
          v_target_rest_ends_at := v_now + make_interval(secs => v_state.rest_duration_seconds);
        end if;
        if v_state.activity_timer_kind is not null then
          v_target_activity_running_since := v_now;
          if v_state.activity_timer_duration_seconds is not null then
            v_remaining := greatest(
              0,
              v_state.activity_timer_duration_seconds - v_state.activity_timer_elapsed_seconds
            );
            v_target_activity_ends_at := v_now + make_interval(secs => v_remaining);
          end if;
        end if;
      else
        v_reason := 'already_running';
      end if;

    when 'start_activity_timer' then
      if v_state.session_state = 'review' then
        raise exception 'A workout in session review cannot start an activity timer.' using errcode = '22023';
      end if;
      if not (v_payload ? 'kind') or not (v_payload ? 'duration_seconds') then
        raise exception 'start_activity_timer requires kind and duration_seconds.' using errcode = '22023';
      end if;
      v_kind := v_payload->>'kind';
      if v_kind not in ('timed_set','block') then
        raise exception 'start_activity_timer kind is invalid.' using errcode = '22023';
      end if;
      if v_payload->'duration_seconds' = 'null'::jsonb then
        v_duration := null;
      else
        begin
          v_duration := (v_payload->>'duration_seconds')::integer;
        exception when others then
          raise exception 'start_activity_timer duration_seconds must be an integer or null.' using errcode = '22023';
        end;
        if v_duration < 0 or v_duration > 86400 then
          raise exception 'start_activity_timer duration is out of range.' using errcode = '22023';
        end if;
      end if;
      if v_kind = 'block' and v_duration is null then
        raise exception 'A block activity timer requires a bounded duration.' using errcode = '22023';
      end if;
      if v_state.activity_timer_kind is not null then
        if v_state.activity_timer_kind = v_kind
           and v_state.activity_timer_duration_seconds is not distinct from v_duration then
          v_reason := 'activity_timer_already_running';
        else
          raise exception 'A different activity timer is already active.' using errcode = '23514';
        end if;
      else
        v_target_activity_kind := v_kind;
        v_target_activity_elapsed := 0;
        v_target_activity_duration := v_duration;
        v_target_activity_running_since := case when v_state.session_state = 'paused' then null else v_now end;
        v_target_activity_ends_at := case
          when v_state.session_state = 'paused' or v_duration is null then null
          else v_now + make_interval(secs => v_duration)
        end;
      end if;

    when 'clear_activity_timer' then
      if not (v_payload ? 'completion_reason') then
        raise exception 'clear_activity_timer requires completion_reason.' using errcode = '22023';
      end if;
      v_completion_reason := v_payload->>'completion_reason';
      if v_completion_reason not in ('completed','user_skipped','cancelled','transitioned') then
        raise exception 'clear_activity_timer completion_reason is invalid.' using errcode = '22023';
      end if;
      if v_state.activity_timer_kind is null then
        v_reason := 'activity_timer_inactive';
      else
        v_target_activity_kind := null;
        v_target_activity_elapsed := 0;
        v_target_activity_running_since := null;
        v_target_activity_duration := null;
        v_target_activity_ends_at := null;
      end if;

    when 'reset_activity_timer' then
      if v_state.activity_timer_kind is null then
        v_reason := 'activity_timer_inactive';
      else
        v_target_activity_elapsed := 0;
        v_target_activity_running_since := case when v_state.session_state = 'paused' then null else v_now end;
        v_target_activity_ends_at := case
          when v_state.session_state = 'paused'
               or v_state.activity_timer_duration_seconds is null then null
          else v_now + make_interval(secs => v_state.activity_timer_duration_seconds)
        end;
      end if;
  end case;

  if v_reason is not null then
    v_target_device_id := v_state.controller_device_id;
  end if;

  if row(
    v_target_session_state, v_target_view_state, v_target_elapsed,
    v_target_running_since, v_target_rest_started_at, v_target_rest_duration,
    v_target_rest_ends_at, v_target_activity_kind, v_target_activity_elapsed,
    v_target_activity_running_since, v_target_activity_duration,
    v_target_activity_ends_at, v_target_device_id
  ) is distinct from row(
    v_state.session_state, v_state.view_state, v_state.session_elapsed_seconds,
    v_state.session_running_since, v_state.rest_started_at, v_state.rest_duration_seconds,
    v_state.rest_ends_at, v_state.activity_timer_kind, v_state.activity_timer_elapsed_seconds,
    v_state.activity_timer_running_since, v_state.activity_timer_duration_seconds,
    v_state.activity_timer_ends_at, v_state.controller_device_id
  ) then
    update public.workout_session_execution_states state
    set session_state = v_target_session_state,
        view_state = v_target_view_state,
        session_elapsed_seconds = v_target_elapsed,
        session_running_since = v_target_running_since,
        rest_started_at = v_target_rest_started_at,
        rest_duration_seconds = v_target_rest_duration,
        rest_ends_at = v_target_rest_ends_at,
        activity_timer_kind = v_target_activity_kind,
        activity_timer_elapsed_seconds = v_target_activity_elapsed,
        activity_timer_running_since = v_target_activity_running_since,
        activity_timer_duration_seconds = v_target_activity_duration,
        activity_timer_ends_at = v_target_activity_ends_at,
        controller_device_id = v_target_device_id
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
  return jsonb_build_object(
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
end
$function$;

revoke all on function private.aw2c_core_apply_workout_session_execution_command_atomic(
  uuid, uuid, uuid, bigint, text, jsonb
) from public, anon, authenticated, service_role;

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
  v_before public.workout_session_execution_states%rowtype;
  v_after public.workout_session_execution_states%rowtype;
  v_result jsonb;
  v_occurred_at timestamptz;
  v_rest_end_reason text;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_before
  from public.workout_session_execution_states state
  where state.workout_session_id = p_workout_session_id
  for update;
  v_result := private.aw2c_core_apply_workout_session_execution_command_atomic(
    p_user_id,
    p_workout_session_id,
    p_command_id,
    p_expected_revision,
    p_command_type,
    p_payload
  );
  if coalesce(v_result->>'outcome', '') <> 'applied'
     or coalesce((v_result->>'replayed')::boolean, false)
     or p_command_type in (
       'import_legacy_cache',
       'reset_timer',
       'start_activity_timer',
       'clear_activity_timer',
       'reset_activity_timer'
     ) then
    return v_result;
  end if;
  select * into strict v_after
  from public.workout_session_execution_states state
  where state.workout_session_id = p_workout_session_id;
  v_occurred_at := v_after.updated_at;

  if v_before.session_state <> 'paused' and v_after.session_state = 'paused' then
    perform private.append_workout_session_timeline_event(
      p_workout_session_id,
      p_user_id,
      'session_paused',
      v_occurred_at,
      'runtime',
      'runtime:command:' || p_command_id::text || ':session_paused',
      jsonb_build_object(
        'revisionBefore', v_before.revision,
        'revisionAfter', v_after.revision,
        'elapsedSeconds', v_after.session_elapsed_seconds
      ),
      p_command_id
    );
  elsif v_before.session_state = 'paused' and v_after.session_state = 'active' then
    perform private.append_workout_session_timeline_event(
      p_workout_session_id,
      p_user_id,
      'session_resumed',
      v_occurred_at,
      'runtime',
      'runtime:command:' || p_command_id::text || ':session_resumed',
      jsonb_build_object(
        'revisionBefore', v_before.revision,
        'revisionAfter', v_after.revision,
        'elapsedSeconds', v_after.session_elapsed_seconds
      ),
      p_command_id
    );
  end if;

  -- Pause and resume freeze/re-anchor an existing rest. They are lifecycle
  -- events, not rest completion/restart events.
  if p_command_type not in ('pause', 'resume') then
    if v_before.rest_started_at is not null
       and v_after.rest_started_at is not null
       and v_before.rest_started_at is distinct from v_after.rest_started_at then
      perform private.append_workout_session_timeline_event(
        p_workout_session_id,
        p_user_id,
        'rest_ended',
        v_occurred_at,
        'runtime',
        'runtime:command:' || p_command_id::text || ':rest_ended',
        jsonb_build_object(
          'revisionBefore', v_before.revision,
          'revisionAfter', v_after.revision,
          'reason', 'restarted'
        ),
        p_command_id
      );
      perform private.append_workout_session_timeline_event(
        p_workout_session_id,
        p_user_id,
        'rest_started',
        v_after.rest_started_at,
        'runtime',
        'runtime:command:' || p_command_id::text || ':rest_started',
        jsonb_build_object(
          'revisionBefore', v_before.revision,
          'revisionAfter', v_after.revision,
          'durationSeconds', v_after.rest_duration_seconds,
          'endsAt', v_after.rest_ends_at
        ),
        p_command_id
      );
    elsif v_before.rest_started_at is null and v_after.rest_started_at is not null then
      perform private.append_workout_session_timeline_event(
        p_workout_session_id,
        p_user_id,
        'rest_started',
        v_after.rest_started_at,
        'runtime',
        'runtime:command:' || p_command_id::text || ':rest_started',
        jsonb_build_object(
          'revisionBefore', v_before.revision,
          'revisionAfter', v_after.revision,
          'durationSeconds', v_after.rest_duration_seconds,
          'endsAt', v_after.rest_ends_at
        ),
        p_command_id
      );
    elsif v_before.view_state = 'rest' and v_after.view_state <> 'rest' then
      v_rest_end_reason := case
        when p_command_type = 'clear_rest'
          then coalesce(p_payload->>'completion_reason', 'user_skipped')
        when p_command_type in ('move_cursor', 'complete_set_transition')
          then 'transitioned'
        else 'transitioned'
      end;
      perform private.append_workout_session_timeline_event(
        p_workout_session_id,
        p_user_id,
        'rest_ended',
        v_occurred_at,
        'runtime',
        'runtime:command:' || p_command_id::text || ':rest_ended',
        jsonb_build_object(
          'revisionBefore', v_before.revision,
          'revisionAfter', v_after.revision,
          'reason', v_rest_end_reason
        ),
        p_command_id
      );
    end if;
  end if;
  return v_result;
end
$function$;

revoke all on function public.apply_workout_session_execution_command_atomic(
  uuid, uuid, uuid, bigint, text, jsonb
) from public, anon;
grant execute on function public.apply_workout_session_execution_command_atomic(
  uuid, uuid, uuid, bigint, text, jsonb
) to authenticated, service_role;

do $aw4_postconditions$
declare
  v_rpc regprocedure :=
    to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)');
begin
  if v_rpc is null
     or not (select procedure.prosecdef from pg_proc procedure where procedure.oid = v_rpc)
     or coalesce(
       (select array_to_string(procedure.proconfig, ',') from pg_proc procedure where procedure.oid = v_rpc),
       ''
     ) not like '%search_path=%' then
    raise exception 'AW-4 public command RPC hardening is invalid.';
  end if;
  if has_function_privilege(
       'public',
       'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'AW-4 public command RPC ACL is invalid.';
  end if;
  if has_table_privilege(
       'authenticated',
       'public.workout_session_execution_states',
       'INSERT,UPDATE,DELETE'
     )
     or has_table_privilege(
       'authenticated',
       'public.workout_session_execution_commands',
       'SELECT,INSERT,UPDATE,DELETE'
     ) then
    raise exception 'AW-4 retained an authenticated direct-write or receipt-table path.';
  end if;
  if not exists (
    select 1
    from public.release_schema_compatibility compatibility
    where compatibility.singleton
      and compatibility.version = '2'
      and compatibility.migration_version = '20260724232734'
  ) then
    raise exception 'AW-4 changed the compatibility marker without authorization.';
  end if;
  if exists (
    select 1
    from public.workout_session_execution_states state
    where state.state_version <> 1
  ) then
    raise exception 'AW-4 changed the compatible execution state version.';
  end if;
end
$aw4_postconditions$;
