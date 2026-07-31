begin;

-- AW-9 structural verification. This file is read-only apart from the
-- surrounding transaction and leaves the database unchanged.
do $aw9_verification$
declare
  v_marker text;
  v_command_constraint text;
  v_outcome_constraint text;
begin
  if to_regprocedure('private.assert_active_workout_controller(uuid,uuid,uuid)') is null then
    raise exception 'AW-9 controller assertion helper is missing.';
  end if;
  if to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)') is null then
    raise exception 'AW-9 public command authority is missing.';
  end if;
  if to_regprocedure('public.aw9_pre_apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)') is null then
    raise exception 'AW-9 reviewed pre-apply command authority is missing.';
  end if;

  if to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb,uuid)') is null
     or to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text,uuid)') is null
     or to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text,uuid)') is null
     or to_regprocedure('public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,uuid)') is null
     or to_regprocedure('public.cancel_workout_session_atomic(uuid,uuid,text,uuid)') is null then
    raise exception 'One or more AW-9 controller-guarded mutation overloads are missing.';
  end if;

  select pg_get_constraintdef(oid) into strict v_command_constraint
  from pg_constraint
  where conrelid = 'public.workout_session_execution_commands'::regclass
    and conname = 'workout_session_execution_commands_type_check';
  if position('claim_control' in v_command_constraint) = 0 then
    raise exception 'AW-9 command-type constraint does not admit claim_control.';
  end if;

  select pg_get_constraintdef(oid) into strict v_outcome_constraint
  from pg_constraint
  where conrelid = 'public.workout_session_execution_commands'::regclass
    and conname = 'workout_session_execution_commands_outcome_check';
  if position('controller_conflict' in v_outcome_constraint) = 0 then
    raise exception 'AW-9 command-outcome constraint does not admit controller_conflict.';
  end if;

  select migration_version into strict v_marker
  from public.release_schema_compatibility
  where singleton;
  if (select version from public.release_schema_compatibility where singleton) <> '2'
     or v_marker <> '20260724232734' then
    raise exception 'AW-9 must not promote the compatibility marker.';
  end if;

  if has_function_privilege('anon', 'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)', 'EXECUTE')
     or has_function_privilege('public', 'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)', 'EXECUTE') then
    raise exception 'AW-9 public command authority grants execution too broadly.';
  end if;
  if not has_function_privilege('authenticated', 'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)', 'EXECUTE') then
    raise exception 'AW-9 public command authority is missing reviewed execution grants.';
  end if;

  if exists (
    select 1
    from pg_proc
    where oid in (
      'private.assert_active_workout_controller(uuid,uuid,uuid)'::regprocedure,
      'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'::regprocedure,
      'public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb,uuid)'::regprocedure,
      'public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text,uuid)'::regprocedure,
      'public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text,uuid)'::regprocedure,
      'public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,uuid)'::regprocedure,
      'public.cancel_workout_session_atomic(uuid,uuid,text,uuid)'::regprocedure
    )
      and (
        not prosecdef
        or proconfig is null
        or not ('search_path=' = any(proconfig))
      )
  ) then
    raise exception 'AW-9 trusted functions must be SECURITY DEFINER with an empty search_path.';
  end if;
end
$aw9_verification$;

rollback;
