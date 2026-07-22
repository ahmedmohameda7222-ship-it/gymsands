begin;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values (
  'a3000000-0000-4000-8000-000000000001','authenticated','authenticated',
  'aw3a-verification@plaivra.invalid','',clock_timestamp(),
  '{}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false
);

insert into public.profiles(id,email,full_name,role)
values ('a3000000-0000-4000-8000-000000000001','aw3a-verification@plaivra.invalid','AW-3A Verification','member')
on conflict (id) do update set email=excluded.email,full_name=excluded.full_name;

insert into public.workout_sessions(
  id,user_id,workout_name,started_at,status,source
) values (
  'a3000000-0000-4000-8000-000000000010',
  'a3000000-0000-4000-8000-000000000001',
  'AW-3A Verification',
  '2026-07-22T10:00:00Z',
  'started',
  'manual'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

select public.upsert_workout_set_logs_atomic(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,
    'exercise_name','AW-3A Structured Set',
    'set_number',1,
    'reps',8,
    'weight_kg',50,
    'completed_at','2026-07-22T10:01:00Z',
    'performance_metrics',jsonb_build_array(
      jsonb_build_object('metric_key','repetitions','metric_version',1,'value',8,'side','none','source','manual','captured_at','2026-07-22T10:01:00Z'),
      jsonb_build_object('metric_key','external_load_kg','metric_version',1,'value',50,'side','none','source','manual','captured_at','2026-07-22T10:01:00Z'),
      jsonb_build_object('metric_key','duration_seconds','metric_version',1,'value',60,'side','none','source','manual','captured_at','2026-07-22T10:01:00Z')
    )
  ))
);

-- Exact retry must not duplicate the set, metrics, or completion event.
select public.upsert_workout_set_logs_atomic(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3A Structured Set','set_number',1,
    'reps',8,'weight_kg',50,'completed_at','2026-07-22T10:01:00Z',
    'performance_metrics',jsonb_build_array(
      jsonb_build_object('metric_key','repetitions','metric_version',1,'value',8,'side','none','source','manual','captured_at','2026-07-22T10:01:00Z'),
      jsonb_build_object('metric_key','external_load_kg','metric_version',1,'value',50,'side','none','source','manual','captured_at','2026-07-22T10:01:00Z'),
      jsonb_build_object('metric_key','duration_seconds','metric_version',1,'value',60,'side','none','source','manual','captured_at','2026-07-22T10:01:00Z')
    )
  ))
);

reset role;

do $verify_initial$
declare
  v_log public.exercise_logs%rowtype;
begin
  select * into strict v_log from public.exercise_logs
  where workout_session_id='a3000000-0000-4000-8000-000000000010' and exercise_order=1 and set_number=1;
  if v_log.reps<>8 or v_log.weight_kg<>50 then raise exception 'Structured compatibility projection failed.'; end if;
  if (select count(*) from public.exercise_log_metric_values where exercise_log_id=v_log.id)<>3 then
    raise exception 'Structured metric upsert/retry identity failed.';
  end if;
  if (select count(*) from public.workout_session_timeline_events where workout_session_id=v_log.workout_session_id and exercise_log_id=v_log.id and event_type='set_completed')<>1 then
    raise exception 'Structured completion event is not exactly-once.';
  end if;
  if exists (
    select 1 from public.workout_session_timeline_events
    where workout_session_id=v_log.workout_session_id
      and payload::text ~* '(access_token|refresh_token|user_agent|ip_address|controller_device_id)'
  ) then raise exception 'Timeline payload contains prohibited metadata.'; end if;
end
$verify_initial$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

-- Full replacement omits repetitions/load, so both metric rows and scalar projections disappear.
select public.upsert_workout_set_logs_atomic(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3A Structured Set','set_number',1,
    'reps',null,'weight_kg',null,'completed_at','2026-07-22T10:01:00Z',
    'performance_metrics',jsonb_build_array(
      jsonb_build_object('metric_key','duration_seconds','metric_version',1,'value',75,'side','none','source','manual','captured_at','2026-07-22T10:02:00Z')
    )
  ))
);
select public.upsert_workout_set_logs_atomic(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3A Structured Set','set_number',1,
    'reps',null,'weight_kg',null,'completed_at','2026-07-22T10:01:00Z',
    'performance_metrics',jsonb_build_array(
      jsonb_build_object('metric_key','duration_seconds','metric_version',1,'value',75,'side','none','source','manual','captured_at','2026-07-22T10:02:00Z')
    )
  ))
);

reset role;

do $verify_replacement$
declare
  v_log public.exercise_logs%rowtype;
begin
  select * into strict v_log from public.exercise_logs
  where workout_session_id='a3000000-0000-4000-8000-000000000010' and exercise_order=1 and set_number=1;
  if v_log.reps is not null or v_log.weight_kg is not null then raise exception 'Structured replacement failed to clear scalar projections.'; end if;
  if (select count(*) from public.exercise_log_metric_values where exercise_log_id=v_log.id)<>1
     or not exists (select 1 from public.exercise_log_metric_values where exercise_log_id=v_log.id and metric_key='duration_seconds' and value=75) then
    raise exception 'Structured full replacement failed.';
  end if;
  if (select count(*) from public.workout_session_timeline_events where exercise_log_id=v_log.id and event_type='set_edited')<>1 then
    raise exception 'Structured replacement retry emitted an incorrect number of edit events.';
  end if;
  if not exists (
    select 1 from public.workout_session_timeline_events
    where exercise_log_id=v_log.id and event_type='set_edited'
      and payload->'changedFields' ? 'performanceMetrics'
  ) then raise exception 'Structured edit did not identify performanceMetrics.'; end if;
end
$verify_replacement$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

-- Old client adds unsided reps/load while preserving duration.
select public.upsert_workout_set_logs_atomic(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3A Structured Set','set_number',1,
    'reps',10,'weight_kg',55,'completed_at','2026-07-22T10:01:00Z'
  ))
);

-- Unilateral-only values must not invent scalar totals.
select public.upsert_workout_set_logs_atomic(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'exercise_order',2,'exercise_name','AW-3A Unilateral Set','set_number',1,
    'reps',null,'weight_kg',null,'completed_at','2026-07-22T10:03:00Z',
    'performance_metrics',jsonb_build_array(
      jsonb_build_object('metric_key','repetitions','value',8,'side','left','source','manual','captured_at','2026-07-22T10:03:00Z'),
      jsonb_build_object('metric_key','repetitions','value',7,'side','right','source','manual','captured_at','2026-07-22T10:03:00Z'),
      jsonb_build_object('metric_key','external_load_kg','value',20,'side','left','source','manual','captured_at','2026-07-22T10:03:00Z'),
      jsonb_build_object('metric_key','external_load_kg','value',20,'side','right','source','manual','captured_at','2026-07-22T10:03:00Z')
    )
  ))
);

-- Generic values stay distinct from scalar load.
select public.upsert_workout_set_logs_atomic(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'exercise_order',3,'exercise_name','AW-3A Generic Set','set_number',1,
    'reps',null,'weight_kg',null,'completed_at','2026-07-22T10:04:00Z',
    'performance_metrics',jsonb_build_array(
      jsonb_build_object('metric_key','bodyweight_kg','value',85,'side','none','source','manual','captured_at','2026-07-22T10:04:00Z'),
      jsonb_build_object('metric_key','assistance_load_kg','value',15,'side','none','source','manual','captured_at','2026-07-22T10:04:00Z'),
      jsonb_build_object('metric_key','rounds','value',3,'side','none','source','manual','captured_at','2026-07-22T10:04:00Z'),
      jsonb_build_object('metric_key','distance_meters','value',500,'side','none','source','manual','captured_at','2026-07-22T10:04:00Z')
    )
  ))
);

-- Representative invalid cases must roll back atomically.
do $invalid_cases$
declare
  v_before bigint;
begin
  select count(*) into v_before from public.exercise_logs where workout_session_id='a3000000-0000-4000-8000-000000000010';

  begin
    perform public.upsert_workout_set_logs_atomic(
      'a3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000010',
      jsonb_build_array(jsonb_build_object(
        'exercise_order',4,'exercise_name','Invalid','set_number',1,'reps',null,'weight_kg',null,
        'performance_metrics',jsonb_build_array(jsonb_build_object('metric_key','unknown_metric','value',1))
      ))
    );
    raise exception 'Unknown metric was accepted.';
  exception when foreign_key_violation then null; end;

  begin
    perform public.upsert_workout_set_logs_atomic(
      'a3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000010',
      jsonb_build_array(jsonb_build_object(
        'exercise_order',4,'exercise_name','Invalid','set_number',1,'reps',null,'weight_kg',null,
        'performance_metrics',jsonb_build_array(jsonb_build_object('metric_key','repetitions','value',1.5))
      ))
    );
    raise exception 'Fractional repetitions were accepted.';
  exception when numeric_value_out_of_range then null; end;

  begin
    perform public.upsert_workout_set_logs_atomic(
      'a3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000010',
      jsonb_build_array(jsonb_build_object(
        'exercise_order',4,'exercise_name','Invalid','set_number',1,'reps',8,'weight_kg',null,
        'performance_metrics',jsonb_build_array(jsonb_build_object('metric_key','repetitions','value',9,'side','none'))
      ))
    );
    raise exception 'Scalar/structured mismatch was accepted.';
  exception when check_violation then null; end;

  if (select count(*) from public.exercise_logs where workout_session_id='a3000000-0000-4000-8000-000000000010')<>v_before then
    raise exception 'An invalid structured payload partially mutated exercise logs.';
  end if;
end
$invalid_cases$;

reset role;

do $verify_generic_and_unilateral$
declare
  v_log public.exercise_logs%rowtype;
begin
  select * into strict v_log from public.exercise_logs
  where workout_session_id='a3000000-0000-4000-8000-000000000010' and exercise_order=1 and set_number=1;
  if v_log.reps<>10 or v_log.weight_kg<>55 then raise exception 'Old-client scalar synchronization failed.'; end if;
  if not exists (select 1 from public.exercise_log_metric_values where exercise_log_id=v_log.id and metric_key='duration_seconds' and value=75) then
    raise exception 'Old-client update erased a generic metric.';
  end if;
  if not exists (select 1 from public.exercise_log_metric_values where exercise_log_id=v_log.id and metric_key='repetitions' and source='chatgpt' and source_provider='openai') then
    raise exception 'MCP/service-role source metadata was not applied.';
  end if;

  select * into strict v_log from public.exercise_logs
  where workout_session_id='a3000000-0000-4000-8000-000000000010' and exercise_order=2 and set_number=1;
  if v_log.reps is not null or v_log.weight_kg is not null then raise exception 'Unilateral values invented a scalar total.'; end if;
  if (select count(*) from public.exercise_log_metric_values where exercise_log_id=v_log.id)<>4 then
    raise exception 'Unilateral metric rows are incomplete.';
  end if;

  select * into strict v_log from public.exercise_logs
  where workout_session_id='a3000000-0000-4000-8000-000000000010' and exercise_order=3 and set_number=1;
  if v_log.weight_kg is not null then raise exception 'Bodyweight/assistance invented external load.'; end if;
  if (select count(*) from public.exercise_log_metric_values where exercise_log_id=v_log.id)<>4 then
    raise exception 'Generic metric values are incomplete.';
  end if;
end
$verify_generic_and_unilateral$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

-- Completion accepts structured final logs and deletes omitted logs; metric children cascade.
select public.complete_workout_session_atomic(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3A Structured Set','set_number',1,
    'reps',10,'weight_kg',55,'completed_at','2026-07-22T10:01:00Z',
    'performance_metrics',jsonb_build_array(
      jsonb_build_object('metric_key','repetitions','value',10,'side','none','source','chatgpt','source_provider','openai','captured_at','2026-07-22T10:01:00Z'),
      jsonb_build_object('metric_key','external_load_kg','value',55,'side','none','source','chatgpt','source_provider','openai','captured_at','2026-07-22T10:01:00Z'),
      jsonb_build_object('metric_key','duration_seconds','value',75,'side','none','source','manual','captured_at','2026-07-22T10:02:00Z')
    )
  )),
  30,
  null
);

reset role;

do $verify_completion$
begin
  if (select count(*) from public.exercise_logs where workout_session_id='a3000000-0000-4000-8000-000000000010')<>1 then
    raise exception 'Completion did not delete omitted logs.';
  end if;
  if exists (
    select 1 from public.exercise_log_metric_values v
    left join public.exercise_logs l on l.id=v.exercise_log_id
    where v.workout_session_id='a3000000-0000-4000-8000-000000000010' and l.id is null
  ) then raise exception 'Completion left orphan metric values.'; end if;
  if not exists (
    select 1 from public.workout_session_timeline_events
    where workout_session_id='a3000000-0000-4000-8000-000000000010' and event_type='session_completed'
  ) then raise exception 'Completion timeline event is missing.'; end if;
end
$verify_completion$;

-- Account deletion must cascade every owned performed metric row.
delete from auth.users where id='a3000000-0000-4000-8000-000000000001';

do $verify_account_delete$
begin
  if exists (select 1 from public.exercise_log_metric_values where user_id='a3000000-0000-4000-8000-000000000001') then
    raise exception 'Account deletion left workout metric values.';
  end if;
  if exists (select 1 from public.workout_sessions where user_id='a3000000-0000-4000-8000-000000000001') then
    raise exception 'Account deletion left workout sessions.';
  end if;
end
$verify_account_delete$;

rollback;
