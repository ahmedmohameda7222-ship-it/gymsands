begin;

-- Phase 3 is additive. workout_sessions remains the performed-session root and
-- the existing plan/program tables remain the planning authority.

create table public.workout_session_muscle_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  scheduled_session_id uuid references public.user_workout_sessions(id) on delete set null,
  plan_id uuid references public.user_workout_plans(id) on delete set null,
  plan_day_id uuid references public.user_workout_plan_days(id) on delete set null,
  plan_week_id uuid references public.user_workout_plan_weeks(id) on delete set null,
  plan_session_id uuid references public.user_workout_plan_sessions(id) on delete set null,
  snapshot_schema_version text not null default 'workout_session_muscle_snapshot_v1',
  taxonomy_version text not null default 'muscle_taxonomy_v1',
  mapping_schema_version text not null default 'exercise_muscle_mapping_v1',
  calculation_engine_version text not null default 'muscle_load_resistance_sets_v1',
  threshold_profile_version text not null default 'muscle_load_thresholds_v1',
  result_schema_version text not null default 'muscle_analysis_result_v1',
  workload_model_version text not null default 'resistance_sets_v1',
  prescription_schema_version text not null default 'planned_prescription_v1',
  custom_identity_schema_version text not null default 'custom_exercise_identity_snapshot_v1',
  completeness text not null,
  reason_codes text[] not null default '{}',
  source text not null,
  source_plan_updated_at timestamptz,
  frozen_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint workout_session_muscle_snapshots_session_key unique (workout_session_id),
  constraint workout_session_muscle_snapshots_owner_key unique (id, user_id),
  constraint workout_session_muscle_snapshots_schema_check
    check (snapshot_schema_version = 'workout_session_muscle_snapshot_v1'),
  constraint workout_session_muscle_snapshots_taxonomy_check
    check (taxonomy_version = 'muscle_taxonomy_v1'),
  constraint workout_session_muscle_snapshots_mapping_schema_check
    check (mapping_schema_version = 'exercise_muscle_mapping_v1'),
  constraint workout_session_muscle_snapshots_engine_check
    check (calculation_engine_version = 'muscle_load_resistance_sets_v1'),
  constraint workout_session_muscle_snapshots_threshold_check
    check (threshold_profile_version = 'muscle_load_thresholds_v1'),
  constraint workout_session_muscle_snapshots_result_schema_check
    check (result_schema_version = 'muscle_analysis_result_v1'),
  constraint workout_session_muscle_snapshots_workload_check
    check (workload_model_version = 'resistance_sets_v1'),
  constraint workout_session_muscle_snapshots_completeness_check
    check (completeness in ('complete', 'partial', 'unavailable')),
  constraint workout_session_muscle_snapshots_source_check
    check (source in ('session_start', 'legacy_backfill'))
);

create table public.workout_session_muscle_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  user_id uuid not null,
  source_plan_exercise_id uuid references public.user_workout_plan_exercises(id) on delete set null,
  source_plan_activity_id uuid references public.user_workout_plan_activities(id) on delete set null,
  item_order integer not null,
  phase_slug text,
  phase_name_snapshot text,
  activity_name_snapshot text not null,
  planned_target_type text,
  planned_global_exercise_id uuid references public.exercises(id) on delete restrict,
  planned_custom_exercise_id uuid,
  planned_provider text,
  planned_provider_activity_id text,
  planned_mapping_set_id uuid references public.exercise_muscle_mapping_sets(id) on delete restrict,
  planned_custom_mapping_set_id uuid,
  planned_mapping_version integer,
  planned_mapping_schema_version text,
  planned_mapping_checksum text,
  planned_custom_identity_snapshot jsonb,
  planned_custom_mapping_entries jsonb,
  planned_prescription jsonb not null default '{}'::jsonb,
  planned_sets integer,
  state text not null default 'planned',
  actual_target_type text,
  actual_global_exercise_id uuid references public.exercises(id) on delete restrict,
  actual_custom_exercise_id uuid,
  actual_provider text,
  actual_provider_activity_id text,
  actual_name_snapshot text,
  actual_mapping_set_id uuid references public.exercise_muscle_mapping_sets(id) on delete restrict,
  actual_custom_mapping_set_id uuid,
  actual_mapping_version integer,
  actual_mapping_schema_version text,
  actual_mapping_checksum text,
  actual_custom_identity_snapshot jsonb,
  actual_custom_mapping_entries jsonb,
  replacement_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_session_muscle_snapshot_items_owner_fk
    foreign key (snapshot_id, user_id)
    references public.workout_session_muscle_snapshots(id, user_id)
    on delete cascade,
  constraint workout_session_muscle_snapshot_items_order_key unique (snapshot_id, item_order),
  constraint workout_session_muscle_snapshot_items_order_check check (item_order > 0),
  constraint workout_session_muscle_snapshot_items_state_check
    check (state in ('planned', 'replaced', 'skipped', 'adjusted', 'completed')),
  constraint workout_session_muscle_snapshot_items_planned_target_check
    check (planned_target_type is null or planned_target_type in ('global_exercise', 'custom_exercise')),
  constraint workout_session_muscle_snapshot_items_actual_target_check
    check (actual_target_type is null or actual_target_type in ('global_exercise', 'custom_exercise')),
  constraint workout_session_muscle_snapshot_items_planned_sets_check
    check (planned_sets is null or planned_sets > 0),
  constraint workout_session_muscle_snapshot_items_prescription_check
    check (jsonb_typeof(planned_prescription) = 'object'),
  constraint workout_session_muscle_snapshot_items_planned_custom_entries_check
    check (planned_custom_mapping_entries is null or jsonb_typeof(planned_custom_mapping_entries) = 'array'),
  constraint workout_session_muscle_snapshot_items_actual_custom_entries_check
    check (actual_custom_mapping_entries is null or jsonb_typeof(actual_custom_mapping_entries) = 'array'),
  constraint workout_session_muscle_snapshot_items_planned_mapping_check check (
    (planned_mapping_set_id is null or planned_target_type = 'global_exercise')
    and (planned_custom_mapping_set_id is null or planned_target_type = 'custom_exercise')
  ),
  constraint workout_session_muscle_snapshot_items_actual_mapping_check check (
    (actual_mapping_set_id is null or actual_target_type = 'global_exercise')
    and (actual_custom_mapping_set_id is null or actual_target_type = 'custom_exercise')
  )
);

create unique index workout_session_muscle_snapshot_items_plan_exercise_uidx
  on public.workout_session_muscle_snapshot_items(snapshot_id, source_plan_exercise_id)
  where source_plan_exercise_id is not null;
create index workout_session_muscle_snapshots_owner_time_idx
  on public.workout_session_muscle_snapshots(user_id, frozen_at desc, id);
create index workout_session_muscle_snapshot_items_snapshot_idx
  on public.workout_session_muscle_snapshot_items(snapshot_id, item_order, id);

comment on table public.workout_session_muscle_snapshots is
  'One immutable version envelope for each performed workout session. It does not replace workout_sessions.';
comment on table public.workout_session_muscle_snapshot_items is
  'Frozen planned activity identities and exact mapping references, plus controlled performed-state/replacement facts.';
comment on column public.workout_session_muscle_snapshot_items.planned_custom_mapping_entries is
  'Compact owner-scoped custom mapping copy retained because custom exercise deletion may cascade its source mapping.';

create or replace function private.phase3_custom_mapping_entries(p_mapping_set_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'muscleId', entry.muscle_id,
    'role', entry.role,
    'contribution', entry.contribution::double precision,
    'sideScope', entry.side_scope,
    'sortOrder', entry.sort_order
  ) order by private.muscle_taxonomy_display_order(entry.muscle_id), entry.muscle_id), '[]'::jsonb)
  from public.user_custom_exercise_mapping_entries entry
  where entry.mapping_set_id = p_mapping_set_id
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

  select snapshot.id into v_snapshot_id
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id = v_session.id;
  if found then
    return v_snapshot_id;
  end if;

  if v_session.plan_id is not null then
    select plan.updated_at into v_source_plan_updated_at
    from public.user_workout_plans plan
    where plan.id = v_session.plan_id and plan.user_id = v_session.user_id;
  end if;

  insert into public.workout_session_muscle_snapshots (
    user_id, workout_session_id, scheduled_session_id, plan_id, plan_day_id,
    plan_week_id, plan_session_id, completeness, reason_codes, source,
    source_plan_updated_at, frozen_at
  ) values (
    v_session.user_id, v_session.id, v_session.scheduled_session_id, v_session.plan_id,
    v_session.plan_day_id, v_session.plan_week_id, v_session.plan_session_id,
    'unavailable', array['snapshot_building']::text[], 'session_start',
    v_source_plan_updated_at, v_session.started_at
  )
  on conflict (workout_session_id) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select id into strict v_snapshot_id
    from public.workout_session_muscle_snapshots
    where workout_session_id = v_session.id;
    return v_snapshot_id;
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
    resolved.phase_slug, resolved.phase_name_snapshot,
    resolved.exercise_name,
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
    from public.exercise_muscle_mapping_sets mapping
    where mapping.exercise_id = resolved.global_exercise_id
      and mapping.status in ('published', 'retired')
      and mapping.published_at <= v_session.started_at
    order by mapping.mapping_version desc, mapping.id
    limit 1
  ) global_mapping on true
  left join lateral (
    select mapping.*
    from public.user_custom_exercise_mapping_sets mapping
    where mapping.custom_exercise_id = resolved.custom_exercise_id
      and mapping.user_id = v_session.user_id
      and mapping.status in ('published', 'retired')
      and mapping.published_at <= v_session.started_at
    order by mapping.mapping_version desc, mapping.id
    limit 1
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

-- Backfill only stable IDs already carried by performed logs/plan bridges. Names
-- are copied for display but are never used to resolve an exercise or mapping.
insert into public.workout_session_muscle_snapshots (
  user_id, workout_session_id, scheduled_session_id, plan_id, plan_day_id,
  plan_week_id, plan_session_id, completeness, reason_codes, source,
  source_plan_updated_at, frozen_at
)
select
  session.user_id, session.id, session.scheduled_session_id, session.plan_id,
  session.plan_day_id, session.plan_week_id, session.plan_session_id,
  'unavailable', array['legacy_backfill_pending_classification']::text[],
  'legacy_backfill', plan.updated_at, session.started_at
from public.workout_sessions session
left join public.user_workout_plans plan
  on plan.id = session.plan_id and plan.user_id = session.user_id
on conflict (workout_session_id) do nothing;

with legacy_logs as (
  select
    snapshot.id as snapshot_id,
    snapshot.user_id,
    snapshot.frozen_at,
    log.plan_exercise_id,
    log.plan_activity_id,
    coalesce(log.exercise_order, 100000 + row_number() over (
      partition by log.workout_session_id
      order by log.plan_exercise_id nulls last, log.exercise_name, min(log.id::text)
    )::integer) as item_order,
    min(log.exercise_name) as exercise_name,
    max(log.planned_sets) as planned_sets,
    count(*) filter (where log.completed_at is not null) as completed_sets,
    session.status,
    plan_exercise.source_workout_id,
    case
      when plan_exercise.source_workout_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then plan_exercise.source_workout_id::uuid
      else null
    end as source_uuid
  from public.workout_session_muscle_snapshots snapshot
  join public.workout_sessions session on session.id = snapshot.workout_session_id
  join public.exercise_logs log on log.workout_session_id = session.id
  left join public.user_workout_plan_exercises plan_exercise on plan_exercise.id = log.plan_exercise_id
  where snapshot.source = 'legacy_backfill'
  group by snapshot.id, snapshot.user_id, snapshot.frozen_at, log.workout_session_id,
    log.plan_exercise_id, log.plan_activity_id, log.exercise_order, log.exercise_name,
    session.status, plan_exercise.source_workout_id
), resolved as (
  select legacy_log.*, global_exercise.id as global_exercise_id, custom_exercise.id as custom_exercise_id
  from legacy_logs legacy_log
  left join public.exercises global_exercise
    on global_exercise.id = legacy_log.source_uuid and global_exercise.is_global and global_exercise.is_approved
  left join public.user_custom_exercises custom_exercise
    on custom_exercise.id = legacy_log.source_uuid and custom_exercise.user_id = legacy_log.user_id
)
insert into public.workout_session_muscle_snapshot_items (
  snapshot_id, user_id, source_plan_exercise_id, source_plan_activity_id,
  item_order, activity_name_snapshot, planned_target_type,
  planned_global_exercise_id, planned_custom_exercise_id,
  planned_mapping_set_id, planned_custom_mapping_set_id,
  planned_mapping_version, planned_mapping_schema_version, planned_mapping_checksum,
  planned_custom_identity_snapshot, planned_custom_mapping_entries,
  planned_prescription, planned_sets, state
)
select
  resolved.snapshot_id, resolved.user_id, resolved.plan_exercise_id, resolved.plan_activity_id,
  resolved.item_order, resolved.exercise_name,
  case when resolved.global_exercise_id is not null then 'global_exercise'
       when resolved.custom_exercise_id is not null then 'custom_exercise' end,
  resolved.global_exercise_id, resolved.custom_exercise_id,
  global_mapping.id, custom_mapping.id,
  coalesce(global_mapping.mapping_version, custom_mapping.mapping_version),
  coalesce(global_mapping.schema_version, custom_mapping.schema_version),
  coalesce(global_mapping.checksum, custom_mapping.checksum),
  case when resolved.custom_exercise_id is not null then jsonb_build_object(
    'id', custom_identity.id, 'name', custom_identity.name,
    'equipment', custom_identity.equipment, 'targetMuscle', custom_identity.target_muscle
  ) end,
  case when custom_mapping.id is not null then private.phase3_custom_mapping_entries(custom_mapping.id) end,
  jsonb_strip_nulls(jsonb_build_object('sets', resolved.planned_sets)),
  resolved.planned_sets,
  case
    when resolved.status = 'skipped' or resolved.completed_sets = 0 then 'skipped'
    when resolved.planned_sets is not null and resolved.completed_sets <> resolved.planned_sets then 'adjusted'
    else 'completed'
  end
from resolved
left join public.user_custom_exercises custom_identity
  on custom_identity.id = resolved.custom_exercise_id and custom_identity.user_id = resolved.user_id
left join lateral (
  select mapping.* from public.exercise_muscle_mapping_sets mapping
  where mapping.exercise_id = resolved.global_exercise_id
    and mapping.status in ('published', 'retired')
    and mapping.published_at <= resolved.frozen_at
  order by mapping.mapping_version desc, mapping.id limit 1
) global_mapping on true
left join lateral (
  select mapping.* from public.user_custom_exercise_mapping_sets mapping
  where mapping.custom_exercise_id = resolved.custom_exercise_id
    and mapping.user_id = resolved.user_id
    and mapping.status in ('published', 'retired')
    and mapping.published_at <= resolved.frozen_at
  order by mapping.mapping_version desc, mapping.id limit 1
) custom_mapping on true
on conflict (snapshot_id, item_order) do nothing;

with counts as (
  select snapshot.id,
    count(item.id) as total,
    count(item.id) filter (
      where item.planned_mapping_set_id is not null or item.planned_custom_mapping_set_id is not null
    ) as mapped
  from public.workout_session_muscle_snapshots snapshot
  left join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
  where snapshot.source = 'legacy_backfill'
  group by snapshot.id
)
update public.workout_session_muscle_snapshots snapshot
set completeness = case
      when counts.total = 0 or counts.mapped = 0 then 'unavailable'
      when counts.total = counts.mapped then 'complete'
      else 'partial'
    end,
    reason_codes = case
      when counts.total = 0 then array['legacy_no_stable_items']::text[]
      when counts.mapped = counts.total then '{}'::text[]
      else array['legacy_unresolved_stable_identity_or_mapping']::text[]
    end
from counts
where snapshot.id = counts.id;

create or replace function private.enforce_workout_session_muscle_snapshot_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if current_setting('plaivra.session_snapshot_mutation_id', true) = v_snapshot_id::text then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'Workout session muscle snapshots are immutable.' using errcode = '23514';
end
$function$;

create or replace function private.enforce_workout_session_muscle_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot_id uuid := case when tg_op = 'DELETE' then old.snapshot_id else new.snapshot_id end;
begin
  if current_setting('plaivra.session_snapshot_mutation_id', true) = v_snapshot_id::text then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'Workout session muscle snapshot items may change only through authoritative session functions.' using errcode = '23514';
end
$function$;

create trigger workout_session_muscle_snapshots_immutable
before update or delete on public.workout_session_muscle_snapshots
for each row execute function private.enforce_workout_session_muscle_snapshot_immutability();
create trigger workout_session_muscle_snapshot_items_guard
before insert or update or delete on public.workout_session_muscle_snapshot_items
for each row execute function private.enforce_workout_session_muscle_item_mutation();

create or replace function private.freeze_workout_session_muscle_snapshot_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform set_config('plaivra.session_snapshot_mutation_id', '', true);
  perform private.freeze_workout_session_muscle_snapshot(new.id, 'session_start');
  return new;
end
$function$;

create trigger freeze_workout_session_muscle_snapshot_on_insert
after insert on public.workout_sessions
for each row execute function private.freeze_workout_session_muscle_snapshot_on_insert();

create or replace function private.reconcile_workout_session_muscle_snapshot_on_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot_id uuid;
begin
  if new.status not in ('completed', 'skipped') or old.status = new.status then return new; end if;
  select id into v_snapshot_id
  from public.workout_session_muscle_snapshots
  where workout_session_id = new.id and user_id = new.user_id;
  if v_snapshot_id is null then
    raise exception 'Workout session snapshot is missing.' using errcode = '23514';
  end if;
  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot_id::text, true);
  update public.workout_session_muscle_snapshot_items item
  set state = case
      when item.state = 'replaced' then 'replaced'
      when new.status = 'skipped' then 'skipped'
      when coalesce((
        select count(*) filter (where log.completed_at is not null)::integer
        from public.exercise_logs log
        where log.workout_session_id = new.id
          and (
            (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
            or (item.source_plan_exercise_id is null and log.exercise_order = item.item_order)
          )
      ), 0) = 0 then 'skipped'
      when item.planned_sets is not null and (
        select count(*) filter (where log.completed_at is not null)::integer
        from public.exercise_logs log
        where log.workout_session_id = new.id
          and (
            (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
            or (item.source_plan_exercise_id is null and log.exercise_order = item.item_order)
          )
      ) <> item.planned_sets then 'adjusted'
      else 'completed'
    end,
    updated_at = clock_timestamp()
  where item.snapshot_id = v_snapshot_id;
  return new;
end
$function$;

create trigger reconcile_workout_session_muscle_snapshot_on_terminal
after update of status on public.workout_sessions
for each row execute function private.reconcile_workout_session_muscle_snapshot_on_terminal();

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
  v_session public.workout_sessions%rowtype;
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_item public.workout_session_muscle_snapshot_items%rowtype;
  v_global public.exercises%rowtype;
  v_custom public.user_custom_exercises%rowtype;
  v_global_mapping public.exercise_muscle_mapping_sets%rowtype;
  v_custom_mapping public.user_custom_exercise_mapping_sets%rowtype;
  v_provider_activity_id text;
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
  select * into v_item from public.workout_session_muscle_snapshot_items
  where snapshot_id = v_snapshot.id and source_plan_exercise_id = p_plan_exercise_id for update;
  if not found then raise exception 'Snapshot activity not found.' using errcode = 'P0002'; end if;

  if p_replacement_type = 'global_exercise' then
    begin
      select * into v_global from public.exercises
      where id = p_replacement_identity::uuid and is_global and is_approved;
    exception when invalid_text_representation then
      raise exception 'Global replacement identity must be a UUID.' using errcode = '22023';
    end;
  elsif p_replacement_type = 'provider_activity' then
    if nullif(btrim(coalesce(p_provider, '')), '') is null then
      raise exception 'Provider identity is required.' using errcode = '22023';
    end if;
    select exercise.* into v_global
    from public.exercise_provider_links link
    join public.exercises exercise on exercise.id = link.exercise_id
    where link.provider = p_provider
      and link.provider_activity_id = p_replacement_identity
      and link.verification_status = 'verified'
      and exercise.is_global and exercise.is_approved;
    v_provider_activity_id := p_replacement_identity;
  else
    begin
      select * into v_custom from public.user_custom_exercises
      where id = p_replacement_identity::uuid and user_id = p_user_id;
    exception when invalid_text_representation then
      raise exception 'Custom replacement identity must be a UUID.' using errcode = '22023';
    end;
  end if;

  if p_replacement_type in ('global_exercise', 'provider_activity') then
    if v_global.id is null then raise exception 'Replacement exercise not found.' using errcode = 'P0002'; end if;
    select * into v_global_mapping from public.exercise_muscle_mapping_sets
    where exercise_id = v_global.id and status = 'published'
    order by mapping_version desc, id limit 1;
    if v_global_mapping.id is null then
      raise exception 'Replacement exercise has no published muscle mapping.' using errcode = '23514';
    end if;
    if v_item.actual_global_exercise_id = v_global.id
       and v_item.actual_mapping_checksum = v_global_mapping.checksum then
      return to_jsonb(v_item);
    end if;
  else
    if v_custom.id is null then raise exception 'Replacement custom exercise not found.' using errcode = 'P0002'; end if;
    select * into v_custom_mapping from public.user_custom_exercise_mapping_sets
    where custom_exercise_id = v_custom.id and user_id = p_user_id and status = 'published'
    order by mapping_version desc, id limit 1;
    if v_custom_mapping.id is null then
      raise exception 'Replacement custom exercise has no published muscle mapping.' using errcode = '23514';
    end if;
    if v_item.actual_custom_exercise_id = v_custom.id
       and v_item.actual_mapping_checksum = v_custom_mapping.checksum then
      return to_jsonb(v_item);
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
      replacement_recorded_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = v_item.id
  returning * into v_item;
  return to_jsonb(v_item);
end
$function$;

alter table public.workout_session_muscle_snapshots enable row level security;
alter table public.workout_session_muscle_snapshot_items enable row level security;

revoke all on table public.workout_session_muscle_snapshots from public, anon, authenticated;
revoke all on table public.workout_session_muscle_snapshot_items from public, anon, authenticated;
grant select on table public.workout_session_muscle_snapshots to authenticated, service_role;
grant select on table public.workout_session_muscle_snapshot_items to authenticated, service_role;
grant insert, update, delete on table public.workout_session_muscle_snapshots to service_role;
grant insert, update, delete on table public.workout_session_muscle_snapshot_items to service_role;

create policy workout_session_muscle_snapshots_member_select
on public.workout_session_muscle_snapshots for select to authenticated
using (user_id = (select auth.uid()));
create policy workout_session_muscle_snapshot_items_member_select
on public.workout_session_muscle_snapshot_items for select to authenticated
using (user_id = (select auth.uid()));

revoke all on function public.replace_workout_session_snapshot_item_atomic(uuid, uuid, uuid, text, text, text)
  from public, anon;
grant execute on function public.replace_workout_session_snapshot_item_atomic(uuid, uuid, uuid, text, text, text)
  to authenticated, service_role;
revoke all on function private.phase3_custom_mapping_entries(uuid) from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot(uuid, text) from public, anon, authenticated;
revoke all on function private.enforce_workout_session_muscle_snapshot_immutability() from public, anon, authenticated;
revoke all on function private.enforce_workout_session_muscle_item_mutation() from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot_on_insert() from public, anon, authenticated;
revoke all on function private.reconcile_workout_session_muscle_snapshot_on_terminal() from public, anon, authenticated;

do $postconditions$
declare
  v_session_count bigint;
  v_snapshot_count bigint;
begin
  select count(*) into v_session_count from public.workout_sessions;
  select count(*) into v_snapshot_count from public.workout_session_muscle_snapshots;
  if v_snapshot_count <> v_session_count then
    raise exception 'Phase 3 snapshot backfill did not cover every performed session.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.workout_session_muscle_snapshots snapshot
    join public.workout_sessions session on session.id = snapshot.workout_session_id
    where snapshot.user_id <> session.user_id
  ) then
    raise exception 'Phase 3 snapshot ownership mismatch.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.workout_session_muscle_snapshot_items item
    where item.planned_mapping_set_id is not null
      and not exists (
        select 1 from public.exercise_muscle_mapping_sets mapping
        where mapping.id = item.planned_mapping_set_id
          and mapping.mapping_version = item.planned_mapping_version
          and mapping.schema_version = item.planned_mapping_schema_version
          and mapping.checksum = item.planned_mapping_checksum
      )
  ) then
    raise exception 'Phase 3 global mapping reference drift was detected.' using errcode = '23514';
  end if;
  raise notice 'Phase 3 legacy backfill: sessions=%, snapshots=%, complete=%, partial=%, unavailable=%',
    v_session_count, v_snapshot_count,
    (select count(*) from public.workout_session_muscle_snapshots where completeness = 'complete'),
    (select count(*) from public.workout_session_muscle_snapshots where completeness = 'partial'),
    (select count(*) from public.workout_session_muscle_snapshots where completeness = 'unavailable');
end
$postconditions$;

commit;
