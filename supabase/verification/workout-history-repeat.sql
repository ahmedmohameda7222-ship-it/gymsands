\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.wh8_assert(p_condition boolean,p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition,false) then raise exception '%',p_message; end if;
end
$function$;

create or replace function pg_temp.wh8_rejected(p_sql text,p_message text)
returns void language plpgsql as $function$
begin
  begin execute p_sql;
  exception when others then return;
  end;
  raise exception '%',p_message;
end
$function$;

grant execute on function pg_temp.wh8_assert(boolean,text) to public;
grant execute on function pg_temp.wh8_rejected(text,text) to public;

select pg_temp.wh8_assert(
  to_regprocedure('public.start_repeated_workout_session_atomic(uuid,uuid,uuid,text,jsonb)') is not null
  and not has_function_privilege('anon','public.start_repeated_workout_session_atomic(uuid,uuid,uuid,text,jsonb)','execute')
  and has_function_privilege('authenticated','public.start_repeated_workout_session_atomic(uuid,uuid,uuid,text,jsonb)','execute'),
  'WH-8 repeat authority or grants are invalid.'
);
select pg_temp.wh8_assert(
  not exists(select 1 from pg_indexes where schemaname='public' and indexdef ilike '%repeated_from_session_id%'),
  'WH-8 added an unproven provenance index.'
);

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values
  ('b8000000-0000-4000-8000-000000000001','authenticated','authenticated','wh8-owner@plaivra.invalid','',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false),
  ('b8000000-0000-4000-8000-000000000002','authenticated','authenticated','wh8-other@plaivra.invalid','',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false);
insert into public.profiles(id,email,full_name,role) values
  ('b8000000-0000-4000-8000-000000000001','wh8-owner@plaivra.invalid','WH-8 owner','member'),
  ('b8000000-0000-4000-8000-000000000002','wh8-other@plaivra.invalid','WH-8 other','member')
on conflict (id) do update set email=excluded.email,full_name=excluded.full_name,role=excluded.role;

select
  max(id::text) filter(where exercise_rank=1) as source_exercise_id,
  max(id::text) filter(where exercise_rank=2) as replacement_exercise_id
from (
  select exercise.id,row_number() over(order by exercise.id) as exercise_rank
  from public.exercises exercise
  where exercise.is_global and exercise.is_approved
    and exists(select 1 from private.resolve_muscle_mapping(exercise.id,'exercise_muscle_mapping_v2',clock_timestamp()))
  order by exercise.id limit 2
) candidate \gset
select pg_temp.wh8_assert(:'source_exercise_id' is not null and :'replacement_exercise_id' is not null,'WH-8 fixture needs two mapped global exercises.');

set local role authenticated;
select set_config('request.jwt.claim.sub','b8000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.start_or_resume_direct_workout_session_atomic(
  'b8000000-0000-4000-8000-000000000001','global_exercise',:'source_exercise_id',null,
  'WH-8 source workout','strength','{"sets":2,"reps":"8-10","weight":50}'::jsonb,null
) as source_result \gset
select set_config('plaivra.wh8_source_session_id',:'source_result'::jsonb->'session'->>'id',true);
select set_config('plaivra.wh8_source_item_id',:'source_result'::jsonb->'snapshotItem'->>'id',true);
reset role;

insert into public.workout_session_muscle_snapshot_items(
  id,snapshot_id,user_id,item_order,activity_name_snapshot,
  planned_target_type,planned_global_exercise_id,planned_custom_exercise_id,
  planned_provider,planned_provider_activity_id,
  planned_mapping_set_id,planned_custom_mapping_set_id,
  planned_mapping_version,planned_mapping_schema_version,planned_mapping_checksum,
  planned_custom_identity_snapshot,planned_custom_mapping_entries,
  planned_prescription,planned_sets,state
)
select
  extra.id,item.snapshot_id,item.user_id,extra.item_order,item.activity_name_snapshot||extra.suffix,
  item.planned_target_type,item.planned_global_exercise_id,item.planned_custom_exercise_id,
  item.planned_provider,item.planned_provider_activity_id,
  item.planned_mapping_set_id,item.planned_custom_mapping_set_id,
  item.planned_mapping_version,item.planned_mapping_schema_version,item.planned_mapping_checksum,
  item.planned_custom_identity_snapshot,item.planned_custom_mapping_entries,
  extra.prescription,(extra.prescription->>'sets')::integer,'planned'
from public.workout_session_muscle_snapshot_items item
cross join (values
  ('b8000000-0000-4000-8000-000000000021'::uuid,2,' omitted','{"sets":1,"reps":6}'::jsonb),
  ('b8000000-0000-4000-8000-000000000022'::uuid,3,' replaced','{"sets":1,"reps":12}'::jsonb)
) extra(id,item_order,suffix,prescription)
where item.id=current_setting('plaivra.wh8_source_item_id')::uuid;

insert into public.exercise_logs(
  id,workout_session_id,exercise_name,set_number,reps,weight_kg,completed_at,exercise_order,source,set_type,created_at
) values (
  'b8000000-0000-4000-8000-000000000030',current_setting('plaivra.wh8_source_session_id')::uuid,
  'WH-8 performed source only',1,8,50,'2026-08-01T10:30:00Z',1,'manual','working','2026-08-01T10:30:00Z'
);
update public.workout_sessions
set status='completed',completed_at='2026-08-01T11:00:00Z',duration_minutes=60,notes='Source note must not copy'
where id=current_setting('plaivra.wh8_source_session_id')::uuid;
select private.append_workout_session_timeline_event(
  current_setting('plaivra.wh8_source_session_id')::uuid,'b8000000-0000-4000-8000-000000000001',
  'session_completed','2026-08-01T11:00:00Z','runtime','wh8-source-completed',
  '{"sourceOnly":true}'::jsonb
);
insert into public.personal_records(
  user_id,exercise_name,record_type,record_date,source_kind,record_key,
  exercise_identity_kind,exercise_identity,workout_session_id,exercise_log_id,
  derived_record_type,record_value,record_unit,comparison_context_key,set_type,
  schema_version,formula_version,achieved_at
) values (
  'b8000000-0000-4000-8000-000000000001','WH-8 source record','highest_load','2026-08-01','workout_derived','wh8-source-record',
  'global','global:'||:'source_exercise_id',current_setting('plaivra.wh8_source_session_id')::uuid,
  'b8000000-0000-4000-8000-000000000030','highest_load',50,'kg','resistance:external','working',1,'wh8-test','2026-08-01T10:30:00Z'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','b8000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.wh8_rejected(
  format($sql$select public.start_repeated_workout_session_atomic(
    'b8000000-0000-4000-8000-000000000001','%s','b8000000-0000-4000-8000-000000000040',
    'wh8-wrong-owner-repeat-0001','[]'::jsonb)$sql$,current_setting('plaivra.wh8_source_session_id')),
  'WH-8 allowed a non-owner repeat.'
);

select set_config('request.jwt.claim.sub','b8000000-0000-4000-8000-000000000001',true);
select public.start_repeated_workout_session_atomic(
  'b8000000-0000-4000-8000-000000000001',current_setting('plaivra.wh8_source_session_id')::uuid,
  'b8000000-0000-4000-8000-000000000040','wh8-repeat-start-operation-0001',
  jsonb_build_array(
    jsonb_build_object(
      'sourceSnapshotItemId',current_setting('plaivra.wh8_source_item_id'),'action','use',
      'identity',jsonb_build_object('targetType','global_exercise','identity',:'source_exercise_id')
    ),
    jsonb_build_object('sourceSnapshotItemId','b8000000-0000-4000-8000-000000000021','action','omit'),
    jsonb_build_object(
      'sourceSnapshotItemId','b8000000-0000-4000-8000-000000000022','action','replace',
      'identity',jsonb_build_object('targetType','global_exercise','identity',:'replacement_exercise_id')
    )
  )
) as repeat_result \gset

set constraints all immediate;
select pg_temp.wh8_assert(
  :'repeat_result'::jsonb->'session'->>'id'='b8000000-0000-4000-8000-000000000040'
  and (select repeated_from_session_id=current_setting('plaivra.wh8_source_session_id')::uuid
       and status='started' and completed_at is null and duration_minutes is null and notes is null
       from public.workout_sessions where id='b8000000-0000-4000-8000-000000000040'),
  'WH-8 did not create the exact candidate root with clean active state.'
);
select pg_temp.wh8_assert(
  (select count(*)=2 and min(item_order)=1 and max(item_order)=2
   from public.workout_session_muscle_snapshot_items item
   join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id
   where snapshot.workout_session_id='b8000000-0000-4000-8000-000000000040')
  and (select array_agg(planned_global_exercise_id order by item_order)=array[:'source_exercise_id'::uuid,:'replacement_exercise_id'::uuid]
       from public.workout_session_muscle_snapshot_items item
       join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id
       where snapshot.workout_session_id='b8000000-0000-4000-8000-000000000040'),
  'WH-8 omit, replacement, or source ordering is incorrect.'
);
select pg_temp.wh8_assert(
  (select count(*)=3 from public.workout_session_prescription_sets where workout_session_id='b8000000-0000-4000-8000-000000000040')
  and exists(select 1 from public.workout_session_prescription_metric_targets where workout_session_id='b8000000-0000-4000-8000-000000000040')
  and exists(select 1 from public.workout_session_execution_states where workout_session_id='b8000000-0000-4000-8000-000000000040'),
  'WH-8 did not materialize the new frozen prescription and execution state.'
);
select pg_temp.wh8_assert(
  not exists(select 1 from public.exercise_logs where workout_session_id='b8000000-0000-4000-8000-000000000040')
  and not exists(select 1 from public.personal_records where workout_session_id='b8000000-0000-4000-8000-000000000040')
  and (select count(*)=2 from public.workout_session_timeline_events where workout_session_id='b8000000-0000-4000-8000-000000000040')
  and not exists(select 1 from public.workout_session_timeline_events where workout_session_id='b8000000-0000-4000-8000-000000000040' and idempotency_key='wh8-source-completed'),
  'WH-8 copied performed logs, records, or source timeline.'
);

select public.start_repeated_workout_session_atomic(
  'b8000000-0000-4000-8000-000000000001',current_setting('plaivra.wh8_source_session_id')::uuid,
  'b8000000-0000-4000-8000-000000000040','wh8-repeat-start-operation-0001',
  jsonb_build_array(
    jsonb_build_object('sourceSnapshotItemId',current_setting('plaivra.wh8_source_item_id'),'action','use','identity',jsonb_build_object('targetType','global_exercise','identity',:'source_exercise_id')),
    jsonb_build_object('sourceSnapshotItemId','b8000000-0000-4000-8000-000000000021','action','omit'),
    jsonb_build_object('sourceSnapshotItemId','b8000000-0000-4000-8000-000000000022','action','replace','identity',jsonb_build_object('targetType','global_exercise','identity',:'replacement_exercise_id'))
  )
) as replay_result \gset
select pg_temp.wh8_assert(:'replay_result'::jsonb=:'repeat_result'::jsonb,'WH-8 idempotent replay changed the canonical result.');

select pg_temp.wh8_rejected(
  format($sql$select public.start_repeated_workout_session_atomic(
    'b8000000-0000-4000-8000-000000000001','%s','b8000000-0000-4000-8000-000000000041',
    'wh8-repeat-active-conflict-001',jsonb_build_array(jsonb_build_object(
      'sourceSnapshotItemId','%s','action','use','identity',jsonb_build_object(
        'targetType','global_exercise','identity','%s'))))$sql$,
    current_setting('plaivra.wh8_source_session_id'),current_setting('plaivra.wh8_source_item_id'),:'source_exercise_id'),
  'WH-8 allowed a second active repeated workout.'
);

select public.soft_delete_workout_session_atomic(
  'b8000000-0000-4000-8000-000000000001',current_setting('plaivra.wh8_source_session_id')::uuid,
  'wh8-source-soft-delete-operation'
);
select pg_temp.wh8_rejected(
  format($sql$select public.start_repeated_workout_session_atomic(
    'b8000000-0000-4000-8000-000000000001','%s','b8000000-0000-4000-8000-000000000042',
    'wh8-repeat-deleted-source-001','[]'::jsonb)$sql$,current_setting('plaivra.wh8_source_session_id')),
  'WH-8 allowed a deleted source repeat.'
);
select public.purge_workout_session_atomic(
  'b8000000-0000-4000-8000-000000000001',current_setting('plaivra.wh8_source_session_id')::uuid,true
);
select pg_temp.wh8_assert(
  exists(select 1 from public.workout_sessions where id='b8000000-0000-4000-8000-000000000040' and repeated_from_session_id is null)
  and exists(select 1 from public.workout_session_execution_states where workout_session_id='b8000000-0000-4000-8000-000000000040'),
  'WH-8 hard purge did not null repeat provenance while preserving the repeated session.'
);

rollback;
