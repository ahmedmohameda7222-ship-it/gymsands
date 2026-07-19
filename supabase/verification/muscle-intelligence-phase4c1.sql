begin read only;

do $verification$
declare
  v_marker text;
  v_direct oid := to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)');
  v_replace oid := to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)');
  v_complete oid := to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)');
  v_supported oid := to_regprocedure('private.assert_workout_session_muscle_snapshot_supported(uuid)');
  v_v2_freeze oid := to_regprocedure('private.freeze_workout_session_muscle_snapshot_v2(uuid,text)');
begin
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker is distinct from '20260717051011' then
    raise exception 'Phase 4C.1 must not advance the compatibility marker independently.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exercise_logs'
      and column_name = 'set_type' and is_nullable = 'NO'
  ) then
    raise exception 'Structured exercise-log set type is missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_session_muscle_snapshot_items'
      and column_name = 'performed_total_sets'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_session_muscle_snapshot_items'
      and column_name = 'performed_qualifying_sets'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_session_muscle_snapshot_items'
      and column_name = 'performed_frozen_at'
  ) then
    raise exception 'Frozen performed-workload columns are incomplete.';
  end if;

  if exists (
    select 1 from public.exercise_logs
    where set_type not in ('normal', 'warmup', 'working', 'failure', 'drop')
  ) then
    raise exception 'An exercise log has an unsupported structured set type.';
  end if;

  if exists (
    select 1 from public.workout_session_muscle_snapshot_items item
    where (item.performed_total_sets is null) <> (item.performed_qualifying_sets is null)
       or (item.performed_total_sets is null) <> (item.performed_frozen_at is null)
       or item.performed_total_sets < 0
       or item.performed_qualifying_sets < 0
       or item.performed_qualifying_sets > item.performed_total_sets
  ) then
    raise exception 'Frozen performed workload is internally inconsistent.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where not trigger_row.tgisinternal
      and schema_row.nspname = 'public'
      and table_row.relname = 'exercise_logs'
      and trigger_row.tgname = 'exercise_logs_terminal_immutable'
  ) then
    raise exception 'Terminal exercise-log mutation guard is missing.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where not trigger_row.tgisinternal
      and schema_row.nspname = 'public'
      and table_row.relname = 'workout_sessions'
      and trigger_row.tgname = 'workout_sessions_terminal_delete_guard'
  ) then
    raise exception 'Terminal workout-session deletion guard is missing.';
  end if;

  if v_direct is null or v_replace is null or v_complete is null or v_supported is null or v_v2_freeze is null then
    raise exception 'A Phase 4C.1 runtime authority is missing.';
  end if;

  if not (select prosecdef from pg_proc where oid = v_direct)
     or not (select prosecdef from pg_proc where oid = v_replace)
     or not (select prosecdef from pg_proc where oid = v_complete)
     or not (select prosecdef from pg_proc where oid = v_supported)
     or not (select prosecdef from pg_proc where oid = v_v2_freeze) then
    raise exception 'A Phase 4C.1 runtime authority is not SECURITY DEFINER.';
  end if;

  if not coalesce((select cardinality(proconfig) = 1 and proconfig[1] = 'search_path=""' from pg_proc where oid = v_direct), false)
     or not coalesce((select cardinality(proconfig) = 1 and proconfig[1] = 'search_path=""' from pg_proc where oid = v_replace), false)
     or not coalesce((select cardinality(proconfig) = 1 and proconfig[1] = 'search_path=""' from pg_proc where oid = v_supported), false)
     or not coalesce((select cardinality(proconfig) = 1 and proconfig[1] = 'search_path=""' from pg_proc where oid = v_v2_freeze), false) then
    raise exception 'A Phase 4C.1 runtime authority has an unsafe search_path.';
  end if;

  if has_function_privilege('anon', v_direct, 'EXECUTE')
     or has_function_privilege('anon', v_replace, 'EXECUTE')
     or has_function_privilege('anon', v_complete, 'EXECUTE')
     or not has_function_privilege('authenticated', v_direct, 'EXECUTE')
     or not has_function_privilege('authenticated', v_replace, 'EXECUTE')
     or not has_function_privilege('authenticated', v_complete, 'EXECUTE') then
    raise exception 'Workout runtime RPC grants drifted.';
  end if;

  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    where snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v1'
      and (
        snapshot.taxonomy_version <> 'muscle_taxonomy_v1'
        or snapshot.mapping_schema_version <> 'exercise_muscle_mapping_v1'
        or snapshot.calculation_engine_version <> 'muscle_load_resistance_sets_v1'
      )
  ) then
    raise exception 'A historical V1 snapshot bundle drifted.';
  end if;

  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    where snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
      and (
        snapshot.taxonomy_version <> 'advanced_visible_v1'
        or snapshot.mapping_schema_version <> 'exercise_muscle_mapping_v2'
        or snapshot.calculation_engine_version <> 'muscle_load_resistance_sets_v2'
        or snapshot.threshold_profile_version <> 'advanced_exposure_v1'
        or snapshot.result_schema_version <> 'advanced_muscle_exposure_result_v1'
        or snapshot.workload_model_version <> 'resistance_sets_v1'
      )
  ) then
    raise exception 'A V2 snapshot has a mixed or unsupported version bundle.';
  end if;

  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_sessions session on session.id = snapshot.workout_session_id
    where snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
      and session.status in ('completed', 'skipped')
      and exists (
        select 1
        from public.workout_session_muscle_snapshot_items item
        where item.snapshot_id = snapshot.id
          and item.performed_frozen_at is null
      )
  ) then
    raise exception 'A terminal V2 session is missing immutable performed workload.';
  end if;
end
$verification$;

rollback;
