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
    raise exception 'Compatibility marker changed during Phase 4C.1 runtime schema migration.';
  end if;
  if (select count(*) from public.workout_sessions) is distinct from v_baseline.session_count
     or (select count(*) from public.workout_session_muscle_snapshots) is distinct from v_baseline.snapshot_count
     or (select count(*) from public.workout_session_muscle_snapshot_items) is distinct from v_baseline.snapshot_item_count
     or (select count(*) from public.exercise_logs) is distinct from v_baseline.exercise_log_count then
    raise exception 'Existing workout data row counts changed during the V2 runtime schema migration.';
  end if;
  if (select count(*) from public.workout_session_muscle_snapshots where snapshot_schema_version = 'workout_session_muscle_snapshot_v1')
       is distinct from v_baseline.v1_snapshot_count then
    raise exception 'Existing V1 snapshot envelopes changed during the runtime schema migration.';
  end if;
  if exists (
    select 1 from public.workout_session_muscle_snapshots
    where snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
  ) then
    raise exception 'The runtime schema migration must not create V2 session snapshots.';
  end if;
  if exists (
    select 1 from public.workout_session_muscle_snapshot_items
    where performed_total_sets is not null
       or performed_qualifying_sets is not null
       or performed_frozen_at is not null
  ) then
    raise exception 'Historical snapshot items were rewritten with performed workload.';
  end if;
  if exists (select 1 from public.exercise_logs where set_type is null) then
    raise exception 'Structured workout set type backfill is incomplete.';
  end if;
end
$postconditions$;

commit;
