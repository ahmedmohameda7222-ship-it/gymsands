\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.wh7_assert(p_condition boolean,p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition,false) then raise exception '%',p_message; end if;
end
$function$;

create or replace function pg_temp.wh7_rejected(p_sql text,p_message text)
returns void language plpgsql as $function$
begin
  begin execute p_sql;
  exception when others then return;
  end;
  raise exception '%',p_message;
end
$function$;

grant execute on function pg_temp.wh7_assert(boolean,text) to public;
grant execute on function pg_temp.wh7_rejected(text,text) to public;

select pg_temp.wh7_assert(
  to_regprocedure('public.correct_completed_workout_session_atomic(uuid,uuid,bigint,text,jsonb,jsonb)') is not null,
  'WH-7 correction authority is missing.'
);
select pg_temp.wh7_assert(
  to_regprocedure('public.soft_delete_workout_session_atomic(uuid,uuid,text)') is not null
  and to_regprocedure('public.restore_workout_session_atomic(uuid,uuid,text)') is not null
  and to_regprocedure('public.purge_workout_session_atomic(uuid,uuid,boolean)') is not null,
  'WH-7 deletion lifecycle authorities are incomplete.'
);
select pg_temp.wh7_assert(
  not has_function_privilege('authenticated','public.purge_expired_workout_sessions(integer,boolean)','execute')
  and has_function_privilege('service_role','public.purge_expired_workout_sessions(integer,boolean)','execute'),
  'WH-7 cleanup execution grants are unsafe.'
);

insert into auth.users(
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('b7000000-0000-4000-8000-000000000001','authenticated','authenticated','wh7-owner@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('b7000000-0000-4000-8000-000000000002','authenticated','authenticated','wh7-other@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.user_workout_plans(id,user_id,name,is_active,is_default,source,created_at,updated_at)
values ('b7000000-0000-4000-8000-000000000010','b7000000-0000-4000-8000-000000000001','WH-7 plan',true,true,'manual',now(),now());
insert into public.user_workout_plan_days(id,plan_id,day_number,day_name,weekday,created_at,updated_at)
values ('b7000000-0000-4000-8000-000000000011','b7000000-0000-4000-8000-000000000010',1,'WH-7 day','Monday',now(),now());
insert into public.user_workout_plan_exercises(
  id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at
) values (
  'b7000000-0000-4000-8000-000000000012','b7000000-0000-4000-8000-000000000011',
  'WH-7 press',3,'5',60,1,1,now()
);
insert into public.workout_sessions(
  id,user_id,workout_name,status,started_at,completed_at,plan_id,plan_day_id,source,created_at,updated_at
) values
  ('b7000000-0000-4000-8000-000000000020','b7000000-0000-4000-8000-000000000001',
   'WH-7 corrected session','started','2026-08-01T10:00:00Z',null,
   'b7000000-0000-4000-8000-000000000010','b7000000-0000-4000-8000-000000000011','manual',now(),now()),
  ('b7000000-0000-4000-8000-000000000030','b7000000-0000-4000-8000-000000000001',
   'WH-7 cleanup session','completed','2026-07-01T10:00:00Z','2026-07-01T11:00:00Z',
   'b7000000-0000-4000-8000-000000000010','b7000000-0000-4000-8000-000000000011','manual',now(),now());
insert into public.exercise_logs(
  id,workout_session_id,exercise_name,set_number,reps,weight_kg,plan_exercise_id,
  completed_at,exercise_order,source,set_type,created_at
) values (
  'b7000000-0000-4000-8000-000000000021','b7000000-0000-4000-8000-000000000020',
  'WH-7 press',1,5,80,'b7000000-0000-4000-8000-000000000012',
  '2026-08-01T10:30:00Z',1,'manual','working','2026-08-01T10:30:00Z'
);
update public.workout_sessions
set status='completed',completed_at='2026-08-01T11:00:00Z'
where id='b7000000-0000-4000-8000-000000000020';

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.wh7_rejected(
  $$update public.exercise_logs set reps=99 where id='b7000000-0000-4000-8000-000000000021'$$,
  'WH-7 direct terminal log mutation bypassed correction scope.'
);
select set_config('plaivra.terminal_exercise_log_mutation_session_id','b7000000-0000-4000-8000-000000000020',true);
select set_config('plaivra.workout_history_correction_operation_id','forged-correction-operation',true);
select set_config('plaivra.workout_history_correction_signature',repeat('0',64),true);
select pg_temp.wh7_rejected(
  $$update public.exercise_logs set reps=99 where id='b7000000-0000-4000-8000-000000000021'$$,
  'WH-7 forged terminal correction scope was accepted.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.correct_completed_workout_session_atomic(
  'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020',0,
  'wh7-correction-operation-0001','{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'kind','update','exerciseLogId','b7000000-0000-4000-8000-000000000021',
    'patch',jsonb_build_object(
      'performanceMetrics',jsonb_build_array(
        jsonb_build_object('metricKey','repetitions','value',6),
        jsonb_build_object('metricKey','external_load_kg','value',82.5)
      ),
      'setDetails',jsonb_build_object('setType','working','rpe',8.5,'rir',2)
    )
  ))
) as correction_result \gset
select pg_temp.wh7_assert(
  (:'correction_result'::jsonb->>'history_revision')::integer=1
  and (select reps=6 and weight_kg=82.5 from public.exercise_logs where id='b7000000-0000-4000-8000-000000000021')
  and (select count(*)=2 from public.exercise_log_metric_values where exercise_log_id='b7000000-0000-4000-8000-000000000021')
  and (select rpe=8.5 and rir=2 from public.exercise_log_set_details where exercise_log_id='b7000000-0000-4000-8000-000000000021'),
  'WH-7 structured correction did not update the canonical graph.'
);
select public.correct_completed_workout_session_atomic(
  'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020',0,
  'wh7-correction-operation-0001','{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'kind','update','exerciseLogId','b7000000-0000-4000-8000-000000000021',
    'patch',jsonb_build_object(
      'performanceMetrics',jsonb_build_array(
        jsonb_build_object('metricKey','repetitions','value',6),
        jsonb_build_object('metricKey','external_load_kg','value',82.5)
      ),
      'setDetails',jsonb_build_object('setType','working','rpe',8.5,'rir',2)
    )
  ))
);
select pg_temp.wh7_assert(
  (select history_revision=1 from public.workout_sessions where id='b7000000-0000-4000-8000-000000000020')
  and (select count(*)=1 from public.workout_session_timeline_events where workout_session_id='b7000000-0000-4000-8000-000000000020' and event_type='session_corrected'),
  'WH-7 correction replay was not idempotent.'
);
select pg_temp.wh7_rejected(
  $$select public.correct_completed_workout_session_atomic(
    'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020',0,
    'wh7-correction-operation-stale','{}'::jsonb,'[]'::jsonb)$$,
  'WH-7 accepted a stale revision.'
);
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000002',true);
select pg_temp.wh7_rejected(
  $$select public.soft_delete_workout_session_atomic(
    'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020','wh7-owner-mismatch-delete')$$,
  'WH-7 allowed a non-owner mutation.'
);
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000001',true);

select public.correct_completed_workout_session_atomic(
  'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020',1,
  'wh7-note-correction-operation','{"notes":"Corrected note"}'::jsonb,'[]'::jsonb
) as note_result \gset
select pg_temp.wh7_assert(
  not coalesce((:'note_result'::jsonb->>'performance_changed')::boolean,true)
  and (select history_revision=2 and notes='Corrected note' from public.workout_sessions where id='b7000000-0000-4000-8000-000000000020'),
  'WH-7 note-only correction invalidated performance derivations.'
);

select public.soft_delete_workout_session_atomic(
  'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020','wh7-soft-delete-operation'
);
select pg_temp.wh7_assert(
  (select deleted_at is not null and purge_after>=deleted_at+interval '29 days 23 hours' from public.workout_sessions where id='b7000000-0000-4000-8000-000000000020'),
  'WH-7 soft deletion window is invalid.'
);
select public.restore_workout_session_atomic(
  'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020','wh7-restore-operation-0001'
);
select pg_temp.wh7_assert(
  (select deleted_at is null and purge_after is null and completed_at='2026-08-01T11:00:00Z' from public.workout_sessions where id='b7000000-0000-4000-8000-000000000020'),
  'WH-7 restore changed original chronology.'
);
select public.soft_delete_workout_session_atomic(
  'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020','wh7-soft-delete-operation-2'
);
select pg_temp.wh7_rejected(
  $$select public.purge_workout_session_atomic(
    'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020',false)$$,
  'WH-7 permanent purge succeeded without confirmation.'
);
select public.purge_workout_session_atomic(
  'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000020',true
);
select pg_temp.wh7_assert(
  not exists(select 1 from public.workout_sessions where id='b7000000-0000-4000-8000-000000000020')
  and not exists(select 1 from public.exercise_logs where workout_session_id='b7000000-0000-4000-8000-000000000020')
  and not exists(select 1 from public.workout_session_timeline_events where workout_session_id='b7000000-0000-4000-8000-000000000020'),
  'WH-7 permanent purge left canonical children behind.'
);

select public.soft_delete_workout_session_atomic(
  'b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000030','wh7-cleanup-soft-delete'
);
reset role;
update public.workout_sessions set deleted_at=clock_timestamp()-interval '31 days',purge_after=clock_timestamp()-interval '1 day'
where id='b7000000-0000-4000-8000-000000000030';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.purge_expired_workout_sessions(10,true) as cleanup_dry_run \gset
reset role;
select pg_temp.wh7_assert(
  (:'cleanup_dry_run'::jsonb->>'candidate_count')::integer>=1
  and (:'cleanup_dry_run'::jsonb->>'purged_count')::integer=0
  and exists(select 1 from public.workout_sessions where id='b7000000-0000-4000-8000-000000000030'),
  'WH-7 cleanup dry-run deleted data or missed an expired candidate.'
);

rollback;
