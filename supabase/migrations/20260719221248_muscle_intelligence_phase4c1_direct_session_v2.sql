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
  if to_regprocedure('private.freeze_workout_session_muscle_snapshot_v2(uuid,text)') is null then
    raise exception 'V2 snapshot freeze authority must exist before direct-session cutover.';
  end if;
end
$preflight$;

create or replace function public.start_or_resume_direct_workout_session_atomic(
  p_user_id uuid,
  p_target_type text,
  p_identity text,
  p_provider text default null,
  p_display_name text default null,
  p_category text default null,
  p_planned_prescription jsonb default '{}'::jsonb,
  p_candidate_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_requested_uuid uuid;
  v_global public.exercises%rowtype;
  v_custom public.user_custom_exercises%rowtype;
  v_global_mapping public.exercise_muscle_mapping_sets%rowtype;
  v_custom_mapping public.user_custom_exercise_mapping_sets%rowtype;
  v_session public.workout_sessions%rowtype;
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_snapshot_id uuid;
  v_item public.workout_session_muscle_snapshot_items%rowtype;
  v_name text;
  v_reason text;
  v_planned_sets integer;
  v_same_identity boolean;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_target_type not in ('global_exercise', 'provider_activity', 'custom_exercise')
     or nullif(btrim(coalesce(p_identity, '')), '') is null then
    raise exception 'A stable direct-workout identity is required; names are not accepted.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_planned_prescription, '{}'::jsonb)) <> 'object' then
    raise exception 'Planned prescription must be a JSON object.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':direct-workout-session', 0));

  if p_target_type in ('global_exercise', 'custom_exercise') then
    begin
      v_requested_uuid := p_identity::uuid;
    exception when invalid_text_representation then
      raise exception 'Stable direct-workout identity must be a UUID.' using errcode = '22023';
    end;
  end if;

  if p_target_type = 'global_exercise' then
    select exercise.* into v_global
    from public.exercises exercise
    where exercise.is_global and exercise.is_approved
      and (exercise.id = v_requested_uuid or exercise.legacy_workout_id = v_requested_uuid)
    order by (exercise.id = v_requested_uuid) desc, exercise.id
    limit 1;
    if v_global.id is null then raise exception 'Canonical exercise not found.' using errcode = 'P0002'; end if;
  elsif p_target_type = 'provider_activity' then
    if nullif(btrim(coalesce(p_provider, '')), '') is null then
      raise exception 'Provider identity is required.' using errcode = '22023';
    end if;
    select exercise.* into v_global
    from public.exercise_provider_links link
    join public.exercises exercise
      on exercise.id = link.exercise_id and exercise.is_global and exercise.is_approved
    where link.provider = p_provider
      and link.provider_activity_id = p_identity
      and link.verification_status = 'verified'
    order by link.verified_at desc nulls last, link.id
    limit 1;
  else
    select custom.* into v_custom
    from public.user_custom_exercises custom
    where custom.id = v_requested_uuid and custom.user_id = p_user_id;
    if v_custom.id is null then raise exception 'Owner custom exercise not found.' using errcode = 'P0002'; end if;
  end if;

  if v_global.id is not null then
    select mapping.* into v_global_mapping
    from private.resolve_muscle_mapping(v_global.id, 'exercise_muscle_mapping_v2', v_now) mapping;
  elsif v_custom.id is not null then
    select mapping.* into v_custom_mapping
    from private.resolve_custom_muscle_mapping(p_user_id, v_custom.id, 'exercise_muscle_mapping_v2', v_now) mapping;
  end if;

  if p_target_type = 'provider_activity' and v_global.id is null then
    v_reason := 'provider_bridge_unavailable';
  elsif p_target_type = 'custom_exercise' and v_custom_mapping.id is null then
    v_reason := 'custom_mapping_unavailable';
  elsif v_global.id is not null and v_global_mapping.id is null then
    v_reason := 'global_mapping_unavailable';
  end if;

  if p_candidate_session_id is not null then
    select * into v_session
    from public.workout_sessions session
    where session.id = p_candidate_session_id
      and session.user_id = p_user_id
      and session.status = 'started'
      and session.plan_day_id is null
    for update;
    if found then
      select snapshot.* into strict v_snapshot
      from public.workout_session_muscle_snapshots snapshot
      where snapshot.workout_session_id = v_session.id and snapshot.user_id = p_user_id;
      perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);
      select item.* into v_item
      from public.workout_session_muscle_snapshot_items item
      where item.snapshot_id = v_snapshot.id and item.item_order = 1;
      v_same_identity := case
        when p_target_type = 'provider_activity' then
          v_item.planned_provider = p_provider and v_item.planned_provider_activity_id = p_identity
        when p_target_type = 'global_exercise' then
          v_item.planned_provider is null and v_item.planned_global_exercise_id = v_global.id
        else v_item.planned_custom_exercise_id = v_custom.id
      end;
      if not coalesce(v_same_identity, false) then
        raise exception 'The active direct workout has a conflicting stable identity.' using errcode = '23514';
      end if;
      return jsonb_build_object('session', to_jsonb(v_session), 'snapshotItem', to_jsonb(v_item), 'resumed', true);
    end if;
  end if;

  select * into v_session
  from public.workout_sessions session
  where session.user_id = p_user_id and session.status = 'started' and session.plan_day_id is null
  order by session.started_at desc, session.id
  limit 1 for update;
  if found then
    select snapshot.* into strict v_snapshot
    from public.workout_session_muscle_snapshots snapshot
    where snapshot.workout_session_id = v_session.id and snapshot.user_id = p_user_id;
    perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);
    select item.* into v_item
    from public.workout_session_muscle_snapshot_items item
    where item.snapshot_id = v_snapshot.id and item.item_order = 1;
    v_same_identity := case
      when p_target_type = 'provider_activity' then
        v_item.planned_provider = p_provider and v_item.planned_provider_activity_id = p_identity
      when p_target_type = 'global_exercise' then
        v_item.planned_provider is null and v_item.planned_global_exercise_id = v_global.id
      else v_item.planned_custom_exercise_id = v_custom.id
    end;
    if coalesce(v_same_identity, false) then
      return jsonb_build_object('session', to_jsonb(v_session), 'snapshotItem', to_jsonb(v_item), 'resumed', true);
    end if;
    raise exception 'Another direct workout is active with a different stable identity.' using errcode = '23514';
  end if;

  v_name := case
    when p_target_type = 'provider_activity' then coalesce(
      nullif(btrim(coalesce(p_display_name, '')), ''), v_global.name, 'External activity'
    )
    else coalesce(v_global.name, v_custom.name, 'Workout')
  end;
  begin
    v_planned_sets := nullif(p_planned_prescription->>'sets', '')::integer;
    if v_planned_sets is not null and v_planned_sets <= 0 then v_planned_sets := null; end if;
  exception when invalid_text_representation then
    v_planned_sets := null;
  end;

  perform set_config('plaivra.direct_session_authoritative_start', '1', true);
  insert into public.workout_sessions (
    user_id, workout_id, workout_name, workout_category, started_at,
    completed_at, duration_minutes, notes, status, source
  ) values (
    p_user_id, v_global.legacy_workout_id, v_name,
    coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Workout'),
    v_now, null, null, null, 'started', 'manual'
  ) returning * into v_session;

  select * into strict v_snapshot
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id = v_session.id and snapshot.user_id = p_user_id;
  if private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id) <> 'v2' then
    raise exception 'New direct workouts must use the V2 snapshot contract.' using errcode = '23514';
  end if;
  v_snapshot_id := v_snapshot.id;

  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot_id::text, true);
  insert into public.workout_session_muscle_snapshot_items (
    snapshot_id, user_id, item_order, activity_name_snapshot,
    planned_target_type, planned_global_exercise_id, planned_custom_exercise_id,
    planned_provider, planned_provider_activity_id,
    planned_mapping_set_id, planned_custom_mapping_set_id,
    planned_mapping_version, planned_mapping_schema_version, planned_mapping_checksum,
    planned_custom_identity_snapshot, planned_custom_mapping_entries,
    planned_prescription, planned_sets, state
  ) values (
    v_snapshot_id, p_user_id, 1, v_name,
    case when v_global.id is not null then 'global_exercise'
         when v_custom.id is not null then 'custom_exercise' end,
    v_global.id, v_custom.id,
    case when p_target_type = 'provider_activity' then p_provider end,
    case when p_target_type = 'provider_activity' then p_identity end,
    v_global_mapping.id, v_custom_mapping.id,
    coalesce(v_global_mapping.mapping_version, v_custom_mapping.mapping_version),
    coalesce(v_global_mapping.schema_version, v_custom_mapping.schema_version),
    coalesce(v_global_mapping.checksum, v_custom_mapping.checksum),
    case when v_custom.id is not null then jsonb_build_object(
      'id', v_custom.id, 'name', v_custom.name, 'equipment', v_custom.equipment,
      'targetMuscle', v_custom.target_muscle
    ) end,
    case when v_custom_mapping.id is not null then private.phase3_custom_mapping_entries(v_custom_mapping.id) end,
    coalesce(p_planned_prescription, '{}'::jsonb), v_planned_sets, 'planned'
  ) returning * into v_item;

  perform private.phase3_refresh_snapshot_completeness(v_snapshot_id, v_reason);
  perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot_id);
  perform set_config('plaivra.direct_session_authoritative_start', '', true);
  return jsonb_build_object('session', to_jsonb(v_session), 'snapshotItem', to_jsonb(v_item), 'resumed', false);
end
$function$;

revoke all on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)
  to authenticated, service_role;

do $postconditions$
declare
  v_rpc oid := to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)');
begin
  if v_rpc is null or not (select prosecdef from pg_proc where oid = v_rpc) then
    raise exception 'V2 direct-session RPC is missing or not SECURITY DEFINER.';
  end if;
  if has_function_privilege('anon', v_rpc, 'EXECUTE')
     or not has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
    raise exception 'V2 direct-session RPC grants drifted.';
  end if;
end
$postconditions$;

commit;
