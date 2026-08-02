\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.wh_muscle_assert(p_condition boolean,p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition,false) then raise exception '%',p_message; end if;
end
$function$;
grant execute on function pg_temp.wh_muscle_assert(boolean,text) to public;

insert into auth.users(
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  'ba000000-0000-4000-8000-000000000001','authenticated','authenticated',
  'wh-muscle-owner@example.test','',
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
);

insert into public.user_workout_plans(id,user_id,name,is_active,is_default,source,created_at,updated_at)
values (
  'ba000000-0000-4000-8000-000000000010',
  'ba000000-0000-4000-8000-000000000001',
  'WH muscle plan',true,true,'manual',now(),now()
);
insert into public.user_workout_plan_days(id,plan_id,day_number,day_name,weekday,created_at,updated_at)
values (
  'ba000000-0000-4000-8000-000000000011',
  'ba000000-0000-4000-8000-000000000010',1,'WH muscle day','Monday',now(),now()
);
insert into public.user_workout_plan_exercises(
  id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at
) values (
  'ba000000-0000-4000-8000-000000000012',
  'ba000000-0000-4000-8000-000000000011',
  'WH muscle press',2,'8',60,1,1,now()
);

insert into public.workout_sessions(
  id,user_id,workout_name,status,started_at,completed_at,plan_id,plan_day_id,source,created_at,updated_at
) values (
  'ba000000-0000-4000-8000-000000000020',
  'ba000000-0000-4000-8000-000000000001',
  'WH corrected muscle session','started','2026-08-01T10:00:00Z',null,
  'ba000000-0000-4000-8000-000000000010',
  'ba000000-0000-4000-8000-000000000011','manual',now(),now()
);

select snapshot.id as snapshot_id,snapshot.snapshot_schema_version
from public.workout_session_muscle_snapshots snapshot
where snapshot.workout_session_id='ba000000-0000-4000-8000-000000000020' \gset
select item.id as snapshot_item_id,
       md5(jsonb_build_object(
         'planned_target_type',item.planned_target_type,
         'planned_global_exercise_id',item.planned_global_exercise_id,
         'planned_custom_exercise_id',item.planned_custom_exercise_id,
         'planned_mapping_set_id',item.planned_mapping_set_id,
         'planned_custom_mapping_set_id',item.planned_custom_mapping_set_id,
         'planned_mapping_version',item.planned_mapping_version,
         'planned_mapping_schema_version',item.planned_mapping_schema_version,
         'planned_mapping_checksum',item.planned_mapping_checksum,
         'planned_prescription',item.planned_prescription,
         'planned_sets',item.planned_sets
       )::text) as planned_hash
from public.workout_session_muscle_snapshot_items item
where item.snapshot_id=:'snapshot_id'::uuid and item.item_order=1 \gset

select pg_temp.wh_muscle_assert(
  :'snapshot_schema_version'='workout_session_muscle_snapshot_v2',
  'Workout History muscle correction fixture did not create a V2 snapshot.'
);

insert into public.exercise_logs(
  id,workout_session_id,exercise_name,set_number,reps,weight_kg,plan_exercise_id,
  completed_at,exercise_order,source,set_type,created_at
) values
  (
    'ba000000-0000-4000-8000-000000000021',
    'ba000000-0000-4000-8000-000000000020','WH muscle press',1,8,60,
    'ba000000-0000-4000-8000-000000000012','2026-08-01T10:20:00Z',1,'manual','working',now()
  ),
  (
    'ba000000-0000-4000-8000-000000000022',
    'ba000000-0000-4000-8000-000000000020','WH muscle press',2,8,60,
    'ba000000-0000-4000-8000-000000000012','2026-08-01T10:30:00Z',1,'manual','working',now()
  );
update public.workout_sessions
set status='completed',completed_at='2026-08-01T11:00:00Z'
where id='ba000000-0000-4000-8000-000000000020';

select performed_frozen_at as first_frozen_at
from public.workout_session_muscle_snapshot_items
where id=:'snapshot_item_id'::uuid \gset
select pg_temp.wh_muscle_assert(
  (select performed_total_sets=2 and performed_qualifying_sets=2
   from public.workout_session_muscle_snapshot_items where id=:'snapshot_item_id'::uuid),
  'Terminal V2 muscle workload did not freeze two qualifying sets.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select public.correct_completed_workout_session_atomic(
  'ba000000-0000-4000-8000-000000000001',
  'ba000000-0000-4000-8000-000000000020',0,
  'wh-muscle-correction-warmup-0001','{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'kind','update',
    'exerciseLogId','ba000000-0000-4000-8000-000000000021',
    'patch',jsonb_build_object(
      'setDetails',jsonb_build_object('setType','warmup','rpe',5,'rir',5)
    )
  ))
);
select pg_temp.wh_muscle_assert(
  (select performed_total_sets=2 and performed_qualifying_sets=1
     and performed_frozen_at>:'first_frozen_at'::timestamptz
   from public.workout_session_muscle_snapshot_items where id=:'snapshot_item_id'::uuid),
  'Warm-up correction did not refreeze the V2 qualifying workload.'
);

select public.correct_completed_workout_session_atomic(
  'ba000000-0000-4000-8000-000000000001',
  'ba000000-0000-4000-8000-000000000020',1,
  'wh-muscle-correction-remove-0002','{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'kind','remove','exerciseLogId','ba000000-0000-4000-8000-000000000022'
  ))
);
select pg_temp.wh_muscle_assert(
  (select performed_total_sets=1 and performed_qualifying_sets=0
   from public.workout_session_muscle_snapshot_items where id=:'snapshot_item_id'::uuid),
  'Set removal did not reduce the V2 performed workload.'
);

select public.correct_completed_workout_session_atomic(
  'ba000000-0000-4000-8000-000000000001',
  'ba000000-0000-4000-8000-000000000020',2,
  'wh-muscle-correction-add-0003','{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'kind','add','snapshotItemId',:'snapshot_item_id', 'setNumber',2,
    'values',jsonb_build_object(
      'reps',9,'weightKg',62.5,'setType','working',
      'completedAt','2026-08-01T10:35:00Z',
      'setDetails',jsonb_build_object('setType','working','rpe',8,'rir',2)
    )
  ))
);
select pg_temp.wh_muscle_assert(
  (select performed_total_sets=2 and performed_qualifying_sets=1
   from public.workout_session_muscle_snapshot_items where id=:'snapshot_item_id'::uuid),
  'Set addition did not increase the V2 performed workload.'
);

reset role;
select pg_temp.wh_muscle_assert(
  (select md5(jsonb_build_object(
     'planned_target_type',item.planned_target_type,
     'planned_global_exercise_id',item.planned_global_exercise_id,
     'planned_custom_exercise_id',item.planned_custom_exercise_id,
     'planned_mapping_set_id',item.planned_mapping_set_id,
     'planned_custom_mapping_set_id',item.planned_custom_mapping_set_id,
     'planned_mapping_version',item.planned_mapping_version,
     'planned_mapping_schema_version',item.planned_mapping_schema_version,
     'planned_mapping_checksum',item.planned_mapping_checksum,
     'planned_prescription',item.planned_prescription,
     'planned_sets',item.planned_sets
   )::text)=:'planned_hash'
   from public.workout_session_muscle_snapshot_items item
   where item.id=:'snapshot_item_id'::uuid),
  'Completed-session correction changed the immutable planned muscle prescription.'
);

rollback;
