begin;

do $preflight$
begin
  if to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null then
    raise exception 'Phase 3 snapshot tables must exist before applying integrity corrections.';
  end if;
  if to_regprocedure('private.freeze_workout_session_muscle_snapshot(uuid,text)') is null then
    raise exception 'Phase 3 snapshot freeze function is missing.';
  end if;
end
$preflight$;

-- Preserve the applied implementation as an internal primitive. The public
-- trigger boundary below corrects its mapping selection without rewriting the
-- applied migration and never revisits an already-frozen snapshot on resume.
alter function private.freeze_workout_session_muscle_snapshot(uuid, text)
  rename to freeze_workout_session_muscle_snapshot_phase3_initial;

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

  v_snapshot_id := private.freeze_workout_session_muscle_snapshot_phase3_initial(p_session_id, p_source);
  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot_id::text, true);

  with corrected as (
    select
      item.id,
      global_mapping.id as global_mapping_id,
      global_mapping.mapping_version as global_mapping_version,
      global_mapping.schema_version as global_mapping_schema_version,
      global_mapping.checksum as global_mapping_checksum,
      custom_mapping.id as custom_mapping_id,
      custom_mapping.mapping_version as custom_mapping_version,
      custom_mapping.schema_version as custom_mapping_schema_version,
      custom_mapping.checksum as custom_mapping_checksum
    from public.workout_session_muscle_snapshot_items item
    left join lateral (
      select mapping.*
      from public.exercise_muscle_mapping_sets mapping
      where mapping.exercise_id = item.planned_global_exercise_id
        and mapping.status = 'published'
        and mapping.published_at <= v_session.started_at
      order by mapping.mapping_version desc, mapping.id
      limit 1
    ) global_mapping on true
    left join lateral (
      select mapping.*
      from public.user_custom_exercise_mapping_sets mapping
      where mapping.custom_exercise_id = item.planned_custom_exercise_id
        and mapping.user_id = v_session.user_id
        and mapping.status = 'published'
        and mapping.published_at <= v_session.started_at
      order by mapping.mapping_version desc, mapping.id
      limit 1
    ) custom_mapping on true
    where item.snapshot_id = v_snapshot_id
  )
  update public.workout_session_muscle_snapshot_items item
  set planned_mapping_set_id = corrected.global_mapping_id,
      planned_custom_mapping_set_id = corrected.custom_mapping_id,
      planned_mapping_version = coalesce(corrected.global_mapping_version, corrected.custom_mapping_version),
      planned_mapping_schema_version = coalesce(corrected.global_mapping_schema_version, corrected.custom_mapping_schema_version),
      planned_mapping_checksum = coalesce(corrected.global_mapping_checksum, corrected.custom_mapping_checksum),
      planned_custom_mapping_entries = case
        when corrected.custom_mapping_id is not null
          then private.phase3_custom_mapping_entries(corrected.custom_mapping_id)
        else null
      end,
      updated_at = clock_timestamp()
  from corrected
  where item.id = corrected.id;

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

-- A mapping retired before an existing session started was not active at that
-- historical boundary. This also closes the short production window between
-- the initial Phase 3 migration and this correction. Remove only the unprovable
-- reference; retain the stable identity and explicit incomplete classification.
do $legacy_correction$
declare
  target record;
  v_total integer;
  v_mapped integer;
begin
  for target in
    select snapshot.id, snapshot.source
    from public.workout_session_muscle_snapshots snapshot
    order by snapshot.id
  loop
    perform set_config('plaivra.session_snapshot_mutation_id', target.id::text, true);

    update public.workout_session_muscle_snapshot_items item
    set planned_mapping_set_id = null,
        planned_mapping_version = null,
        planned_mapping_schema_version = null,
        planned_mapping_checksum = null,
        updated_at = clock_timestamp()
    from public.workout_session_muscle_snapshots snapshot,
         public.exercise_muscle_mapping_sets mapping
    where item.snapshot_id = target.id
      and snapshot.id = item.snapshot_id
      and mapping.id = item.planned_mapping_set_id
      and (
        mapping.published_at > snapshot.frozen_at
        or (mapping.retired_at is not null and mapping.retired_at <= snapshot.frozen_at)
      );

    update public.workout_session_muscle_snapshot_items item
    set planned_custom_mapping_set_id = null,
        planned_mapping_version = null,
        planned_mapping_schema_version = null,
        planned_mapping_checksum = null,
        planned_custom_mapping_entries = null,
        updated_at = clock_timestamp()
    from public.workout_session_muscle_snapshots snapshot,
         public.user_custom_exercise_mapping_sets mapping
    where item.snapshot_id = target.id
      and snapshot.id = item.snapshot_id
      and mapping.id = item.planned_custom_mapping_set_id
      and (
        mapping.published_at > snapshot.frozen_at
        or (mapping.retired_at is not null and mapping.retired_at <= snapshot.frozen_at)
      );

    select count(*), count(*) filter (
      where item.planned_mapping_set_id is not null or item.planned_custom_mapping_set_id is not null
    ) into v_total, v_mapped
    from public.workout_session_muscle_snapshot_items item
    where item.snapshot_id = target.id;

    update public.workout_session_muscle_snapshots
    set completeness = case
          when v_total = 0 or v_mapped = 0 then 'unavailable'
          when v_mapped = v_total then 'complete'
          else 'partial'
        end,
        reason_codes = case
          when v_total = 0 and target.source = 'legacy_backfill' then array['legacy_no_stable_items']::text[]
          when v_total = 0 then array['no_planned_items']::text[]
          when v_mapped = v_total then '{}'::text[]
          when target.source = 'legacy_backfill' then array['legacy_unresolved_stable_identity_or_mapping']::text[]
          else array['unresolved_identity_or_mapping']::text[]
        end
    where id = target.id;
  end loop;
end
$legacy_correction$;

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
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'scheduled_session_id' - 'plan_id' - 'plan_day_id' - 'plan_week_id' - 'plan_session_id')
         = (to_jsonb(old) - 'scheduled_session_id' - 'plan_id' - 'plan_day_id' - 'plan_week_id' - 'plan_session_id')
     and (
       new.scheduled_session_id is not distinct from old.scheduled_session_id
       or (new.scheduled_session_id is null and old.scheduled_session_id is not null
           and not exists (select 1 from public.user_workout_sessions parent where parent.id = old.scheduled_session_id))
     )
     and (
       new.plan_id is not distinct from old.plan_id
       or (new.plan_id is null and old.plan_id is not null
           and not exists (select 1 from public.user_workout_plans parent where parent.id = old.plan_id))
     )
     and (
       new.plan_day_id is not distinct from old.plan_day_id
       or (new.plan_day_id is null and old.plan_day_id is not null
           and not exists (select 1 from public.user_workout_plan_days parent where parent.id = old.plan_day_id))
     )
     and (
       new.plan_week_id is not distinct from old.plan_week_id
       or (new.plan_week_id is null and old.plan_week_id is not null
           and not exists (select 1 from public.user_workout_plan_weeks parent where parent.id = old.plan_week_id))
     )
     and (
       new.plan_session_id is not distinct from old.plan_session_id
       or (new.plan_session_id is null and old.plan_session_id is not null
           and not exists (select 1 from public.user_workout_plan_sessions parent where parent.id = old.plan_session_id))
     ) then
    return new;
  end if;
  if tg_op = 'DELETE'
     and (
       not exists (select 1 from public.workout_sessions session where session.id = old.workout_session_id)
       or not exists (select 1 from public.profiles profile where profile.id = old.user_id)
     ) then
    return old;
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
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'source_plan_exercise_id' - 'source_plan_activity_id')
         = (to_jsonb(old) - 'source_plan_exercise_id' - 'source_plan_activity_id')
     and (
       new.source_plan_exercise_id is not distinct from old.source_plan_exercise_id
       or (new.source_plan_exercise_id is null and old.source_plan_exercise_id is not null
           and not exists (select 1 from public.user_workout_plan_exercises parent where parent.id = old.source_plan_exercise_id))
     )
     and (
       new.source_plan_activity_id is not distinct from old.source_plan_activity_id
       or (new.source_plan_activity_id is null and old.source_plan_activity_id is not null
           and not exists (select 1 from public.user_workout_plan_activities parent where parent.id = old.source_plan_activity_id))
     ) then
    return new;
  end if;
  if tg_op = 'DELETE'
     and not exists (
       select 1 from public.workout_session_muscle_snapshots snapshot where snapshot.id = old.snapshot_id
     ) then
    return old;
  end if;
  raise exception 'Workout session muscle snapshot items may change only through authoritative session functions.' using errcode = '23514';
end
$function$;

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
  select * into v_item from public.workout_session_muscle_snapshot_items
  where snapshot_id = v_snapshot.id and source_plan_exercise_id = p_plan_exercise_id for update;
  if not found then raise exception 'Snapshot activity not found.' using errcode = 'P0002'; end if;

  -- Identity equality, not the latest mapping, defines an idempotent retry.
  -- Check it before current catalog/mapping resolution so provider removal,
  -- deactivation, deletion, or later publication cannot rewrite accepted history.
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
    select * into v_global_mapping from public.exercise_muscle_mapping_sets
    where exercise_id = v_global.id and status = 'published'
    order by mapping_version desc, id limit 1;
    if v_global_mapping.id is null then
      raise exception 'Replacement exercise has no published muscle mapping.' using errcode = '23514';
    end if;
  else
    if v_custom.id is null then raise exception 'Replacement custom exercise not found.' using errcode = 'P0002'; end if;
    select * into v_custom_mapping from public.user_custom_exercise_mapping_sets
    where custom_exercise_id = v_custom.id and user_id = p_user_id and status = 'published'
    order by mapping_version desc, id limit 1;
    if v_custom_mapping.id is null then
      raise exception 'Replacement custom exercise has no published muscle mapping.' using errcode = '23514';
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

alter table public.workout_session_muscle_snapshot_items
  add constraint workout_session_muscle_snapshot_items_planned_mapping_bundle_check
  check (
    (planned_mapping_set_id is null and planned_custom_mapping_set_id is null
      and planned_mapping_version is null and planned_mapping_schema_version is null
      and planned_mapping_checksum is null and planned_custom_mapping_entries is null)
    or
    (planned_mapping_set_id is not null and planned_custom_mapping_set_id is null
      and planned_target_type = 'global_exercise' and planned_global_exercise_id is not null
      and planned_mapping_version is not null and planned_mapping_schema_version is not null
      and planned_mapping_checksum is not null and planned_custom_mapping_entries is null)
    or
    (planned_mapping_set_id is null and planned_custom_mapping_set_id is not null
      and planned_target_type = 'custom_exercise' and planned_custom_exercise_id is not null
      and planned_mapping_version is not null and planned_mapping_schema_version is not null
      and planned_mapping_checksum is not null and jsonb_typeof(planned_custom_mapping_entries) = 'array')
  ) not valid;
alter table public.workout_session_muscle_snapshot_items
  validate constraint workout_session_muscle_snapshot_items_planned_mapping_bundle_check;

alter table public.workout_session_muscle_snapshot_items
  add constraint workout_session_muscle_snapshot_items_actual_mapping_bundle_check
  check (
    (actual_mapping_set_id is null and actual_custom_mapping_set_id is null
      and actual_mapping_version is null and actual_mapping_schema_version is null
      and actual_mapping_checksum is null and actual_custom_mapping_entries is null)
    or
    (actual_mapping_set_id is not null and actual_custom_mapping_set_id is null
      and actual_target_type = 'global_exercise' and actual_global_exercise_id is not null
      and actual_mapping_version is not null and actual_mapping_schema_version is not null
      and actual_mapping_checksum is not null and actual_custom_mapping_entries is null)
    or
    (actual_mapping_set_id is null and actual_custom_mapping_set_id is not null
      and actual_target_type = 'custom_exercise' and actual_custom_exercise_id is not null
      and actual_mapping_version is not null and actual_mapping_schema_version is not null
      and actual_mapping_checksum is not null and jsonb_typeof(actual_custom_mapping_entries) = 'array')
  ) not valid;
alter table public.workout_session_muscle_snapshot_items
  validate constraint workout_session_muscle_snapshot_items_actual_mapping_bundle_check;

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
    select 1 from public.workout_sessions session
    where session.id = p_session_id and session.user_id = p_user_id
  ) then
    raise exception 'Workout session not found.' using errcode = 'P0002';
  end if;

  return query
  select mapping.id,
         mapping.exercise_id,
         mapping.mapping_version,
         mapping.schema_version,
         mapping.checksum,
         coalesce(jsonb_agg(jsonb_build_object(
           'muscleId', entry.muscle_id,
           'role', entry.role,
           'contribution', entry.contribution,
           'sideScope', entry.side_scope,
           'sortOrder', entry.sort_order
         ) order by private.muscle_taxonomy_display_order(entry.muscle_id), entry.muscle_id)
         filter (where entry.id is not null), '[]'::jsonb)
  from public.workout_session_muscle_snapshots snapshot
  join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
  join public.exercise_muscle_mapping_sets mapping
    on mapping.id in (item.planned_mapping_set_id, item.actual_mapping_set_id)
  left join public.exercise_muscle_mapping_entries entry on entry.mapping_set_id = mapping.id
  where snapshot.user_id = p_user_id
    and snapshot.workout_session_id = p_session_id
    and mapping.status in ('published', 'retired')
  group by mapping.id, mapping.exercise_id, mapping.mapping_version, mapping.schema_version, mapping.checksum
  order by mapping.id;
end
$function$;

revoke all on function private.freeze_workout_session_muscle_snapshot_phase3_initial(uuid, text)
  from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_workout_session_frozen_global_mappings(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_workout_session_frozen_global_mappings(uuid, uuid)
  to authenticated, service_role;

do $postconditions$
declare
  routine_oid oid;
begin
  routine_oid := to_regprocedure('public.get_workout_session_frozen_global_mappings(uuid,uuid)');
  if routine_oid is null or not (select prosecdef from pg_proc where oid = routine_oid) then
    raise exception 'Historical mapping loader is missing or not SECURITY DEFINER.';
  end if;
  if has_function_privilege('anon', routine_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', routine_oid, 'EXECUTE') then
    raise exception 'Historical mapping loader grants are incorrect.';
  end if;
  if exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    left join public.exercise_muscle_mapping_sets global_mapping on global_mapping.id = item.planned_mapping_set_id
    left join public.user_custom_exercise_mapping_sets custom_mapping on custom_mapping.id = item.planned_custom_mapping_set_id
    where (
        (global_mapping.id is not null and global_mapping.retired_at <= snapshot.frozen_at)
        or (custom_mapping.id is not null and custom_mapping.retired_at <= snapshot.frozen_at)
      )
  ) then
    raise exception 'Existing snapshots still reference mappings retired before session start.';
  end if;
end
$postconditions$;

commit;
