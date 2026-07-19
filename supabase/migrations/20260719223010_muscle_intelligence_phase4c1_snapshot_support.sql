begin;

do $preflight$
declare
  v_marker text;
begin
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted during Phase 4C.1 split cutover: %.', v_marker;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exercise_logs' and column_name = 'set_type'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_session_muscle_snapshot_items'
      and column_name = 'performed_qualifying_sets'
  ) then
    raise exception 'Phase 4C.1 runtime schema must be applied before snapshot support.';
  end if;
end
$preflight$;

create or replace function private.assert_workout_session_muscle_snapshot_supported(
  p_snapshot_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
begin
  select * into v_snapshot
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.id = p_snapshot_id;
  if not found then
    raise exception 'Workout session snapshot is missing.' using errcode = '23514';
  end if;

  if v_snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v1' then
    perform private.assert_phase3_snapshot_v1(p_snapshot_id);
    return 'v1';
  end if;

  if v_snapshot.snapshot_schema_version <> 'workout_session_muscle_snapshot_v2'
     or v_snapshot.taxonomy_version <> 'advanced_visible_v1'
     or v_snapshot.mapping_schema_version <> 'exercise_muscle_mapping_v2'
     or v_snapshot.calculation_engine_version <> 'muscle_load_resistance_sets_v2'
     or v_snapshot.threshold_profile_version <> 'advanced_exposure_v1'
     or v_snapshot.result_schema_version <> 'advanced_muscle_exposure_result_v1'
     or v_snapshot.workload_model_version <> 'resistance_sets_v1' then
    raise exception 'Workout session snapshot uses an unsupported version bundle.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    left join public.exercise_muscle_mapping_sets planned_global on planned_global.id = item.planned_mapping_set_id
    left join public.user_custom_exercise_mapping_sets planned_custom on planned_custom.id = item.planned_custom_mapping_set_id
    left join public.exercise_muscle_mapping_sets actual_global on actual_global.id = item.actual_mapping_set_id
    left join public.user_custom_exercise_mapping_sets actual_custom on actual_custom.id = item.actual_custom_mapping_set_id
    where item.snapshot_id = p_snapshot_id
      and (
        item.planned_mapping_schema_version is distinct from coalesce(
          planned_global.schema_version,
          planned_custom.schema_version,
          item.planned_mapping_schema_version
        )
        or item.actual_mapping_schema_version is distinct from coalesce(
          actual_global.schema_version,
          actual_custom.schema_version,
          item.actual_mapping_schema_version
        )
        or (item.planned_mapping_schema_version is not null and item.planned_mapping_schema_version <> 'exercise_muscle_mapping_v2')
        or (item.actual_mapping_schema_version is not null and item.actual_mapping_schema_version <> 'exercise_muscle_mapping_v2')
      )
  ) then
    raise exception 'V2 snapshot items must reference only V2 mappings.' using errcode = '23514';
  end if;
  return 'v2';
end
$function$;

-- Completeness follows the effective target. A recorded replacement supersedes the
-- planned mapping, including when the replacement has a stable identity but no V2 map.
create or replace function private.phase3_refresh_snapshot_completeness(
  p_snapshot_id uuid,
  p_extra_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_total integer;
  v_mapped integer;
  v_unlinked_provider integer;
  v_unmapped_identity integer;
  v_reasons text[] := '{}'::text[];
begin
  select
    count(*),
    count(*) filter (
      where case when item.actual_target_type is not null
        then item.actual_mapping_set_id is not null or item.actual_custom_mapping_set_id is not null
        else item.planned_mapping_set_id is not null or item.planned_custom_mapping_set_id is not null end
    ),
    count(*) filter (
      where case when item.actual_target_type is not null
        then item.actual_provider_activity_id is not null and item.actual_global_exercise_id is null
        else item.planned_provider_activity_id is not null and item.planned_global_exercise_id is null end
    ),
    count(*) filter (
      where case when item.actual_target_type is not null
        then item.actual_provider_activity_id is null
          and item.actual_global_exercise_id is null
          and item.actual_custom_exercise_id is null
        else item.planned_provider_activity_id is null
          and item.planned_global_exercise_id is null
          and item.planned_custom_exercise_id is null end
    )
  into v_total, v_mapped, v_unlinked_provider, v_unmapped_identity
  from public.workout_session_muscle_snapshot_items item
  where item.snapshot_id = p_snapshot_id;

  if v_total = 0 then v_reasons := array_append(v_reasons, 'no_planned_items'); end if;
  if v_unlinked_provider > 0 then v_reasons := array_append(v_reasons, 'provider_bridge_unavailable'); end if;
  if v_total > v_mapped and (v_total - v_mapped - v_unlinked_provider) > 0 then
    v_reasons := array_append(v_reasons, 'mapping_unavailable');
  end if;
  if v_unmapped_identity > 0 then v_reasons := array_append(v_reasons, 'stable_identity_unavailable'); end if;
  if nullif(btrim(coalesce(p_extra_reason, '')), '') is not null
     and not (p_extra_reason = any(v_reasons)) then
    v_reasons := array_append(v_reasons, p_extra_reason);
  end if;

  perform set_config('plaivra.session_snapshot_mutation_id', p_snapshot_id::text, true);
  update public.workout_session_muscle_snapshots
  set completeness = case
        when v_total = 0 or v_mapped = 0 then 'unavailable'
        when v_mapped = v_total then 'complete'
        else 'partial'
      end,
      reason_codes = case
        when v_mapped = v_total and v_total > 0 and p_extra_reason is null then '{}'::text[]
        else v_reasons
      end
  where id = p_snapshot_id;
end
$function$;

do $postconditions$
begin
  if to_regprocedure('private.assert_workout_session_muscle_snapshot_supported(uuid)') is null
     or to_regprocedure('private.phase3_refresh_snapshot_completeness(uuid,text)') is null then
    raise exception 'Phase 4C.1 snapshot support functions are missing.';
  end if;
  if exists (
    select 1 from public.workout_session_muscle_snapshots
    where snapshot_schema_version <> 'workout_session_muscle_snapshot_v1'
  ) then
    raise exception 'Snapshot support migration changed historical snapshot versions.';
  end if;
end
$postconditions$;

commit;
