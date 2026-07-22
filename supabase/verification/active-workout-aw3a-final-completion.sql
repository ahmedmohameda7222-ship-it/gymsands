begin;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values (
  'a3f00000-0000-4000-8000-000000000001','authenticated','authenticated',
  'aw3a-final-completion@plaivra.invalid','',clock_timestamp(),
  '{}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false
);

insert into public.profiles(id,email,full_name,role)
values ('a3f00000-0000-4000-8000-000000000001','aw3a-final-completion@plaivra.invalid','AW-3A Final Completion','member')
on conflict (id) do update set email=excluded.email,full_name=excluded.full_name;

insert into public.workout_sessions(id,user_id,workout_name,started_at,status,source)
values (
  'a3f00000-0000-4000-8000-000000000010',
  'a3f00000-0000-4000-8000-000000000001',
  'AW-3A Final Completion',
  '2026-07-22T12:00:00Z',
  'started',
  'manual'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

select public.upsert_workout_set_logs_atomic(
  'a3f00000-0000-4000-8000-000000000001',
  'a3f00000-0000-4000-8000-000000000010',
  jsonb_build_array(
    jsonb_build_object(
      'exercise_order',1,'exercise_name','AW-3A Scalar Final','set_number',1,
      'reps',null,'weight_kg',null,'completed_at',null,
      'performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','duration_seconds','value',10,'side','none','source','manual')
      )
    ),
    jsonb_build_object(
      'exercise_order',2,'exercise_name','AW-3A Bilateral Final','set_number',1,
      'reps',null,'weight_kg',null,'completed_at',null,
      'performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','distance_meters','value',25,'side','none','source','manual')
      )
    ),
    jsonb_build_object(
      'exercise_order',3,'exercise_name','AW-3A Omitted Final','set_number',1,
      'reps',null,'weight_kg',null,'completed_at',null,
      'performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','rounds','value',2,'side','none','source','manual')
      )
    )
  )
);

create temporary table aw3a_final_omitted on commit drop as
select id as exercise_log_id
from public.exercise_logs
where workout_session_id='a3f00000-0000-4000-8000-000000000010'
  and exercise_order=3 and set_number=1;

select public.complete_workout_session_atomic(
  'a3f00000-0000-4000-8000-000000000001',
  'a3f00000-0000-4000-8000-000000000010',
  jsonb_build_array(
    jsonb_build_object(
      'exercise_order',1,'exercise_name','AW-3A Scalar Final','set_number',1,
      'reps',12,'weight_kg',60,'completed_at','2026-07-22T12:10:00Z',
      'metric_source','import','metric_source_provider','planner-proof','metric_source_version','v1',
      'performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','repetitions','value',12,'side','none','captured_at','2026-07-22T12:10:00Z'),
        jsonb_build_object('metric_key','external_load_kg','value',60,'side','none','captured_at','2026-07-22T12:10:00Z'),
        jsonb_build_object('metric_key','duration_seconds','value',95,'side','none','captured_at','2026-07-22T12:10:00Z'),
        jsonb_build_object('metric_key','distance_meters','value',500,'side','none','captured_at','2026-07-22T12:10:00Z')
      )
    ),
    jsonb_build_object(
      'exercise_order',2,'exercise_name','AW-3A Bilateral Final','set_number',1,
      'reps',null,'weight_kg',null,'completed_at','2026-07-22T12:11:00Z',
      'metric_source','import','metric_source_provider','planner-proof','metric_source_version','v1',
      'performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','repetitions','value',8,'side','left','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','repetitions','value',7,'side','right','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','external_load_kg','value',22.5,'side','left','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','external_load_kg','value',20,'side','right','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','duration_seconds','value',70,'side','none','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','distance_meters','value',300,'side','none','captured_at','2026-07-22T12:11:00Z')
      )
    )
  ),
  45,
  'Structured final completion'
);

-- Exact retry must be a no-op: no duplicate rows or timeline events.
select public.complete_workout_session_atomic(
  'a3f00000-0000-4000-8000-000000000001',
  'a3f00000-0000-4000-8000-000000000010',
  jsonb_build_array(
    jsonb_build_object(
      'exercise_order',1,'exercise_name','AW-3A Scalar Final','set_number',1,
      'reps',12,'weight_kg',60,'completed_at','2026-07-22T12:10:00Z',
      'metric_source','import','metric_source_provider','planner-proof','metric_source_version','v1',
      'performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','repetitions','value',12,'side','none','captured_at','2026-07-22T12:10:00Z'),
        jsonb_build_object('metric_key','external_load_kg','value',60,'side','none','captured_at','2026-07-22T12:10:00Z'),
        jsonb_build_object('metric_key','duration_seconds','value',95,'side','none','captured_at','2026-07-22T12:10:00Z'),
        jsonb_build_object('metric_key','distance_meters','value',500,'side','none','captured_at','2026-07-22T12:10:00Z')
      )
    ),
    jsonb_build_object(
      'exercise_order',2,'exercise_name','AW-3A Bilateral Final','set_number',1,
      'reps',null,'weight_kg',null,'completed_at','2026-07-22T12:11:00Z',
      'metric_source','import','metric_source_provider','planner-proof','metric_source_version','v1',
      'performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','repetitions','value',8,'side','left','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','repetitions','value',7,'side','right','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','external_load_kg','value',22.5,'side','left','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','external_load_kg','value',20,'side','right','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','duration_seconds','value',70,'side','none','captured_at','2026-07-22T12:11:00Z'),
        jsonb_build_object('metric_key','distance_meters','value',300,'side','none','captured_at','2026-07-22T12:11:00Z')
      )
    )
  ),
  45,
  'Structured final completion'
);

reset role;

do $verify_aw3a_final_completion$
declare
  v_scalar public.exercise_logs%rowtype;
  v_bilateral public.exercise_logs%rowtype;
begin
  select * into strict v_scalar from public.exercise_logs
  where workout_session_id='a3f00000-0000-4000-8000-000000000010' and exercise_order=1 and set_number=1;
  select * into strict v_bilateral from public.exercise_logs
  where workout_session_id='a3f00000-0000-4000-8000-000000000010' and exercise_order=2 and set_number=1;

  if (select status::text from public.workout_sessions where id='a3f00000-0000-4000-8000-000000000010')<>'completed'
     or (select duration_minutes from public.workout_sessions where id='a3f00000-0000-4000-8000-000000000010')<>45 then
    raise exception 'Structured final completion did not preserve the terminal session projection.';
  end if;
  if v_scalar.reps<>12 or v_scalar.weight_kg<>60 then
    raise exception 'Structured final completion lost scalar repetitions/load projections.';
  end if;
  if v_bilateral.reps is not null or v_bilateral.weight_kg is not null then
    raise exception 'Left/right final metrics invented scalar projections.';
  end if;
  if (select count(*) from public.exercise_logs where workout_session_id='a3f00000-0000-4000-8000-000000000010')<>2 then
    raise exception 'Completion did not delete exactly the omitted log.';
  end if;
  if exists (select 1 from public.exercise_logs where id in (select exercise_log_id from aw3a_final_omitted)) then
    raise exception 'The omitted exercise log survived completion.';
  end if;
  if exists (select 1 from public.exercise_log_metric_values where exercise_log_id in (select exercise_log_id from aw3a_final_omitted)) then
    raise exception 'Metric children of the omitted log did not cascade.';
  end if;
  if (select count(*) from public.exercise_log_metric_values where exercise_log_id=v_scalar.id)<>4
     or (select count(*) from public.exercise_log_metric_values where exercise_log_id=v_bilateral.id)<>6 then
    raise exception 'Structured final metric rows are incomplete or duplicated.';
  end if;
  if exists (
    select 1 from public.exercise_log_metric_values
    where exercise_log_id in (v_scalar.id,v_bilateral.id)
      and (source<>'import' or source_provider<>'planner-proof' or source_version<>'v1')
  ) then raise exception 'Structured final metric source metadata was lost.'; end if;
  if not exists (select 1 from public.exercise_log_metric_values where exercise_log_id=v_scalar.id and metric_key='duration_seconds' and value=95)
     or not exists (select 1 from public.exercise_log_metric_values where exercise_log_id=v_scalar.id and metric_key='distance_meters' and value=500)
     or not exists (select 1 from public.exercise_log_metric_values where exercise_log_id=v_bilateral.id and metric_key='repetitions' and side='left' and value=8)
     or not exists (select 1 from public.exercise_log_metric_values where exercise_log_id=v_bilateral.id and metric_key='repetitions' and side='right' and value=7)
     or not exists (select 1 from public.exercise_log_metric_values where exercise_log_id=v_bilateral.id and metric_key='external_load_kg' and side='left' and value=22.5)
     or not exists (select 1 from public.exercise_log_metric_values where exercise_log_id=v_bilateral.id and metric_key='external_load_kg' and side='right' and value=20) then
    raise exception 'Structured final duration/distance/bilateral facts were not preserved.';
  end if;
  if (select count(*) from public.workout_session_timeline_events where workout_session_id='a3f00000-0000-4000-8000-000000000010' and event_type='set_completed')<>2 then
    raise exception 'Structured completion did not create exactly one set_completed event per retained log.';
  end if;
  if (select count(*) from public.workout_session_timeline_events where workout_session_id='a3f00000-0000-4000-8000-000000000010' and event_type='session_completed')<>1 then
    raise exception 'Structured completion retry duplicated or omitted session_completed.';
  end if;
  if exists (
    select idempotency_key from public.workout_session_timeline_events
    where workout_session_id='a3f00000-0000-4000-8000-000000000010'
    group by idempotency_key having count(*)>1
  ) then raise exception 'Structured completion retry duplicated a timeline identity.'; end if;
  if exists (
    select 1 from public.workout_session_timeline_events
    where workout_session_id='a3f00000-0000-4000-8000-000000000010'
      and event_type='set_completed'
      and not (payload ? 'performanceMetrics')
  ) then raise exception 'Structured completion timeline payload omitted performanceMetrics.'; end if;
end
$verify_aw3a_final_completion$;

delete from auth.users where id='a3f00000-0000-4000-8000-000000000001';

rollback;
