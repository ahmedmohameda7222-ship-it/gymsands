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
do $phase3_lifecycle_preflight$
begin
  if to_regprocedure('private.freeze_workout_session_muscle_snapshot(uuid,text)') is null
     or to_regprocedure('private.reconcile_workout_session_muscle_snapshot_on_terminal()') is null then
    raise exception 'Phase 3 lifecycle routines are missing.';
  end if;
  if to_regprocedure('private.freeze_workout_session_muscle_snapshot_phase3_integrity_v1(uuid,text)') is not null
     or exists (select 1 from pg_trigger where tgrelid='public.workout_sessions'::regclass and tgname='freeze_workout_session_muscle_snapshot_on_started_transition' and not tgisinternal) then
    raise exception 'Phase 3 lifecycle/provider correction appears partially applied.';
  end if;
end
$phase3_lifecycle_preflight$;

create temporary table phase3_legacy_snapshot_baseline on commit drop as
select id, md5(to_jsonb(snapshot)::text) as row_hash
from public.workout_session_muscle_snapshots snapshot
where source = 'legacy_backfill';

create temporary table phase3_legacy_item_baseline on commit drop as
select item.id, md5(to_jsonb(item)::text) as row_hash
from public.workout_session_muscle_snapshot_items item
join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
where snapshot.source = 'legacy_backfill';

alter table public.workout_session_muscle_snapshots
  drop constraint workout_session_muscle_snapshots_source_check;
alter table public.workout_session_muscle_snapshots
  add constraint workout_session_muscle_snapshots_source_check
  check (source in ('session_start', 'terminal_insert', 'legacy_backfill'));

alter function private.freeze_workout_session_muscle_snapshot(uuid, text)
  rename to freeze_workout_session_muscle_snapshot_phase3_integrity_v1;

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
      where item.planned_mapping_set_id is not null
         or item.planned_custom_mapping_set_id is not null
    ),
    count(*) filter (
      where item.planned_provider_activity_id is not null
        and item.planned_global_exercise_id is null
    ),
    count(*) filter (
      where item.planned_provider_activity_id is null
        and item.planned_global_exercise_id is null
        and item.planned_custom_exercise_id is null
    )
  into v_total, v_mapped, v_unlinked_provider, v_unmapped_identity
  from public.workout_session_muscle_snapshot_items item
  where item.snapshot_id = p_snapshot_id;

  if v_total = 0 then
    v_reasons := array_append(v_reasons, 'no_planned_items');
  end if;
  if v_unlinked_provider > 0 then
    v_reasons := array_append(v_reasons, 'provider_bridge_unavailable');
  end if;
  if v_total > v_mapped and (v_total - v_mapped - v_unlinked_provider) > 0 then
    v_reasons := array_append(v_reasons, 'mapping_unavailable');
  end if;
  if v_unmapped_identity > 0 then
    v_reasons := array_append(v_reasons, 'stable_identity_unavailable');
  end if;
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

  -- External plan activities retain the trusted provider identity independently
  -- from bridge or mapping availability. Canonical identity is accepted only
  -- through an exact verified provider link.
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
      from public.exercise_muscle_mapping_sets candidate
      where candidate.exercise_id = link.exercise_id
        and candidate.status = 'published'
        and candidate.published_at <= v_session.started_at
        and (candidate.retired_at is null or candidate.retired_at > v_session.started_at)
      order by candidate.mapping_version desc, candidate.id
      limit 1
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

  perform private.phase3_refresh_snapshot_completeness(
    v_snapshot_id,
    case
      when v_session.status = 'skipped' then 'session_skipped'
      when v_completed_log_count = 0 then 'completed_without_performed_logs'
    end
  );
end
$function$;

create or replace function private.freeze_workout_session_muscle_snapshot_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform set_config('plaivra.session_snapshot_mutation_id', '', true);
  if new.status = 'started' then
    if new.plan_day_id is null
       and current_setting('plaivra.direct_session_authoritative_start', true) is distinct from '1' then
      raise exception 'Direct workout sessions must use the authoritative start operation.' using errcode = '23514';
    end if;
    perform private.freeze_workout_session_muscle_snapshot(new.id, 'session_start');
  elsif new.status in ('completed', 'skipped') then
    perform private.freeze_workout_session_muscle_snapshot(new.id, 'terminal_insert');
    perform private.phase3_reconcile_terminal_session(new.id);
  else
    raise exception 'Unsupported workout session lifecycle state.' using errcode = '23514';
  end if;
  return new;
end
$function$;

create or replace function private.freeze_workout_session_muscle_snapshot_on_started_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source text;
begin
  if new.status <> 'started' or old.status = 'started' then
    return new;
  end if;
  select source into v_source
  from public.workout_session_muscle_snapshots
  where workout_session_id = new.id;
  if v_source = 'terminal_insert' then
    raise exception 'A terminally inserted workout session cannot be restarted.' using errcode = '23514';
  end if;
  perform private.freeze_workout_session_muscle_snapshot(new.id, 'session_start');
  return new;
end
$function$;

create trigger freeze_workout_session_muscle_snapshot_on_started_transition
after update of status on public.workout_sessions
for each row
execute function private.freeze_workout_session_muscle_snapshot_on_started_transition();

create or replace function private.reconcile_workout_session_muscle_snapshot_on_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status not in ('completed', 'skipped') or old.status = new.status then
    return new;
  end if;
  perform private.phase3_reconcile_terminal_session(new.id);
  return new;
end
$function$;

revoke all on function private.freeze_workout_session_muscle_snapshot_phase3_integrity_v1(uuid,text) from public, anon, authenticated;
revoke all on function private.phase3_refresh_snapshot_completeness(uuid,text) from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot(uuid,text) from public, anon, authenticated;
revoke all on function private.phase3_reconcile_terminal_session(uuid) from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot_on_insert() from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot_on_started_transition() from public, anon, authenticated;
revoke all on function private.reconcile_workout_session_muscle_snapshot_on_terminal() from public, anon, authenticated;

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
  if exists (select 1 from public.workout_sessions session left join public.workout_session_muscle_snapshots snapshot on snapshot.workout_session_id=session.id where snapshot.id is null) then
    raise exception 'A workout session committed without a Phase 3 snapshot.';
  end if;
  if exists (select 1 from public.workout_session_muscle_snapshots snapshot join public.workout_sessions session on session.id=snapshot.workout_session_id where snapshot.user_id<>session.user_id) then
    raise exception 'Snapshot owner mismatch exists after lifecycle correction.';
  end if;
  foreach v_routine in array array[
    to_regprocedure('private.freeze_workout_session_muscle_snapshot(uuid,text)'),
    to_regprocedure('private.phase3_reconcile_terminal_session(uuid)')
  ] loop
    if v_routine is null or not (select prosecdef from pg_proc where oid=v_routine)
       or coalesce((select array_to_string(proconfig, ',') from pg_proc where oid=v_routine),'') not like '%search_path=%' then
      raise exception 'Corrected lifecycle routine is missing or not hardened: %.', v_routine;
    end if;
  end loop;
  select migration_version into v_marker from public.release_schema_compatibility where singleton;
  if v_marker is distinct from '20260717051011' then raise exception 'Compatibility marker changed.'; end if;
end
$postconditions$;

commit;
