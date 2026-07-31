-- AW-9 Offline & Multi-Device.
-- Forward-only controller authority and guarded Active Workout mutation overloads.
-- This migration intentionally does not promote release_schema_compatibility.

alter table public.workout_session_execution_commands
  drop constraint workout_session_execution_commands_type_check;
alter table public.workout_session_execution_commands
  add constraint workout_session_execution_commands_type_check
  check (command_type in (
    'claim_control',
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

alter table public.workout_session_execution_commands
  drop constraint workout_session_execution_commands_outcome_check;
alter table public.workout_session_execution_commands
  add constraint workout_session_execution_commands_outcome_check
  check (outcome in (
    'applied',
    'no_op',
    'revision_conflict',
    'controller_conflict'
  ));

create or replace function private.assert_active_workout_controller(
  p_user_id uuid,
  p_workout_session_id uuid,
  p_controller_device_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_state public.workout_session_execution_states%rowtype;
  v_root_user_id uuid;
  v_root_status text;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_user_id is null
     or p_workout_session_id is null
     or p_controller_device_id is null then
    raise exception 'Active Workout controller identity is required.'
      using errcode = '22023';
  end if;

  select * into v_state
  from public.workout_session_execution_states state
  where state.workout_session_id = p_workout_session_id
  for update;
  if not found then
    raise exception 'Workout execution state does not exist.'
      using errcode = 'P0002';
  end if;

  select session.user_id, session.status::text
    into v_root_user_id, v_root_status
  from public.workout_sessions session
  where session.id = p_workout_session_id;

  if v_root_user_id is null
     or v_root_user_id <> p_user_id
     or v_state.user_id <> p_user_id then
    raise exception 'Workout controller owner mismatch.'
      using errcode = '42501';
  end if;
  if v_root_status <> 'started' then
    raise exception 'Workout controller requires a started session.'
      using errcode = '23514';
  end if;
  if v_state.controller_device_id is null
     or v_state.controller_device_id <> p_controller_device_id::text then
    raise exception 'Workout controller conflict.'
      using errcode = 'P0001', detail = 'controller_conflict';
  end if;
end
$function$;

revoke all on function private.assert_active_workout_controller(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

alter function public.apply_workout_session_execution_command_atomic(
  uuid, uuid, uuid, bigint, text, jsonb
) rename to aw9_pre_apply_workout_session_execution_command_atomic;

revoke all on function public.aw9_pre_apply_workout_session_execution_command_atomic(
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
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_hash text;
  v_existing public.workout_session_execution_commands%rowtype;
  v_state public.workout_session_execution_states%rowtype;
  v_result public.workout_session_execution_states%rowtype;
  v_root_user_id uuid;
  v_root_status text;
  v_controller uuid;
  v_expected_controller uuid;
  v_takeover boolean;
  v_outcome text;
  v_reason text;
  v_exception_detail text;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_user_id is null or p_workout_session_id is null or p_command_id is null then
    raise exception 'Workout execution command identity is required.'
      using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Workout execution expected revision must be non-negative.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload) <> 'object' or pg_column_size(v_payload) > 4096 then
    raise exception 'Workout execution payload must be one bounded object.'
      using errcode = '22023';
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
    pg_catalog.hashtextextended(
      p_workout_session_id::text || ':' || p_command_id::text,
      0
    )
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

  if p_command_type <> 'claim_control' then
    begin
      perform private.assert_active_workout_controller(
        p_user_id,
        p_workout_session_id,
        nullif(v_payload->>'controller_device_id', '')::uuid
      );
    exception
      when invalid_text_representation then
        raise exception 'controller_device_id must be a UUID.'
          using errcode = '22023';
      when raise_exception then
        get stacked diagnostics v_exception_detail = pg_exception_detail;
        if v_exception_detail = 'controller_conflict' then
          select * into strict v_state
          from public.workout_session_execution_states state
          where state.workout_session_id = p_workout_session_id;
          return jsonb_build_object(
            'schemaVersion', 1,
            'workoutSessionId', p_workout_session_id,
            'commandId', p_command_id,
            'commandType', p_command_type,
            'outcome', 'controller_conflict',
            'replayed', false,
            'expectedRevision', p_expected_revision,
            'revisionBefore', v_state.revision,
            'revisionAfter', v_state.revision,
            'reason', 'controller_device_mismatch',
            'state', to_jsonb(v_state)
          );
        end if;
        raise;
    end;
    return public.aw9_pre_apply_workout_session_execution_command_atomic(
      p_user_id,
      p_workout_session_id,
      p_command_id,
      p_expected_revision,
      p_command_type,
      v_payload
    );
  end if;

  if (
    select count(*)
    from jsonb_object_keys(v_payload)
  ) <> 3
     or not (v_payload ?& array[
       'controller_device_id',
       'expected_controller_device_id',
       'takeover'
     ]) then
    raise exception 'claim_control payload keys are invalid.'
      using errcode = '22023';
  end if;
  begin
    v_controller := (v_payload->>'controller_device_id')::uuid;
    v_expected_controller := nullif(
      v_payload->>'expected_controller_device_id',
      ''
    )::uuid;
    v_takeover := (v_payload->>'takeover')::boolean;
  exception when others then
    raise exception 'claim_control payload values are invalid.'
      using errcode = '22023';
  end;
  if v_controller is null or v_takeover is null then
    raise exception 'claim_control requires a controller and takeover intent.'
      using errcode = '22023';
  end if;

  select * into v_state
  from public.workout_session_execution_states state
  where state.workout_session_id = p_workout_session_id
  for update;
  if not found then
    raise exception 'Workout execution state does not exist.'
      using errcode = 'P0002';
  end if;
  select session.user_id, session.status::text
    into v_root_user_id, v_root_status
  from public.workout_sessions session
  where session.id = p_workout_session_id;
  if v_root_user_id is null
     or v_root_user_id <> p_user_id
     or v_state.user_id <> p_user_id then
    raise exception 'Workout execution command owner mismatch.'
      using errcode = '42501';
  end if;
  if v_root_status <> 'started' then
    raise exception 'Workout execution commands require a started session.'
      using errcode = '23514';
  end if;

  if v_state.revision <> p_expected_revision then
    v_outcome := 'revision_conflict';
    v_reason := 'expected_revision_mismatch';
    v_result := v_state;
  elsif v_state.controller_device_id is distinct from v_expected_controller::text
     or (
       v_state.controller_device_id is not null
       and v_state.controller_device_id <> v_controller::text
       and not v_takeover
     ) then
    v_outcome := 'controller_conflict';
    v_reason := 'expected_controller_mismatch';
    v_result := v_state;
  elsif v_state.controller_device_id = v_controller::text then
    v_outcome := 'no_op';
    v_reason := 'controller_already_claimed';
    v_result := v_state;
  else
    update public.workout_session_execution_states state
    set controller_device_id = v_controller::text
    where state.workout_session_id = p_workout_session_id
    returning * into strict v_result;
    v_outcome := 'applied';
    v_reason := case when v_state.controller_device_id is null
      then 'controller_claimed'
      else 'controller_taken_over'
    end;
  end if;

  insert into public.workout_session_execution_commands (
    workout_session_id,
    user_id,
    command_id,
    command_type,
    expected_revision,
    request_payload,
    request_hash,
    outcome,
    revision_before,
    revision_after,
    result_state,
    reason
  ) values (
    p_workout_session_id,
    p_user_id,
    p_command_id,
    p_command_type,
    p_expected_revision,
    v_payload,
    v_hash,
    v_outcome,
    v_state.revision,
    v_result.revision,
    to_jsonb(v_result),
    v_reason
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

revoke all on function public.apply_workout_session_execution_command_atomic(
  uuid,uuid,uuid,bigint,text,jsonb
) from public, anon;
grant execute on function public.apply_workout_session_execution_command_atomic(
  uuid,uuid,uuid,bigint,text,jsonb
) to authenticated, service_role;

create or replace function public.upsert_workout_set_logs_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb,
  p_controller_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.assert_active_workout_controller(
    p_user_id, p_session_id, p_controller_device_id
  );
  return public.upsert_workout_set_logs_atomic(
    p_user_id, p_session_id, p_logs
  );
end
$function$;

create or replace function public.complete_workout_session_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb,
  p_duration_minutes integer,
  p_notes text,
  p_controller_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.assert_active_workout_controller(
    p_user_id, p_session_id, p_controller_device_id
  );
  return public.complete_workout_session_atomic(
    p_user_id, p_session_id, p_logs, p_duration_minutes, p_notes
  );
end
$function$;

create or replace function public.replace_workout_session_snapshot_item_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_plan_exercise_id uuid,
  p_replacement_type text,
  p_replacement_identity text,
  p_provider text,
  p_controller_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.assert_active_workout_controller(
    p_user_id, p_session_id, p_controller_device_id
  );
  return public.replace_workout_session_snapshot_item_atomic(
    p_user_id,
    p_session_id,
    p_plan_exercise_id,
    p_replacement_type,
    p_replacement_identity,
    p_provider
  );
end
$function$;

create or replace function public.skip_workout_session_snapshot_item_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_snapshot_item_id uuid,
  p_reason text,
  p_controller_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.assert_active_workout_controller(
    p_user_id, p_session_id, p_controller_device_id
  );
  return public.skip_workout_session_snapshot_item_atomic(
    p_user_id, p_session_id, p_snapshot_item_id, p_reason
  );
end
$function$;

create or replace function public.cancel_workout_session_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_reason text,
  p_controller_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.assert_active_workout_controller(
    p_user_id, p_session_id, p_controller_device_id
  );
  return public.cancel_workout_session_atomic(
    p_user_id, p_session_id, p_reason
  );
end
$function$;

revoke all on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb,uuid)
  from public, anon;
revoke all on function public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text,uuid)
  from public, anon;
revoke all on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text,uuid)
  from public, anon;
revoke all on function public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,uuid)
  from public, anon;
revoke all on function public.cancel_workout_session_atomic(uuid,uuid,text,uuid)
  from public, anon;

grant execute on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb,uuid)
  to authenticated, service_role;
grant execute on function public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text,uuid)
  to authenticated, service_role;
grant execute on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text,uuid)
  to authenticated, service_role;
grant execute on function public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,uuid)
  to authenticated, service_role;
grant execute on function public.cancel_workout_session_atomic(uuid,uuid,text,uuid)
  to authenticated, service_role;

comment on function private.assert_active_workout_controller(uuid,uuid,uuid) is
  'AW-9 FOR UPDATE controller gate for every Active Workout mutation outside claim_control.';
