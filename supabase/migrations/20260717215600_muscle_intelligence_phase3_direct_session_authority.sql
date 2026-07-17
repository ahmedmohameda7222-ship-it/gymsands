begin;

do $preflight$
declare
  v_marker text;
  v_snapshots integer;
  v_items integer;
  v_recent integer;
begin
  if to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null then
    raise exception 'Phase 3 snapshot tables are missing.';
  end if;
  select count(*) into v_snapshots from public.workout_session_muscle_snapshots where source = 'legacy_backfill';
  select count(*) into v_items from public.workout_session_muscle_snapshot_items item join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id where snapshot.source='legacy_backfill';
  if not (
    (v_snapshots = 0 and v_items = 0)
    or (v_snapshots = 9 and v_items = 29)
  ) then
    raise exception 'Phase 3 legacy baseline drifted: % snapshots, % items.', v_snapshots, v_items;
  end if;
  if exists (select 1 from public.workout_session_muscle_snapshots snapshot join public.workout_sessions session on session.id=snapshot.workout_session_id where snapshot.user_id<>session.user_id) then
    raise exception 'Phase 3 snapshot ownership mismatch exists.';
  end if;
  select migration_version into v_marker from public.release_schema_compatibility where singleton;
  if v_marker is distinct from '20260717051011' then
    raise exception 'Compatibility marker drifted before Phase 3 correction: %.', v_marker;
  end if;
  select count(*) into v_recent from public.workout_sessions where created_at >= timestamptz '2026-07-17 19:48:47+00';
  raise notice 'Detected % workout sessions created after the first Phase 3 migration.', v_recent;
end
$preflight$;
do $direct_preflight$
begin
  if to_regprocedure('private.freeze_workout_session_muscle_snapshot_phase3_integrity_v1(uuid,text)') is null then
    raise exception 'Lifecycle/provider correction must precede direct-session authority.';
  end if;
  if to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)') is not null
     or to_regclass('public.workout_sessions_one_active_direct_session_uidx') is not null then
    raise exception 'Direct-session authority appears partially applied.';
  end if;
  if exists (select 1 from public.workout_sessions where status='started' and plan_day_id is null) then
    raise exception 'Unexpected active direct session exists before direct-session authority.';
  end if;
end
$direct_preflight$;

create temporary table phase3_legacy_snapshot_baseline on commit drop as
select id, md5(to_jsonb(snapshot)::text) as row_hash
from public.workout_session_muscle_snapshots snapshot
where source = 'legacy_backfill';

create temporary table phase3_legacy_item_baseline on commit drop as
select item.id, md5(to_jsonb(item)::text) as row_hash
from public.workout_session_muscle_snapshot_items item
join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
where snapshot.source = 'legacy_backfill';

create unique index workout_sessions_one_active_direct_session_uidx
  on public.workout_sessions(user_id)
  where status = 'started' and plan_day_id is null;

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
    where exercise.is_global
      and exercise.is_approved
      and (exercise.id = v_requested_uuid or exercise.legacy_workout_id = v_requested_uuid)
    order by (exercise.id = v_requested_uuid) desc, exercise.id
    limit 1;
    if v_global.id is null then
      raise exception 'Canonical exercise not found.' using errcode = 'P0002';
    end if;
  elsif p_target_type = 'provider_activity' then
    if nullif(btrim(coalesce(p_provider, '')), '') is null then
      raise exception 'Provider identity is required.' using errcode = '22023';
    end if;
    select exercise.* into v_global
    from public.exercise_provider_links link
    join public.exercises exercise
      on exercise.id = link.exercise_id
     and exercise.is_global
     and exercise.is_approved
    where link.provider = p_provider
      and link.provider_activity_id = p_identity
      and link.verification_status = 'verified'
    order by link.verified_at desc nulls last, link.id
    limit 1;
  else
    select custom.* into v_custom
    from public.user_custom_exercises custom
    where custom.id = v_requested_uuid
      and custom.user_id = p_user_id;
    if v_custom.id is null then
      raise exception 'Owner custom exercise not found.' using errcode = 'P0002';
    end if;
  end if;

  if v_global.id is not null then
    select mapping.* into v_global_mapping
    from public.exercise_muscle_mapping_sets mapping
    where mapping.exercise_id = v_global.id
      and mapping.status = 'published'
      and mapping.published_at <= v_now
      and (mapping.retired_at is null or mapping.retired_at > v_now)
    order by mapping.mapping_version desc, mapping.id
    limit 1;
  elsif v_custom.id is not null then
    select mapping.* into v_custom_mapping
    from public.user_custom_exercise_mapping_sets mapping
    where mapping.custom_exercise_id = v_custom.id
      and mapping.user_id = p_user_id
      and mapping.status = 'published'
      and mapping.published_at <= v_now
      and (mapping.retired_at is null or mapping.retired_at > v_now)
    order by mapping.mapping_version desc, mapping.id
    limit 1;
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
    from public.workout_sessions
    where id = p_candidate_session_id
      and user_id = p_user_id
      and status = 'started'
      and plan_day_id is null
    for update;
    if found then
      select item.* into v_item
      from public.workout_session_muscle_snapshot_items item
      join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
      where snapshot.workout_session_id = v_session.id
        and item.item_order = 1;
      v_same_identity := case
        when p_target_type = 'provider_activity' then
          v_item.planned_provider = p_provider
          and v_item.planned_provider_activity_id = p_identity
        when p_target_type = 'global_exercise' then
          v_item.planned_provider is null
          and v_item.planned_global_exercise_id = v_global.id
        else
          v_item.planned_custom_exercise_id = v_custom.id
      end;
      if not coalesce(v_same_identity, false) then
        raise exception 'The active direct workout has a conflicting stable identity.' using errcode = '23514';
      end if;
      return jsonb_build_object('session', to_jsonb(v_session), 'snapshotItem', to_jsonb(v_item), 'resumed', true);
    end if;
  end if;

  select * into v_session
  from public.workout_sessions
  where user_id = p_user_id
    and status = 'started'
    and plan_day_id is null
  order by started_at desc, id
  limit 1
  for update;
  if found then
    select item.* into v_item
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = v_session.id
      and item.item_order = 1;
    v_same_identity := case
      when p_target_type = 'provider_activity' then
        v_item.planned_provider = p_provider
        and v_item.planned_provider_activity_id = p_identity
      when p_target_type = 'global_exercise' then
        v_item.planned_provider is null
        and v_item.planned_global_exercise_id = v_global.id
      else
        v_item.planned_custom_exercise_id = v_custom.id
    end;
    if coalesce(v_same_identity, false) then
      return jsonb_build_object('session', to_jsonb(v_session), 'snapshotItem', to_jsonb(v_item), 'resumed', true);
    end if;
    raise exception 'Another direct workout is active with a different stable identity.' using errcode = '23514';
  end if;

  v_name := case
    when p_target_type = 'provider_activity' then coalesce(
      nullif(btrim(coalesce(p_display_name, '')), ''),
      v_global.name,
      'External activity'
    )
    else coalesce(v_global.name, v_custom.name, 'Workout')
  end;
  begin
    v_planned_sets := nullif(p_planned_prescription->>'sets', '')::integer;
    if v_planned_sets is not null and v_planned_sets <= 0 then
      v_planned_sets := null;
    end if;
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
  )
  returning * into v_session;

  select id into strict v_snapshot_id
  from public.workout_session_muscle_snapshots
  where workout_session_id = v_session.id
    and user_id = p_user_id;

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
      'id', v_custom.id,
      'name', v_custom.name,
      'equipment', v_custom.equipment,
      'targetMuscle', v_custom.target_muscle
    ) end,
    case when v_custom_mapping.id is not null
      then private.phase3_custom_mapping_entries(v_custom_mapping.id) end,
    coalesce(p_planned_prescription, '{}'::jsonb),
    v_planned_sets,
    'planned'
  )
  returning * into v_item;

  perform private.phase3_refresh_snapshot_completeness(v_snapshot_id, v_reason);
  perform set_config('plaivra.direct_session_authoritative_start', '', true);
  return jsonb_build_object('session', to_jsonb(v_session), 'snapshotItem', to_jsonb(v_item), 'resumed', false);
end
$function$;


revoke all on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) to authenticated, service_role;

do $postconditions$
declare v_marker text; v_routine oid;
begin
  if exists (
    select 1 from phase3_legacy_snapshot_baseline baseline
    full join (select id, md5(to_jsonb(snapshot)::text) row_hash from public.workout_session_muscle_snapshots snapshot where source='legacy_backfill') current using (id,row_hash)
    where baseline.id is null or current.id is null
  ) then raise exception 'Legacy Phase 3 snapshots changed.'; end if;
  if exists (
    select 1 from phase3_legacy_item_baseline baseline
    full join (select item.id, md5(to_jsonb(item)::text) row_hash from public.workout_session_muscle_snapshot_items item join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id where snapshot.source='legacy_backfill') current using (id,row_hash)
    where baseline.id is null or current.id is null
  ) then raise exception 'Legacy Phase 3 snapshot items changed.'; end if;
  v_routine := to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)');
  if v_routine is null or not (select prosecdef from pg_proc where oid=v_routine)
     or coalesce((select array_to_string(proconfig, ',') from pg_proc where oid=v_routine),'') not like '%search_path=%' then
    raise exception 'Direct-session RPC is missing or not hardened.';
  end if;
  if has_function_privilege('anon',v_routine,'EXECUTE') or not has_function_privilege('authenticated',v_routine,'EXECUTE') then
    raise exception 'Direct-session RPC grants are incorrect.';
  end if;
  if to_regclass('public.workout_sessions_one_active_direct_session_uidx') is null then raise exception 'Direct-session uniqueness index is missing.'; end if;
  select migration_version into v_marker from public.release_schema_compatibility where singleton;
  if v_marker is distinct from '20260717051011' then raise exception 'Compatibility marker changed.'; end if;
end
$postconditions$;

commit;
