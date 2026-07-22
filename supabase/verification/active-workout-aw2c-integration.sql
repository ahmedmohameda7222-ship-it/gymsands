\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.aw2c_assert(p_condition boolean,p_message text)
returns void language plpgsql as $function$
begin if not coalesce(p_condition,false) then raise exception '%',p_message; end if; end
$function$;

create or replace function pg_temp.aw2c_rejected(p_sql text,p_codes text[],p_message text)
returns void language plpgsql as $function$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate=any(p_codes) then return; end if;
    raise exception '% Unexpected SQLSTATE %: %',p_message,sqlstate,sqlerrm;
  end;
  raise exception '%',p_message;
end
$function$;
grant execute on function pg_temp.aw2c_assert(boolean,text) to public;
grant execute on function pg_temp.aw2c_rejected(text,text[],text) to public;

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('c2c00000-0000-4000-8000-000000000001','authenticated','authenticated','aw2c-owner@example.test','',
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
('c2c00000-0000-4000-8000-000000000002','authenticated','authenticated','aw2c-other@example.test','',
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
\set owner_id 'c2c00000-0000-4000-8000-000000000001'
\set other_id 'c2c00000-0000-4000-8000-000000000002'

select pg_temp.aw2c_assert(
  (select count(*)=2 from public.profiles where id in (:'owner_id'::uuid,:'other_id'::uuid)),
  'AW-2C auth fixtures did not create profiles.');

insert into public.user_workout_plans(id,user_id,name,is_active,is_default,source,created_at,updated_at)
values('c2c00000-0000-4000-8000-000000000010',:'owner_id'::uuid,'AW-2C plan',true,true,'manual',now(),now());
insert into public.user_workout_plan_days(id,plan_id,day_number,day_name,weekday,created_at,updated_at)
values('c2c00000-0000-4000-8000-000000000011','c2c00000-0000-4000-8000-000000000010',1,'AW-2C day','Monday',now(),now());
insert into public.user_workout_plan_exercises
(id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at)
values('c2c00000-0000-4000-8000-000000000012','c2c00000-0000-4000-8000-000000000011','AW-2C exercise',3,'8',90,1,1,now());
insert into public.user_workout_sessions
(id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,created_at,updated_at)
values
('c2c00000-0000-4000-8000-000000000014',:'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000010','c2c00000-0000-4000-8000-000000000011',1,1,1,current_date,'AW-2C day','scheduled',now(),now()),
('c2c00000-0000-4000-8000-000000000015',:'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000010','c2c00000-0000-4000-8000-000000000011',1,2,2,current_date,'AW-2C day','scheduled',now(),now()),
('c2c00000-0000-4000-8000-000000000016',:'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000010','c2c00000-0000-4000-8000-000000000011',1,3,3,current_date,'AW-2C day','scheduled',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claim.role','authenticated',true);

select (public.start_or_resume_workout_session_atomic(
  :'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,'c2c00000-0000-4000-8000-000000000014'::uuid
)->'session'->>'id') as session_id \gset
set constraints all immediate;
select pg_temp.aw2c_assert(
  (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='session_started'),
  'AW-2C start event is missing.');
select public.start_or_resume_workout_session_atomic(
  :'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,'c2c00000-0000-4000-8000-000000000014'::uuid
);
select pg_temp.aw2c_assert(
  (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='session_started'),
  'AW-2C resume duplicated the session start event.');

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000101'::uuid,0,'pause','{"controller_device_id":null}'::jsonb
);
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000101'::uuid,0,'pause','{"controller_device_id":null}'::jsonb
);
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000102'::uuid,1,'pause','{"controller_device_id":null}'::jsonb
);
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000103'::uuid,0,'resume','{"controller_device_id":null}'::jsonb
);
select pg_temp.aw2c_assert(
  (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='session_paused')
  and not exists(select 1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and command_id in ('c2c00000-0000-4000-8000-000000000102'::uuid,'c2c00000-0000-4000-8000-000000000103'::uuid)),
  'AW-2C replay, no-op, or revision-conflict command produced timeline noise.');

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000104'::uuid,1,'resume','{"controller_device_id":null}'::jsonb
);
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000105'::uuid,2,'start_rest','{"duration_seconds":90,"controller_device_id":null}'::jsonb
);
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000106'::uuid,3,'start_rest','{"duration_seconds":60,"controller_device_id":null}'::jsonb
);
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000107'::uuid,4,'clear_rest','{"view_state":"set_entry","controller_device_id":null}'::jsonb
);
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000108'::uuid,5,'move_cursor','{"active_snapshot_item_id":null,"active_item_order":1,"active_set_number":2,"view_state":"set_entry","controller_device_id":null}'::jsonb
);
select pg_temp.aw2c_assert(
  (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='session_resumed')
  and (select count(*)=2 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='rest_started')
  and (select count(*)=2 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='rest_ended')
  and (select count(*)=2 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and command_id='c2c00000-0000-4000-8000-000000000106'::uuid)
  and not exists(select 1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and command_id='c2c00000-0000-4000-8000-000000000108'::uuid),
  'AW-2C command semantic event mapping is incorrect.');

select clock_timestamp()::text as set_completed_at \gset
select public.upsert_workout_set_logs_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,
  jsonb_build_array(jsonb_build_object(
    'plan_exercise_id','c2c00000-0000-4000-8000-000000000012','exercise_order',1,
    'exercise_name','AW-2C exercise','set_number',1,'reps',8,'weight_kg',50,
    'notes','private set note','completed_at',:'set_completed_at'))
);
select public.upsert_workout_set_logs_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,
  jsonb_build_array(jsonb_build_object(
    'plan_exercise_id','c2c00000-0000-4000-8000-000000000012','exercise_order',1,
    'exercise_name','AW-2C exercise','set_number',1,'reps',8,'weight_kg',50,
    'notes','private set note','completed_at',:'set_completed_at'))
);
select pg_temp.aw2c_assert(
  (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='set_completed')
  and (select count(*)=0 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='set_edited'),
  'AW-2C exact completed-set retry created a duplicate event.');
select public.upsert_workout_set_logs_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,
  jsonb_build_array(jsonb_build_object(
    'plan_exercise_id','c2c00000-0000-4000-8000-000000000012','exercise_order',1,
    'exercise_name','AW-2C exercise','set_number',1,'reps',10,'weight_kg',52.5,
    'notes','changed private note','completed_at',:'set_completed_at'))
);
select pg_temp.aw2c_assert(
  (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='set_completed')
  and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='set_edited')
  and (select bool_and(coalesce((payload->>'notesChanged')::boolean,false)) from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='set_edited')
  and not exists(select 1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and payload::text like '%private%'),
  'AW-2C set events are incorrect or leaked raw notes.');

select public.complete_workout_session_atomic(:'owner_id'::uuid,:'session_id'::uuid,null,30,'private session note');
select public.complete_workout_session_atomic(:'owner_id'::uuid,:'session_id'::uuid,null,30,'private session note');
select pg_temp.aw2c_assert(
  (select status='completed' from public.workout_sessions where id=:'session_id'::uuid)
  and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='session_completed')
  and not exists(select 1 from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid),
  'AW-2C completion or completion retry is not atomic and idempotent.');

select (public.start_or_resume_workout_session_atomic(
  :'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,'c2c00000-0000-4000-8000-000000000015'::uuid
)->'session'->>'id') as cancel_session_id \gset
select public.cancel_workout_session_atomic(:'owner_id'::uuid,:'cancel_session_id'::uuid,'started_by_mistake');
select public.cancel_workout_session_atomic(:'owner_id'::uuid,:'cancel_session_id'::uuid,'started_by_mistake');
select pg_temp.aw2c_assert(
  (select status='cancelled' and cancelled_at is not null and completed_at is null and scheduled_session_id is null from public.workout_sessions where id=:'cancel_session_id'::uuid)
  and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'cancel_session_id'::uuid and event_type='session_cancelled')
  and (select status='scheduled' and started_at is null and completed_at is null and skipped_at is null from public.user_workout_sessions where id='c2c00000-0000-4000-8000-000000000015'::uuid)
  and not exists(select 1 from public.workout_session_execution_states where workout_session_id=:'cancel_session_id'::uuid),
  'AW-2C cancellation is not durable, idempotent, or schedule-safe.');

select (public.start_or_resume_workout_session_atomic(
  :'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,'c2c00000-0000-4000-8000-000000000015'::uuid
)->'session'->>'id') as retry_session_id \gset
set constraints all immediate;
select pg_temp.aw2c_assert(
  :'retry_session_id'::uuid<>:'cancel_session_id'::uuid
  and (select status='started' and scheduled_session_id='c2c00000-0000-4000-8000-000000000015'::uuid from public.workout_sessions where id=:'retry_session_id'::uuid)
  and (select status='started' from public.user_workout_sessions where id='c2c00000-0000-4000-8000-000000000015'::uuid)
  and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'retry_session_id'::uuid and event_type='session_started'),
  'AW-2C did not allow a new performed session from the reset schedule.');
select public.cancel_workout_session_atomic(:'owner_id'::uuid,:'retry_session_id'::uuid,'user_cancelled');
select pg_temp.aw2c_assert(
  (select status='cancelled' and scheduled_session_id is null from public.workout_sessions where id=:'retry_session_id'::uuid)
  and (select status='scheduled' and started_at is null from public.user_workout_sessions where id='c2c00000-0000-4000-8000-000000000015'::uuid),
  'AW-2C schedule retry cancellation did not release the schedule again.');

select (public.start_or_resume_workout_session_atomic(
  :'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,'c2c00000-0000-4000-8000-000000000016'::uuid
)->'session'->>'id') as delete_session_id \gset
delete from public.workout_sessions where id=:'delete_session_id'::uuid and status='started';
select pg_temp.aw2c_assert(
  (select status='cancelled' and scheduled_session_id is null from public.workout_sessions where id=:'delete_session_id'::uuid)
  and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'delete_session_id'::uuid and event_type='session_cancelled')
  and (select status='scheduled' and started_at is null from public.user_workout_sessions where id='c2c00000-0000-4000-8000-000000000016'::uuid),
  'AW-2C old-client DELETE bridge hard-deleted the session or failed schedule reset.');

-- Direct public start authority: one canonical root and one runtime start event.
reset role;
select exercise.id::text as direct_exercise_id
from public.exercises exercise
where exercise.is_global and exercise.is_approved
  and exists (
    select 1 from public.exercise_muscle_mapping_sets mapping
    where mapping.exercise_id=exercise.id and mapping.status='published'
  )
order by exercise.id
limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.start_or_resume_direct_workout_session_atomic(
  :'owner_id'::uuid,'global_exercise',:'direct_exercise_id',null,
  'AW-2C direct exercise','Strength','{"sets":3,"reps":"8","restSeconds":90}'::jsonb,null
)->'session'->>'id') as direct_session_id \gset
set constraints all immediate;
select pg_temp.aw2c_assert(
  (select count(*)=1 from public.workout_sessions
   where id=:'direct_session_id'::uuid and user_id=:'owner_id'::uuid)
  and (select count(*)=1 from public.workout_session_timeline_events
       where workout_session_id=:'direct_session_id'::uuid
         and user_id=:'owner_id'::uuid and event_type='session_started'
         and source='runtime' and sequence_number=1)
  and not exists(
    select 1 from public.workout_session_timeline_events
    where workout_session_id=:'direct_session_id'::uuid
      and payload ?| array['notes','requestHash','controllerDeviceId','token','ip','userAgent','browserFingerprint']
  ),
  'AW-2C direct start did not create one privacy-safe runtime start event.');
select (public.start_or_resume_direct_workout_session_atomic(
  :'owner_id'::uuid,'global_exercise',:'direct_exercise_id',null,
  'AW-2C direct exercise','Strength','{"sets":3,"reps":"8","restSeconds":90}'::jsonb,
  :'direct_session_id'::uuid
)->'session'->>'id') as direct_candidate_retry_id \gset
select (public.start_or_resume_direct_workout_session_atomic(
  :'owner_id'::uuid,'global_exercise',:'direct_exercise_id',null,
  'AW-2C direct exercise','Strength','{"sets":3,"reps":"8","restSeconds":90}'::jsonb,null
)->'session'->>'id') as direct_identity_retry_id \gset
select pg_temp.aw2c_assert(
  :'direct_candidate_retry_id'=:'direct_session_id'
  and :'direct_identity_retry_id'=:'direct_session_id'
  and (select count(*)=1 from public.workout_sessions where id=:'direct_session_id'::uuid)
  and (select count(*)=1 from public.workout_session_timeline_events
       where workout_session_id=:'direct_session_id'::uuid and event_type='session_started')
  and (select min(sequence_number)=1 and max(sequence_number)=1
       from public.workout_session_timeline_events where workout_session_id=:'direct_session_id'::uuid),
  'AW-2C direct retry duplicated the session root or start event.');
select public.cancel_workout_session_atomic(:'owner_id'::uuid,:'direct_session_id'::uuid,'user_cancelled');

select (public.skip_workout_day_atomic(
  :'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,
  'private skip note','no_time','skip_and_continue'
)->'session'->>'id') as skipped_session_id \gset
select pg_temp.aw2c_assert(
  (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'skipped_session_id'::uuid and event_type='session_skipped')
  and not exists(select 1 from public.workout_session_timeline_events where workout_session_id=:'skipped_session_id'::uuid and event_type='session_started')
  and not exists(select 1 from public.workout_session_timeline_events where workout_session_id=:'skipped_session_id'::uuid and payload::text like '%private%'),
  'AW-2C skipped-day event is incorrect or leaked notes.');

select pg_temp.aw2c_rejected(
  format('insert into public.workout_session_timeline_events(workout_session_id,user_id,event_type,occurred_at,source,idempotency_key) values (%L::uuid,%L::uuid,''session_started'',clock_timestamp(),''runtime'',''client:forbidden'')',:'session_id',:'owner_id'),
  array['42501'],'AW-2C authenticated direct timeline INSERT succeeded.');
select pg_temp.aw2c_rejected(
  format('update public.workout_session_timeline_events set payload=''{}''::jsonb where workout_session_id=%L::uuid',:'session_id'),
  array['42501'],'AW-2C authenticated direct timeline UPDATE succeeded.');
select pg_temp.aw2c_rejected(
  format('delete from public.workout_session_timeline_events where workout_session_id=%L::uuid',:'session_id'),
  array['42501'],'AW-2C authenticated direct timeline DELETE succeeded.');

select set_config('request.jwt.claim.sub',:'other_id',true);
select pg_temp.aw2c_assert(
  (select count(*)=0 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid),
  'AW-2C cross-user timeline read leaked rows.');
select pg_temp.aw2c_rejected(
  format('select public.cancel_workout_session_atomic(%L::uuid,%L::uuid,''user_cancelled'')',:'owner_id',:'skipped_session_id'),
  array['42501'],'AW-2C cross-user cancellation succeeded.');

reset role;
rollback;
