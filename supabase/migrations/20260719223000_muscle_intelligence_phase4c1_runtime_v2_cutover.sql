begin;

-- Phase 4C.1 is a forward-only runtime cutover. Existing V1 snapshot envelopes and
-- their mapping references are intentionally preserved without rewrite.
do $preflight$
declare
  v_marker text;
begin
  if to_regclass('public.exercise_logs') is null
     or to_regclass('public.workout_sessions') is null
     or to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null
     or to_regclass('public.exercise_muscle_mapping_sets') is null
     or to_regclass('public.user_custom_exercise_mapping_sets') is null then
    raise exception 'Phase 4C.1 requires the completed Train and Muscle Intelligence foundations.';
  end if;

  if to_regprocedure('private.freeze_workout_session_muscle_snapshot_phase3_integrity_v1(uuid,text)') is null
     or to_regprocedure('private.resolve_muscle_mapping(uuid,text,timestamptz)') is null
     or to_regprocedure('private.resolve_custom_muscle_mapping(uuid,uuid,text,timestamptz)') is null
     or to_regprocedure('public.start_or_resume_workout_session_atomic(uuid,uuid,uuid)') is null
     or to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)') is null
     or to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)') is null then
    raise exception 'Required workout session runtime authorities are missing.';
  end if;

  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted before Phase 4C.1: %.', v_marker;
  end if;

  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    where snapshot.snapshot_schema_version <> 'workout_session_muscle_snapshot_v1'
  ) then
    raise exception 'Unexpected non-V1 session snapshots exist before the V2 runtime cutover.';
  end if;

  if not exists (
    select 1
    from public.exercise_muscle_mapping_sets mapping
    where mapping.schema_version = 'exercise_muscle_mapping_v2'
      and mapping.status = 'published'
  ) then
    raise exception 'Published V2 mappings are required before the runtime cutover.';
  end if;
end
$preflight$;

create temporary table phase4c1_runtime_baseline on commit drop as
select
  (select migration_version from public.release_schema_compatibility where singleton) as marker,
  (select count(*) from public.workout_sessions) as session_count,
  (select count(*) from public.workout_session_muscle_snapshots) as snapshot_count,
  (select count(*) from public.workout_session_muscle_snapshot_items) as snapshot_item_count,
  (select count(*) from public.workout_session_muscle_snapshots where snapshot_schema_version = 'workout_session_muscle_snapshot_v1') as v1_snapshot_count,
  (select count(*) from public.exercise_logs) as exercise_log_count;

alter table public.exercise_logs
  add column set_type text;

update public.exercise_logs log
set set_type = coalesce(
  lower((regexp_match(coalesce(log.notes, ''), '(^|[|])[[:space:]]*type[[:space:]]*:[[:space:]]*(normal|warmup|working|failure|drop)([[:space:]]*[|]|$)', 'i'))[2]),
  'normal'
);

alter table public.exercise_logs
  alter column set_type set not null;

alter table public.exercise_logs
  add constraint exercise_logs_set_type_check
  check (set_type in ('normal', 'warmup', 'working', 'failure', 'drop')) not valid;
alter table public.exercise_logs validate constraint exercise_logs_set_type_check;

alter table public.workout_session_muscle_snapshot_items
  add column performed_total_sets integer,
  add column performed_qualifying_sets integer,
  add column performed_frozen_at timestamptz;

alter table public.workout_session_muscle_snapshot_items
  add constraint workout_session_muscle_snapshot_items_performed_total_check
  check (performed_total_sets is null or performed_total_sets >= 0) not valid;
alter table public.workout_session_muscle_snapshot_items
  validate constraint workout_session_muscle_snapshot_items_performed_total_check;

alter table public.workout_session_muscle_snapshot_items
  add constraint workout_session_muscle_snapshot_items_performed_qualifying_check
  check (performed_qualifying_sets is null or performed_qualifying_sets >= 0) not valid;
alter table public.workout_session_muscle_snapshot_items
  validate constraint workout_session_muscle_snapshot_items_performed_qualifying_check;

alter table public.workout_session_muscle_snapshot_items
  add constraint workout_session_muscle_snapshot_items_performed_relation_check
  check (
    (performed_total_sets is null and performed_qualifying_sets is null and performed_frozen_at is null)
    or
    (performed_total_sets is not null and performed_qualifying_sets is not null and performed_frozen_at is not null
      and performed_qualifying_sets <= performed_total_sets)
  ) not valid;
alter table public.workout_session_muscle_snapshot_items
  validate constraint workout_session_muscle_snapshot_items_performed_relation_check;

create or replace function private.workout_set_type(
  p_notes text,
  p_explicit text default null
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_type text := lower(nullif(btrim(coalesce(p_explicit, '')), ''));
  v_match text[];
begin
  if v_type in ('normal', 'warmup', 'working', 'failure', 'drop') then
    return v_type;
  end if;
  v_match := regexp_match(
    coalesce(p_notes, ''),
    '(^|[|])[[:space:]]*type[[:space:]]*:[[:space:]]*(normal|warmup|working|failure|drop)([[:space:]]*[|]|$)',
    'i'
  );
  return coalesce(lower(v_match[2]), 'normal');
end
$function$;

create or replace function private.normalize_exercise_log_set_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.set_type := private.workout_set_type(new.notes, new.set_type);
  return new;
end
$function$;

drop trigger if exists exercise_logs_normalize_set_type on public.exercise_logs;
create trigger exercise_logs_normalize_set_type
before insert or update of notes, set_type on public.exercise_logs
for each row execute function private.normalize_exercise_log_set_type();

create or replace function private.enforce_terminal_exercise_log_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_status text;
  v_new_status text;
  v_old_session uuid := case when tg_op = 'INSERT' then null else old.workout_session_id end;
  v_new_session uuid := case when tg_op = 'DELETE' then null else new.workout_session_id end;
begin
  if v_old_session is not null then
    select session.status into v_old_status
    from public.workout_sessions session
    where session.id = v_old_session;
  end if;
  if v_new_session is not null then
    select session.status into v_new_status
    from public.workout_sessions session
    where session.id = v_new_session;
  end if;

  -- Child cleanup caused by an already-authorized parent deletion remains valid.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if v_old_session is not null
     and v_old_status is distinct from 'started'
     and current_setting('plaivra.terminal_exercise_log_mutation_session_id', true) is distinct from v_old_session::text then
    raise exception 'Completed workout set logs are immutable.' using errcode = '23514';
  end if;
  if v_new_session is not null
     and v_new_status is distinct from 'started'
     and current_setting('plaivra.terminal_exercise_log_mutation_session_id', true) is distinct from v_new_session::text then
    raise exception 'Completed workout set logs are immutable.' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

drop trigger if exists exercise_logs_terminal_immutable on public.exercise_logs;
create trigger exercise_logs_terminal_immutable
before insert or update or delete on public.exercise_logs
for each row execute function private.enforce_terminal_exercise_log_immutability();

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

create or replace function private.phase3_reconcile_terminal_session(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_snapshot_version text;
  v_completed_log_count integer;
  v_frozen_at timestamptz;
begin
  select * into v_session
  from public.workout_sessions session
  where session.id = p_session_id
  for update;
  if not found then raise exception 'Workout session not found.' using errcode = 'P0002'; end if;
  if v_session.status not in ('completed', 'skipped') then return; end if;

  select * into strict v_snapshot
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id = v_session.id and snapshot.user_id = v_session.user_id;
  v_snapshot_version := private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);

  select count(*) filter (where log.completed_at is not null)
  into v_completed_log_count
  from public.exercise_logs log
  where log.workout_session_id = v_session.id;

  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot.id::text, true);

  if v_snapshot_version = 'v1' then
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
    where item.snapshot_id = v_snapshot.id;
  else
    if exists (
      select 1
      from public.workout_session_muscle_snapshot_items item
      where item.snapshot_id = v_snapshot.id and item.performed_frozen_at is not null
    ) then
      if exists (
        select 1
        from public.workout_session_muscle_snapshot_items item
        where item.snapshot_id = v_snapshot.id
          and (item.performed_total_sets is null or item.performed_qualifying_sets is null or item.performed_frozen_at is null)
      ) then
        raise exception 'V2 performed workload is only partially frozen.' using errcode = '23514';
      end if;
      return;
    end if;

    v_frozen_at := coalesce(v_session.completed_at, v_session.skipped_at, clock_timestamp());
    update public.workout_session_muscle_snapshot_items item
    set performed_total_sets = case when v_session.status = 'skipped' then 0 else (
          select count(*) filter (where log.completed_at is not null)::integer
          from public.exercise_logs log
          where log.workout_session_id = v_session.id
            and (
              (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
              or
              (item.source_plan_exercise_id is null and log.plan_exercise_id is null and log.exercise_order = item.item_order)
            )
        ) end,
        performed_qualifying_sets = case when v_session.status = 'skipped' then 0 else (
          select count(*) filter (where log.completed_at is not null and log.set_type <> 'warmup')::integer
          from public.exercise_logs log
          where log.workout_session_id = v_session.id
            and (
              (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
              or
              (item.source_plan_exercise_id is null and log.plan_exercise_id is null and log.exercise_order = item.item_order)
            )
        ) end,
        performed_frozen_at = v_frozen_at,
        state = case
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
    where item.snapshot_id = v_snapshot.id;
  end if;

  perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);
  perform private.phase3_refresh_snapshot_completeness(
    v_snapshot.id,
    case
      when v_session.status = 'skipped' then 'session_skipped'
      when v_completed_log_count = 0 then 'completed_without_performed_logs'
    end
  );
end
$function$;

-- Preserve the reviewed RPC ACLs and hardened execution boundary.
revoke all on function private.workout_set_type(text,text) from public, anon, authenticated;
revoke all on function private.assert_workout_session_muscle_snapshot_supported(uuid) from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot_v2(uuid,text) from public, anon, authenticated;

revoke all on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)
  to authenticated, service_role;

revoke all on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)
  to authenticated, service_role;

-- The compatibility marker is deliberately unchanged until the coordinated release.
do $postconditions$
declare
  v_baseline phase4c1_runtime_baseline%rowtype;
  v_marker text;
begin
  select * into strict v_baseline from phase4c1_runtime_baseline;
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;

  if v_marker is distinct from v_baseline.marker then
    raise exception 'Compatibility marker changed during Phase 4C.1 implementation.';
  end if;
  if (select count(*) from public.workout_sessions) is distinct from v_baseline.session_count
     or (select count(*) from public.workout_session_muscle_snapshots) is distinct from v_baseline.snapshot_count
     or (select count(*) from public.workout_session_muscle_snapshot_items) is distinct from v_baseline.snapshot_item_count
     or (select count(*) from public.exercise_logs) is distinct from v_baseline.exercise_log_count then
    raise exception 'Existing workout data row counts changed during the V2 runtime cutover.';
  end if;
  if (select count(*) from public.workout_session_muscle_snapshots where snapshot_schema_version = 'workout_session_muscle_snapshot_v1')
       is distinct from v_baseline.v1_snapshot_count then
    raise exception 'Existing V1 snapshot envelopes changed during the cutover.';
  end if;
  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    where snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
  ) then
    raise exception 'The migration itself must not create V2 session snapshots.';
  end if;
  if exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    where item.performed_total_sets is not null
       or item.performed_qualifying_sets is not null
       or item.performed_frozen_at is not null
  ) then
    raise exception 'Historical snapshot items were rewritten with performed workload.';
  end if;
  if exists (select 1 from public.exercise_logs where set_type is null) then
    raise exception 'Structured workout set type backfill is incomplete.';
  end if;
  if to_regprocedure('private.assert_workout_session_muscle_snapshot_supported(uuid)') is null
     or to_regprocedure('private.freeze_workout_session_muscle_snapshot_v2(uuid,text)') is null then
    raise exception 'Phase 4C.1 version-aware snapshot functions are missing.';
  end if;
end
$postconditions$;

commit;
