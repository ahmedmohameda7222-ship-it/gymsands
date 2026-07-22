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

insert into public.user_workout_plans(id,user_id,name,is_active,is_default,source,created_at,updated_at)
values('c2c00000-0000-4000-8000-000000000010',:'owner_id'::uuid,'AW-2C plan',true,true,'manual',now(),now());
insert into public.user_workout_plan_days(id,plan_id,day_number,day_name,weekday,created_at,updated_at)
values('c2c00000-0000-4000-8000-000000000011','c2c00000-0000-4000-8000-000000000010',1,'AW-2C day','Monday',now(),now());
insert into public.user_workout_plan_exercises
(id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at)
values('c2c00000-0000-4000-8000-000000000012','c2c00000-0000-4000-8000-000000000010','AW-2C exercise',3,'8',90,1,1,now());

set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.start_or_resume_workout_session_atomic(
  :'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,null
)->'session'->>'id') as session_id \gset
set constraints all immediate;
select pg_temp.aw2c_assert((select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='session_started'),'AW-2C start event is missing.');
select public.apply_workout_session_execution_command_atomic(:'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000101'::uuid,0,'pause','{"controller_device_id":null}'::jsonb);
select public.apply_workout_session_execution_command_atomic(:'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000102'::uuid,1,'resume','{"controller_device_id":null}'::jsonb);
select public.apply_workout_session_execution_command_atomic(:'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000103'::uuid,2,'start_rest','{"duration_seconds":90,"controller_device_id":null}'::jsonb);
select public.apply_workout_session_execution_command_atomic(:'owner_id'::uuid,:'session_id'::uuid,'c2c00000-0000-4000-8000-000000000104'::uuid,3,'clear_rest','{"view_state":"set_entry","controller_device_id":null}'::jsonb);
select pg_temp.aw2c_assert((select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='session_paused') and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='session_resumed') and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='rest_started') and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='rest_ended'),'AW-2C command event mapping is incorrect.');
select clock_timestamp()::text as set_completed_at \gset
select public.upsert_workout_set_logs_atomic(:'owner_id'::uuid,:'session_id'::uuid,jsonb_build_array(jsonb_build_object('plan_exercise_id','c2c00000-0000-4000-8000-000000000012','exercise_order',1,'exercise_name','AW-2C exercise','set_number',1,'reps',8,'weight_kg',50,'notes','private set note','completed_at',:'set_completed_at')));
select public.upsert_workout_set_logs_atomic(:'owner_id'::uuid,:'session_id'::uuid,jsonb_build_array(jsonb_build_object('plan_exercise_id','c2c00000-0000-4000-8000-000000000012','exercise_order',1,'exercise_name','AW-2C exercise','set_number',1,'reps',10,'weight_kg',52.5,'notes','changed private note','completed_at',:'set_completed_at')));
select pg_temp.aw2c_assert((select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='set_completed') and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='set_edited') and not exists(select 1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and payload::text like '%private%'),'AW-2C set events are incorrect or leaked notes.');
select public.complete_workout_session_atomic(:'owner_id'::uuid,:'session_id'::uuid,null,30,'private session note');
select pg_temp.aw2c_assert((select status='completed' from public.workout_sessions where id=:'session_id'::uuid) and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid and event_type='session_completed') and not exists(select 1 from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid),'AW-2C completion is not atomic.');

select (public.start_or_resume_workout_session_atomic(:'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,null)->'session'->>'id') as cancel_session_id \gset
select public.cancel_workout_session_atomic(:'owner_id'::uuid,:'cancel_session_id'::uuid,'started_by_mistake');
select pg_temp.aw2c_assert((select status='cancelled' and cancelled_at is not null from public.workout_sessions where id=:'cancel_session_id'::uuid) and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'cancel_session_id'::uuid and event_type='session_cancelled'),'AW-2C cancellation is not durable.');
select (public.start_or_resume_workout_session_atomic(:'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,null)->'session'->>'id') as delete_session_id \gset
delete from public.workout_sessions where id=:'delete_session_id'::uuid and status='started';
select pg_temp.aw2c_assert((select status='cancelled' from public.workout_sessions where id=:'delete_session_id'::uuid),'AW-2C old-client DELETE bridge hard-deleted the session.');
select (public.skip_workout_day_atomic(:'owner_id'::uuid,'c2c00000-0000-4000-8000-000000000011'::uuid,'no_time','skip_and_continue','private skip note')->'session'->>'id') as skipped_session_id \gset
select pg_temp.aw2c_assert((select count(*)=1 from public.workout_session_timeline_events where workout_session_id=:'skipped_session_id'::uuid and event_type='session_skipped') and not exists(select 1 from public.workout_session_timeline_events where workout_session_id=:'skipped_session_id'::uuid and event_type='session_started'),'AW-2C skipped-day event is incorrect.');
select set_config('request.jwt.claim.sub',:'other_id',true);
select pg_temp.aw2c_assert((select count(*)=0 from public.workout_session_timeline_events where workout_session_id=:'session_id'::uuid),'AW-2C cross-user timeline read leaked rows.');
select pg_temp.aw2c_rejected(format('select public.cancel_workout_session_atomic(%L::uuid,%L::uuid,''user_cancelled'')',:'owner_id',:'skipped_session_id'),array['42501'],'AW-2C cross-user cancellation succeeded.');
reset role;
rollback;
