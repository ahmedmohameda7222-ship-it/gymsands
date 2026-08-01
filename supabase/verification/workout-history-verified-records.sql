\set ON_ERROR_STOP on

begin;

do $verification$
declare
  v_policy_count integer;
  v_function_security boolean;
  v_function_config text[];
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='personal_records'
      and column_name='source_kind' and column_default like '%manual%'
  ) then raise exception 'WH-6 source_kind default is missing.'; end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='personal_records_workout_record_key_uidx'
  ) then raise exception 'WH-6 deterministic record key index is missing.'; end if;
  if to_regclass('public.current_personal_records') is null then
    raise exception 'WH-6 current trusted record projection is missing.';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname='public' and tablename='personal_records'
    and policyname in (
      'personal_records_owner_admin_select',
      'personal_records_owner_manual_insert',
      'personal_records_owner_manual_update',
      'personal_records_owner_manual_delete'
    );
  if v_policy_count<>4 then raise exception 'WH-6 personal record policies are incomplete.'; end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='personal_records' and policyname='personal_records_own_all'
  ) then raise exception 'WH-6 broad personal_records policy remains.'; end if;

  select prosecdef,proconfig into v_function_security,v_function_config
  from pg_proc
  where oid='public.replace_workout_derived_records_atomic(uuid,uuid,smallint,text,jsonb)'::regprocedure;
  if not coalesce(v_function_security,false) then raise exception 'WH-6 replacement wrapper is not SECURITY DEFINER.'; end if;
  if not ('search_path='=any(v_function_config) or 'search_path=""'=any(v_function_config)) then
    raise exception 'WH-6 replacement wrapper search_path is unsafe.';
  end if;
  if has_function_privilege('anon','public.replace_workout_derived_records_atomic(uuid,uuid,smallint,text,jsonb)','execute') then
    raise exception 'WH-6 anon can execute record replacement.';
  end if;
  if not has_function_privilege('authenticated','public.replace_workout_derived_records_atomic(uuid,uuid,smallint,text,jsonb)','execute') then
    raise exception 'WH-6 authenticated replacement grant is missing.';
  end if;
end;
$verification$;

create or replace function pg_temp.wh6_assert(p_condition boolean,p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition,false) then raise exception '%',p_message; end if;
end
$function$;

create or replace function pg_temp.wh6_rejected(p_sql text,p_message text)
returns void language plpgsql as $function$
begin
  begin execute p_sql;
  exception when others then return;
  end;
  raise exception '%',p_message;
end
$function$;

grant execute on function pg_temp.wh6_assert(boolean,text) to public;
grant execute on function pg_temp.wh6_rejected(text,text) to public;

insert into auth.users(
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('b6000000-0000-4000-8000-000000000001','authenticated','authenticated','wh6-owner@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('b6000000-0000-4000-8000-000000000002','authenticated','authenticated','wh6-other@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.user_workout_plans(id,user_id,name,is_active,is_default,source,created_at,updated_at)
values ('b6000000-0000-4000-8000-000000000010','b6000000-0000-4000-8000-000000000001','WH-6 plan',true,true,'manual',now(),now());
insert into public.user_workout_plan_days(id,plan_id,day_number,day_name,weekday,created_at,updated_at)
values ('b6000000-0000-4000-8000-000000000011','b6000000-0000-4000-8000-000000000010',1,'WH-6 day','Monday',now(),now());
insert into public.user_workout_plan_exercises(
  id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at
) values (
  'b6000000-0000-4000-8000-000000000012','b6000000-0000-4000-8000-000000000011',
  'WH-6 squat',3,'5',60,1,1,now()
);
insert into public.workout_sessions(
  id,user_id,workout_name,status,started_at,completed_at,plan_id,plan_day_id,source,created_at,updated_at
) values (
  'b6000000-0000-4000-8000-000000000020','b6000000-0000-4000-8000-000000000001',
  'WH-6 completed session','completed','2026-08-01T10:00:00Z','2026-08-01T11:00:00Z',
  'b6000000-0000-4000-8000-000000000010','b6000000-0000-4000-8000-000000000011','manual',now(),now()
);
insert into public.exercise_logs(
  id,workout_session_id,exercise_name,set_number,reps,weight_kg,plan_exercise_id,
  completed_at,exercise_order,source,set_type,created_at
) values (
  'b6000000-0000-4000-8000-000000000021','b6000000-0000-4000-8000-000000000020',
  'WH-6 squat',1,5,100,'b6000000-0000-4000-8000-000000000012',
  '2026-08-01T10:30:00Z',1,'manual','normal','2026-08-01T10:30:00Z'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into public.personal_records(user_id,exercise_name,record_type,record_date,source_kind)
values ('b6000000-0000-4000-8000-000000000001','Manual record','Manual',current_date,'manual');

select public.replace_workout_derived_records_atomic(
  'b6000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000020',
  1::smallint,
  'wh6-v1',
  jsonb_build_array(jsonb_build_object(
    'exercise_log_id','b6000000-0000-4000-8000-000000000021',
    'exercise_identity_kind','plan_exercise',
    'exercise_identity','plan_exercise:b6000000-0000-4000-8000-000000000012',
    'record_type','highest_load',
    'record_value',100,
    'record_unit','kg',
    'comparison_context_key','external_load|unit:kg|side:none|set:normal',
    'set_type','normal',
    'achieved_at','2026-08-01T10:30:00Z'
  ))
) as first_replacement \gset

select pg_temp.wh6_assert(
  (select count(*)=1 and min(record_key) is not null from public.personal_records
   where workout_session_id='b6000000-0000-4000-8000-000000000020' and source_kind='workout_derived'),
  'WH-6 trusted replacement did not create exactly one derived record.'
);
select record_key as stable_record_key from public.personal_records
where workout_session_id='b6000000-0000-4000-8000-000000000020' and source_kind='workout_derived' \gset

select public.replace_workout_derived_records_atomic(
  'b6000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000020',1::smallint,'wh6-v1',
  jsonb_build_array(jsonb_build_object(
    'exercise_log_id','b6000000-0000-4000-8000-000000000021',
    'exercise_identity_kind','plan_exercise',
    'exercise_identity','plan_exercise:b6000000-0000-4000-8000-000000000012',
    'record_type','highest_load','record_value',100,'record_unit','kg',
    'comparison_context_key','external_load|unit:kg|side:none|set:normal',
    'set_type','normal','achieved_at','2026-08-01T10:30:00Z'
  ))
);
select pg_temp.wh6_assert(
  (select count(*)=1 and min(record_key)=:'stable_record_key' from public.personal_records
   where workout_session_id='b6000000-0000-4000-8000-000000000020' and source_kind='workout_derived'),
  'WH-6 replacement is not idempotent with a stable record identity.'
);

select pg_temp.wh6_rejected(
  $sql$insert into public.personal_records(
    user_id,exercise_name,record_type,record_date,source_kind,record_key,exercise_identity_kind,
    exercise_identity,workout_session_id,exercise_log_id,derived_record_type,record_value,record_unit,
    comparison_context_key,set_type,schema_version,formula_version,achieved_at
  ) values (
    'b6000000-0000-4000-8000-000000000001','Forged','Max weight',current_date,
    'workout_derived','forged','plan_exercise','plan_exercise:b6000000-0000-4000-8000-000000000012',
    'b6000000-0000-4000-8000-000000000020','b6000000-0000-4000-8000-000000000021',
    'highest_load',999,'kg','forged','normal',1,'wh6-v1','2026-08-01T10:30:00Z'
  )$sql$,
  'Authenticated client forged a derived record directly.'
);
update public.personal_records set record_value=999 where source_kind='workout_derived';
select pg_temp.wh6_assert(
  (select record_value=100 from public.personal_records where source_kind='workout_derived'),
  'Authenticated client updated a derived record directly.'
);

select set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000002',true);
select pg_temp.wh6_rejected(
  $$select public.replace_workout_derived_records_atomic(
    'b6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000020',1::smallint,'wh6-v1','[]'::jsonb
  )$$,
  'A different member replaced the owner derived records.'
);
select set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000001',true);

select public.replace_workout_derived_records_atomic(
  'b6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000020',1::smallint,'wh6-v1','[]'::jsonb
);
select pg_temp.wh6_assert(
  (select count(*)=0 from public.personal_records where source_kind='workout_derived')
  and (select count(*)=1 from public.personal_records where source_kind='manual' and exercise_name='Manual record'),
  'WH-6 empty replacement did not delete only derived records.'
);

rollback;
