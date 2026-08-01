\set ON_ERROR_STOP on

begin;

do $aw4_verification$
declare
  v_definition text;
begin
  if (
    select count(*) = 5
    from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'workout_session_execution_states'
      and (
        (column_info.column_name = 'activity_timer_kind'
          and column_info.data_type = 'text'
          and column_info.is_nullable = 'YES')
        or (column_info.column_name = 'activity_timer_elapsed_seconds'
          and column_info.data_type = 'integer'
          and column_info.is_nullable = 'NO'
          and column_info.column_default = '0')
        or (column_info.column_name = 'activity_timer_running_since'
          and column_info.data_type = 'timestamp with time zone'
          and column_info.is_nullable = 'YES')
        or (column_info.column_name = 'activity_timer_duration_seconds'
          and column_info.data_type = 'integer'
          and column_info.is_nullable = 'YES')
        or (column_info.column_name = 'activity_timer_ends_at'
          and column_info.data_type = 'timestamp with time zone'
          and column_info.is_nullable = 'YES')
      )
  ) is not true then
    raise exception 'AW-4 activity timer columns do not match the exact additive contract.';
  end if;

  if exists (
    select 1
    from public.workout_session_execution_states state
    where state.state_version <> 1
       or state.activity_timer_elapsed_seconds < 0
       or (
         state.activity_timer_kind is null
         and (
           state.activity_timer_elapsed_seconds <> 0
           or state.activity_timer_running_since is not null
           or state.activity_timer_duration_seconds is not null
           or state.activity_timer_ends_at is not null
         )
       )
  ) then
    raise exception 'AW-4 existing execution rows are not additively compatible.';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_info
    where constraint_info.conrelid = 'public.workout_session_execution_states'::regclass
      and constraint_info.conname = 'workout_session_execution_states_activity_timer_check'
      and pg_get_constraintdef(constraint_info.oid) like '%86400%'
  ) then
    raise exception 'AW-4 strict bounded activity timer constraint is missing.';
  end if;
  if not exists (
    select 1
    from pg_constraint constraint_info
    where constraint_info.conrelid = 'public.workout_session_execution_commands'::regclass
      and constraint_info.conname = 'workout_session_execution_commands_type_check'
      and pg_get_constraintdef(constraint_info.oid) like '%start_activity_timer%'
      and pg_get_constraintdef(constraint_info.oid) like '%clear_activity_timer%'
      and pg_get_constraintdef(constraint_info.oid) like '%reset_activity_timer%'
  ) then
    raise exception 'AW-4 command receipt type constraint is incomplete.';
  end if;

  if to_regprocedure(
       'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'
     ) is null
     or to_regprocedure(
       'public.aw9_pre_apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'
     ) is null
     or to_regprocedure(
       'private.aw2c_core_apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'
     ) is null
     or to_regprocedure(
       'private.aw4_pre_session_engine_apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'
     ) is null then
    raise exception 'AW-4 additive command authority chain is incomplete.';
  end if;

  select pg_get_functiondef(
    'private.aw2c_core_apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'::regprocedure
  ) into strict v_definition;
  if v_definition not like '%pg_column_size(v_payload) > 4096%'
     or v_definition not like '%start_activity_timer%'
     or v_definition not like '%clear_activity_timer%'
     or v_definition not like '%reset_activity_timer%'
     or v_definition not like '%natural_expiration%'
     or v_definition not like '%clock_timestamp()%'
     or v_definition not like '%pg_advisory_xact_lock%'
     or v_definition not like '%command_id_reused_with_different_request%' then
    raise exception 'AW-4 private core does not retain its bounded atomic command contract.';
  end if;

  select pg_get_functiondef(
    'public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'::regprocedure
  ) into strict v_definition;
  if v_definition not like '%public.aw9_pre_apply_workout_session_execution_command_atomic%'
     or v_definition not like '%claim_control%'
     or v_definition not like '%controller_conflict%' then
    raise exception 'AW-9 public authority wrapper does not preserve the AW-4 delegation boundary.';
  end if;

  select pg_get_functiondef(
    'public.aw9_pre_apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'::regprocedure
  ) into strict v_definition;
  if v_definition not like '%completion_reason%'
     or v_definition not like '%p_payload->>''completion_reason''%'
     or v_definition not like '%v_rest_end_reason%'
     or v_definition not like '%session_paused%'
     or v_definition not like '%session_resumed%' then
    raise exception 'AW-4 preserved public timeline wrapper is incomplete.';
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
    raise exception 'AW-4 public RPC grants are invalid.';
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
    raise exception 'AW-4 authenticated direct mutation access exists.';
  end if;
  if (
    select version = '2' and migration_version = '20260724232734'
    from public.release_schema_compatibility
    where singleton
  ) is not true then
    raise exception 'AW-4 compatibility marker changed.';
  end if;
end
$aw4_verification$;

rollback;
