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
  if to_regprocedure('private.assert_workout_session_muscle_snapshot_supported(uuid)') is null then
    raise exception 'Version-aware snapshot support must exist before replacement cutover.';
  end if;
end
$preflight$;

create or replace function public.replace_workout_session_snapshot_item_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_plan_exercise_id uuid,
  p_replacement_type text,
  p_replacement_identity text,
  p_provider text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_session public.workout_sessions%rowtype;
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_item public.workout_session_muscle_snapshot_items%rowtype;
  v_global public.exercises%rowtype;
  v_custom public.user_custom_exercises%rowtype;
  v_global_mapping public.exercise_muscle_mapping_sets%rowtype;
  v_custom_mapping public.user_custom_exercise_mapping_sets%rowtype;
  v_provider_activity_id text;
  v_requested_id uuid;
  v_snapshot_version text;
  v_reason text;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_replacement_type not in ('global_exercise', 'provider_activity', 'custom_exercise')
     or nullif(btrim(coalesce(p_replacement_identity, '')), '') is null then
    raise exception 'A stable replacement identity is required; names are not accepted.' using errcode = '22023';
  end if;

  select * into v_session from public.workout_sessions session
  where session.id = p_session_id and session.user_id = p_user_id for update;
  if not found then raise exception 'Workout session not found.' using errcode = 'P0002'; end if;
  if v_session.status <> 'started' then
    raise exception 'Only an active workout can record a replacement.' using errcode = '23514';
  end if;

  select * into strict v_snapshot from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id = p_session_id and snapshot.user_id = p_user_id;
  v_snapshot_version := private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);
  select * into v_item from public.workout_session_muscle_snapshot_items item
  where item.snapshot_id = v_snapshot.id and item.source_plan_exercise_id = p_plan_exercise_id for update;
  if not found then raise exception 'Snapshot activity not found.' using errcode = 'P0002'; end if;

  if p_replacement_type in ('global_exercise', 'custom_exercise') then
    begin
      v_requested_id := p_replacement_identity::uuid;
    exception when invalid_text_representation then
      raise exception 'Stable replacement identity must be a UUID.' using errcode = '22023';
    end;
  end if;

  if p_replacement_type = 'global_exercise'
     and v_item.actual_target_type = 'global_exercise'
     and v_item.actual_provider is null
     and v_item.actual_global_exercise_id = v_requested_id then
    return to_jsonb(v_item);
  elsif p_replacement_type = 'provider_activity' then
    if nullif(btrim(coalesce(p_provider, '')), '') is null then
      raise exception 'Provider identity is required.' using errcode = '22023';
    end if;
    if v_item.actual_target_type = 'global_exercise'
       and v_item.actual_global_exercise_id is not null
       and v_item.actual_provider = p_provider
       and v_item.actual_provider_activity_id = p_replacement_identity then
      return to_jsonb(v_item);
    end if;
  elsif p_replacement_type = 'custom_exercise'
     and v_item.actual_target_type = 'custom_exercise'
     and v_item.actual_custom_exercise_id = v_requested_id then
    return to_jsonb(v_item);
  end if;

  if p_replacement_type = 'global_exercise' then
    select * into v_global from public.exercises exercise
    where exercise.id = v_requested_id and exercise.is_global and exercise.is_approved;
  elsif p_replacement_type = 'provider_activity' then
    select exercise.* into v_global
    from public.exercise_provider_links link
    join public.exercises exercise on exercise.id = link.exercise_id
    where link.provider = p_provider
      and link.provider_activity_id = p_replacement_identity
      and link.verification_status = 'verified'
      and exercise.is_global and exercise.is_approved;
    v_provider_activity_id := p_replacement_identity;
  else
    select * into v_custom from public.user_custom_exercises custom
    where custom.id = v_requested_id and custom.user_id = p_user_id;
  end if;

  if p_replacement_type in ('global_exercise', 'provider_activity') then
    if v_global.id is null then raise exception 'Replacement exercise not found.' using errcode = 'P0002'; end if;
    select mapping.* into v_global_mapping
    from private.resolve_muscle_mapping(v_global.id, v_snapshot.mapping_schema_version, v_now) mapping;
    if v_snapshot_version = 'v1' and v_global_mapping.id is null then
      raise exception 'Replacement exercise has no published V1 muscle mapping.' using errcode = '23514';
    end if;
    if v_global_mapping.id is null then v_reason := 'replacement_mapping_unavailable'; end if;
  else
    if v_custom.id is null then raise exception 'Replacement custom exercise not found.' using errcode = 'P0002'; end if;
    select mapping.* into v_custom_mapping
    from private.resolve_custom_muscle_mapping(p_user_id, v_custom.id, v_snapshot.mapping_schema_version, v_now) mapping;
    if v_snapshot_version = 'v1' and v_custom_mapping.id is null then
      raise exception 'Replacement custom exercise has no published V1 muscle mapping.' using errcode = '23514';
    end if;
    if v_custom_mapping.id is null then v_reason := 'replacement_mapping_unavailable'; end if;
  end if;

  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot.id::text, true);
  update public.workout_session_muscle_snapshot_items
  set state = 'replaced',
      actual_target_type = case when v_global.id is not null then 'global_exercise' else 'custom_exercise' end,
      actual_global_exercise_id = v_global.id,
      actual_custom_exercise_id = v_custom.id,
      actual_provider = case when p_replacement_type = 'provider_activity' then p_provider end,
      actual_provider_activity_id = v_provider_activity_id,
      actual_name_snapshot = coalesce(v_global.name, v_custom.name),
      actual_mapping_set_id = v_global_mapping.id,
      actual_custom_mapping_set_id = v_custom_mapping.id,
      actual_mapping_version = coalesce(v_global_mapping.mapping_version, v_custom_mapping.mapping_version),
      actual_mapping_schema_version = coalesce(v_global_mapping.schema_version, v_custom_mapping.schema_version),
      actual_mapping_checksum = coalesce(v_global_mapping.checksum, v_custom_mapping.checksum),
      actual_custom_identity_snapshot = case when v_custom.id is not null then jsonb_build_object(
        'id', v_custom.id, 'name', v_custom.name, 'equipment', v_custom.equipment,
        'targetMuscle', v_custom.target_muscle
      ) end,
      actual_custom_mapping_entries = case when v_custom_mapping.id is not null
        then private.phase3_custom_mapping_entries(v_custom_mapping.id) end,
      replacement_recorded_at = v_now,
      updated_at = v_now
  where id = v_item.id
  returning * into v_item;

  perform private.phase3_refresh_snapshot_completeness(v_snapshot.id, v_reason);
  perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);
  return to_jsonb(v_item);
end
$function$;

revoke all on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)
  to authenticated, service_role;

do $postconditions$
declare
  v_rpc oid := to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)');
begin
  if v_rpc is null or not (select prosecdef from pg_proc where oid = v_rpc) then
    raise exception 'Version-aware replacement RPC is missing or not SECURITY DEFINER.';
  end if;
  if has_function_privilege('anon', v_rpc, 'EXECUTE')
     or not has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
    raise exception 'Replacement RPC grants drifted.';
  end if;
end
$postconditions$;

commit;
