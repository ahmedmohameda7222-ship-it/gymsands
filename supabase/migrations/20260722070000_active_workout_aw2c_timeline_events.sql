begin;

-- AW-2C adds a durable append-only historical projection beneath the
-- canonical workout_sessions -> exercise_logs performed-session authority.
do $aw2c_preflight$
declare
  v_marker text;
begin
  if to_regclass('public.workout_sessions') is null
     or to_regclass('public.exercise_logs') is null
     or to_regclass('public.workout_session_execution_states') is null
     or to_regclass('public.workout_session_execution_commands') is null
     or to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null then
    raise exception 'AW-2C requires the canonical performed-session, execution-state, command, and snapshot foundations.';
  end if;

  if to_regclass('public.workout_session_timeline_events') is not null
     or to_regprocedure('private.append_workout_session_timeline_event(uuid,uuid,text,timestamp with time zone,text,text,jsonb,uuid,uuid,uuid,smallint)') is not null
     or to_regprocedure('public.cancel_workout_session_atomic(uuid,uuid,text)') is not null
     or to_regprocedure('public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text)') is not null
     or to_regprocedure('public.skip_workout_day_atomic(uuid,uuid,text,text,text)') is not null then
    raise exception 'AW-2C objects already exist; refusing repeated or partial application.';
  end if;

  if to_regprocedure('public.start_or_resume_workout_session_atomic(uuid,uuid,uuid)') is null
     or to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)') is null
     or to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)') is null
     or to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)') is null
     or to_regprocedure('public.assert_workout_actor(uuid)') is null then
    raise exception 'AW-2C requires all reviewed workout mutation authorities.';
  end if;

  select migration_version into strict v_marker
  from public.release_schema_compatibility
  where singleton;
  if (select version from public.release_schema_compatibility where singleton) <> '2'
     or v_marker <> '20260721224813' then
    raise exception 'AW-2C requires compatibility schema version 2 and marker 20260721224813, found %.', v_marker;
  end if;
end
$aw2c_preflight$;

create temporary table aw2c_baseline on commit drop as
select
  (select version from public.release_schema_compatibility where singleton) as compatibility_version,
  (select migration_version from public.release_schema_compatibility where singleton) as compatibility_marker,
  (select count(*) from public.workout_sessions) as workout_sessions_count,
  (
    select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(
      jsonb_build_object(
        'id',s.id,'user_id',s.user_id,'workout_id',s.workout_id,'workout_name',s.workout_name,
        'started_at',s.started_at,'completed_at',s.completed_at,'duration_minutes',s.duration_minutes,
        'notes',s.notes,'status',s.status::text,'created_at',s.created_at,'updated_at',s.updated_at,
        'plan_id',s.plan_id,'plan_day_id',s.plan_day_id,'workout_day_name',s.workout_day_name,
        'workout_category',s.workout_category,'skipped_at',s.skipped_at,'skip_reason',s.skip_reason,
        'skip_followup_action',s.skip_followup_action,'scheduled_session_id',s.scheduled_session_id,
        'source',s.source,'plan_week_id',s.plan_week_id,'plan_session_id',s.plan_session_id
      )::text,E'\n' order by s.id),''),'UTF8'),'sha256'),'hex')
    from public.workout_sessions s
  ) as workout_sessions_hash,
  (select count(*) from public.exercise_logs) as exercise_logs_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by id),''),'UTF8'),'sha256'),'hex') from public.exercise_logs row_value) as exercise_logs_hash,
  (select count(*) from public.workout_session_execution_states) as execution_states_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by workout_session_id),''),'UTF8'),'sha256'),'hex') from public.workout_session_execution_states row_value) as execution_states_hash,
  (select count(*) from public.workout_session_execution_commands) as command_receipts_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by workout_session_id,command_id),''),'UTF8'),'sha256'),'hex') from public.workout_session_execution_commands row_value) as command_receipts_hash,
  (select count(*) from public.workout_session_muscle_snapshots) as snapshots_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by id),''),'UTF8'),'sha256'),'hex') from public.workout_session_muscle_snapshots row_value) as snapshots_hash,
  (select count(*) from public.workout_session_muscle_snapshot_items) as snapshot_items_count,
  (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by id),''),'UTF8'),'sha256'),'hex') from public.workout_session_muscle_snapshot_items row_value) as snapshot_items_hash;

alter type public.workout_session_status add value 'cancelled';

alter table public.workout_sessions
  add column cancelled_at timestamptz,
  add column cancel_reason text;

alter table public.workout_sessions
  add constraint workout_sessions_cancel_reason_check
    check (cancel_reason is null or cancel_reason in ('user_cancelled','started_by_mistake','not_feeling_well','time_constraint','pain_or_discomfort','other')) not valid,
  add constraint workout_sessions_cancelled_consistency_check
    check (
      (status::text = 'cancelled' and cancelled_at is not null and completed_at is null and skipped_at is null)
      or
      (status::text <> 'cancelled' and cancelled_at is null and cancel_reason is null)
    ) not valid;
alter table public.workout_sessions validate constraint workout_sessions_cancel_reason_check;
alter table public.workout_sessions validate constraint workout_sessions_cancelled_consistency_check;

create table public.workout_session_timeline_events (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sequence_number bigint generated always as identity,
  event_type text not null,
  occurred_at timestamptz not null,
  source text not null,
  command_id uuid,
  exercise_log_id uuid references public.exercise_logs(id) on delete set null,
  snapshot_item_id uuid references public.workout_session_muscle_snapshot_items(id) on delete set null,
  payload_version smallint not null default 1,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint workout_session_timeline_events_sequence_check check (sequence_number > 0),
  constraint workout_session_timeline_events_type_check check (event_type in ('session_started','session_paused','session_resumed','rest_started','rest_ended','set_completed','set_edited','exercise_skipped','exercise_replaced','session_completed','session_skipped','session_cancelled')),
  constraint workout_session_timeline_events_source_check check (source in ('runtime','migration_backfill')),
  constraint workout_session_timeline_events_payload_version_check check (payload_version = 1),
  constraint workout_session_timeline_events_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint workout_session_timeline_events_payload_size_check check (octet_length(payload::text) <= 8192),
  constraint workout_session_timeline_events_idempotency_key_check check (char_length(idempotency_key) between 8 and 200 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'),
  constraint workout_session_timeline_events_session_sequence_key unique (workout_session_id, sequence_number),
  constraint workout_session_timeline_events_session_idempotency_key unique (workout_session_id, idempotency_key)
);

comment on table public.workout_session_timeline_events is 'Durable immutable historical projection of meaningful committed workout-session transitions. Canonical mutable truth remains in workout_sessions, exercise_logs, execution state, and muscle snapshots.';
comment on column public.workout_session_timeline_events.command_id is 'Durable UUID correlation only. It intentionally has no foreign key to transient AW-2B command receipts.';
comment on column public.workout_session_timeline_events.sequence_number is 'Database-allocated global monotonic token used as the stable ascending cursor within a workout session; gaps are allowed.';

create index workout_session_timeline_events_user_time_idx on public.workout_session_timeline_events(user_id, occurred_at desc, sequence_number desc);
create index workout_session_timeline_events_session_sequence_idx on public.workout_session_timeline_events(workout_session_id, sequence_number asc);
create index workout_session_timeline_events_command_type_idx on public.workout_session_timeline_events(workout_session_id, command_id, event_type) where command_id is not null;

alter table public.workout_session_timeline_events enable row level security;
revoke all on table public.workout_session_timeline_events from public, anon, authenticated, service_role;
grant select on table public.workout_session_timeline_events to authenticated, service_role;
revoke all on sequence public.workout_session_timeline_events_sequence_number_seq from public, anon, authenticated, service_role;
create policy workout_session_timeline_events_owner_select
  on public.workout_session_timeline_events
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.append_workout_session_timeline_event(
  p_workout_session_id uuid,
  p_user_id uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_source text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,
  p_command_id uuid default null,
  p_exercise_log_id uuid default null,
  p_snapshot_item_id uuid default null,
  p_payload_version smallint default 1
)
returns public.workout_session_timeline_events
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner uuid;
  v_inserted public.workout_session_timeline_events%rowtype;
  v_existing public.workout_session_timeline_events%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  select session.user_id into v_owner
  from public.workout_sessions session
  where session.id = p_workout_session_id;
  if v_owner is null then raise exception 'Timeline root workout session does not exist.' using errcode='23503'; end if;
  if p_user_id is null or v_owner <> p_user_id then raise exception 'Timeline owner must equal the root workout-session owner.' using errcode='42501'; end if;
  if p_event_type not in ('session_started','session_paused','session_resumed','rest_started','rest_ended','set_completed','set_edited','exercise_skipped','exercise_replaced','session_completed','session_skipped','session_cancelled') then raise exception 'Unsupported workout timeline event type.' using errcode='22023'; end if;
  if p_source not in ('runtime','migration_backfill') then raise exception 'Unsupported workout timeline source.' using errcode='22023'; end if;
  if p_occurred_at is null then raise exception 'Timeline occurrence time is required.' using errcode='22023'; end if;
  if p_payload_version <> 1 then raise exception 'Unsupported workout timeline payload version.' using errcode='22023'; end if;
  if jsonb_typeof(v_payload) <> 'object' then raise exception 'Workout timeline payload must be a JSON object.' using errcode='22023'; end if;
  if octet_length(v_payload::text) > 8192 then raise exception 'Workout timeline payload exceeds the 8192-byte limit.' using errcode='22023'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$' then raise exception 'Workout timeline idempotency key is invalid.' using errcode='22023'; end if;
  if p_exercise_log_id is not null and not exists (
    select 1 from public.exercise_logs log
    where log.id=p_exercise_log_id and log.workout_session_id=p_workout_session_id
  ) then raise exception 'Timeline exercise log must belong to the root workout session.' using errcode='23514'; end if;
  if p_snapshot_item_id is not null and not exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id
    where item.id=p_snapshot_item_id and item.user_id=p_user_id and snapshot.workout_session_id=p_workout_session_id
  ) then raise exception 'Timeline snapshot item must belong to the root workout session.' using errcode='23514'; end if;

  insert into public.workout_session_timeline_events(
    workout_session_id,user_id,event_type,occurred_at,source,command_id,
    exercise_log_id,snapshot_item_id,payload_version,payload,idempotency_key
  ) values (
    p_workout_session_id,p_user_id,p_event_type,p_occurred_at,p_source,p_command_id,
    p_exercise_log_id,p_snapshot_item_id,p_payload_version,v_payload,p_idempotency_key
  )
  on conflict (workout_session_id,idempotency_key) do nothing
  returning * into v_inserted;
  if found then return v_inserted; end if;

  select * into strict v_existing
  from public.workout_session_timeline_events event
  where event.workout_session_id=p_workout_session_id and event.idempotency_key=p_idempotency_key;
  if v_existing.user_id is distinct from p_user_id
     or v_existing.event_type is distinct from p_event_type
     or v_existing.occurred_at is distinct from p_occurred_at
     or v_existing.source is distinct from p_source
     or v_existing.command_id is distinct from p_command_id
     or v_existing.exercise_log_id is distinct from p_exercise_log_id
     or v_existing.snapshot_item_id is distinct from p_snapshot_item_id
     or v_existing.payload_version is distinct from p_payload_version
     or v_existing.payload is distinct from v_payload then
    raise exception 'Workout timeline idempotency key collided with a different event identity.' using errcode='23505';
  end if;
  return v_existing;
end
$function$;
revoke all on function private.append_workout_session_timeline_event(uuid,uuid,text,timestamp with time zone,text,text,jsonb,uuid,uuid,uuid,smallint) from public,anon,authenticated,service_role;

-- Preserve the exact public signatures while wrapping the latest reviewed authorities.
alter function public.start_or_resume_workout_session_atomic(uuid,uuid,uuid) rename to aw2c_core_start_or_resume_workout_session_atomic;
alter function public.aw2c_core_start_or_resume_workout_session_atomic(uuid,uuid,uuid) set schema private;
revoke all on function private.aw2c_core_start_or_resume_workout_session_atomic(uuid,uuid,uuid) from public,anon,authenticated,service_role;

alter function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) rename to aw2c_core_start_or_resume_direct_workout_session_atomic;
alter function public.aw2c_core_start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) set schema private;
revoke all on function private.aw2c_core_start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) from public,anon,authenticated,service_role;

alter function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb) rename to aw2c_core_upsert_workout_set_logs_atomic;
alter function public.aw2c_core_upsert_workout_set_logs_atomic(uuid,uuid,jsonb) set schema private;
revoke all on function private.aw2c_core_upsert_workout_set_logs_atomic(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

alter function public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text) rename to aw2c_core_complete_workout_session_atomic;
alter function public.aw2c_core_complete_workout_session_atomic(uuid,uuid,jsonb,integer,text) set schema private;
revoke all on function private.aw2c_core_complete_workout_session_atomic(uuid,uuid,jsonb,integer,text) from public,anon,authenticated,service_role;

alter function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text) rename to aw2c_core_replace_workout_session_snapshot_item_atomic;
alter function public.aw2c_core_replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text) set schema private;
revoke all on function private.aw2c_core_replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

alter function public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb) rename to aw2c_core_apply_workout_session_execution_command_atomic;
alter function public.aw2c_core_apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb) set schema private;
revoke all on function private.aw2c_core_apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.start_or_resume_workout_session_atomic(
  p_user_id uuid,p_plan_day_id uuid,p_scheduled_session_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_result jsonb; v_session public.workout_sessions%rowtype;
begin
  perform public.assert_workout_actor(p_user_id);
  v_result:=private.aw2c_core_start_or_resume_workout_session_atomic(p_user_id,p_plan_day_id,p_scheduled_session_id);
  select * into strict v_session from public.workout_sessions session
  where session.id=(v_result->'session'->>'id')::uuid and session.user_id=p_user_id;
  if not exists(select 1 from public.workout_session_timeline_events event where event.workout_session_id=v_session.id and event.event_type='session_started') then
    perform private.append_workout_session_timeline_event(
      v_session.id,v_session.user_id,'session_started',v_session.started_at,'runtime',
      'runtime:session_started:'||v_session.id::text,
      jsonb_build_object('sessionSource',v_session.source,'planId',v_session.plan_id,'planDayId',v_session.plan_day_id,'scheduledSessionId',v_session.scheduled_session_id)
    );
  end if;
  return v_result;
end $function$;

create or replace function public.start_or_resume_direct_workout_session_atomic(
  p_user_id uuid,p_target_type text,p_identity text,p_provider text default null,
  p_display_name text default null,p_category text default null,
  p_planned_prescription jsonb default '{}'::jsonb,p_candidate_session_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_result jsonb; v_session public.workout_sessions%rowtype;
begin
  perform public.assert_workout_actor(p_user_id);
  v_result:=private.aw2c_core_start_or_resume_direct_workout_session_atomic(
    p_user_id,p_target_type,p_identity,p_provider,p_display_name,p_category,p_planned_prescription,p_candidate_session_id
  );
  select * into strict v_session from public.workout_sessions session
  where session.id=(v_result->'session'->>'id')::uuid and session.user_id=p_user_id;
  if not exists(select 1 from public.workout_session_timeline_events event where event.workout_session_id=v_session.id and event.event_type='session_started') then
    perform private.append_workout_session_timeline_event(
      v_session.id,v_session.user_id,'session_started',v_session.started_at,'runtime',
      'runtime:session_started:'||v_session.id::text,
      jsonb_build_object('sessionSource',v_session.source,'planId',v_session.plan_id,'planDayId',v_session.plan_day_id,'scheduledSessionId',v_session.scheduled_session_id)
    );
  end if;
  return v_result;
end $function$;

create or replace function public.upsert_workout_set_logs_atomic(
  p_user_id uuid,p_session_id uuid,p_logs jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_result jsonb;
  v_item jsonb;
  v_key text;
  v_before_by_key jsonb:='{}'::jsonb;
  v_before jsonb;
  v_after public.exercise_logs%rowtype;
  v_before_completed boolean;
  v_after_completed boolean;
  v_changed boolean;
  v_changed_fields text[];
  v_notes_changed boolean;
  v_fingerprint text;
  v_payload jsonb;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_logs is not null and jsonb_typeof(p_logs)='array' then
    for v_item in select value from jsonb_array_elements(p_logs) loop
      if nullif(v_item->>'plan_exercise_id','') is not null then
        v_key:='plan:'||(v_item->>'plan_exercise_id')||':set:'||coalesce(v_item->>'set_number','');
        select to_jsonb(log) into v_before from public.exercise_logs log
        where log.workout_session_id=p_session_id
          and log.plan_exercise_id=(v_item->>'plan_exercise_id')::uuid
          and log.set_number=(v_item->>'set_number')::integer
        for update;
      else
        v_key:='order:'||coalesce(v_item->>'exercise_order','')||':set:'||coalesce(v_item->>'set_number','');
        select to_jsonb(log) into v_before from public.exercise_logs log
        where log.workout_session_id=p_session_id and log.plan_exercise_id is null
          and log.exercise_order=(v_item->>'exercise_order')::integer
          and log.set_number=(v_item->>'set_number')::integer
        for update;
      end if;
      v_before_by_key:=jsonb_set(v_before_by_key,array[v_key],coalesce(v_before,'null'::jsonb),true);
      v_before:=null;
    end loop;
  end if;

  v_result:=private.aw2c_core_upsert_workout_set_logs_atomic(p_user_id,p_session_id,p_logs);
  if p_logs is null or jsonb_typeof(p_logs)<>'array' then return v_result; end if;

  for v_item in select value from jsonb_array_elements(p_logs) loop
    if nullif(v_item->>'plan_exercise_id','') is not null then
      v_key:='plan:'||(v_item->>'plan_exercise_id')||':set:'||coalesce(v_item->>'set_number','');
      select * into strict v_after from public.exercise_logs log
      where log.workout_session_id=p_session_id
        and log.plan_exercise_id=(v_item->>'plan_exercise_id')::uuid
        and log.set_number=(v_item->>'set_number')::integer;
    else
      v_key:='order:'||coalesce(v_item->>'exercise_order','')||':set:'||coalesce(v_item->>'set_number','');
      select * into strict v_after from public.exercise_logs log
      where log.workout_session_id=p_session_id and log.plan_exercise_id is null
        and log.exercise_order=(v_item->>'exercise_order')::integer
        and log.set_number=(v_item->>'set_number')::integer;
    end if;
    v_before:=v_before_by_key->v_key;
    v_before_completed:=coalesce((v_before->>'completed_at') is not null,false);
    v_after_completed:=v_after.completed_at is not null;
    if v_before is null or v_before='null'::jsonb then
      v_changed:=true;
    else
      v_changed:=(v_before->>'reps')::integer is distinct from v_after.reps
        or (v_before->>'weight_kg')::numeric is distinct from v_after.weight_kg
        or (v_before->>'completed_at')::timestamptz is distinct from v_after.completed_at
        or v_before->>'set_type' is distinct from v_after.set_type
        or v_before->>'notes' is distinct from v_after.notes
        or v_before->>'exercise_name' is distinct from v_after.exercise_name
        or (v_before->>'exercise_order')::integer is distinct from v_after.exercise_order
        or (v_before->>'plan_exercise_id')::uuid is distinct from v_after.plan_exercise_id;
    end if;

    if (v_before is null or v_before='null'::jsonb or not v_before_completed) and v_after_completed then
      v_fingerprint:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
        'exerciseLogId',v_after.id,'exerciseOrder',v_after.exercise_order,'planExerciseId',v_after.plan_exercise_id,
        'exerciseName',v_after.exercise_name,'setNumber',v_after.set_number,'reps',v_after.reps,
        'weightKg',v_after.weight_kg,'completedAt',v_after.completed_at,'setType',v_after.set_type
      )::text,'UTF8'),'sha256'),'hex');
      perform private.append_workout_session_timeline_event(
        p_session_id,p_user_id,'set_completed',v_after.completed_at,'runtime',
        'runtime:set_completed:'||v_after.id::text||':'||v_fingerprint,
        jsonb_build_object(
          'exerciseOrder',v_after.exercise_order,'planExerciseId',v_after.plan_exercise_id,
          'exerciseNameSnapshot',v_after.exercise_name,'setNumber',v_after.set_number,
          'reps',v_after.reps,'weightKg',v_after.weight_kg,'completedAt',v_after.completed_at,'setType',v_after.set_type
        ),null,v_after.id,null,1::smallint
      );
    elsif v_before is not null and v_before<>'null'::jsonb and v_before_completed and v_changed then
      v_notes_changed:=(v_before->>'notes') is distinct from v_after.notes;
      v_changed_fields:=array_remove(array[
        case when (v_before->>'reps')::integer is distinct from v_after.reps then 'reps' end,
        case when (v_before->>'weight_kg')::numeric is distinct from v_after.weight_kg then 'weightKg' end,
        case when ((v_before->>'completed_at') is not null) is distinct from (v_after.completed_at is not null)
                    or (v_before->>'completed_at')::timestamptz is distinct from v_after.completed_at then 'completedAt' end,
        case when v_before->>'set_type' is distinct from v_after.set_type then 'setType' end,
        case when v_notes_changed then 'notes' end,
        case when v_before->>'exercise_name' is distinct from v_after.exercise_name then 'exerciseName' end,
        case when (v_before->>'exercise_order')::integer is distinct from v_after.exercise_order then 'exerciseOrder' end,
        case when (v_before->>'plan_exercise_id')::uuid is distinct from v_after.plan_exercise_id then 'planExerciseId' end
      ],null);
      v_payload:=jsonb_build_object(
        'exerciseOrder',v_after.exercise_order,'planExerciseId',v_after.plan_exercise_id,
        'exerciseNameSnapshot',v_after.exercise_name,'setNumber',v_after.set_number,
        'changedFields',to_jsonb(v_changed_fields),
        'before',jsonb_build_object('reps',(v_before->>'reps')::integer,'weightKg',(v_before->>'weight_kg')::numeric,'completed',(v_before->>'completed_at') is not null,'setType',v_before->>'set_type'),
        'after',jsonb_build_object('reps',v_after.reps,'weightKg',v_after.weight_kg,'completed',v_after.completed_at is not null,'setType',v_after.set_type),
        'notesChanged',v_notes_changed
      );
      v_fingerprint:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
        'before',v_before-array['id','created_at','updated_at'],
        'after',to_jsonb(v_after)-array['id','created_at','updated_at']
      )::text,'UTF8'),'sha256'),'hex');
      perform private.append_workout_session_timeline_event(
        p_session_id,p_user_id,'set_edited',clock_timestamp(),'runtime',
        'runtime:set_edited:'||v_after.id::text||':'||v_fingerprint,
        v_payload,null,v_after.id,null,1::smallint
      );
    end if;
  end loop;
  return v_result;
end $function$;

create or replace function public.complete_workout_session_atomic(
  p_user_id uuid,p_session_id uuid,p_logs jsonb,p_duration_minutes integer,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_result jsonb; v_session public.workout_sessions%rowtype; v_performed_set_count integer;
begin
  perform public.assert_workout_actor(p_user_id);
  v_result:=private.aw2c_core_complete_workout_session_atomic(p_user_id,p_session_id,p_logs,p_duration_minutes,p_notes);
  select * into strict v_session from public.workout_sessions session
  where session.id=p_session_id and session.user_id=p_user_id;
  if v_session.status::text='completed'
     and not exists(select 1 from public.workout_session_timeline_events event where event.workout_session_id=v_session.id and event.event_type='session_completed') then
    select count(*)::integer into v_performed_set_count
    from public.exercise_logs log where log.workout_session_id=v_session.id and log.completed_at is not null;
    perform private.append_workout_session_timeline_event(
      v_session.id,v_session.user_id,'session_completed',v_session.completed_at,'runtime',
      'runtime:session_completed:'||v_session.id::text,
      jsonb_build_object('durationMinutes',v_session.duration_minutes,'performedSetCount',v_performed_set_count)
    );
  end if;
  return v_result;
end $function$;

create or replace function public.replace_workout_session_snapshot_item_atomic(
  p_user_id uuid,p_session_id uuid,p_plan_exercise_id uuid,
  p_replacement_type text,p_replacement_identity text,p_provider text default null
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_snapshot_id uuid;
  v_before public.workout_session_muscle_snapshot_items%rowtype;
  v_after public.workout_session_muscle_snapshot_items%rowtype;
  v_result jsonb;
  v_changed boolean;
  v_fingerprint text;
  v_planned_type text;
  v_planned_identity text;
  v_actual_type text;
  v_actual_identity text;
begin
  perform public.assert_workout_actor(p_user_id);
  select snapshot.id into strict v_snapshot_id
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id=p_session_id and snapshot.user_id=p_user_id;
  select * into strict v_before
  from public.workout_session_muscle_snapshot_items item
  where item.snapshot_id=v_snapshot_id and item.source_plan_exercise_id=p_plan_exercise_id
  for update;
  v_result:=private.aw2c_core_replace_workout_session_snapshot_item_atomic(
    p_user_id,p_session_id,p_plan_exercise_id,p_replacement_type,p_replacement_identity,p_provider
  );
  select * into strict v_after from public.workout_session_muscle_snapshot_items item where item.id=v_before.id;
  v_changed:=v_before.state is distinct from v_after.state
    or v_before.actual_target_type is distinct from v_after.actual_target_type
    or v_before.actual_global_exercise_id is distinct from v_after.actual_global_exercise_id
    or v_before.actual_custom_exercise_id is distinct from v_after.actual_custom_exercise_id
    or v_before.actual_provider is distinct from v_after.actual_provider
    or v_before.actual_provider_activity_id is distinct from v_after.actual_provider_activity_id
    or v_before.actual_name_snapshot is distinct from v_after.actual_name_snapshot
    or v_before.replacement_recorded_at is distinct from v_after.replacement_recorded_at;
  if v_changed then
    v_planned_type:=case when v_after.planned_provider_activity_id is not null then 'provider_activity' else v_after.planned_target_type end;
    v_planned_identity:=case
      when v_after.planned_provider_activity_id is not null then v_after.planned_provider_activity_id
      when v_after.planned_global_exercise_id is not null then v_after.planned_global_exercise_id::text
      when v_after.planned_custom_exercise_id is not null then v_after.planned_custom_exercise_id::text
      else null end;
    v_actual_type:=case when v_after.actual_provider_activity_id is not null then 'provider_activity' else v_after.actual_target_type end;
    v_actual_identity:=case
      when v_after.actual_provider_activity_id is not null then v_after.actual_provider_activity_id
      when v_after.actual_global_exercise_id is not null then v_after.actual_global_exercise_id::text
      when v_after.actual_custom_exercise_id is not null then v_after.actual_custom_exercise_id::text
      else null end;
    v_fingerprint:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('before',to_jsonb(v_before),'after',to_jsonb(v_after))::text,'UTF8'),'sha256'),'hex');
    perform private.append_workout_session_timeline_event(
      p_session_id,p_user_id,'exercise_replaced',v_after.replacement_recorded_at,'runtime',
      'runtime:exercise_replaced:'||v_after.id::text||':'||v_fingerprint,
      jsonb_build_object(
        'itemOrder',v_after.item_order,
        'planned',jsonb_build_object('targetType',v_planned_type,'stableIdentity',v_planned_identity,'nameSnapshot',v_after.activity_name_snapshot),
        'actual',jsonb_build_object('targetType',v_actual_type,'stableIdentity',v_actual_identity,'provider',v_after.actual_provider,'nameSnapshot',v_after.actual_name_snapshot)
      ),null,null,v_after.id,1::smallint
    );
  end if;
  return v_result;
end $function$;

create or replace function public.apply_workout_session_execution_command_atomic(
  p_user_id uuid,p_workout_session_id uuid,p_command_id uuid,
  p_expected_revision bigint,p_command_type text,p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_before public.workout_session_execution_states%rowtype;
  v_after public.workout_session_execution_states%rowtype;
  v_result jsonb;
  v_occurred_at timestamptz;
  v_rest_end_reason text;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_before from public.workout_session_execution_states state
  where state.workout_session_id=p_workout_session_id for update;
  v_result:=private.aw2c_core_apply_workout_session_execution_command_atomic(
    p_user_id,p_workout_session_id,p_command_id,p_expected_revision,p_command_type,p_payload
  );
  if coalesce(v_result->>'outcome','')<>'applied'
     or coalesce((v_result->>'replayed')::boolean,false)
     or p_command_type in ('import_legacy_cache','reset_timer') then
    return v_result;
  end if;
  select * into strict v_after from public.workout_session_execution_states state
  where state.workout_session_id=p_workout_session_id;
  v_occurred_at:=v_after.updated_at;

  if v_before.session_state<>'paused' and v_after.session_state='paused' then
    perform private.append_workout_session_timeline_event(
      p_workout_session_id,p_user_id,'session_paused',v_occurred_at,'runtime',
      'runtime:command:'||p_command_id::text||':session_paused',
      jsonb_build_object('revisionBefore',v_before.revision,'revisionAfter',v_after.revision,'elapsedSeconds',v_after.session_elapsed_seconds),p_command_id
    );
  elsif v_before.session_state='paused' and v_after.session_state='active' then
    perform private.append_workout_session_timeline_event(
      p_workout_session_id,p_user_id,'session_resumed',v_occurred_at,'runtime',
      'runtime:command:'||p_command_id::text||':session_resumed',
      jsonb_build_object('revisionBefore',v_before.revision,'revisionAfter',v_after.revision,'elapsedSeconds',v_after.session_elapsed_seconds),p_command_id
    );
  end if;

  if v_before.rest_started_at is not null and v_after.rest_started_at is not null
     and v_before.rest_started_at is distinct from v_after.rest_started_at then
    perform private.append_workout_session_timeline_event(
      p_workout_session_id,p_user_id,'rest_ended',v_occurred_at,'runtime',
      'runtime:command:'||p_command_id::text||':rest_ended',
      jsonb_build_object('revisionBefore',v_before.revision,'revisionAfter',v_after.revision,'reason','restarted'),p_command_id
    );
    perform private.append_workout_session_timeline_event(
      p_workout_session_id,p_user_id,'rest_started',v_after.rest_started_at,'runtime',
      'runtime:command:'||p_command_id::text||':rest_started',
      jsonb_build_object('revisionBefore',v_before.revision,'revisionAfter',v_after.revision,'durationSeconds',v_after.rest_duration_seconds,'endsAt',v_after.rest_ends_at),p_command_id
    );
  elsif v_before.rest_started_at is null and v_after.rest_started_at is not null then
    perform private.append_workout_session_timeline_event(
      p_workout_session_id,p_user_id,'rest_started',v_after.rest_started_at,'runtime',
      'runtime:command:'||p_command_id::text||':rest_started',
      jsonb_build_object('revisionBefore',v_before.revision,'revisionAfter',v_after.revision,'durationSeconds',v_after.rest_duration_seconds,'endsAt',v_after.rest_ends_at),p_command_id
    );
  elsif v_before.rest_started_at is not null and v_after.rest_started_at is null then
    v_rest_end_reason:=case
      when p_command_type='clear_rest' then 'cleared'
      when p_command_type in ('move_cursor','complete_set_transition') then 'transitioned'
      else 'cleared' end;
    perform private.append_workout_session_timeline_event(
      p_workout_session_id,p_user_id,'rest_ended',v_occurred_at,'runtime',
      'runtime:command:'||p_command_id::text||':rest_ended',
      jsonb_build_object('revisionBefore',v_before.revision,'revisionAfter',v_after.revision,'reason',v_rest_end_reason),p_command_id
    );
  end if;
  return v_result;
end $function$;

revoke all on function public.start_or_resume_workout_session_atomic(uuid,uuid,uuid) from public,anon;
grant execute on function public.start_or_resume_workout_session_atomic(uuid,uuid,uuid) to authenticated,service_role;
revoke all on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) from public,anon;
grant execute on function public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) to authenticated,service_role;
revoke all on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb) from public,anon;
grant execute on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb) to authenticated,service_role;
revoke all on function public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text) from public,anon;
grant execute on function public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text) to authenticated,service_role;
revoke all on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text) to authenticated,service_role;
revoke all on function public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb) from public,anon;
grant execute on function public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb) to authenticated,service_role;

create or replace function public.skip_workout_session_snapshot_item_atomic(
  p_user_id uuid,p_session_id uuid,p_snapshot_item_id uuid,p_reason text default 'user_skipped'
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_item public.workout_session_muscle_snapshot_items%rowtype;
  v_event public.workout_session_timeline_events%rowtype;
  v_completed_sets integer;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_reason not in ('user_skipped','equipment_unavailable','pain_or_discomfort','time_constraint','other') then
    raise exception 'Unsupported workout exercise skip reason.' using errcode='22023';
  end if;
  select * into v_session from public.workout_sessions session
  where session.id=p_session_id and session.user_id=p_user_id for update;
  if not found then raise exception 'Workout session not found.' using errcode='P0002'; end if;
  if v_session.status::text<>'started' then raise exception 'Only a started workout can skip an exercise.' using errcode='23514'; end if;
  select * into strict v_snapshot from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id=p_session_id and snapshot.user_id=p_user_id;
  select * into v_item from public.workout_session_muscle_snapshot_items item
  where item.id=p_snapshot_item_id and item.snapshot_id=v_snapshot.id and item.user_id=p_user_id for update;
  if not found then raise exception 'Workout snapshot item not found.' using errcode='P0002'; end if;
  if v_item.state='skipped' then
    select * into v_event from public.workout_session_timeline_events event
    where event.workout_session_id=p_session_id and event.snapshot_item_id=v_item.id and event.event_type='exercise_skipped'
    order by event.sequence_number desc limit 1;
    return jsonb_build_object('schemaVersion',1,'item',to_jsonb(v_item),'skipped',true,'alreadySkipped',true,'event',case when v_event.id is null then null else to_jsonb(v_event) end);
  end if;
  select count(*)::integer into v_completed_sets
  from public.exercise_logs log
  where log.workout_session_id=p_session_id and log.completed_at is not null
    and ((v_item.source_plan_exercise_id is not null and log.plan_exercise_id=v_item.source_plan_exercise_id)
      or (v_item.source_plan_exercise_id is null and log.plan_exercise_id is null and log.exercise_order=v_item.item_order));
  if v_item.state in ('completed','adjusted') or coalesce(v_item.performed_total_sets,0)>0 or v_completed_sets>0 then
    raise exception 'A performed or terminal workout snapshot item cannot be skipped.' using errcode='23514';
  end if;
  perform set_config('plaivra.session_snapshot_mutation_id',v_snapshot.id::text,true);
  update public.workout_session_muscle_snapshot_items item
  set state='skipped',updated_at=clock_timestamp()
  where item.id=v_item.id returning * into v_item;
  perform private.phase3_refresh_snapshot_completeness(v_snapshot.id,null);
  perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);
  v_event:=private.append_workout_session_timeline_event(
    p_session_id,p_user_id,'exercise_skipped',clock_timestamp(),'runtime',
    'runtime:exercise_skipped:'||v_item.id::text,
    jsonb_build_object('itemOrder',v_item.item_order,'plannedNameSnapshot',v_item.activity_name_snapshot,'actualNameSnapshot',v_item.actual_name_snapshot,'reason',p_reason),
    null,null,v_item.id,1::smallint
  );
  return jsonb_build_object('schemaVersion',1,'item',to_jsonb(v_item),'skipped',true,'alreadySkipped',false,'event',to_jsonb(v_event));
end $function$;
revoke all on function public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text) to authenticated,service_role;

create or replace function private.cancel_workout_session_impl(
  p_user_id uuid,p_session_id uuid,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_event public.workout_session_timeline_events%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_schedule_count integer;
begin
  if p_reason not in ('user_cancelled','started_by_mistake','not_feeling_well','time_constraint','pain_or_discomfort','other') then
    raise exception 'Unsupported workout cancellation reason.' using errcode='22023';
  end if;
  select * into v_session from public.workout_sessions session
  where session.id=p_session_id and session.user_id=p_user_id for update;
  if not found then raise exception 'Workout session not found.' using errcode='P0002'; end if;
  if v_session.status::text='cancelled' then
    select * into v_event from public.workout_session_timeline_events event
    where event.workout_session_id=v_session.id and event.event_type='session_cancelled'
    order by event.sequence_number desc limit 1;
    return jsonb_build_object('schemaVersion',1,'session',to_jsonb(v_session),'cancelled',true,'alreadyCancelled',true,'event',case when v_event.id is null then null else to_jsonb(v_event) end);
  end if;
  if v_session.status::text<>'started' then raise exception 'Only a started workout can be cancelled.' using errcode='23514'; end if;

  -- Dynamic SQL delays use of the newly-added enum value until runtime, after this
  -- migration transaction has committed.
  execute $cancel$
    update public.workout_sessions session
    set status='cancelled'::public.workout_session_status,
        cancelled_at=$1,cancel_reason=$2,completed_at=null,skipped_at=null,
        skip_reason=null,skip_followup_action=null,updated_at=$1
    where session.id=$3 and session.user_id=$4 and session.status::text='started'
    returning session.*
  $cancel$ into v_session using v_now,p_reason,p_session_id,p_user_id;
  if not found then raise exception 'Workout session state changed while cancelling it.' using errcode='40001'; end if;

  if v_session.scheduled_session_id is not null then
    update public.user_workout_sessions schedule
    set status='scheduled',started_at=null,completed_at=null,skipped_at=null,duration_minutes=null,updated_at=v_now
    where schedule.id=v_session.scheduled_session_id and schedule.user_id=p_user_id and schedule.status='started';
    get diagnostics v_schedule_count=row_count;
    if v_schedule_count<>1 then raise exception 'Linked scheduled workout could not be returned to scheduled state.' using errcode='40001'; end if;
  end if;
  v_event:=private.append_workout_session_timeline_event(
    v_session.id,v_session.user_id,'session_cancelled',v_session.cancelled_at,'runtime',
    'runtime:session_cancelled:'||v_session.id::text,jsonb_build_object('reason',v_session.cancel_reason)
  );
  return jsonb_build_object('schemaVersion',1,'session',to_jsonb(v_session),'cancelled',true,'alreadyCancelled',false,'event',to_jsonb(v_event));
end $function$;
revoke all on function private.cancel_workout_session_impl(uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.cancel_workout_session_atomic(
  p_user_id uuid,p_session_id uuid,p_reason text default 'user_cancelled'
)
returns jsonb language plpgsql security definer set search_path='' as $function$
begin
  perform public.assert_workout_actor(p_user_id);
  return private.cancel_workout_session_impl(p_user_id,p_session_id,p_reason);
end $function$;
revoke all on function public.cancel_workout_session_atomic(uuid,uuid,text) from public,anon;
grant execute on function public.cancel_workout_session_atomic(uuid,uuid,text) to authenticated,service_role;

create or replace function private.cleanup_workout_session_execution_state()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if old.status::text='started' and new.status::text in ('completed','skipped','cancelled') then
    delete from public.workout_session_execution_states state where state.workout_session_id=new.id;
  end if;
  return new;
end $function$;
revoke all on function private.cleanup_workout_session_execution_state() from public,anon,authenticated,service_role;

create or replace function private.enforce_terminal_workout_session_delete()
returns trigger language plpgsql set search_path='' as $function$
begin
  if current_user in ('postgres','supabase_admin','service_role') or coalesce(auth.role(),'')='service_role' then
    return old;
  end if;
  perform public.assert_workout_actor(old.user_id);
  if old.status::text='started' then
    perform public.cancel_workout_session_atomic(old.user_id,old.id,'user_cancelled');
    return null;
  end if;
  raise exception 'Terminal workout sessions are immutable. Delete the account through the privacy workflow instead.' using errcode='23514';
end $function$;
revoke all on function private.enforce_terminal_workout_session_delete() from public,anon,authenticated,service_role;

create or replace function public.skip_workout_day_atomic(
  p_user_id uuid,p_plan_day_id uuid,p_notes text default null,
  p_reason text default null,p_followup_action text default null
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_plan public.user_workout_plans%rowtype;
  v_day public.user_workout_plan_days%rowtype;
  v_schedule public.user_workout_sessions%rowtype;
  v_session public.workout_sessions%rowtype;
  v_event public.workout_session_timeline_events%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_name text;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_reason is not null and p_reason not in ('no_time','low_energy','sick','pain','travel','gym_closed','too_sore','other') then raise exception 'Unsupported skipped workout reason.' using errcode='22023'; end if;
  if p_followup_action is not null and p_followup_action not in ('move_to_tomorrow','skip_and_continue','rebalance_week','reduce_next_session') then raise exception 'Unsupported skipped workout follow-up action.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||':skip-workout-day:'||p_plan_day_id::text,0));

  select plan.* into v_plan
  from public.user_workout_plans plan
  join public.user_workout_plan_days day on day.plan_id=plan.id
  where day.id=p_plan_day_id and plan.user_id=p_user_id and plan.archived_at is null and day.archived_at is null
  for update of plan;
  if not found then raise exception 'Workout day not found.' using errcode='P0002'; end if;
  select * into strict v_day from public.user_workout_plan_days day
  where day.id=p_plan_day_id and day.plan_id=v_plan.id for update;

  select * into v_schedule
  from public.user_workout_sessions schedule
  where schedule.user_id=p_user_id and schedule.plan_day_id=p_plan_day_id
    and schedule.scheduled_date=current_date and schedule.status in ('scheduled','started','skipped')
  order by case schedule.status when 'started' then 0 when 'scheduled' then 1 else 2 end,schedule.id
  limit 1 for update;
  if v_schedule.id is not null then
    select * into v_session from public.workout_sessions session
    where session.user_id=p_user_id and session.scheduled_session_id=v_schedule.id
      and session.status::text in ('started','skipped')
    order by session.started_at desc,session.id limit 1 for update;
  end if;
  if v_session.id is null then
    select * into v_session from public.workout_sessions session
    where session.user_id=p_user_id and session.plan_day_id=p_plan_day_id
      and (session.status::text='started' or (session.status::text='skipped' and session.skipped_at::date=current_date))
    order by case session.status::text when 'started' then 0 else 1 end,session.started_at desc,session.id
    limit 1 for update;
  end if;
  if v_session.id is not null and v_session.status::text='skipped' then
    select * into v_event from public.workout_session_timeline_events event
    where event.workout_session_id=v_session.id and event.event_type='session_skipped'
    order by event.sequence_number desc limit 1;
    return jsonb_build_object('schemaVersion',1,'session',to_jsonb(v_session),'skipped',true,'alreadySkipped',true,'event',case when v_event.id is null then null else to_jsonb(v_event) end);
  end if;

  if v_session.id is null then
    v_name:=case when v_day.weekday is null then v_day.day_name else v_day.day_name||' - '||v_day.weekday end;
    insert into public.workout_sessions(
      user_id,workout_id,plan_id,plan_day_id,scheduled_session_id,workout_day_name,
      workout_category,workout_name,started_at,completed_at,skipped_at,duration_minutes,
      notes,status,source,skip_reason,skip_followup_action
    ) values (
      p_user_id,null,v_plan.id,p_plan_day_id,v_schedule.id,v_day.day_name,
      coalesce(nullif(btrim(coalesce(v_day.focus,'')),''),'Workout'),v_name,
      v_now,v_now,v_now,0,nullif(btrim(coalesce(p_notes,'')),''),'skipped',
      case when v_schedule.id is null then 'manual' else 'schedule' end,p_reason,p_followup_action
    ) returning * into v_session;
  else
    update public.workout_sessions session
    set status='skipped',completed_at=v_now,skipped_at=v_now,duration_minutes=0,
        notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),session.notes),
        skip_reason=p_reason,skip_followup_action=p_followup_action,
        cancelled_at=null,cancel_reason=null,updated_at=v_now
    where session.id=v_session.id and session.user_id=p_user_id and session.status::text='started'
    returning * into v_session;
    if not found then raise exception 'Workout session state changed while skipping it.' using errcode='40001'; end if;
  end if;

  if v_schedule.id is not null then
    update public.user_workout_sessions schedule
    set status='skipped',started_at=coalesce(schedule.started_at,v_session.started_at),
        completed_at=v_now,skipped_at=v_now,duration_minutes=0,
        notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),schedule.notes),updated_at=v_now
    where schedule.id=v_schedule.id and schedule.user_id=p_user_id and schedule.status in ('scheduled','started','skipped');
  end if;
  v_event:=private.append_workout_session_timeline_event(
    v_session.id,v_session.user_id,'session_skipped',coalesce(v_session.skipped_at,v_session.completed_at),'runtime',
    'runtime:session_skipped:'||v_session.id::text,
    jsonb_build_object('reason',v_session.skip_reason,'followupAction',v_session.skip_followup_action)
  );
  return jsonb_build_object('schemaVersion',1,'session',to_jsonb(v_session),'skipped',true,'alreadySkipped',false,'event',to_jsonb(v_event));
end $function$;
revoke all on function public.skip_workout_day_atomic(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.skip_workout_day_atomic(uuid,uuid,text,text,text) to authenticated,service_role;

-- Conservative deterministic historical backfill. Ambiguous snapshot rows whose
-- state is merely 'skipped' are intentionally excluded.
insert into public.workout_session_timeline_events(workout_session_id,user_id,event_type,occurred_at,source,payload_version,payload,idempotency_key)
select session.id,session.user_id,'session_started',session.started_at,'migration_backfill',1,
  jsonb_build_object('sessionSource',case when session.source in ('manual','schedule','chatgpt','backfill') then session.source else 'backfill' end,'planId',session.plan_id,'planDayId',session.plan_day_id,'scheduledSessionId',session.scheduled_session_id),
  'backfill:session_started:'||session.id::text
from public.workout_sessions session
where session.status::text<>'skipped'
order by session.started_at,session.id;

insert into public.workout_session_timeline_events(workout_session_id,user_id,event_type,occurred_at,source,exercise_log_id,payload_version,payload,idempotency_key)
select log.workout_session_id,session.user_id,'set_completed',log.completed_at,'migration_backfill',log.id,1,
  jsonb_build_object('exerciseOrder',log.exercise_order,'planExerciseId',log.plan_exercise_id,'exerciseNameSnapshot',log.exercise_name,'setNumber',log.set_number,'reps',log.reps,'weightKg',log.weight_kg,'completedAt',log.completed_at,'setType',log.set_type),
  'backfill:set_completed:'||log.id::text
from public.exercise_logs log
join public.workout_sessions session on session.id=log.workout_session_id
where log.completed_at is not null
order by log.completed_at,log.exercise_order nulls last,log.plan_exercise_id,log.set_number,log.id;

insert into public.workout_session_timeline_events(workout_session_id,user_id,event_type,occurred_at,source,snapshot_item_id,payload_version,payload,idempotency_key)
select snapshot.workout_session_id,item.user_id,'exercise_replaced',item.replacement_recorded_at,'migration_backfill',item.id,1,
  jsonb_build_object(
    'itemOrder',item.item_order,
    'planned',jsonb_build_object(
      'targetType',case when item.planned_provider_activity_id is not null then 'provider_activity' else item.planned_target_type end,
      'stableIdentity',case when item.planned_provider_activity_id is not null then item.planned_provider_activity_id when item.planned_global_exercise_id is not null then item.planned_global_exercise_id::text when item.planned_custom_exercise_id is not null then item.planned_custom_exercise_id::text else null end,
      'nameSnapshot',item.activity_name_snapshot
    ),
    'actual',jsonb_build_object(
      'targetType',case when item.actual_provider_activity_id is not null then 'provider_activity' else item.actual_target_type end,
      'stableIdentity',case when item.actual_provider_activity_id is not null then item.actual_provider_activity_id when item.actual_global_exercise_id is not null then item.actual_global_exercise_id::text when item.actual_custom_exercise_id is not null then item.actual_custom_exercise_id::text else null end,
      'provider',item.actual_provider,'nameSnapshot',item.actual_name_snapshot
    )
  ),
  'backfill:exercise_replaced:'||item.id::text
from public.workout_session_muscle_snapshot_items item
join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id
where item.replacement_recorded_at is not null and item.actual_name_snapshot is not null
  and (item.actual_global_exercise_id is not null or item.actual_custom_exercise_id is not null or item.actual_provider_activity_id is not null)
order by item.replacement_recorded_at,item.item_order,item.id;

insert into public.workout_session_timeline_events(workout_session_id,user_id,event_type,occurred_at,source,payload_version,payload,idempotency_key)
select session.id,session.user_id,'session_completed',session.completed_at,'migration_backfill',1,
  jsonb_build_object('durationMinutes',session.duration_minutes,'performedSetCount',(select count(*)::integer from public.exercise_logs log where log.workout_session_id=session.id and log.completed_at is not null)),
  'backfill:session_completed:'||session.id::text
from public.workout_sessions session
where session.status::text='completed' and session.completed_at is not null
order by session.completed_at,session.id;

insert into public.workout_session_timeline_events(workout_session_id,user_id,event_type,occurred_at,source,payload_version,payload,idempotency_key)
select session.id,session.user_id,'session_skipped',coalesce(session.skipped_at,session.completed_at),'migration_backfill',1,
  jsonb_build_object('reason',session.skip_reason,'followupAction',session.skip_followup_action),
  'backfill:session_skipped:'||session.id::text
from public.workout_sessions session
where session.status::text='skipped' and coalesce(session.skipped_at,session.completed_at) is not null
order by coalesce(session.skipped_at,session.completed_at),session.id;

do $aw2c_postconditions$
declare
  v_baseline aw2c_baseline%rowtype;
  v_session_hash text;
begin
  select * into strict v_baseline from aw2c_baseline;
  select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(
    jsonb_build_object(
      'id',s.id,'user_id',s.user_id,'workout_id',s.workout_id,'workout_name',s.workout_name,
      'started_at',s.started_at,'completed_at',s.completed_at,'duration_minutes',s.duration_minutes,
      'notes',s.notes,'status',s.status::text,'created_at',s.created_at,'updated_at',s.updated_at,
      'plan_id',s.plan_id,'plan_day_id',s.plan_day_id,'workout_day_name',s.workout_day_name,
      'workout_category',s.workout_category,'skipped_at',s.skipped_at,'skip_reason',s.skip_reason,
      'skip_followup_action',s.skip_followup_action,'scheduled_session_id',s.scheduled_session_id,
      'source',s.source,'plan_week_id',s.plan_week_id,'plan_session_id',s.plan_session_id
    )::text,E'\n' order by s.id),''),'UTF8'),'sha256'),'hex')
  into v_session_hash from public.workout_sessions s;

  if (select version from public.release_schema_compatibility where singleton) is distinct from v_baseline.compatibility_version
     or (select migration_version from public.release_schema_compatibility where singleton) is distinct from v_baseline.compatibility_marker then
    raise exception 'AW-2C changed the release compatibility marker.';
  end if;
  if (select count(*) from public.workout_sessions)<>v_baseline.workout_sessions_count
     or v_session_hash<>v_baseline.workout_sessions_hash
     or (select count(*) from public.exercise_logs)<>v_baseline.exercise_logs_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by id),''),'UTF8'),'sha256'),'hex') from public.exercise_logs row_value)<>v_baseline.exercise_logs_hash
     or (select count(*) from public.workout_session_execution_states)<>v_baseline.execution_states_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by workout_session_id),''),'UTF8'),'sha256'),'hex') from public.workout_session_execution_states row_value)<>v_baseline.execution_states_hash
     or (select count(*) from public.workout_session_execution_commands)<>v_baseline.command_receipts_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by workout_session_id,command_id),''),'UTF8'),'sha256'),'hex') from public.workout_session_execution_commands row_value)<>v_baseline.command_receipts_hash
     or (select count(*) from public.workout_session_muscle_snapshots)<>v_baseline.snapshots_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by id),''),'UTF8'),'sha256'),'hex') from public.workout_session_muscle_snapshots row_value)<>v_baseline.snapshots_hash
     or (select count(*) from public.workout_session_muscle_snapshot_items)<>v_baseline.snapshot_items_count
     or (select encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(to_jsonb(row_value)::text,E'\n' order by id),''),'UTF8'),'sha256'),'hex') from public.workout_session_muscle_snapshot_items row_value)<>v_baseline.snapshot_items_hash then
    raise exception 'AW-2C changed protected canonical application data during migration.';
  end if;

  if (select count(*) from public.workout_session_timeline_events where source='migration_backfill' and event_type='session_started')<>(select count(*) from public.workout_sessions where status::text<>'skipped')
     or (select count(*) from public.workout_session_timeline_events where source='migration_backfill' and event_type='set_completed')<>(select count(*) from public.exercise_logs where completed_at is not null)
     or (select count(*) from public.workout_session_timeline_events where source='migration_backfill' and event_type='exercise_replaced')<>(select count(*) from public.workout_session_muscle_snapshot_items item where item.replacement_recorded_at is not null and item.actual_name_snapshot is not null and (item.actual_global_exercise_id is not null or item.actual_custom_exercise_id is not null or item.actual_provider_activity_id is not null))
     or (select count(*) from public.workout_session_timeline_events where source='migration_backfill' and event_type='session_completed')<>(select count(*) from public.workout_sessions where status::text='completed' and completed_at is not null)
     or (select count(*) from public.workout_session_timeline_events where source='migration_backfill' and event_type='session_skipped')<>(select count(*) from public.workout_sessions where status::text='skipped' and coalesce(skipped_at,completed_at) is not null) then
    raise exception 'AW-2C conservative backfill counts do not match provable canonical history.';
  end if;
  if exists(select 1 from public.workout_session_timeline_events where source='migration_backfill' and event_type in ('session_paused','session_resumed','rest_started','rest_ended','set_edited','exercise_skipped','session_cancelled')) then
    raise exception 'AW-2C fabricated an unprovable historical event.';
  end if;
  if exists(select 1 from public.workout_session_timeline_events event join public.workout_sessions session on session.id=event.workout_session_id where event.user_id<>session.user_id) then
    raise exception 'AW-2C timeline ownership differs from the canonical session owner.';
  end if;
  if has_table_privilege('authenticated','public.workout_session_timeline_events','INSERT')
     or has_table_privilege('authenticated','public.workout_session_timeline_events','UPDATE')
     or has_table_privilege('authenticated','public.workout_session_timeline_events','DELETE')
     or not has_table_privilege('authenticated','public.workout_session_timeline_events','SELECT')
     or has_table_privilege('anon','public.workout_session_timeline_events','SELECT') then
    raise exception 'AW-2C timeline ACL is invalid.';
  end if;
  if has_function_privilege('authenticated','private.append_workout_session_timeline_event(uuid,uuid,text,timestamp with time zone,text,text,jsonb,uuid,uuid,uuid,smallint)','EXECUTE') then
    raise exception 'Authenticated clients can execute the private AW-2C append helper.';
  end if;
  if exists(
    select 1 from pg_proc procedure
    where procedure.oid in (
      to_regprocedure('public.start_or_resume_workout_session_atomic(uuid,uuid,uuid)'),
      to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)'),
      to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)'),
      to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)'),
      to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)'),
      to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'),
      to_regprocedure('public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text)'),
      to_regprocedure('public.cancel_workout_session_atomic(uuid,uuid,text)'),
      to_regprocedure('public.skip_workout_day_atomic(uuid,uuid,text,text,text)')
    ) and (not procedure.prosecdef or coalesce(array_to_string(procedure.proconfig,','),'') not like '%search_path=%')
  ) then raise exception 'An AW-2C public write RPC lacks SECURITY DEFINER or an empty search path.'; end if;
  if not exists(select 1 from pg_trigger trigger_row where trigger_row.tgrelid='public.workout_sessions'::regclass and trigger_row.tgname='workout_sessions_terminal_delete_guard' and trigger_row.tgenabled<>'D') then
    raise exception 'The AW-2C backward-compatible delete bridge is missing.';
  end if;
end
$aw2c_postconditions$;

commit;
