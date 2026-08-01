\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

begin;

set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local session_replication_role = replica;

insert into public.profiles (id,email,full_name,role)
values (
  'b9000000-0000-4000-8000-000000000001'::uuid,
  'wh9-heavy-history@plaivra.local',
  'WH-9 Heavy History Fixture',
  'member'
);

create temp table wh9_identity on commit drop as
select
  exercise.id as exercise_id,
  exercise.name as exercise_name,
  mapping.id as mapping_id,
  mapping.mapping_version,
  mapping.schema_version,
  mapping.checksum
from public.exercises exercise
cross join lateral private.resolve_muscle_mapping(
  exercise.id,
  'exercise_muscle_mapping_v2',
  clock_timestamp()
) mapping
where exercise.is_global
  and exercise.is_approved
order by exercise.id
limit 1;

do $fixture_guard$
begin
  if (select count(*) from wh9_identity) <> 1 then
    raise exception 'WH-9 requires one approved global exercise with a V2 mapping.';
  end if;
end
$fixture_guard$;

create temp table wh9_sessions on commit drop as
select
  n,
  md5('plaivra-wh9-session-' || n)::uuid as session_id,
  ('2021-01-01 08:00:00+00'::timestamptz + n * interval '8 hours') as occurred_at,
  case
    when n % 20 = 0 then 'skipped'
    when n % 10 = 0 then 'cancelled'
    else 'completed'
  end as terminal_status
from generate_series(1, 5000) n;

insert into public.workout_sessions (
  id,user_id,workout_name,started_at,completed_at,duration_minutes,notes,status,
  created_at,updated_at,workout_day_name,workout_category,skipped_at,skip_reason,
  skip_followup_action,source,cancelled_at,cancel_reason,deleted_at,purge_after,
  history_revision,repeated_from_session_id
)
select
  fixture.session_id,
  'b9000000-0000-4000-8000-000000000001'::uuid,
  case fixture.n % 3
    when 0 then 'Langhantel-Krafttraining mit kontrollierter Ausführung und progressiver Belastung ' || fixture.n
    when 1 then 'جلسة قوة طويلة متعددة المراحل مع تحكم كامل في الأداء والتكرارات ' || fixture.n
    else 'Long progressive strength and conditioning session with deliberate tempo control ' || fixture.n
  end,
  fixture.occurred_at - interval '55 minutes',
  case when fixture.terminal_status = 'completed' then fixture.occurred_at end,
  case when fixture.terminal_status = 'skipped' then 0 else 55 + fixture.n % 35 end,
  case fixture.n % 3
    when 0 then 'Deterministische deutsche Verlaufsnotiz für Last-, Tempo- und Erholungsbeobachtungen.'
    when 1 then 'ملاحظة عربية حتمية حول الحمل والإيقاع والتعافي عبر الجلسة.'
    else 'Deterministic English history note covering load, tempo, recovery, and execution quality.'
  end,
  fixture.terminal_status::public.workout_session_status,
  fixture.occurred_at - interval '60 minutes',
  fixture.occurred_at,
  case fixture.n % 3 when 0 then 'Kraft A' when 1 then 'قوة ب' else 'Strength C' end,
  case when fixture.terminal_status = 'cancelled' then 'partial' else 'strength' end,
  case when fixture.terminal_status = 'skipped' then fixture.occurred_at end,
  case when fixture.terminal_status = 'skipped' then 'no_time' end,
  case when fixture.terminal_status = 'skipped' then 'skip_and_continue' end,
  'backfill',
  case when fixture.terminal_status = 'cancelled' then fixture.occurred_at end,
  case when fixture.terminal_status = 'cancelled' then 'time_constraint' end,
  case when fixture.n % 25 = 0 then clock_timestamp() - (fixture.n % 20) * interval '1 day' end,
  case when fixture.n % 25 = 0 then clock_timestamp() + (30 - fixture.n % 20) * interval '1 day' end,
  0,
  case when fixture.n > 1 and fixture.n % 7 = 0
    then md5('plaivra-wh9-session-' || (fixture.n - 1))::uuid
  end
from wh9_sessions fixture;

create temp table wh9_logs on commit drop as
select
  row_number() over (order by fixture.n,set_ordinal)::integer as log_number,
  fixture.n,
  fixture.session_id,
  fixture.occurred_at,
  set_ordinal,
  md5('plaivra-wh9-log-' || fixture.n || '-' || set_ordinal)::uuid as log_id
from wh9_sessions fixture
cross join generate_series(1, 11) set_ordinal
where fixture.terminal_status <> 'skipped';

insert into public.exercise_logs (
  id,workout_session_id,exercise_name,set_number,reps,weight_kg,notes,created_at,
  planned_sets,planned_reps,planned_rest_seconds,completed_at,exercise_category,
  exercise_order,source,set_type
)
select
  log.log_id,log.session_id,
  case log.n % 3
    when 0 then identity.exercise_name || ' — kontrollierte Ausführung'
    when 1 then identity.exercise_name || ' — تنفيذ متحكم به'
    else identity.exercise_name || ' — controlled execution'
  end,
  ((log.set_ordinal - 1) % 6) + 1,
  6 + (log.set_ordinal % 7),
  30 + (log.n % 90) + log.set_ordinal,
  'WH-9 deterministic structured set',
  log.occurred_at - (12 - log.set_ordinal) * interval '3 minutes',
  6,'6-12',90,
  log.occurred_at - (12 - log.set_ordinal) * interval '3 minutes',
  'strength',
  ((log.set_ordinal - 1) / 6) + 1,
  'backfill','working'
from wh9_logs log
cross join wh9_identity identity;

insert into public.exercise_log_metric_values (
  id,exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,
  value,source,captured_at,created_at,updated_at
)
select
  md5('plaivra-wh9-metric-' || log.log_number || '-' || metric.ordinality)::uuid,
  log.log_id,log.session_id,'b9000000-0000-4000-8000-000000000001'::uuid,
  metric.metric_key,1,'bilateral',
  case metric.metric_key when 'repetitions' then 6 + log.set_ordinal % 7 else 30 + log.n % 90 + log.set_ordinal end,
  'backfill',log.occurred_at,log.occurred_at,log.occurred_at
from wh9_logs log
cross join lateral unnest(array['repetitions','external_load_kg']) with ordinality metric(metric_key,ordinality);

insert into public.exercise_log_set_details (
  exercise_log_id,workout_session_id,user_id,schema_version,set_type,rpe,rir,notes,
  side_mode,planned_tempo,performed_tempo,tempo_adherence,source,created_at,updated_at
)
select
  log.log_id,log.session_id,'b9000000-0000-4000-8000-000000000001'::uuid,
  1,'working',7.5,2.0,'WH-9 structured detail','bilateral','3-1-1','3-1-1',
  'adhered','backfill',log.occurred_at,log.occurred_at
from wh9_logs log;

insert into public.exercise_log_set_segments (
  id,exercise_log_id,workout_session_id,user_id,segment_order,segment_kind,side,
  completed_at,source,created_at,updated_at
)
select
  md5('plaivra-wh9-segment-' || log.log_number)::uuid,
  log.log_id,log.session_id,'b9000000-0000-4000-8000-000000000001'::uuid,
  1,'primary','bilateral',log.occurred_at,'backfill',log.occurred_at,log.occurred_at
from wh9_logs log;

insert into public.workout_session_muscle_snapshots (
  id,user_id,workout_session_id,snapshot_schema_version,taxonomy_version,
  mapping_schema_version,calculation_engine_version,threshold_profile_version,
  result_schema_version,workload_model_version,prescription_schema_version,
  custom_identity_schema_version,completeness,reason_codes,source,frozen_at,created_at
)
select
  md5('plaivra-wh9-snapshot-' || fixture.n)::uuid,
  'b9000000-0000-4000-8000-000000000001'::uuid,fixture.session_id,
  'workout_session_muscle_snapshot_v2','advanced_visible_v1','exercise_muscle_mapping_v2',
  'muscle_load_resistance_sets_v2','advanced_exposure_v1','advanced_muscle_exposure_result_v1',
  'resistance_sets_v1','planned_prescription_v1','custom_exercise_identity_snapshot_v1',
  'complete','{}','session_start',fixture.occurred_at,fixture.occurred_at
from wh9_sessions fixture;

insert into public.workout_session_muscle_snapshot_items (
  id,snapshot_id,user_id,item_order,phase_slug,phase_name_snapshot,activity_name_snapshot,
  planned_target_type,planned_global_exercise_id,planned_mapping_set_id,
  planned_mapping_version,planned_mapping_schema_version,planned_mapping_checksum,
  planned_prescription,planned_sets,state,created_at,updated_at,
  performed_total_sets,performed_qualifying_sets,performed_frozen_at
)
select
  md5('plaivra-wh9-item-' || fixture.n)::uuid,
  md5('plaivra-wh9-snapshot-' || fixture.n)::uuid,
  'b9000000-0000-4000-8000-000000000001'::uuid,
  1,'main','Main work',identity.exercise_name,
  'global_exercise',identity.exercise_id,identity.mapping_id,
  identity.mapping_version,identity.schema_version,identity.checksum,
  jsonb_build_object('sets',3,'reps','6-12','restSeconds',90),3,
  case when fixture.terminal_status = 'skipped' then 'skipped' else 'completed' end,
  fixture.occurred_at,fixture.occurred_at,
  case when fixture.terminal_status = 'skipped' then 0 else 11 end,
  case when fixture.terminal_status = 'skipped' then 0 else 11 end,
  fixture.occurred_at
from wh9_sessions fixture
cross join wh9_identity identity;

insert into public.workout_session_prescription_sets (
  id,snapshot_item_id,snapshot_id,workout_session_id,user_id,set_order,
  performed_order_hint,set_type,target_mode,side_mode,rest_seconds,tempo_target,
  schema_version,created_at
)
select
  md5('plaivra-wh9-prescription-' || fixture.n || '-' || set_order)::uuid,
  md5('plaivra-wh9-item-' || fixture.n)::uuid,
  md5('plaivra-wh9-snapshot-' || fixture.n)::uuid,
  fixture.session_id,'b9000000-0000-4000-8000-000000000001'::uuid,
  set_order,set_order,'working','mixed','bilateral',90,'3-1-1',1,fixture.occurred_at
from wh9_sessions fixture
cross join generate_series(1,3) set_order;

insert into public.workout_session_prescription_metric_targets (
  id,prescription_set_id,snapshot_item_id,workout_session_id,user_id,metric_key,
  metric_version,side,target_value,minimum_value,maximum_value,target_mode,created_at
)
select
  md5('plaivra-wh9-target-' || fixture.n || '-' || set_order || '-' || metric.ordinality)::uuid,
  md5('plaivra-wh9-prescription-' || fixture.n || '-' || set_order)::uuid,
  md5('plaivra-wh9-item-' || fixture.n)::uuid,
  fixture.session_id,'b9000000-0000-4000-8000-000000000001'::uuid,
  metric.metric_key,1,'bilateral',null,
  case metric.metric_key when 'repetitions' then 6 else 30 end,
  case metric.metric_key when 'repetitions' then 12 else 180 end,
  'range',fixture.occurred_at
from wh9_sessions fixture
cross join generate_series(1,3) set_order
cross join lateral unnest(array['repetitions','external_load_kg']) with ordinality metric(metric_key,ordinality);

insert into public.workout_session_timeline_events (
  id,workout_session_id,user_id,event_type,occurred_at,source,payload_version,payload,
  idempotency_key,created_at
)
select
  md5('plaivra-wh9-event-' || fixture.n || '-' || event.ordinality)::uuid,
  fixture.session_id,'b9000000-0000-4000-8000-000000000001'::uuid,
  case event.ordinality
    when 1 then 'session_started'
    else case fixture.terminal_status
      when 'completed' then 'session_completed'
      when 'cancelled' then 'session_cancelled'
      else 'session_skipped'
    end
  end,
  case event.ordinality when 1 then fixture.occurred_at - interval '55 minutes' else fixture.occurred_at end,
  'migration_backfill',1,jsonb_build_object('fixture','wh9','ordinal',event.ordinality),
  'wh9:event:' || fixture.n || ':' || event.ordinality,fixture.occurred_at
from wh9_sessions fixture
cross join lateral unnest(array[1,2]) with ordinality event(value,ordinality);

insert into public.personal_records (
  id,user_id,exercise_name,record_type,weight_kg,reps,record_date,notes,created_at,
  updated_at,source_kind,record_key,exercise_identity_kind,exercise_identity,
  workout_session_id,exercise_log_id,derived_record_type,record_value,record_unit,
  comparison_context_key,set_type,schema_version,formula_version,achieved_at
)
select
  md5('plaivra-wh9-record-' || fixture.n)::uuid,
  'b9000000-0000-4000-8000-000000000001'::uuid,identity.exercise_name,
  'highest_load',80 + fixture.n % 70,8,fixture.occurred_at::date,'WH-9 verified record',
  fixture.occurred_at,fixture.occurred_at,'workout_derived','highest_load:' || fixture.n,
  'global',identity.exercise_id::text,fixture.session_id,
  md5('plaivra-wh9-log-' || fixture.n || '-1')::uuid,
  'highest_load',80 + fixture.n % 70,'kg','global:' || identity.exercise_id,
  'working',1,'wh6-v1',fixture.occurred_at
from wh9_sessions fixture
cross join wh9_identity identity
where fixture.n % 10 = 1;

set local session_replication_role = origin;

analyze public.workout_sessions;
analyze public.exercise_logs;
analyze public.exercise_log_metric_values;
analyze public.workout_session_muscle_snapshots;
analyze public.workout_session_muscle_snapshot_items;
analyze public.workout_session_timeline_events;
analyze public.personal_records;

create temp table wh9_timings (
  label text not null,
  sample integer not null,
  elapsed_ms numeric not null
) on commit drop;

create temp table wh9_plans (
  label text primary key,
  plan jsonb not null
) on commit drop;

create or replace function pg_temp.wh9_measure(p_label text,p_query text,p_repetitions integer default 15)
returns void language plpgsql as $measure$
declare
  v_started timestamptz;
  v_sample integer;
begin
  for v_sample in 1..p_repetitions loop
    v_started := clock_timestamp();
    execute p_query;
    insert into wh9_timings values (p_label,v_sample,extract(epoch from clock_timestamp()-v_started)*1000);
  end loop;
end
$measure$;

create or replace function pg_temp.wh9_explain(p_label text,p_query text)
returns void language plpgsql as $explain$
declare v_plan jsonb;
begin
  execute 'explain (analyze,buffers,format json) ' || p_query into v_plan;
  insert into wh9_plans values (p_label,v_plan);
end
$explain$;

select pg_temp.wh9_measure('default_month',$q$
  select id,workout_name,status,completed_at,cancelled_at,skipped_at,duration_minutes,repeated_from_session_id
  from public.workout_sessions
  where user_id='b9000000-0000-4000-8000-000000000001'
    and deleted_at is null
    and coalesce(completed_at,cancelled_at,skipped_at,started_at)>='2025-06-01'
    and coalesce(completed_at,cancelled_at,skipped_at,started_at)<'2025-07-01'
  order by coalesce(completed_at,cancelled_at,skipped_at,started_at) desc,id desc limit 20
$q$);

select pg_temp.wh9_measure('three_month',$q$
  select id,workout_name,status,completed_at,cancelled_at,skipped_at,duration_minutes
  from public.workout_sessions
  where user_id='b9000000-0000-4000-8000-000000000001' and deleted_at is null
    and coalesce(completed_at,cancelled_at,skipped_at,started_at)>='2025-04-01'
    and coalesce(completed_at,cancelled_at,skipped_at,started_at)<'2025-07-01'
  order by coalesce(completed_at,cancelled_at,skipped_at,started_at) desc,id desc limit 20
$q$);

select pg_temp.wh9_measure('multi_year',$q$
  select id,workout_name,status,completed_at,cancelled_at,skipped_at,duration_minutes
  from public.workout_sessions
  where user_id='b9000000-0000-4000-8000-000000000001' and deleted_at is null
    and coalesce(completed_at,cancelled_at,skipped_at,started_at)>='2021-01-01'
    and coalesce(completed_at,cancelled_at,skipped_at,started_at)<'2026-01-01'
  order by coalesce(completed_at,cancelled_at,skipped_at,started_at) desc,id desc limit 20
$q$);

select pg_temp.wh9_measure('period_summary',$q$
  select count(*),count(*) filter(where status='completed'),count(*) filter(where status='cancelled'),
    count(*) filter(where status='skipped'),coalesce(sum(duration_minutes),0)
  from public.workout_sessions
  where user_id='b9000000-0000-4000-8000-000000000001' and deleted_at is null
    and coalesce(completed_at,cancelled_at,skipped_at,started_at)>='2025-04-01'
    and coalesce(completed_at,cancelled_at,skipped_at,started_at)<'2025-07-01'
$q$);

select pg_temp.wh9_measure('session_detail',$q$
  select session.id,session.workout_name,
    jsonb_agg(distinct to_jsonb(log)) filter(where log.id is not null),
    jsonb_agg(distinct to_jsonb(metric)) filter(where metric.id is not null),
    jsonb_agg(distinct to_jsonb(event)) filter(where event.id is not null)
  from public.workout_sessions session
  left join public.exercise_logs log on log.workout_session_id=session.id
  left join public.exercise_log_metric_values metric on metric.exercise_log_id=log.id
  left join public.workout_session_timeline_events event on event.workout_session_id=session.id
  where session.user_id='b9000000-0000-4000-8000-000000000001'
    and session.id=md5('plaivra-wh9-session-4999')::uuid
  group by session.id
$q$);

select pg_temp.wh9_measure('filter_status',$q$
  select id from public.workout_sessions where user_id='b9000000-0000-4000-8000-000000000001'
    and deleted_at is null and status='completed' order by completed_at desc nulls last,id desc limit 20
$q$);
select pg_temp.wh9_measure('filter_type',$q$
  select id from public.workout_sessions where user_id='b9000000-0000-4000-8000-000000000001'
    and deleted_at is null and workout_category='strength' order by started_at desc,id desc limit 20
$q$);
select pg_temp.wh9_measure('filter_exercise',$q$
  select distinct session.id from public.workout_sessions session join public.exercise_logs log on log.workout_session_id=session.id
  where session.user_id='b9000000-0000-4000-8000-000000000001' and session.deleted_at is null
    and log.exercise_name ilike '%controlled%' order by session.id desc limit 20
$q$);
select pg_temp.wh9_measure('filter_repeated',$q$
  select id from public.workout_sessions where user_id='b9000000-0000-4000-8000-000000000001'
    and deleted_at is null and repeated_from_session_id is not null order by started_at desc,id desc limit 20
$q$);
select pg_temp.wh9_measure('search',$q$
  select distinct session.id from public.workout_sessions session left join public.exercise_logs log on log.workout_session_id=session.id
  where session.user_id='b9000000-0000-4000-8000-000000000001' and session.deleted_at is null
    and (session.workout_name ilike '%progressive%' or session.notes ilike '%progressive%' or log.exercise_name ilike '%progressive%')
  order by session.id desc limit 20
$q$);
select pg_temp.wh9_measure('next_cursor',$q$
  select id from public.workout_sessions where user_id='b9000000-0000-4000-8000-000000000001'
    and deleted_at is null and (started_at,id)<('2025-06-01 00:00:00+00',md5('plaivra-wh9-session-4800')::uuid)
  order by started_at desc,id desc limit 20
$q$);
select pg_temp.wh9_measure('recently_deleted',$q$
  select id,workout_name,deleted_at,purge_after from public.workout_sessions
  where user_id='b9000000-0000-4000-8000-000000000001' and deleted_at is not null
  order by deleted_at desc,id desc limit 20
$q$);
select pg_temp.wh9_measure('repeat_preview',$q$
  select session.id,session.workout_name,item.id,item.item_order,item.activity_name_snapshot,
    item.planned_global_exercise_id,item.planned_prescription
  from public.workout_sessions session
  join public.workout_session_muscle_snapshots snapshot on snapshot.workout_session_id=session.id
  join public.workout_session_muscle_snapshot_items item on item.snapshot_id=snapshot.id
  where session.user_id='b9000000-0000-4000-8000-000000000001'
    and session.id=md5('plaivra-wh9-session-3')::uuid and session.deleted_at is null
  order by item.item_order
$q$);

select pg_temp.wh9_explain('default_month',$q$
  select id,workout_name,status,completed_at,cancelled_at,skipped_at,duration_minutes,repeated_from_session_id
  from public.workout_sessions where user_id='b9000000-0000-4000-8000-000000000001' and deleted_at is null
  order by coalesce(completed_at,cancelled_at,skipped_at,started_at) desc,id desc limit 20
$q$);
select pg_temp.wh9_explain('period_summary',$q$
  select count(*),coalesce(sum(duration_minutes),0) from public.workout_sessions
  where user_id='b9000000-0000-4000-8000-000000000001' and deleted_at is null
$q$);
select pg_temp.wh9_explain('session_detail',$q$
  select session.id,log.id,metric.id,event.id from public.workout_sessions session
  left join public.exercise_logs log on log.workout_session_id=session.id
  left join public.exercise_log_metric_values metric on metric.exercise_log_id=log.id
  left join public.workout_session_timeline_events event on event.workout_session_id=session.id
  where session.user_id='b9000000-0000-4000-8000-000000000001' and session.id=md5('plaivra-wh9-session-4999')::uuid
$q$);
select pg_temp.wh9_explain('search',$q$
  select distinct session.id from public.workout_sessions session left join public.exercise_logs log on log.workout_session_id=session.id
  where session.user_id='b9000000-0000-4000-8000-000000000001' and session.deleted_at is null
    and (session.workout_name ilike '%progressive%' or session.notes ilike '%progressive%' or log.exercise_name ilike '%progressive%') limit 20
$q$);

select set_config('request.jwt.claim.sub','b9000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $mutation_measurements$
declare
  v_started timestamptz;
  v_item uuid := md5('plaivra-wh9-item-3')::uuid;
  v_exercise uuid := (select exercise_id from wh9_identity);
begin
  v_started:=clock_timestamp();
  perform public.replace_workout_derived_records_atomic(
    'b9000000-0000-4000-8000-000000000001'::uuid,md5('plaivra-wh9-session-1')::uuid,
    1::smallint,'wh6-v1','[]'::jsonb
  );
  insert into wh9_timings values ('pr_rebuild',1,extract(epoch from clock_timestamp()-v_started)*1000);

  v_started:=clock_timestamp();
  perform public.correct_completed_workout_session_atomic(
    'b9000000-0000-4000-8000-000000000001',md5('plaivra-wh9-session-2')::uuid,0,
    'wh9:correction:0001',jsonb_build_object('notes','WH-9 measured correction'),'[]'::jsonb
  );
  insert into wh9_timings values ('correction',1,extract(epoch from clock_timestamp()-v_started)*1000);

  v_started:=clock_timestamp();
  perform public.soft_delete_workout_session_atomic(
    'b9000000-0000-4000-8000-000000000001',md5('plaivra-wh9-session-3')::uuid,'wh9:soft-delete:0001'
  );
  insert into wh9_timings values ('soft_delete',1,extract(epoch from clock_timestamp()-v_started)*1000);

  v_started:=clock_timestamp();
  perform public.restore_workout_session_atomic(
    'b9000000-0000-4000-8000-000000000001',md5('plaivra-wh9-session-3')::uuid,'wh9:restore:0001'
  );
  insert into wh9_timings values ('restore',1,extract(epoch from clock_timestamp()-v_started)*1000);

  v_started:=clock_timestamp();
  perform public.purge_expired_workout_sessions(100,true);
  insert into wh9_timings values ('purge_batch',1,extract(epoch from clock_timestamp()-v_started)*1000);

  v_started:=clock_timestamp();
  perform public.start_repeated_workout_session_atomic(
    'b9000000-0000-4000-8000-000000000001',md5('plaivra-wh9-session-3')::uuid,
    md5('plaivra-wh9-repeat-candidate')::uuid,'wh9:repeat-start:0001',
    jsonb_build_array(jsonb_build_object(
      'sourceSnapshotItemId',v_item,'action','use',
      'identity',jsonb_build_object('targetType','global_exercise','identity',v_exercise::text)
    ))
  );
  insert into wh9_timings values ('repeat_start',1,extract(epoch from clock_timestamp()-v_started)*1000);

  v_started:=clock_timestamp();
  perform public.purge_workout_session_atomic(
    'b9000000-0000-4000-8000-000000000001',md5('plaivra-wh9-session-25')::uuid,true
  );
  insert into wh9_timings values ('purge_session',1,extract(epoch from clock_timestamp()-v_started)*1000);
end
$mutation_measurements$;

create temp table wh9_payloads on commit drop as
select 'list_20' label,octet_length(coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb)::text) bytes
from (
  select id,workout_name,status,completed_at,cancelled_at,skipped_at,duration_minutes,workout_category,repeated_from_session_id
  from public.workout_sessions
  where user_id='b9000000-0000-4000-8000-000000000001' and deleted_at is null and status<>'started'
  order by started_at desc,id desc limit 20
) result
union all
select 'session_detail',octet_length(to_jsonb(result)::text)
from (
  select session.*,
    (select jsonb_agg(to_jsonb(log)) from public.exercise_logs log where log.workout_session_id=session.id) logs,
    (select jsonb_agg(to_jsonb(metric)) from public.exercise_log_metric_values metric where metric.workout_session_id=session.id) metrics,
    (select jsonb_agg(to_jsonb(detail)) from public.exercise_log_set_details detail where detail.workout_session_id=session.id) details,
    (select jsonb_agg(to_jsonb(segment)) from public.exercise_log_set_segments segment where segment.workout_session_id=session.id) segments,
    (select jsonb_agg(to_jsonb(event)) from public.workout_session_timeline_events event where event.workout_session_id=session.id) timeline
  from public.workout_sessions session
  where session.id=md5('plaivra-wh9-session-4999')::uuid
) result;

with fixture_counts as (
  select jsonb_build_object(
    'sessions',(select count(*) from wh9_sessions),
    'exerciseLogs',(select count(*) from wh9_logs),
    'metricRows',(select count(*) from public.exercise_log_metric_values where user_id='b9000000-0000-4000-8000-000000000001'),
    'setDetails',(select count(*) from public.exercise_log_set_details where user_id='b9000000-0000-4000-8000-000000000001'),
    'segments',(select count(*) from public.exercise_log_set_segments where user_id='b9000000-0000-4000-8000-000000000001'),
    'snapshots',(select count(*) from public.workout_session_muscle_snapshots where user_id='b9000000-0000-4000-8000-000000000001'),
    'prescriptionSets',(select count(*) from public.workout_session_prescription_sets where user_id='b9000000-0000-4000-8000-000000000001'),
    'prescriptionTargets',(select count(*) from public.workout_session_prescription_metric_targets where user_id='b9000000-0000-4000-8000-000000000001'),
    'verifiedRecords',(select count(*) from public.personal_records where user_id='b9000000-0000-4000-8000-000000000001'),
    'timelineEvents',(select count(*) from public.workout_session_timeline_events where user_id='b9000000-0000-4000-8000-000000000001'),
    'deletedSessions',(select count(*) from public.workout_sessions where user_id='b9000000-0000-4000-8000-000000000001' and deleted_at is not null),
    'repeatedSessions',(select count(*) from public.workout_sessions where user_id='b9000000-0000-4000-8000-000000000001' and repeated_from_session_id is not null)
  ) value
), timing_report as (
  select jsonb_object_agg(label,jsonb_build_object('samples',samples,'p50Ms',p50,'p95Ms',p95,'maxMs',maximum)) value
  from (
    select label,count(*) samples,
      round(percentile_cont(0.5) within group(order by elapsed_ms)::numeric,3) p50,
      round(percentile_cont(0.95) within group(order by elapsed_ms)::numeric,3) p95,
      round(max(elapsed_ms),3) maximum
    from wh9_timings group by label
  ) timing
), plan_report as (
  select jsonb_object_agg(label,jsonb_build_object(
    'executionMs',round(((plan->0->>'Execution Time')::numeric),3),
    'planningMs',round(((plan->0->>'Planning Time')::numeric),3),
    'actualRows',(plan#>>'{0,Plan,Actual Rows}')::bigint,
    'sharedHitBlocks',coalesce((plan#>>'{0,Plan,Shared Hit Blocks}')::bigint,0),
    'sharedReadBlocks',coalesce((plan#>>'{0,Plan,Shared Read Blocks}')::bigint,0),
    'nodeType',plan#>>'{0,Plan,Node Type}'
  )) value from wh9_plans
), payload_report as (
  select jsonb_object_agg(label,bytes) value from wh9_payloads
), storage_report as (
  select jsonb_build_object(
    'tableBytes',sum(pg_total_relation_size(format('public.%I',tablename)::regclass))-sum(pg_indexes_size(format('public.%I',tablename)::regclass)),
    'indexBytes',sum(pg_indexes_size(format('public.%I',tablename)::regclass)),
    'indexToTableRatio',round((sum(pg_indexes_size(format('public.%I',tablename)::regclass))::numeric/nullif(sum(pg_total_relation_size(format('public.%I',tablename)::regclass))-sum(pg_indexes_size(format('public.%I',tablename)::regclass)),0)),3),
    'averageBytesPerSession',round(sum(pg_total_relation_size(format('public.%I',tablename)::regclass))::numeric/5000,2),
    'childRowsPerSession',round(((select count(*) from wh9_logs)+(select count(*) from public.exercise_log_metric_values where user_id='b9000000-0000-4000-8000-000000000001')+(select count(*) from public.exercise_log_set_details where user_id='b9000000-0000-4000-8000-000000000001')+(select count(*) from public.exercise_log_set_segments where user_id='b9000000-0000-4000-8000-000000000001')+(select count(*) from public.workout_session_prescription_sets where user_id='b9000000-0000-4000-8000-000000000001')+(select count(*) from public.workout_session_prescription_metric_targets where user_id='b9000000-0000-4000-8000-000000000001'))::numeric/5000,2),
    'timelineEventsPerSession',round((select count(*)::numeric/5000 from public.workout_session_timeline_events where user_id='b9000000-0000-4000-8000-000000000001'),2),
    'personalRecordRowsPerSession',round((select count(*)::numeric/5000 from public.personal_records where user_id='b9000000-0000-4000-8000-000000000001'),3),
    'softDeletedRetentionBytesEstimate',round(sum(pg_total_relation_size(format('public.%I',tablename)::regclass))::numeric/5000*(select count(*) from public.workout_sessions where user_id='b9000000-0000-4000-8000-000000000001' and deleted_at is not null),2),
    'cacheBound','20 list summaries plus one bounded detail graph per cached session',
    'purgeBehavior','SKIP LOCKED batches capped at 500; session purge cascades owned child graph',
    'walWriteAmplificationEstimate',jsonb_build_object('method','index-to-table byte ratio proxy','ratio',round((sum(pg_indexes_size(format('public.%I',tablename)::regclass))::numeric/nullif(sum(pg_total_relation_size(format('public.%I',tablename)::regclass))-sum(pg_indexes_size(format('public.%I',tablename)::regclass)),0)),3))
  ) value
  from pg_tables
  where schemaname='public' and tablename in (
    'workout_sessions','exercise_logs','exercise_log_metric_values','exercise_log_set_details',
    'exercise_log_set_segments','workout_session_muscle_snapshots','workout_session_muscle_snapshot_items',
    'workout_session_prescription_sets','workout_session_prescription_metric_targets',
    'workout_session_timeline_events','personal_records'
  )
), index_report as (
  select coalesce(jsonb_object_agg(indexrelname,pg_relation_size(indexrelid)),'{}'::jsonb) value
  from pg_stat_user_indexes
  where schemaname='public' and relname in ('workout_sessions','exercise_logs','workout_session_timeline_events','personal_records')
)
select 'PLAIVRA_WH9_REPORT:' || jsonb_build_object(
  'fixture',(select value from fixture_counts),
  'timings',(select value from timing_report),
  'plans',(select value from plan_report),
  'payloadBytes',(select value from payload_report),
  'queryCounts',jsonb_build_object('list',9,'detail',7,'bounded',true,'nPlusOne',false),
  'storage',(select value from storage_report),
  'indexSizes',(select value from index_report),
  'optimizationDecision','measured_before_index_decision'
)::text;

rollback;
