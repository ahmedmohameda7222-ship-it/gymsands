begin;

do $preflight$
begin
  if to_regclass('public.exercise_muscle_mapping_sets') is null
     or to_regclass('public.user_custom_exercise_mapping_sets') is null
     or to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null then
    raise exception 'Phase 4A correction prerequisites are missing.';
  end if;
  if to_regprocedure('private.freeze_workout_session_muscle_snapshot_phase3_integrity_v1(uuid,text)') is null
     or to_regprocedure('private.freeze_workout_session_muscle_snapshot(uuid,text)') is null
     or to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)') is null then
    raise exception 'Required Phase 3 runtime boundaries are missing.';
  end if;
end
$preflight$;

-- One published mapping is allowed for each target and schema version. The
-- transaction keeps the uniqueness boundary atomic while replacing the legacy
-- target-only indexes.
drop index public.exercise_muscle_mapping_sets_current_uidx;
create unique index exercise_muscle_mapping_sets_current_uidx
  on public.exercise_muscle_mapping_sets(exercise_id, schema_version)
  where status = 'published';

drop index public.user_custom_exercise_mapping_sets_current_uidx;
create unique index user_custom_exercise_mapping_sets_current_uidx
  on public.user_custom_exercise_mapping_sets(custom_exercise_id, schema_version)
  where status = 'published';

create or replace function private.enforce_global_mapping_set_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status = 'draft' or not exists (select 1 from public.exercises where id = old.exercise_id) then
      return old;
    end if;
    raise exception 'Published or retired global mapping sets are immutable.' using errcode = '23514';
  end if;

  if new.schema_version is distinct from old.schema_version then
    raise exception 'Global mapping schema version is immutable after insert.' using errcode = '23514';
  end if;

  if old.status = 'draft' then
    if new.status = 'draft' then return new; end if;
    if new.status = 'published'
       and current_setting('plaivra.muscle_mapping_publication_id', true) = old.id::text
       and new.published_at is not null then
      return new;
    end if;
    raise exception 'Global mappings must be published through the atomic publication function.' using errcode = '23514';
  end if;

  if old.status = 'published'
     and new.status = 'retired'
     and new.retired_at is not null
     and new.id = old.id
     and new.exercise_id = old.exercise_id
     and new.mapping_version = old.mapping_version
     and new.source = old.source
     and new.schema_version = old.schema_version
     and new.checksum = old.checksum
     and new.published_at = old.published_at then
    return new;
  end if;

  raise exception 'Published or retired global mapping sets are immutable.' using errcode = '23514';
end
$function$;

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
begin
  perform public.assert_workout_actor(p_user_id);
  if p_replacement_type not in ('global_exercise', 'provider_activity', 'custom_exercise')
     or nullif(btrim(coalesce(p_replacement_identity, '')), '') is null then
    raise exception 'A stable replacement identity is required; names are not accepted.' using errcode = '22023';
  end if;

  select * into v_session from public.workout_sessions
  where id = p_session_id and user_id = p_user_id for update;
  if not found then raise exception 'Workout session not found.' using errcode = 'P0002'; end if;
  if v_session.status <> 'started' then
    raise exception 'Only an active workout can record a replacement.' using errcode = '23514';
  end if;

  select * into strict v_snapshot from public.workout_session_muscle_snapshots
  where workout_session_id = p_session_id and user_id = p_user_id;
  perform private.assert_phase3_snapshot_v1(v_snapshot.id);
  select * into v_item from public.workout_session_muscle_snapshot_items
  where snapshot_id = v_snapshot.id and source_plan_exercise_id = p_plan_exercise_id for update;
  if not found then raise exception 'Snapshot activity not found.' using errcode = 'P0002'; end if;

  -- Identity equality, not the latest mapping, defines an idempotent retry.
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
    select * into v_global from public.exercises
    where id = v_requested_id and is_global and is_approved;
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
    select * into v_custom from public.user_custom_exercises
    where id = v_requested_id and user_id = p_user_id;
  end if;

  if p_replacement_type in ('global_exercise', 'provider_activity') then
    if v_global.id is null then raise exception 'Replacement exercise not found.' using errcode = 'P0002'; end if;
    select mapping.* into v_global_mapping
    from private.resolve_muscle_mapping(v_global.id, 'exercise_muscle_mapping_v1', v_now) mapping;
    if v_global_mapping.id is null then
      raise exception 'Replacement exercise has no published V1 muscle mapping.' using errcode = '23514';
    end if;
  else
    if v_custom.id is null then raise exception 'Replacement custom exercise not found.' using errcode = 'P0002'; end if;
    select mapping.* into v_custom_mapping
    from private.resolve_custom_muscle_mapping(p_user_id, v_custom.id, 'exercise_muscle_mapping_v1', v_now) mapping;
    if v_custom_mapping.id is null then
      raise exception 'Replacement custom exercise has no published V1 muscle mapping.' using errcode = '23514';
    end if;
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
  perform private.assert_phase3_snapshot_v1(v_snapshot.id);
  return to_jsonb(v_item);
end
$function$;

-- Phase 3 is intentionally pinned to the version-one mapping contract. These
-- trusted resolvers are the only current mapping selectors used by snapshot
-- creation, direct starts, replacements, and replacement eligibility.
create or replace function private.resolve_muscle_mapping(
  p_exercise_id uuid,
  p_schema_version text,
  p_at timestamptz
)
returns setof public.exercise_muscle_mapping_sets
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_schema_version not in ('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2') then
    raise exception 'Unsupported muscle mapping schema.' using errcode = '23514';
  end if;
  return query select mapping.*
  from public.exercise_muscle_mapping_sets mapping
  where mapping.exercise_id = p_exercise_id
    and mapping.schema_version = p_schema_version
    and mapping.status in ('published', 'retired')
    and mapping.published_at <= p_at
    and (mapping.retired_at is null or mapping.retired_at > p_at)
  order by mapping.mapping_version desc, mapping.id
  limit 1;
end
$function$;

create or replace function private.resolve_custom_muscle_mapping(
  p_user_id uuid,
  p_custom_exercise_id uuid,
  p_schema_version text,
  p_at timestamptz
)
returns setof public.user_custom_exercise_mapping_sets
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_schema_version not in ('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2') then
    raise exception 'Unsupported muscle mapping schema.' using errcode = '23514';
  end if;
  return query select mapping.*
  from public.user_custom_exercise_mapping_sets mapping
  where mapping.user_id = p_user_id
    and mapping.custom_exercise_id = p_custom_exercise_id
    and mapping.schema_version = p_schema_version
    and mapping.status in ('published', 'retired')
    and mapping.published_at <= p_at
    and (mapping.retired_at is null or mapping.retired_at > p_at)
  order by mapping.mapping_version desc, mapping.id
  limit 1;
end
$function$;

create or replace function private.freeze_workout_session_muscle_snapshot_phase3_integrity_v1(
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
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_snapshot_id uuid;
  v_total integer;
  v_mapped integer;
  v_source_plan_updated_at timestamptz;
begin
  if p_source <> 'session_start' then
    raise exception 'Only the session-start boundary may use this snapshot function.' using errcode = '23514';
  end if;

  select * into v_session
  from public.workout_sessions
  where id = p_session_id
  for update;
  if not found then
    raise exception 'Workout session not found.' using errcode = 'P0002';
  end if;

  select * into v_snapshot
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id = v_session.id;
  if found then
    if v_snapshot.snapshot_schema_version <> 'workout_session_muscle_snapshot_v1'
       or v_snapshot.mapping_schema_version <> 'exercise_muscle_mapping_v1' then
      raise exception 'Phase 3 supports only the V1 snapshot version bundle.' using errcode = '23514';
    end if;
    return v_snapshot.id;
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
    'workout_session_muscle_snapshot_v1', 'muscle_taxonomy_v1',
    'exercise_muscle_mapping_v1', 'muscle_load_resistance_sets_v1',
    'muscle_load_thresholds_v1', 'muscle_analysis_result_v1', 'resistance_sets_v1',
    'unavailable', array['snapshot_building']::text[], 'session_start',
    v_source_plan_updated_at, v_session.started_at
  )
  on conflict (workout_session_id) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select * into strict v_snapshot
    from public.workout_session_muscle_snapshots
    where workout_session_id = v_session.id;
    if v_snapshot.snapshot_schema_version <> 'workout_session_muscle_snapshot_v1'
       or v_snapshot.mapping_schema_version <> 'exercise_muscle_mapping_v1' then
      raise exception 'Phase 3 supports only the V1 snapshot version bundle.' using errcode = '23514';
    end if;
    return v_snapshot.id;
  end if;

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
      order by link.verified_at desc, link.id
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
      'exercise_muscle_mapping_v1',
      v_session.started_at
    ) mapping
  ) global_mapping on true
  left join lateral (
    select mapping.*
    from private.resolve_custom_muscle_mapping(
      v_session.user_id,
      resolved.custom_exercise_id,
      'exercise_muscle_mapping_v1',
      v_session.started_at
    ) mapping
  ) custom_mapping on true
  order by resolved.sort_order, resolved.id;

  select count(*), count(*) filter (
    where item.planned_mapping_set_id is not null or item.planned_custom_mapping_set_id is not null
  ) into v_total, v_mapped
  from public.workout_session_muscle_snapshot_items item
  where item.snapshot_id = v_snapshot_id;

  update public.workout_session_muscle_snapshots
  set completeness = case
        when v_total = 0 or v_mapped = 0 then 'unavailable'
        when v_mapped = v_total then 'complete'
        else 'partial'
      end,
      reason_codes = case
        when v_total = 0 then array['no_planned_items']::text[]
        when v_mapped = v_total then '{}'::text[]
        else array['unresolved_identity_or_mapping']::text[]
      end
  where id = v_snapshot_id;

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
  v_session public.workout_sessions%rowtype;
  v_snapshot_id uuid;
begin
  if p_source not in ('session_start', 'terminal_insert') then
    raise exception 'Unsupported workout-session snapshot boundary.' using errcode = '23514';
  end if;

  select * into v_session
  from public.workout_sessions
  where id = p_session_id
  for update;
  if not found then
    raise exception 'Workout session not found.' using errcode = 'P0002';
  end if;

  v_snapshot_id := private.freeze_workout_session_muscle_snapshot_phase3_integrity_v1(
    p_session_id,
    'session_start'
  );
  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot_id::text, true);

  -- Preserve trusted provider identity while keeping the Phase 3 mapping
  -- reference explicitly on V1.
  with external_items as (
    select
      item.id,
      activity.catalog_activity_id,
      link.exercise_id,
      mapping.id as mapping_set_id,
      mapping.mapping_version,
      mapping.schema_version,
      mapping.checksum
    from public.workout_session_muscle_snapshot_items item
    join public.user_workout_plan_activities activity
      on activity.id = item.source_plan_activity_id
    left join lateral (
      select provider_link.exercise_id
      from public.exercise_provider_links provider_link
      join public.exercises exercise
        on exercise.id = provider_link.exercise_id
       and exercise.is_global
       and exercise.is_approved
      where provider_link.provider = 'plaivra_activity_catalog'
        and provider_link.provider_activity_id = activity.catalog_activity_id
        and provider_link.verification_status = 'verified'
      order by provider_link.verified_at desc nulls last, provider_link.id
      limit 1
    ) link on true
    left join lateral (
      select candidate.*
      from private.resolve_muscle_mapping(
        link.exercise_id,
        'exercise_muscle_mapping_v1',
        v_session.started_at
      ) candidate
    ) mapping on true
    where item.snapshot_id = v_snapshot_id
      and activity.catalog_source = 'external'
      and nullif(btrim(activity.catalog_activity_id), '') is not null
  )
  update public.workout_session_muscle_snapshot_items item
  set planned_target_type = case when external_items.exercise_id is not null then 'global_exercise' end,
      planned_global_exercise_id = external_items.exercise_id,
      planned_custom_exercise_id = null,
      planned_provider = 'plaivra_activity_catalog',
      planned_provider_activity_id = external_items.catalog_activity_id,
      planned_mapping_set_id = external_items.mapping_set_id,
      planned_custom_mapping_set_id = null,
      planned_mapping_version = external_items.mapping_version,
      planned_mapping_schema_version = external_items.schema_version,
      planned_mapping_checksum = external_items.checksum,
      planned_custom_identity_snapshot = null,
      planned_custom_mapping_entries = null,
      updated_at = clock_timestamp()
  from external_items
  where item.id = external_items.id;

  if p_source = 'terminal_insert' then
    update public.workout_session_muscle_snapshots
    set source = 'terminal_insert'
    where id = v_snapshot_id;
  end if;

  perform private.phase3_refresh_snapshot_completeness(
    v_snapshot_id,
    case when p_source = 'terminal_insert' then 'terminal_insert' end
  );
  return v_snapshot_id;
end
$function$;

create or replace function private.enforce_custom_mapping_set_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status = 'draft' or not exists (
      select 1 from public.user_custom_exercises where id = old.custom_exercise_id and user_id = old.user_id
    ) then
      return old;
    end if;
    raise exception 'Published or retired custom mapping sets are immutable.' using errcode = '23514';
  end if;

  if new.schema_version is distinct from old.schema_version then
    raise exception 'Custom mapping schema version is immutable after insert.' using errcode = '23514';
  end if;

  if old.status = 'draft' then
    if new.status = 'draft' then return new; end if;
    if new.status = 'published'
       and current_setting('plaivra.muscle_mapping_publication_id', true) = old.id::text
       and new.published_at is not null then
      return new;
    end if;
    raise exception 'Custom mappings must be published through the atomic publication function.' using errcode = '23514';
  end if;

  if old.status = 'published'
     and new.status = 'retired'
     and new.retired_at is not null
     and new.id = old.id
     and new.user_id = old.user_id
     and new.custom_exercise_id = old.custom_exercise_id
     and new.mapping_version = old.mapping_version
     and new.schema_version = old.schema_version
     and new.checksum = old.checksum
     and new.published_at = old.published_at then
    return new;
  end if;

  raise exception 'Published or retired custom mapping sets are immutable.' using errcode = '23514';
end
$function$;

create or replace function public.publish_exercise_muscle_mapping_set(p_mapping_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target public.exercise_muscle_mapping_sets%rowtype;
  expected_checksum text;
begin
  if not (
    coalesce((select private.is_admin()), false)
    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false)
  ) then
    raise exception 'Only a Plaivra administrator may publish global muscle mappings.' using errcode = '42501';
  end if;

  select * into target
  from public.exercise_muscle_mapping_sets
  where id = p_mapping_set_id
  for update;
  if not found then raise exception 'Global mapping set not found.' using errcode = 'P0002'; end if;
  if target.status = 'published' then return target.id; end if;
  if target.status <> 'draft' then raise exception 'Only a draft global mapping can be published.' using errcode = '23514'; end if;

  perform 1 from public.exercises where id = target.exercise_id for update;
  if not found then raise exception 'Canonical exercise not found.' using errcode = '23503'; end if;
  if not exists (select 1 from public.exercise_muscle_mapping_entries where mapping_set_id = target.id) then
    raise exception 'A published global mapping requires at least one entry.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.exercise_muscle_mapping_entries where mapping_set_id = target.id and role = 'primary') then
    raise exception 'A published global mapping requires at least one primary entry.' using errcode = '23514';
  end if;
  expected_checksum := private.exercise_muscle_mapping_checksum(target.id);
  if expected_checksum is distinct from target.checksum then
    raise exception 'Global mapping checksum does not match canonical content.' using errcode = '23514';
  end if;

  update public.exercise_muscle_mapping_sets
  set status = 'retired', retired_at = now(), updated_at = now()
  where exercise_id = target.exercise_id
    and schema_version = target.schema_version
    and status = 'published'
    and id <> target.id;

  perform set_config('plaivra.muscle_mapping_publication_id', target.id::text, true);
  update public.exercise_muscle_mapping_sets
  set status = 'published', published_at = now(), retired_at = null, updated_at = now()
  where id = target.id;
  return target.id;
end
$function$;

create or replace function public.publish_user_custom_exercise_mapping_set(p_mapping_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target public.user_custom_exercise_mapping_sets%rowtype;
  expected_checksum text;
  actor_is_admin boolean;
begin
  select * into target
  from public.user_custom_exercise_mapping_sets
  where id = p_mapping_set_id
  for update;
  if not found then raise exception 'Custom mapping set not found.' using errcode = 'P0002'; end if;

  actor_is_admin := coalesce((select private.is_admin()), false)
    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false);
  if not actor_is_admin and (select auth.uid()) is distinct from target.user_id then
    raise exception 'Custom mapping ownership is required.' using errcode = '42501';
  end if;
  if target.status = 'published' then return target.id; end if;
  if target.status <> 'draft' then raise exception 'Only a draft custom mapping can be published.' using errcode = '23514'; end if;

  perform 1
  from public.user_custom_exercises
  where id = target.custom_exercise_id and user_id = target.user_id
  for update;
  if not found then raise exception 'Owned custom exercise not found.' using errcode = '23503'; end if;
  if not exists (select 1 from public.user_custom_exercise_mapping_entries where mapping_set_id = target.id) then
    raise exception 'A published custom mapping requires at least one entry.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.user_custom_exercise_mapping_entries where mapping_set_id = target.id and role = 'primary') then
    raise exception 'A published custom mapping requires at least one primary entry.' using errcode = '23514';
  end if;
  expected_checksum := private.user_custom_exercise_mapping_checksum(target.id);
  if expected_checksum is distinct from target.checksum then
    raise exception 'Custom mapping checksum does not match canonical content.' using errcode = '23514';
  end if;

  update public.user_custom_exercise_mapping_sets
  set status = 'retired', retired_at = now(), updated_at = now()
  where custom_exercise_id = target.custom_exercise_id
    and schema_version = target.schema_version
    and status = 'published'
    and id <> target.id;

  perform set_config('plaivra.muscle_mapping_publication_id', target.id::text, true);
  update public.user_custom_exercise_mapping_sets
  set status = 'published', published_at = now(), retired_at = null, updated_at = now()
  where id = target.id;
  return target.id;
end
$function$;

create or replace function private.phase3_custom_mapping_entries(p_mapping_set_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_schema_version text;
  v_entries jsonb;
begin
  select mapping.schema_version into v_schema_version
  from public.user_custom_exercise_mapping_sets mapping
  where mapping.id = p_mapping_set_id;
  if not found then
    raise exception 'Custom mapping set not found.' using errcode = 'P0002';
  end if;
  if v_schema_version <> 'exercise_muscle_mapping_v1' then
    raise exception 'Phase 3 supports only exercise_muscle_mapping_v1.' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'muscleId', entry.muscle_id,
    'role', entry.role,
    'contribution', entry.contribution::double precision,
    'sideScope', entry.side_scope,
    'sortOrder', entry.sort_order
  ) order by private.muscle_taxonomy_display_order(entry.muscle_id), entry.muscle_id), '[]'::jsonb)
  into v_entries
  from public.user_custom_exercise_mapping_entries entry
  where entry.mapping_set_id = p_mapping_set_id;
  return v_entries;
end
$function$;

create or replace function private.assert_phase3_snapshot_v1(p_snapshot_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
begin
  select * into v_snapshot
  from public.workout_session_muscle_snapshots
  where id = p_snapshot_id;
  if not found then
    raise exception 'Workout session snapshot is missing.' using errcode = '23514';
  end if;
  if v_snapshot.snapshot_schema_version <> 'workout_session_muscle_snapshot_v1'
     or v_snapshot.taxonomy_version <> 'muscle_taxonomy_v1'
     or v_snapshot.mapping_schema_version <> 'exercise_muscle_mapping_v1'
     or v_snapshot.calculation_engine_version <> 'muscle_load_resistance_sets_v1'
     or v_snapshot.threshold_profile_version <> 'muscle_load_thresholds_v1'
     or v_snapshot.result_schema_version <> 'muscle_analysis_result_v1'
     or v_snapshot.workload_model_version <> 'resistance_sets_v1' then
    raise exception 'Phase 3 supports only the V1 snapshot version bundle.' using errcode = '23514';
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
        or (item.planned_mapping_schema_version is not null and item.planned_mapping_schema_version <> 'exercise_muscle_mapping_v1')
        or (item.actual_mapping_schema_version is not null and item.actual_mapping_schema_version <> 'exercise_muscle_mapping_v1')
      )
  ) then
    raise exception 'Phase 3 snapshot items must reference only V1 mappings.' using errcode = '23514';
  end if;
end
$function$;

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
    from private.resolve_muscle_mapping(v_global.id, 'exercise_muscle_mapping_v1', v_now) mapping;
  elsif v_custom.id is not null then
    select mapping.* into v_custom_mapping
    from private.resolve_custom_muscle_mapping(p_user_id, v_custom.id, 'exercise_muscle_mapping_v1', v_now) mapping;
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
      v_snapshot_id := v_item.snapshot_id;
      perform private.assert_phase3_snapshot_v1(v_snapshot_id);
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
    v_snapshot_id := v_item.snapshot_id;
    perform private.assert_phase3_snapshot_v1(v_snapshot_id);
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
  perform private.assert_phase3_snapshot_v1(v_snapshot_id);

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

  perform private.assert_phase3_snapshot_v1(v_snapshot_id);
  perform private.phase3_refresh_snapshot_completeness(v_snapshot_id, v_reason);
  perform set_config('plaivra.direct_session_authoritative_start', '', true);
  return jsonb_build_object('session', to_jsonb(v_session), 'snapshotItem', to_jsonb(v_item), 'resumed', false);
end
$function$;

create or replace function public.get_workout_replacement_candidate_eligibility(
  p_user_id uuid,
  p_candidates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_candidate jsonb;
  v_results jsonb := '[]'::jsonb;
  v_key text;
  v_type text;
  v_identity text;
  v_provider text;
  v_uuid uuid;
  v_global_id uuid;
  v_custom_id uuid;
  v_eligible boolean;
  v_reason text;
begin
  perform public.assert_workout_actor(p_user_id);
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > 100 then
    raise exception 'Replacement candidates must be a bounded JSON array.' using errcode = '22023';
  end if;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    v_key := v_candidate->>'key';
    v_type := v_candidate->>'targetType';
    v_identity := v_candidate->>'identity';
    v_provider := v_candidate->>'provider';
    v_uuid := null;
    v_global_id := null;
    v_custom_id := null;
    v_eligible := false;
    v_reason := 'unsupported_identity';

    if v_type in ('global_exercise', 'custom_exercise') then
      begin
        v_uuid := v_identity::uuid;
      exception when invalid_text_representation then
        v_reason := 'invalid_identity';
      end;
    end if;

    if v_type = 'global_exercise' and v_uuid is not null then
      select exercise.id into v_global_id
      from public.exercises exercise
      where exercise.is_global
        and exercise.is_approved
        and (exercise.id = v_uuid or exercise.legacy_workout_id = v_uuid)
      order by (exercise.id = v_uuid) desc, exercise.id
      limit 1;
      v_eligible := v_global_id is not null
        and exists (
          select 1 from private.resolve_muscle_mapping(v_global_id, 'exercise_muscle_mapping_v1', v_now)
        );
      v_reason := case
        when v_global_id is null then 'canonical_exercise_unavailable'
        when not v_eligible then 'published_mapping_unavailable'
        else null
      end;
    elsif v_type = 'provider_activity' then
      select exercise.id into v_global_id
      from public.exercise_provider_links link
      join public.exercises exercise
        on exercise.id = link.exercise_id
       and exercise.is_global
       and exercise.is_approved
      where link.provider = v_provider
        and link.provider_activity_id = v_identity
        and link.verification_status = 'verified'
      order by link.verified_at desc nulls last, link.id
      limit 1;
      v_eligible := v_global_id is not null
        and exists (
          select 1 from private.resolve_muscle_mapping(v_global_id, 'exercise_muscle_mapping_v1', v_now)
        );
      v_reason := case
        when v_global_id is null then 'provider_bridge_unavailable'
        when not v_eligible then 'published_mapping_unavailable'
        else null
      end;
    elsif v_type = 'custom_exercise' and v_uuid is not null then
      select custom.id into v_custom_id
      from public.user_custom_exercises custom
      where custom.id = v_uuid and custom.user_id = p_user_id;
      v_eligible := v_custom_id is not null
        and exists (
          select 1
          from private.resolve_custom_muscle_mapping(
            p_user_id,
            v_custom_id,
            'exercise_muscle_mapping_v1',
            v_now
          )
        );
      v_reason := case
        when v_custom_id is null then 'custom_exercise_unavailable'
        when not v_eligible then 'published_mapping_unavailable'
        else null
      end;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', v_key,
      'eligible', v_eligible,
      'reason', v_reason
    ));
  end loop;
  return v_results;
end
$function$;

create or replace function private.phase3_reconcile_terminal_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_snapshot_id uuid;
  v_completed_log_count integer;
begin
  select * into v_session
  from public.workout_sessions
  where id = p_session_id
  for update;
  if not found then
    raise exception 'Workout session not found.' using errcode = 'P0002';
  end if;
  if v_session.status not in ('completed', 'skipped') then
    return;
  end if;

  select id into v_snapshot_id
  from public.workout_session_muscle_snapshots
  where workout_session_id = v_session.id
    and user_id = v_session.user_id;
  if v_snapshot_id is null then
    raise exception 'Workout session snapshot is missing.' using errcode = '23514';
  end if;
  perform private.assert_phase3_snapshot_v1(v_snapshot_id);

  select count(*) filter (where completed_at is not null)
  into v_completed_log_count
  from public.exercise_logs
  where workout_session_id = v_session.id;

  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot_id::text, true);
  update public.workout_session_muscle_snapshot_items item
  set state = case
        when v_session.status = 'skipped' or v_completed_log_count = 0 then 'skipped'
        when item.planned_sets is not null and (
          select count(*) filter (where log.completed_at is not null)::integer
          from public.exercise_logs log
          where log.workout_session_id = v_session.id
            and (
              (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
              or
              (item.source_plan_exercise_id is null and log.plan_exercise_id is null and log.exercise_order = item.item_order)
            )
        ) <> item.planned_sets then 'adjusted'
        else 'completed'
      end,
      updated_at = clock_timestamp()
  where item.snapshot_id = v_snapshot_id;

  perform private.assert_phase3_snapshot_v1(v_snapshot_id);
  perform private.phase3_refresh_snapshot_completeness(
    v_snapshot_id,
    case
      when v_session.status = 'skipped' then 'session_skipped'
      when v_completed_log_count = 0 then 'completed_without_performed_logs'
    end
  );
end
$function$;

create or replace function public.get_workout_session_frozen_global_mappings(
  p_user_id uuid,
  p_session_id uuid
)
returns table (
  id uuid,
  exercise_id uuid,
  mapping_version integer,
  schema_version text,
  checksum text,
  entries jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform public.assert_workout_actor(p_user_id);
  if not exists (
    select 1
    from public.workout_sessions session
    where session.id = p_session_id and session.user_id = p_user_id
  ) then
    raise exception 'Workout session not found.' using errcode = 'P0002';
  end if;

  return query
  select mapping.id, mapping.exercise_id, mapping.mapping_version, mapping.schema_version, mapping.checksum,
         coalesce(jsonb_agg(jsonb_build_object(
           'muscleId', entry.muscle_id, 'role', entry.role, 'contribution', entry.contribution,
           'sideScope', entry.side_scope, 'sortOrder', entry.sort_order
         ) order by private.muscle_mapping_display_order(mapping.schema_version, entry.muscle_id), entry.muscle_id)
         filter (where entry.id is not null), '[]'::jsonb)
  from public.workout_session_muscle_snapshots snapshot
  join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
  join public.exercise_muscle_mapping_sets mapping on mapping.id in (item.planned_mapping_set_id, item.actual_mapping_set_id)
  left join public.exercise_muscle_mapping_entries entry on entry.mapping_set_id = mapping.id
  where snapshot.user_id = p_user_id
    and snapshot.workout_session_id = p_session_id
    and mapping.schema_version = snapshot.mapping_schema_version
    and mapping.status in ('published', 'retired')
  group by mapping.id, mapping.exercise_id, mapping.mapping_version, mapping.schema_version, mapping.checksum
  order by mapping.id;
end
$function$;

revoke all on function private.resolve_muscle_mapping(uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function private.resolve_custom_muscle_mapping(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function private.phase3_custom_mapping_entries(uuid) from public, anon, authenticated;
revoke all on function private.assert_phase3_snapshot_v1(uuid) from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot_phase3_integrity_v1(uuid,text) from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot(uuid,text) from public, anon, authenticated;
revoke all on function private.phase3_reconcile_terminal_session(uuid) from public, anon, authenticated;

revoke all on function public.publish_exercise_muscle_mapping_set(uuid) from public, anon, authenticated;
revoke all on function public.publish_user_custom_exercise_mapping_set(uuid) from public, anon, authenticated;
revoke all on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.get_workout_replacement_candidate_eligibility(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.get_workout_session_frozen_global_mappings(uuid,uuid) from public, anon, authenticated;

grant execute on function public.publish_exercise_muscle_mapping_set(uuid) to authenticated, service_role;
grant execute on function public.publish_user_custom_exercise_mapping_set(uuid) to authenticated, service_role;
grant execute on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) to authenticated, service_role;
grant execute on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text) to authenticated, service_role;
grant execute on function public.get_workout_replacement_candidate_eligibility(uuid,jsonb) to authenticated, service_role;
grant execute on function public.get_workout_session_frozen_global_mappings(uuid,uuid) to authenticated, service_role;

do $postconditions$
declare
  v_definition text;
begin
  select pg_get_indexdef(indexrelid) into v_definition
  from pg_index
  where indexrelid = 'public.exercise_muscle_mapping_sets_current_uidx'::regclass;
  if v_definition !~* '\(exercise_id, schema_version\).*status = ''published''' then
    raise exception 'Global published mapping uniqueness is not schema-version aware.';
  end if;
  select pg_get_indexdef(indexrelid) into v_definition
  from pg_index
  where indexrelid = 'public.user_custom_exercise_mapping_sets_current_uidx'::regclass;
  if v_definition !~* '\(custom_exercise_id, schema_version\).*status = ''published''' then
    raise exception 'Custom published mapping uniqueness is not schema-version aware.';
  end if;
  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
    where snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v1'
      and (
        snapshot.mapping_schema_version <> 'exercise_muscle_mapping_v1'
        or (item.planned_mapping_schema_version is not null and item.planned_mapping_schema_version <> 'exercise_muscle_mapping_v1')
        or (item.actual_mapping_schema_version is not null and item.actual_mapping_schema_version <> 'exercise_muscle_mapping_v1')
      )
  ) then
    raise exception 'A V1 snapshot contains a non-V1 mapping reference.';
  end if;
  if exists (
    select 1
    from public.workout_session_muscle_snapshots
    where snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
  ) then
    raise exception 'Phase 4A correction must not create V2 snapshots.';
  end if;
end
$postconditions$;

commit;
