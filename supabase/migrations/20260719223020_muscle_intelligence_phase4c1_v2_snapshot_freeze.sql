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
  if to_regprocedure('private.assert_workout_session_muscle_snapshot_supported(uuid)') is null
     or to_regprocedure('private.phase3_refresh_snapshot_completeness(uuid,text)') is null then
    raise exception 'Snapshot support must exist before the V2 freeze authority.';
  end if;
end
$preflight$;

create or replace function private.freeze_workout_session_muscle_snapshot_v2(
  p_session_id uuid,
  p_source text default 'session_start'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_snapshot_id uuid;
  v_source_plan_updated_at timestamptz;
begin
  if p_source not in ('session_start', 'terminal_insert') then
    raise exception 'Unsupported workout-session snapshot boundary.' using errcode = '23514';
  end if;

  select * into v_session
  from public.workout_sessions session
  where session.id = p_session_id
  for update;
  if not found then raise exception 'Workout session not found.' using errcode = 'P0002'; end if;

  if exists (
    select 1 from public.workout_session_muscle_snapshots snapshot
    where snapshot.workout_session_id = v_session.id
  ) then
    raise exception 'The V2 snapshot creator cannot replace an existing snapshot.' using errcode = '23505';
  end if;

  if v_session.plan_id is not null then
    select plan.updated_at into v_source_plan_updated_at
    from public.user_workout_plans plan
    where plan.id = v_session.plan_id and plan.user_id = v_session.user_id;
  end if;

  insert into public.workout_session_muscle_snapshots (
    user_id, workout_session_id, scheduled_session_id, plan_id, plan_day_id,
    plan_week_id, plan_session_id, snapshot_schema_version, taxonomy_version,
    mapping_schema_version, calculation_engine_version, threshold_profile_version,
    result_schema_version, workload_model_version, completeness, reason_codes,
    source, source_plan_updated_at, frozen_at
  ) values (
    v_session.user_id, v_session.id, v_session.scheduled_session_id, v_session.plan_id,
    v_session.plan_day_id, v_session.plan_week_id, v_session.plan_session_id,
    'workout_session_muscle_snapshot_v2', 'advanced_visible_v1',
    'exercise_muscle_mapping_v2', 'muscle_load_resistance_sets_v2',
    'advanced_exposure_v1', 'advanced_muscle_exposure_result_v1', 'resistance_sets_v1',
    'unavailable', array['snapshot_building']::text[], p_source,
    v_source_plan_updated_at, v_session.started_at
  ) returning id into v_snapshot_id;

  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot_id::text, true);

  with source_items as (
    select
      plan_exercise.*,
      activity.id as activity_id,
      activity.catalog_source,
      activity.catalog_activity_id,
      activity.planned_prescription as activity_prescription,
      phase.phase_slug,
      phase.phase_name_snapshot,
      case
        when plan_exercise.source_workout_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then plan_exercise.source_workout_id::uuid
        else null
      end as source_uuid
    from public.user_workout_plan_exercises plan_exercise
    left join public.user_workout_plan_activities activity
      on activity.source_legacy_plan_exercise_id = plan_exercise.id
      and activity.archived_at is null
    left join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
    where plan_exercise.plan_day_id = v_session.plan_day_id
      and plan_exercise.archived_at is null
  ), resolved as (
    select
      source_item.*,
      coalesce(global_exercise.id, provider_exercise.exercise_id) as global_exercise_id,
      custom_exercise.id as custom_exercise_id,
      provider_exercise.provider,
      provider_exercise.provider_activity_id
    from source_items source_item
    left join public.exercises global_exercise
      on global_exercise.id = source_item.source_uuid
      and global_exercise.is_global and global_exercise.is_approved
    left join public.user_custom_exercises custom_exercise
      on custom_exercise.id = source_item.source_uuid
      and custom_exercise.user_id = v_session.user_id
    left join lateral (
      select link.exercise_id, link.provider, link.provider_activity_id
      from public.exercise_provider_links link
      join public.exercises exercise on exercise.id = link.exercise_id
      where source_item.catalog_activity_id is not null
        and link.provider = 'plaivra_activity_catalog'
        and link.provider_activity_id = source_item.catalog_activity_id
        and link.verification_status = 'verified'
        and exercise.is_global and exercise.is_approved
      order by link.verified_at desc nulls last, link.id
      limit 1
    ) provider_exercise on true
  )
  insert into public.workout_session_muscle_snapshot_items (
    snapshot_id, user_id, source_plan_exercise_id, source_plan_activity_id,
    item_order, phase_slug, phase_name_snapshot, activity_name_snapshot,
    planned_target_type, planned_global_exercise_id, planned_custom_exercise_id,
    planned_provider, planned_provider_activity_id,
    planned_mapping_set_id, planned_custom_mapping_set_id,
    planned_mapping_version, planned_mapping_schema_version, planned_mapping_checksum,
    planned_custom_identity_snapshot, planned_custom_mapping_entries,
    planned_prescription, planned_sets
  )
  select
    v_snapshot_id, v_session.user_id, resolved.id, resolved.activity_id,
    row_number() over (order by resolved.sort_order, resolved.id)::integer,
    resolved.phase_slug, resolved.phase_name_snapshot, resolved.exercise_name,
    case when resolved.global_exercise_id is not null then 'global_exercise'
         when resolved.custom_exercise_id is not null then 'custom_exercise' end,
    resolved.global_exercise_id, resolved.custom_exercise_id,
    resolved.provider, resolved.provider_activity_id,
    global_mapping.id, custom_mapping.id,
    coalesce(global_mapping.mapping_version, custom_mapping.mapping_version),
    coalesce(global_mapping.schema_version, custom_mapping.schema_version),
    coalesce(global_mapping.checksum, custom_mapping.checksum),
    case when resolved.custom_exercise_id is not null then jsonb_build_object(
      'id', resolved.custom_exercise_id,
      'name', custom_identity.name,
      'equipment', custom_identity.equipment,
      'targetMuscle', custom_identity.target_muscle
    ) end,
    case when custom_mapping.id is not null then private.phase3_custom_mapping_entries(custom_mapping.id) end,
    case when jsonb_typeof(resolved.activity_prescription) = 'object'
      then resolved.activity_prescription
      else jsonb_strip_nulls(jsonb_build_object(
        'sets', resolved.sets, 'reps', resolved.reps, 'restSeconds', resolved.rest_seconds
      ))
    end,
    resolved.sets
  from resolved
  left join public.user_custom_exercises custom_identity
    on custom_identity.id = resolved.custom_exercise_id and custom_identity.user_id = v_session.user_id
  left join lateral (
    select mapping.*
    from private.resolve_muscle_mapping(
      resolved.global_exercise_id,
      'exercise_muscle_mapping_v2',
      v_session.started_at
    ) mapping
  ) global_mapping on true
  left join lateral (
    select mapping.*
    from private.resolve_custom_muscle_mapping(
      v_session.user_id,
      resolved.custom_exercise_id,
      'exercise_muscle_mapping_v2',
      v_session.started_at
    ) mapping
  ) custom_mapping on true
  order by resolved.sort_order, resolved.id;

  perform private.phase3_refresh_snapshot_completeness(
    v_snapshot_id,
    case when p_source = 'terminal_insert' then 'terminal_insert' end
  );
  perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot_id);
  return v_snapshot_id;
end
$function$;

create or replace function private.freeze_workout_session_muscle_snapshot(
  p_session_id uuid,
  p_source text default 'session_start'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot_id uuid;
begin
  if p_source not in ('session_start', 'terminal_insert') then
    raise exception 'Unsupported workout-session snapshot boundary.' using errcode = '23514';
  end if;

  select snapshot.id into v_snapshot_id
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id = p_session_id;
  if v_snapshot_id is not null then
    perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot_id);
    return v_snapshot_id;
  end if;

  return private.freeze_workout_session_muscle_snapshot_v2(p_session_id, p_source);
end
$function$;

do $postconditions$
begin
  if to_regprocedure('private.freeze_workout_session_muscle_snapshot_v2(uuid,text)') is null
     or to_regprocedure('private.freeze_workout_session_muscle_snapshot(uuid,text)') is null then
    raise exception 'Phase 4C.1 V2 snapshot freeze authority is missing.';
  end if;
  if exists (
    select 1 from public.workout_session_muscle_snapshots
    where snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
  ) then
    raise exception 'The V2 freeze authority migration must not create session snapshots.';
  end if;
end
$postconditions$;

commit;
