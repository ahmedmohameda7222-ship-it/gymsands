\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.wh_keyset_assert(p_condition boolean,p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition,false) then raise exception '%',p_message; end if;
end
$function$;

grant execute on function pg_temp.wh_keyset_assert(boolean,text) to public;

select pg_temp.wh_keyset_assert(
  to_regprocedure(
    'public.get_workout_history_root_page_v1(uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean,text,timestamptz,text,integer,integer)'
  ) is not null
  and to_regprocedure(
    'public.get_workout_history_period_summary_v1(uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean)'
  ) is not null,
  'Workout History keyset functions are missing.'
);
select pg_temp.wh_keyset_assert(
  not has_function_privilege(
    'anon',
    'public.get_workout_history_root_page_v1(uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean,text,timestamptz,text,integer,integer)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_workout_history_root_page_v1(uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean,text,timestamptz,text,integer,integer)',
    'execute'
  ),
  'Workout History keyset grants are unsafe.'
);

insert into auth.users(
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('bc000000-0000-4000-8000-000000000001','authenticated','authenticated','wh-keyset-owner@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('bc000000-0000-4000-8000-000000000002','authenticated','authenticated','wh-keyset-other@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.user_workout_plans(id,user_id,name,is_active,is_default,source,created_at,updated_at)
values (
  'bc000000-0000-4000-8000-000000000010',
  'bc000000-0000-4000-8000-000000000001',
  'WH keyset plan',true,true,'manual',now(),now()
);
insert into public.user_workout_plan_days(id,plan_id,day_number,day_name,weekday,created_at,updated_at)
values (
  'bc000000-0000-4000-8000-000000000011',
  'bc000000-0000-4000-8000-000000000010',1,'WH keyset day','Monday',now(),now()
);
insert into public.user_workout_plan_exercises(
  id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at
) values (
  'bc000000-0000-4000-8000-000000000012',
  'bc000000-0000-4000-8000-000000000011',
  'WH keyset press',1,'8',60,1,1,now()
);

insert into public.workout_sessions(
  id,user_id,workout_name,status,started_at,plan_id,plan_day_id,source,created_at,updated_at
) values (
  'bc000000-0000-4000-8000-000000000100',
  'bc000000-0000-4000-8000-000000000001','Older workout','started',
  '2026-08-01T09:00:00Z','bc000000-0000-4000-8000-000000000010',
  'bc000000-0000-4000-8000-000000000011','manual',now(),now()
);
insert into public.exercise_logs(
  id,workout_session_id,exercise_name,set_number,reps,weight_kg,plan_exercise_id,
  completed_at,exercise_order,source,set_type,created_at
) values (
  'bc000000-0000-4000-8000-000000000101',
  'bc000000-0000-4000-8000-000000000100','WH keyset press',1,8,40,
  'bc000000-0000-4000-8000-000000000012','2026-08-01T09:30:00Z',1,'manual','working',now()
);
update public.workout_sessions set
  status='completed',completed_at='2026-08-01T10:00:00Z',duration_minutes=60
where id='bc000000-0000-4000-8000-000000000100';

insert into public.workout_sessions(
  id,user_id,workout_name,status,started_at,plan_id,plan_day_id,source,created_at,updated_at
) values (
  'bc000000-0000-4000-8000-000000000200',
  'bc000000-0000-4000-8000-000000000001','Same-time lower identity','started',
  '2026-08-03T09:00:00Z','bc000000-0000-4000-8000-000000000010',
  'bc000000-0000-4000-8000-000000000011','manual',now(),now()
);
insert into public.exercise_logs(
  id,workout_session_id,exercise_name,set_number,reps,weight_kg,plan_exercise_id,
  completed_at,exercise_order,source,set_type,created_at
) values (
  'bc000000-0000-4000-8000-000000000201',
  'bc000000-0000-4000-8000-000000000200','WH keyset press',1,8,45,
  'bc000000-0000-4000-8000-000000000012','2026-08-03T09:30:00Z',1,'manual','working',now()
);
update public.workout_sessions set
  status='completed',completed_at='2026-08-03T10:00:00Z',duration_minutes=60
where id='bc000000-0000-4000-8000-000000000200';

insert into public.workout_sessions(
  id,user_id,workout_name,status,started_at,plan_id,plan_day_id,source,created_at,updated_at
) values (
  'bc000000-0000-4000-8000-000000000300',
  'bc000000-0000-4000-8000-000000000001','Same-time higher identity','started',
  '2026-08-03T09:00:00Z','bc000000-0000-4000-8000-000000000010',
  'bc000000-0000-4000-8000-000000000011','manual',now(),now()
);
insert into public.exercise_logs(
  id,workout_session_id,exercise_name,set_number,reps,weight_kg,plan_exercise_id,
  completed_at,exercise_order,source,set_type,created_at
) values (
  'bc000000-0000-4000-8000-000000000301',
  'bc000000-0000-4000-8000-000000000300','WH keyset press',1,8,50,
  'bc000000-0000-4000-8000-000000000012','2026-08-03T09:30:00Z',1,'manual','working',now()
);
update public.workout_sessions set
  status='completed',completed_at='2026-08-03T10:00:00Z',duration_minutes=60
where id='bc000000-0000-4000-8000-000000000300';

insert into public.user_workout_sessions(
  id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,
  scheduled_date,day_title,status,completed_at,duration_minutes,created_at,updated_at
) values (
  'bc000000-0000-4000-8000-000000000400',
  'bc000000-0000-4000-8000-000000000001',
  'bc000000-0000-4000-8000-000000000010',
  'bc000000-0000-4000-8000-000000000011',1,1,1,
  '2026-08-02','Linked scheduled fallback','completed','2026-08-02T10:00:00Z',45,now(),now()
);
insert into public.workout_sessions(
  id,user_id,scheduled_session_id,workout_name,status,started_at,plan_id,plan_day_id,
  source,created_at,updated_at
) values (
  'bc000000-0000-4000-8000-000000000500',
  'bc000000-0000-4000-8000-000000000001',
  'bc000000-0000-4000-8000-000000000400','Linked canonical workout','started',
  '2026-08-02T09:00:00Z','bc000000-0000-4000-8000-000000000010',
  'bc000000-0000-4000-8000-000000000011','manual',now(),now()
);
insert into public.exercise_logs(
  id,workout_session_id,exercise_name,set_number,reps,weight_kg,plan_exercise_id,
  completed_at,exercise_order,source,set_type,created_at
) values (
  'bc000000-0000-4000-8000-000000000501',
  'bc000000-0000-4000-8000-000000000500','WH keyset press',1,8,42.5,
  'bc000000-0000-4000-8000-000000000012','2026-08-02T09:30:00Z',1,'manual','working',now()
);
update public.workout_sessions set
  status='completed',completed_at='2026-08-02T10:00:00Z',duration_minutes=60,
  deleted_at='2026-08-04T00:00:00Z',purge_after='2026-09-03T00:00:00Z'
where id='bc000000-0000-4000-8000-000000000500';

set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select pg_temp.wh_keyset_assert(
  (select array_agg(root_id order by effective_at desc,activity_id desc)
   from public.get_workout_history_root_page_v1(
     'bc000000-0000-4000-8000-000000000001',
     '2026-08-01T00:00:00Z','2026-08-05T00:00:00Z',
     array['completed','partial'],null,array[]::text[],array[]::text[],array[]::text[],
     array[]::uuid[],false,'newest',null,null,null,2
   ))=array[
     'bc000000-0000-4000-8000-000000000300'::uuid,
     'bc000000-0000-4000-8000-000000000200'::uuid
   ],
  'Workout History first page or equal-time identity tie-breaker is incorrect.'
);

select pg_temp.wh_keyset_assert(
  (select array_agg(root_id order by effective_at desc,activity_id desc)
   from public.get_workout_history_root_page_v1(
     'bc000000-0000-4000-8000-000000000001',
     '2026-08-01T00:00:00Z','2026-08-05T00:00:00Z',
     array['completed','partial'],null,array[]::text[],array[]::text[],array[]::text[],
     array[]::uuid[],false,'newest','2026-08-03T10:00:00Z',
     'bc000000-0000-4000-8000-000000000200',60,2
   ))=array['bc000000-0000-4000-8000-000000000100'::uuid],
  'Workout History second keyset page is incorrect.'
);

select pg_temp.wh_keyset_assert(
  not exists(
    select 1 from public.get_workout_history_root_page_v1(
      'bc000000-0000-4000-8000-000000000001',
      '2026-08-01T00:00:00Z','2026-08-05T00:00:00Z',
      array['completed','partial'],null,array[]::text[],array[]::text[],array[]::text[],
      array[]::uuid[],false,'newest',null,null,null,20
    ) where root_id in (
      'bc000000-0000-4000-8000-000000000400'::uuid,
      'bc000000-0000-4000-8000-000000000500'::uuid
    )
  ),
  'A soft-deleted canonical session leaked or its linked scheduled fallback reappeared.'
);

select pg_temp.wh_keyset_assert(
  (select eligible_workout_count=3
      and trusted_duration_minutes=180
      and completed_set_count=3
      and reliable_volume is null
   from public.get_workout_history_period_summary_v1(
     'bc000000-0000-4000-8000-000000000001',
     '2026-08-01T00:00:00Z','2026-08-05T00:00:00Z',
     array['completed','partial'],null,array[]::text[],array[]::text[],array[]::text[],
     array[]::uuid[],false
   )),
  'Workout History period summary is not independent and complete.'
);

select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select pg_temp.wh_keyset_assert(
  (select count(*)=0
   from public.get_workout_history_root_page_v1(
     'bc000000-0000-4000-8000-000000000002',
     '2026-08-01T00:00:00Z','2026-08-05T00:00:00Z',
     array['completed','partial'],null,array[]::text[],array[]::text[],array[]::text[],
     array[]::uuid[],false,'newest',null,null,null,20
   )),
  'Another member can read the owner Workout History page.'
);

rollback;
