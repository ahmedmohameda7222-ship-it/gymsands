\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then raise exception '%', p_message; end if;
end
$function$;

create or replace function pg_temp.assert_rejected(p_sql text, p_expected_codes text[], p_message text)
returns void language plpgsql as $function$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any(p_expected_codes) then return; end if;
    raise exception '% Unexpected SQLSTATE %: %', p_message, sqlstate, sqlerrm;
  end;
  raise exception '%', p_message;
end
$function$;

grant execute on function pg_temp.assert_true(boolean,text) to public;
grant execute on function pg_temp.assert_rejected(text,text[],text) to public;

insert into auth.users (
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('a2b00000-0000-4000-8000-000000000001','authenticated','authenticated','aw2b-owner@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('a2b00000-0000-4000-8000-000000000002','authenticated','authenticated','aw2b-other@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
\set owner_id 'a2b00000-0000-4000-8000-000000000001'
\set other_id 'a2b00000-0000-4000-8000-000000000002'

select pg_temp.assert_true(
  (select count(*) from public.profiles where id in (:'owner_id'::uuid,:'other_id'::uuid))=2,
  'AW-2B auth fixtures did not create profiles.');

insert into public.user_workout_plans (id,user_id,name,is_active,is_default,source,created_at,updated_at)
values ('a2b00000-0000-4000-8000-000000000010',:'owner_id'::uuid,'AW-2B plan',true,true,'manual',now(),now());
insert into public.user_workout_plan_days (id,plan_id,day_number,day_name,weekday,created_at,updated_at)
values ('a2b00000-0000-4000-8000-000000000011','a2b00000-0000-4000-8000-000000000010',1,'AW-2B day','Monday',now(),now());
insert into public.user_workout_plan_exercises
  (id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at)
values ('a2b00000-0000-4000-8000-000000000012','a2b00000-0000-4000-8000-000000000011','AW-2B exercise',3,'8',60,1,1,now());
insert into public.user_workout_sessions
  (id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,created_at,updated_at)
values ('a2b00000-0000-4000-8000-000000000014',:'owner_id'::uuid,'a2b00000-0000-4000-8000-000000000010','a2b00000-0000-4000-8000-000000000011',1,1,1,current_date,'AW-2B day','scheduled',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.start_or_resume_workout_session_atomic(
  :'owner_id'::uuid,
  'a2b00000-0000-4000-8000-000000000011'::uuid,
  'a2b00000-0000-4000-8000-000000000014'::uuid
)->'session'->>'id') as session_id \gset
set constraints all immediate;

select pg_temp.assert_true(
  (select count(*)=1 from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid and user_id=:'owner_id'::uuid and revision=0),
  'AW-2A initialization did not create the AW-2B command target.');

select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set active_set_number=2 where workout_session_id=%L::uuid',:'session_id'),
  array['42501'],
  'Authenticated direct execution-state UPDATE unexpectedly succeeded.');
select pg_temp.assert_rejected(
  format('insert into public.workout_session_execution_commands(workout_session_id,user_id,command_id,command_type,expected_revision,request_payload,request_hash,outcome,revision_before,revision_after,result_state) values (%L::uuid,%L::uuid,%L::uuid,''resume'',0,''{}''::jsonb,repeat(''0'',64),''no_op'',0,0,''{}''::jsonb)',:'session_id',:'owner_id','a2b00000-0000-4000-8000-000000000090'),
  array['42501'],
  'Authenticated direct command receipt INSERT unexpectedly succeeded.');

select set_config('request.jwt.claim.sub',:'other_id',true);
select pg_temp.assert_rejected(
  format('select public.apply_workout_session_execution_command_atomic(%L::uuid,%L::uuid,%L::uuid,0,''resume'',''{"controller_device_id":null}''::jsonb)',:'owner_id',:'session_id','a2b00000-0000-4000-8000-000000000091'),
  array['42501'],
  'Cross-user command actor unexpectedly succeeded.');
select set_config('request.jwt.claim.sub',:'owner_id',true);

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000101'::uuid,0,
  'move_cursor','{"active_snapshot_item_id":null,"active_item_order":1,"active_set_number":2,"view_state":"set_entry","controller_device_id":null}'::jsonb
) as applied_response \gset
select pg_temp.assert_true((:'applied_response'::jsonb->>'outcome')='applied','AW-2B command did not apply.');
select pg_temp.assert_true((:'applied_response'::jsonb->>'revisionAfter')::bigint=1,'Applied command did not increment revision exactly once.');
select pg_temp.assert_true(
  (select count(*)=1 and bool_and(request_hash~'^[0-9a-f]{64}$') and bool_and(user_id=:'owner_id'::uuid)
   from public.workout_session_execution_commands
   where workout_session_id=:'session_id'::uuid and command_id='a2b00000-0000-4000-8000-000000000101'::uuid),
  'Applied command receipt is missing or invalid.');
select pg_temp.assert_true(
  (select to_jsonb(state)=(:'applied_response'::jsonb->'state') from public.workout_session_execution_states state where workout_session_id=:'session_id'::uuid),
  'Returned applied state differs from persisted state.');

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000101'::uuid,0,
  'move_cursor','{"active_snapshot_item_id":null,"active_item_order":1,"active_set_number":2,"view_state":"set_entry","controller_device_id":null}'::jsonb
) as replay_response \gset
select pg_temp.assert_true(
  (:'replay_response'::jsonb->>'replayed')::boolean
  and (:'replay_response'::jsonb->>'revisionAfter')::bigint=1
  and (select count(*)=1 from public.workout_session_execution_commands where workout_session_id=:'session_id'::uuid and command_id='a2b00000-0000-4000-8000-000000000101'::uuid),
  'Exact replay mutated state or duplicated the receipt.');

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000101'::uuid,0,
  'move_cursor','{"active_snapshot_item_id":null,"active_item_order":1,"active_set_number":3,"view_state":"set_entry","controller_device_id":null}'::jsonb
) as idempotency_response \gset
select pg_temp.assert_true(
  (:'idempotency_response'::jsonb->>'outcome')='idempotency_conflict'
  and (select revision=1 and active_set_number=2 from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid)
  and (select count(*)=1 from public.workout_session_execution_commands where workout_session_id=:'session_id'::uuid and command_id='a2b00000-0000-4000-8000-000000000101'::uuid),
  'Command-ID conflict altered the first receipt or state.');

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000102'::uuid,0,
  'pause','{"controller_device_id":null}'::jsonb
) as stale_response \gset
select pg_temp.assert_true(
  (:'stale_response'::jsonb->>'outcome')='revision_conflict'
  and (:'stale_response'::jsonb->>'revisionAfter')::bigint=1
  and (select revision=1 from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid)
  and (select count(*)=1 and min(outcome)='revision_conflict' from public.workout_session_execution_commands where workout_session_id=:'session_id'::uuid and command_id='a2b00000-0000-4000-8000-000000000102'::uuid),
  'Revision conflict mutated state or failed to persist one receipt.');
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000102'::uuid,0,
  'pause','{"controller_device_id":null}'::jsonb
) as stale_replay \gset
select pg_temp.assert_true((:'stale_replay'::jsonb->>'replayed')::boolean,'Revision conflict did not replay.');

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000103'::uuid,1,
  'pause','{"controller_device_id":null}'::jsonb
) as pause_response \gset
select updated_at as paused_updated_at from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid \gset
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000104'::uuid,2,
  'pause','{"controller_device_id":"a2b00000-0000-4000-8000-000000000199"}'::jsonb
) as noop_response \gset
select pg_temp.assert_true(
  (:'noop_response'::jsonb->>'outcome')='no_op'
  and (:'noop_response'::jsonb->>'revisionAfter')::bigint=2
  and (select revision=2 and updated_at=:'paused_updated_at'::timestamptz and controller_device_id is null from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid),
  'Pause no-op advanced revision, changed updated_at, or wrote controller metadata.');

reset role;

insert into public.user_workout_plans (id,user_id,name,is_active,is_default,source,created_at,updated_at)
values ('a2b00000-0000-4000-8000-000000000020',:'owner_id'::uuid,'AW-2B legacy plan',false,false,'manual',now(),now());
insert into public.user_workout_plan_days (id,plan_id,day_number,day_name,weekday,created_at,updated_at)
values ('a2b00000-0000-4000-8000-000000000021','a2b00000-0000-4000-8000-000000000020',1,'AW-2B legacy day','Tuesday',now(),now());
insert into public.user_workout_plan_exercises
  (id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at)
values ('a2b00000-0000-4000-8000-000000000022','a2b00000-0000-4000-8000-000000000021','AW-2B legacy exercise',2,'10',60,1,1,now());
insert into public.user_workout_sessions
  (id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,created_at,updated_at)
values ('a2b00000-0000-4000-8000-000000000024',:'owner_id'::uuid,'a2b00000-0000-4000-8000-000000000020','a2b00000-0000-4000-8000-000000000021',1,1,1,current_date,'AW-2B legacy day','scheduled',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.start_or_resume_workout_session_atomic(
  :'owner_id'::uuid,
  'a2b00000-0000-4000-8000-000000000021'::uuid,
  'a2b00000-0000-4000-8000-000000000024'::uuid
)->'session'->>'id') as legacy_session_id \gset
reset role;
delete from public.workout_session_execution_states where workout_session_id=:'legacy_session_id'::uuid;
select private.initialize_workout_session_execution_state(:'legacy_session_id'::uuid,'legacy_backfill',clock_timestamp());
set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'legacy_session_id'::uuid,'a2b00000-0000-4000-8000-000000000105'::uuid,0,
  'import_legacy_cache',jsonb_build_object(
    'cached_started_at',(clock_timestamp()-interval '10 minutes')::text,
    'cached_rest_ends_at',(clock_timestamp()+interval '60 seconds')::text,
    'cached_rest_duration_seconds',60,
    'controller_device_id',null
  )
) as import_response \gset
select pg_temp.assert_true(
  (:'import_response'::jsonb->>'outcome')='applied'
  and (select revision=1 and bootstrap_source='client_cache_import' and view_state='rest' from public.workout_session_execution_states where workout_session_id=:'legacy_session_id'::uuid),
  'Valid legacy cache import did not apply exactly once.');
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'legacy_session_id'::uuid,'a2b00000-0000-4000-8000-000000000106'::uuid,1,
  'import_legacy_cache','{"cached_started_at":null,"cached_rest_ends_at":null,"cached_rest_duration_seconds":null,"controller_device_id":null}'::jsonb
) as second_import_response \gset
select pg_temp.assert_true(
  (:'second_import_response'::jsonb->>'outcome')='no_op'
  and (:'second_import_response'::jsonb->>'reason')='not_initial_legacy_state'
  and (select revision=1 and bootstrap_source='client_cache_import' from public.workout_session_execution_states where workout_session_id=:'legacy_session_id'::uuid),
  'Legacy cache bootstrap source was not one-way.');

reset role;
insert into public.exercise_logs(
  workout_session_id,plan_exercise_id,exercise_order,exercise_name,planned_sets,set_number,reps,completed_at,set_type,source
) values (:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000012',1,'AW-2B exercise',3,1,8,clock_timestamp(),'working','manual');
update public.workout_sessions set status='completed',completed_at=clock_timestamp() where id=:'session_id'::uuid;
set constraints all immediate;
select pg_temp.assert_true(
  not exists(select 1 from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid)
  and not exists(select 1 from public.workout_session_execution_commands where workout_session_id=:'session_id'::uuid)
  and exists(select 1 from public.workout_sessions where id=:'session_id'::uuid and status='completed')
  and exists(select 1 from public.exercise_logs where workout_session_id=:'session_id'::uuid),
  'Terminal cleanup did not preserve history while cascading transient execution data.');

rollback;
