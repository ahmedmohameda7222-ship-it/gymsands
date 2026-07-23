begin;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values
('b3000000-0000-4000-8000-000000000001','authenticated','authenticated','aw3b-a@plaivra.invalid','',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false),
('b3000000-0000-4000-8000-000000000002','authenticated','authenticated','aw3b-b@plaivra.invalid','',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false);

insert into public.profiles(id,email,full_name,role) values
('b3000000-0000-4000-8000-000000000001','aw3b-a@plaivra.invalid','AW-3B A','member'),
('b3000000-0000-4000-8000-000000000002','aw3b-b@plaivra.invalid','AW-3B B','member')
on conflict (id) do update set
  email=excluded.email,
  full_name=excluded.full_name,
  role=excluded.role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config(
  'plaivra.aw3b_integration_session_id',
  public.start_or_resume_direct_workout_session_atomic(
    'b3000000-0000-4000-8000-000000000001',
    'provider_activity',
    'aw3b-structured-set-details-verification',
    'plaivra_aw3b_verification',
    'AW-3B Integration',
    'Verification',
    '{"sets":2}'::jsonb,
    null
  )->'session'->>'id',
  true
);

create temporary table aw3b_payload on commit drop as
select jsonb_build_array(jsonb_build_object(
  'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
  'reps',8,'weight_kg',50,'notes','Free note only','completed_at','2026-07-22T20:01:00Z',
  'set_details',jsonb_build_object(
    'schema_version',1,'set_type','drop','rpe',9.0,'rir',0.0,'notes','Free note only',
    'side_mode','bilateral','planned_tempo','3-1-1-0','performed_tempo','3-1-1-0',
    'tempo_adherence','adhered','source','manual','source_provider','plaivra','source_version','aw3b-v1'
  ),
  'segments',jsonb_build_array(
    jsonb_build_object(
      'segment_order',1,'segment_kind','primary','side','bilateral','completed_at','2026-07-22T20:01:00Z',
      'source','manual','source_provider','plaivra','source_version','aw3b-v1',
      'performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','repetitions','metric_version',1,'side','none','value',8,'source','manual','source_provider','plaivra','captured_at','2026-07-22T20:01:00Z'),
        jsonb_build_object('metric_key','external_load_kg','metric_version',1,'side','none','value',50,'source','manual','source_provider','plaivra','captured_at','2026-07-22T20:01:00Z')
      )
    ),
    jsonb_build_object(
      'segment_order',2,'segment_kind','drop','side','bilateral','completed_at','2026-07-22T20:01:30Z',
      'source','manual','source_provider','plaivra','source_version','aw3b-v1',
      'performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','repetitions','metric_version',1,'side','none','value',6,'source','manual','source_provider','plaivra','captured_at','2026-07-22T20:01:30Z'),
        jsonb_build_object('metric_key','external_load_kg','metric_version',1,'side','none','value',40,'source','manual','source_provider','plaivra','captured_at','2026-07-22T20:01:30Z')
      )
    )
  )
)) as payload;

select public.upsert_workout_set_logs_atomic(
  'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
  (select payload from aw3b_payload)
);
select public.upsert_workout_set_logs_atomic(
  'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
  (select payload from aw3b_payload)
);

reset role;

do $verify_create_retry$
declare
  v_log public.exercise_logs%rowtype;
begin
  select * into strict v_log from public.exercise_logs
  where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid and exercise_order=1 and set_number=1;
  if v_log.set_type<>'drop' or v_log.notes<>'Free note only' then raise exception 'AW-3B compatibility projection failed.'; end if;
  if (select count(*) from public.exercise_log_set_details where exercise_log_id=v_log.id)<>1
     or (select count(*) from public.exercise_log_set_segments where exercise_log_id=v_log.id)<>2
     or (select count(*) from public.exercise_log_set_segment_metric_values where exercise_log_id=v_log.id)<>4 then
    raise exception 'AW-3B structured create/retry identity failed.';
  end if;
  if (select count(*) from public.workout_session_timeline_events where exercise_log_id=v_log.id and event_type='set_completed')<>1
     or exists (select 1 from public.workout_session_timeline_events where exercise_log_id=v_log.id and event_type='set_edited') then
    raise exception 'AW-3B exact retry emitted duplicate timeline history.';
  end if;
end
$verify_create_retry$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

-- Detail-only edit: segments are omitted and therefore preserved.
select public.upsert_workout_set_logs_atomic(
  'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
    'reps',8,'weight_kg',50,'notes','Free note only','completed_at','2026-07-22T20:01:00Z',
    'set_details',jsonb_build_object(
      'set_type','drop','rpe',8.5,'rir',0,'notes','Free note only','side_mode','bilateral',
      'planned_tempo','3-1-1-0','performed_tempo','3-1-1-0','tempo_adherence','adhered',
      'source','manual','source_provider','plaivra','source_version','aw3b-v1'
    )
  ))
);

-- Legacy write omits both structured keys, so details and segments remain.
select public.upsert_workout_set_logs_atomic(
  'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
    'reps',9,'weight_kg',52.5,'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z'
  ))
);

reset role;

do $verify_edit_preservation$
declare
  v_log public.exercise_logs%rowtype;
begin
  select * into strict v_log from public.exercise_logs
  where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid and exercise_order=1 and set_number=1;
  if (select rpe from public.exercise_log_set_details where exercise_log_id=v_log.id)<>8.5
     or (select count(*) from public.exercise_log_set_segments where exercise_log_id=v_log.id)<>2 then
    raise exception 'AW-3B omitted-field preservation failed.';
  end if;
  if v_log.notes<>'Legacy free-note edit'
     or (select notes from public.exercise_log_set_details where exercise_log_id=v_log.id)<>'Free note only' then
    raise exception 'AW-3B legacy free-note compatibility failed.';
  end if;
  if not exists (
    select 1 from public.workout_session_timeline_events
    where exercise_log_id=v_log.id and event_type='set_edited'
      and payload->>'rpeChanged'='true' and payload->>'segmentCount'='2'
      and payload::text not like '%Free note only%'
  ) then raise exception 'AW-3B bounded detail-edit fingerprint is missing.'; end if;
end
$verify_edit_preservation$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

-- A legacy caller may explicitly clear the compatibility note. The structured
-- row remains intact, but its older note copy must never resurrect in reads.
select public.upsert_workout_set_logs_atomic(
  'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
    'reps',9,'weight_kg',52.5,'notes',null,'completed_at','2026-07-22T20:01:00Z'
  ))
);

reset role;

do $verify_legacy_note_clear$
declare v_log public.exercise_logs%rowtype;
begin
  select * into strict v_log from public.exercise_logs
  where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid and exercise_order=1 and set_number=1;
  if v_log.notes is not null
     or (select notes from public.exercise_log_set_details where exercise_log_id=v_log.id)<>'Free note only'
     or (select count(*) from public.exercise_log_set_segments where exercise_log_id=v_log.id)<>2 then
    raise exception 'AW-3B legacy free-note clear or structured preservation failed.';
  end if;
end
$verify_legacy_note_clear$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

create temporary table aw3b_replacement_baseline on commit drop as
select
  l.id as exercise_log_id,
  (select id from public.exercise_log_set_segments
    where exercise_log_id=l.id and segment_order=1) as retained_segment_id,
  (select count(*) from public.workout_session_timeline_events
    where exercise_log_id=l.id and event_type='set_edited') as edit_event_count
from public.exercise_logs l
where l.workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid
  and l.exercise_order=1 and l.set_number=1;

-- A present segments array is an exact replacement: retain order 1, replace its
-- metrics, and delete order 2. Repeating the replacement is a no-op.
select public.upsert_workout_set_logs_atomic(
  'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
    'reps',9,'weight_kg',52.5,'completed_at','2026-07-22T20:01:00Z',
    'segments',jsonb_build_array(jsonb_build_object(
      'segment_order',1,'segment_kind','rest_pause','side','bilateral',
      'completed_at','2026-07-22T20:01:45Z','source','manual','source_provider','plaivra',
      'source_version','aw3b-v1','performance_metrics',jsonb_build_array(jsonb_build_object(
        'metric_key','duration_seconds','metric_version',1,'side','none','value',45,
        'source','manual','source_provider','plaivra','captured_at','2026-07-22T20:01:45Z'
      ))
    ))
  ))
);

create temporary table aw3b_replacement_result on commit drop as
select
  s.id as segment_id,
  m.id as metric_id,
  m.captured_at,
  (select count(*) from public.workout_session_timeline_events
    where exercise_log_id=s.exercise_log_id and event_type='set_edited') as edit_event_count
from public.exercise_log_set_segments s
join public.exercise_log_set_segment_metric_values m on m.segment_id=s.id
where s.exercise_log_id=(select exercise_log_id from aw3b_replacement_baseline)
  and s.segment_order=1;

select public.upsert_workout_set_logs_atomic(
  'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
    'reps',9,'weight_kg',52.5,'completed_at','2026-07-22T20:01:00Z',
    'segments',jsonb_build_array(jsonb_build_object(
      'segment_order',1,'segment_kind','rest_pause','side','bilateral',
      'completed_at','2026-07-22T20:01:45Z','source','manual','source_provider','plaivra',
      'source_version','aw3b-v1','performance_metrics',jsonb_build_array(jsonb_build_object(
        'metric_key','duration_seconds','metric_version',1,'side','none','value',45,
        'source','manual','source_provider','plaivra','captured_at','2026-07-22T20:01:45Z'
      ))
    ))
  ))
);

reset role;

do $verify_exact_replacement$
declare
  v_baseline aw3b_replacement_baseline%rowtype;
  v_result aw3b_replacement_result%rowtype;
begin
  select * into strict v_baseline from aw3b_replacement_baseline;
  select * into strict v_result from aw3b_replacement_result;
  if (select count(*) from public.exercise_log_set_segments where exercise_log_id=v_baseline.exercise_log_id)<>1
     or (select count(*) from public.exercise_log_set_segment_metric_values where exercise_log_id=v_baseline.exercise_log_id)<>1 then
    raise exception 'AW-3B exact segment replacement left stale rows.';
  end if;
  if v_result.segment_id<>v_baseline.retained_segment_id
     or (select id from public.exercise_log_set_segments where exercise_log_id=v_baseline.exercise_log_id)<>v_result.segment_id
     or (select id from public.exercise_log_set_segment_metric_values where exercise_log_id=v_baseline.exercise_log_id)<>v_result.metric_id
     or (select captured_at from public.exercise_log_set_segment_metric_values where exercise_log_id=v_baseline.exercise_log_id)<>v_result.captured_at then
    raise exception 'AW-3B replacement retry changed stable row identity or capture time.';
  end if;
  if v_result.edit_event_count<>v_baseline.edit_event_count+1
     or (select count(*) from public.workout_session_timeline_events
       where exercise_log_id=v_baseline.exercise_log_id and event_type='set_edited')<>v_result.edit_event_count then
    raise exception 'AW-3B replacement retry emitted noisy timeline history.';
  end if;
end
$verify_exact_replacement$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000001',true);

do $owner_read_acceptance$
begin
  if (select count(*) from public.exercise_log_set_details
      where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid)<>1
     or (select count(*) from public.exercise_log_set_segments
      where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid)<>1
     or (select count(*) from public.exercise_log_set_segment_metric_values
      where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid)<>1 then
    raise exception 'Owner could not read the complete AW-3B structured set graph.';
  end if;
end
$owner_read_acceptance$;

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000002',true);

do $cross_user_read_rejection$
begin
  if exists (
    select 1 from public.exercise_log_set_details
    where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid
  ) or exists (
    select 1 from public.exercise_log_set_segments
    where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid
  ) or exists (
    select 1 from public.exercise_log_set_segment_metric_values
    where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid
  ) then
    raise exception 'Cross-user AW-3B structured rows were visible.';
  end if;
end
$cross_user_read_rejection$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

-- Explicit null/empty values clear both optional models.
select public.upsert_workout_set_logs_atomic(
  'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
    'reps',9,'weight_kg',52.5,'completed_at','2026-07-22T20:01:00Z',
    'set_details',null,'segments','[]'::jsonb
  ))
);

do $invalid_aw3b_cases$
declare
  v_detail_count bigint;
begin
  select count(*) into v_detail_count from public.exercise_log_set_details;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'set_details',jsonb_build_object('set_type','drop','rpe',10.1,'notes','Legacy free-note edit')
      ))
    );
    raise exception 'Out-of-range RPE was accepted.';
  exception when check_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'set_details',jsonb_build_object('set_type','drop','rpe',8.25,'notes','Legacy free-note edit')
      ))
    );
    raise exception 'Over-precise RPE was accepted.';
  exception when check_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'set_details',jsonb_build_object('set_type','drop','rir',1.25,'notes','Legacy free-note edit')
      ))
    );
    raise exception 'Over-precise RIR was accepted.';
  exception when check_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'set_details',jsonb_build_object('set_type','drop','rir',20.1,'notes','Legacy free-note edit')
      ))
    );
    raise exception 'Out-of-range RIR was accepted.';
  exception when check_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes',repeat('x',4001),'completed_at','2026-07-22T20:01:00Z',
        'set_details',jsonb_build_object('set_type','drop','notes',repeat('x',4001))
      ))
    );
    raise exception 'Overlong set notes were accepted.';
  exception when check_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'set_details',jsonb_build_object('set_type','drop','notes','Legacy free-note edit','side_mode','center')
      ))
    );
    raise exception 'Invalid side mode was accepted.';
  exception when check_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'set_details',jsonb_build_object('set_type','drop','notes','Legacy free-note edit','planned_tempo',E'2-0\n2-0')
      ))
    );
    raise exception 'Control characters in planned tempo were accepted.';
  exception when check_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'set_details',jsonb_build_object('set_type','drop','notes','Legacy free-note edit','tempo_adherence','invented')
      ))
    );
    raise exception 'Invalid tempo adherence was accepted.';
  exception when check_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'segments',jsonb_build_array(jsonb_build_object(
          'segment_order',1,'segment_kind','drop','performance_metrics',jsonb_build_array(
            jsonb_build_object('metric_key','rounds','value',1.5,'source','manual')
          )
        ))
      ))
    );
    raise exception 'Invalid segment metric value was accepted.';
  exception when numeric_value_out_of_range then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'segments',jsonb_build_array(
          jsonb_build_object('segment_order',1,'segment_kind','drop'),
          jsonb_build_object('segment_order',1,'segment_kind','drop')
        )
      ))
    );
    raise exception 'Duplicate segment order was accepted.';
  exception when unique_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,'reps',9,'weight_kg',52.5,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'segments',jsonb_build_array(jsonb_build_object('segment_order',0,'segment_kind','drop'))
      ))
    );
    raise exception 'Out-of-range segment order was accepted.';
  exception when check_violation then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object('padding',repeat('x',16777217)))
    );
    raise exception 'An oversized AW-3B JSON payload was accepted.';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      (select jsonb_agg(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Request Limit','set_number',n
      ) order by n) from generate_series(1,501) n)
    );
    raise exception 'An AW-3B request with more than 500 logs was accepted.';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'set_details',jsonb_build_object(
          'set_type','drop','notes','Legacy free-note edit','source','backfill'
        )
      ))
    );
    raise exception 'Runtime detail writes accepted reserved backfill provenance.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'segments',jsonb_build_array(jsonb_build_object(
          'segment_order',1,'segment_kind','drop','source','backfill'
        ))
      ))
    );
    raise exception 'Runtime segment writes accepted reserved backfill provenance.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
        'notes','Legacy free-note edit','completed_at','2026-07-22T20:01:00Z',
        'segments',jsonb_build_array(jsonb_build_object(
          'segment_order',1,'segment_kind','drop','source','manual',
          'performance_metrics',jsonb_build_array(jsonb_build_object(
            'metric_key','repetitions','value',1,'source','backfill'
          ))
        ))
      ))
    );
    raise exception 'Runtime segment metrics accepted reserved backfill provenance.';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.exercise_log_set_details)<>v_detail_count then
    raise exception 'An invalid AW-3B payload partially committed.';
  end if;
end
$invalid_aw3b_cases$;

reset role;

do $verify_clear$
declare v_log_id uuid;
begin
  select id into strict v_log_id from public.exercise_logs
  where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid and exercise_order=1 and set_number=1;
  if exists (select 1 from public.exercise_log_set_details where exercise_log_id=v_log_id)
     or exists (select 1 from public.exercise_log_set_segments where exercise_log_id=v_log_id)
     or exists (select 1 from public.exercise_log_set_segment_metric_values where exercise_log_id=v_log_id) then
    raise exception 'AW-3B explicit clear did not cascade.';
  end if;
  if (select notes from public.exercise_logs where id=v_log_id) is not null then
    raise exception 'AW-3B detail clear with omitted notes changed the free note.';
  end if;
end
$verify_clear$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select set_config(
  'plaivra.aw3b_session_limit_id',
  public.start_or_resume_direct_workout_session_atomic(
    'b3000000-0000-4000-8000-000000000002',
    'provider_activity',
    'aw3b-session-limit-verification',
    'plaivra_aw3b_verification',
    'AW-3B Session Limit',
    'Verification',
    '{"sets":500}'::jsonb,
    null
  )->'session'->>'id',
  true
);

do $seed_session_log_limit$
begin
  perform public.upsert_workout_set_logs_atomic(
    'b3000000-0000-4000-8000-000000000002',
    current_setting('plaivra.aw3b_session_limit_id')::uuid,
    (select jsonb_agg(jsonb_build_object(
      'exercise_order',1,
      'exercise_name','AW-3B Session Limit',
      'set_number',n,
      'reps',1,
      'completed_at','2026-07-22T20:03:00Z'
    ) order by n) from generate_series(1,500) n)
  );
end
$seed_session_log_limit$;

do $session_log_limit$
begin
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000002',
      current_setting('plaivra.aw3b_session_limit_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,
        'exercise_name','AW-3B Session Limit',
        'set_number',501,
        'reps',1,
        'completed_at','2026-07-22T20:03:01Z'
      ))
    );
    raise exception 'Repeated requests exceeded the AW-3B 500-log session limit.';
  exception when invalid_parameter_value then null; end;
  if (select count(*) from public.exercise_logs
      where workout_session_id=current_setting('plaivra.aw3b_session_limit_id')::uuid)<>500 then
    raise exception 'AW-3B session-limit rejection was not atomic.';
  end if;
end
$session_log_limit$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000002',true);

do $cross_user_rejection$
begin
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,'[]'::jsonb
    );
    raise exception 'Cross-user AW-3B RPC call was accepted.';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.exercise_log_set_details(
      exercise_log_id,workout_session_id,user_id,set_type,source
    ) select id,workout_session_id,'b3000000-0000-4000-8000-000000000001','working','manual'
      from public.exercise_logs where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid limit 1;
    raise exception 'Authenticated direct AW-3B insert was accepted.';
  exception when insufficient_privilege then null; end;
end
$cross_user_rejection$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

-- Completion writes final details and segments through the same public authority.
select public.complete_workout_session_atomic(
  'b3000000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_integration_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Drop Set','set_number',1,
    'reps',9,'weight_kg',52.5,'notes','Final free note','completed_at','2026-07-22T20:02:00Z',
    'set_details',jsonb_build_object('set_type','working','rpe',8,'rir',1,'notes','Final free note','source','manual'),
    'segments',jsonb_build_array(jsonb_build_object(
      'segment_order',1,'segment_kind','other','source','manual',
      'performance_metrics',jsonb_build_array(jsonb_build_object(
        'metric_key','duration_seconds','value',60,'source','manual','captured_at','2026-07-22T20:02:00Z'
      ))
    ))
  )),30,'Done'
);

reset role;

do $verify_completion$
declare v_log_id uuid;
begin
  select id into strict v_log_id from public.exercise_logs
  where workout_session_id=current_setting('plaivra.aw3b_integration_session_id')::uuid;
  if (select status::text from public.workout_sessions where id=current_setting('plaivra.aw3b_integration_session_id')::uuid)<>'completed'
     or (select count(*) from public.exercise_log_set_details where exercise_log_id=v_log_id)<>1
     or (select count(*) from public.exercise_log_set_segments where exercise_log_id=v_log_id)<>1
     or (select count(*) from public.exercise_log_set_segment_metric_values where exercise_log_id=v_log_id)<>1 then
    raise exception 'AW-3B final completion was not atomic.';
  end if;
end
$verify_completion$;

delete from auth.users where id in (
  'b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002'
);

do $verify_account_delete$
begin
  if exists (select 1 from public.exercise_log_set_details where user_id in ('b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002'))
     or exists (select 1 from public.exercise_log_set_segments where user_id in ('b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002'))
     or exists (select 1 from public.exercise_log_set_segment_metric_values where user_id in ('b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002')) then
    raise exception 'Account deletion left AW-3B structured children.';
  end if;
end
$verify_account_delete$;

rollback;
