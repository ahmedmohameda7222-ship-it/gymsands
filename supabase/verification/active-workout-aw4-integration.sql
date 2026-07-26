\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.aw4_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.aw4_rejected(
  p_sql text,
  p_codes text[],
  p_message text
)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any(p_codes) then return; end if;
    raise exception '% Unexpected SQLSTATE %: %', p_message, sqlstate, sqlerrm;
  end;
  raise exception '%', p_message;
end
$function$;

grant execute on function pg_temp.aw4_assert(boolean,text) to public;
grant execute on function pg_temp.aw4_rejected(text,text[],text) to public;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a4000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'aw4-owner@example.test',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'a4000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'aw4-other@example.test',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );
\set owner_id 'a4000000-0000-4000-8000-000000000001'
\set other_id 'a4000000-0000-4000-8000-000000000002'

insert into public.user_workout_plans (
  id, user_id, name, is_active, is_default, source, created_at, updated_at
) values (
  'a4000000-0000-4000-8000-000000000010',
  :'owner_id'::uuid,
  'AW-4 plan',
  true,
  true,
  'manual',
  now(),
  now()
);
insert into public.user_workout_plan_days (
  id, plan_id, day_number, day_name, weekday, created_at, updated_at
) values (
  'a4000000-0000-4000-8000-000000000011',
  'a4000000-0000-4000-8000-000000000010',
  1,
  'AW-4 day',
  'Monday',
  now(),
  now()
);
insert into public.user_workout_plan_exercises (
  id, plan_day_id, exercise_name, sets, reps, rest_seconds,
  sort_order, order_index, created_at
) values (
  'a4000000-0000-4000-8000-000000000012',
  'a4000000-0000-4000-8000-000000000011',
  'AW-4 exercise',
  3,
  '8',
  60,
  1,
  1,
  now()
);
insert into public.user_workout_sessions (
  id, user_id, user_workout_plan_id, plan_day_id, week_index,
  day_index, session_number, scheduled_date, day_title,
  status, created_at, updated_at
) values (
  'a4000000-0000-4000-8000-000000000014',
  :'owner_id'::uuid,
  'a4000000-0000-4000-8000-000000000010',
  'a4000000-0000-4000-8000-000000000011',
  1,
  1,
  1,
  current_date,
  'AW-4 day',
  'scheduled',
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (
  public.start_or_resume_workout_session_atomic(
    :'owner_id'::uuid,
    'a4000000-0000-4000-8000-000000000011'::uuid,
    'a4000000-0000-4000-8000-000000000014'::uuid
  )->'session'->>'id'
) as session_id \gset
set constraints all immediate;

select pg_temp.aw4_assert(
  (
    select state.state_version = 1
      and state.revision = 0
      and state.activity_timer_kind is null
      and state.activity_timer_elapsed_seconds = 0
      and state.activity_timer_running_since is null
      and state.activity_timer_duration_seconds is null
      and state.activity_timer_ends_at is null
    from public.workout_session_execution_states state
    where state.workout_session_id = :'session_id'::uuid
  ),
  'AW-4 additive default state is invalid.'
);

select pg_temp.aw4_rejected(
  format(
    'update public.workout_session_execution_states set activity_timer_kind=''block'' where workout_session_id=%L::uuid',
    :'session_id'
  ),
  array['42501'],
  'Authenticated direct execution-state UPDATE succeeded.'
);
select pg_temp.aw4_rejected(
  format(
    'insert into public.workout_session_execution_commands(workout_session_id,user_id,command_id,command_type,expected_revision,request_payload,request_hash,outcome,revision_before,revision_after,result_state) values (%L::uuid,%L::uuid,%L::uuid,''pause'',0,''{}''::jsonb,repeat(''0'',64),''no_op'',0,0,''{}''::jsonb)',
    :'session_id',
    :'owner_id',
    'a4000000-0000-4000-8000-000000000099'
  ),
  array['42501'],
  'Authenticated direct command receipt INSERT succeeded.'
);

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000101'::uuid,
  0,
  'start_rest',
  '{"duration_seconds":60,"controller_device_id":null}'::jsonb
) as rest_response \gset
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000102'::uuid,
  1,
  'start_activity_timer',
  '{"kind":"block","duration_seconds":120,"controller_device_id":null}'::jsonb
) as activity_response \gset
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000103'::uuid,
  2,
  'pause',
  '{"controller_device_id":null}'::jsonb
) as pause_response \gset

select pg_temp.aw4_assert(
  (:'rest_response'::jsonb->>'outcome') = 'applied'
  and (:'activity_response'::jsonb->>'outcome') = 'applied'
  and (:'pause_response'::jsonb->>'outcome') = 'applied'
  and (
    select state.revision = 3
      and state.session_state = 'paused'
      and state.session_running_since is null
      and state.view_state = 'rest'
      and state.rest_duration_seconds between 0 and 60
      and state.rest_started_at is null
      and state.rest_ends_at is null
      and state.activity_timer_kind = 'block'
      and state.activity_timer_elapsed_seconds between 0 and 120
      and state.activity_timer_running_since is null
      and state.activity_timer_duration_seconds = 120
      and state.activity_timer_ends_at is null
    from public.workout_session_execution_states state
    where state.workout_session_id = :'session_id'::uuid
  ),
  'AW-4 pause did not atomically freeze session, rest, and activity timers.'
);

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000104'::uuid,
  3,
  'resume',
  '{"controller_device_id":null}'::jsonb
) as resume_response \gset
select pg_temp.aw4_assert(
  (:'resume_response'::jsonb->>'outcome') = 'applied'
  and (
    select state.revision = 4
      and state.session_state = 'active'
      and state.session_running_since is not null
      and state.rest_started_at is not null
      and state.rest_ends_at = state.rest_started_at
        + make_interval(secs => state.rest_duration_seconds)
      and state.activity_timer_running_since is not null
      and state.activity_timer_ends_at is not null
    from public.workout_session_execution_states state
    where state.workout_session_id = :'session_id'::uuid
  ),
  'AW-4 resume did not atomically restart session, rest, and activity timers.'
);

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000105'::uuid,
  4,
  'clear_rest',
  '{"view_state":"set_entry","completion_reason":"natural_expiration","controller_device_id":null}'::jsonb
) as clear_rest_response \gset
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000106'::uuid,
  5,
  'reset_activity_timer',
  '{"controller_device_id":null}'::jsonb
) as reset_activity_response \gset
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000107'::uuid,
  6,
  'clear_activity_timer',
  '{"completion_reason":"completed","controller_device_id":null}'::jsonb
) as clear_activity_response \gset

select pg_temp.aw4_assert(
  (:'clear_rest_response'::jsonb->>'outcome') = 'applied'
  and (:'reset_activity_response'::jsonb->>'outcome') = 'applied'
  and (:'clear_activity_response'::jsonb->>'outcome') = 'applied'
  and (
    select state.revision = 7
      and state.view_state = 'set_entry'
      and state.rest_started_at is null
      and state.activity_timer_kind is null
      and state.activity_timer_elapsed_seconds = 0
    from public.workout_session_execution_states state
    where state.workout_session_id = :'session_id'::uuid
  ),
  'AW-4 rest/activity clear and activity reset transitions are incorrect.'
);

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000107'::uuid,
  6,
  'clear_activity_timer',
  '{"completion_reason":"completed","controller_device_id":null}'::jsonb
) as replay_response \gset
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000107'::uuid,
  6,
  'clear_activity_timer',
  '{"completion_reason":"cancelled","controller_device_id":null}'::jsonb
) as idempotency_response \gset
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000108'::uuid,
  6,
  'pause',
  '{"controller_device_id":null}'::jsonb
) as revision_response \gset
select pg_temp.aw4_assert(
  (:'replay_response'::jsonb->>'replayed')::boolean
  and (:'idempotency_response'::jsonb->>'outcome') = 'idempotency_conflict'
  and (:'revision_response'::jsonb->>'outcome') = 'revision_conflict'
  and (
    select state.revision = 7
    from public.workout_session_execution_states state
    where state.workout_session_id = :'session_id'::uuid
  ),
  'AW-4 replay, idempotency conflict, or revision conflict mutated canonical state.'
);

select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000109'::uuid,
  7,
  'start_activity_timer',
  '{"kind":"timed_set","duration_seconds":null,"controller_device_id":null}'::jsonb
) as unbounded_response \gset
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000110'::uuid,
  8,
  'clear_activity_timer',
  '{"completion_reason":"transitioned","controller_device_id":null}'::jsonb
) as unbounded_clear_response \gset
select pg_temp.aw4_assert(
  (:'unbounded_response'::jsonb->>'outcome') = 'applied'
  and (:'unbounded_clear_response'::jsonb->>'outcome') = 'applied',
  'AW-4 unbounded timed-set timer did not start and clear.'
);

select id::text as snapshot_item_id
from public.workout_session_muscle_snapshot_items
where user_id = :'owner_id'::uuid
  and snapshot_id = (
    select id
    from public.workout_session_muscle_snapshots
    where workout_session_id = :'session_id'::uuid
  )
order by item_order
limit 1 \gset

select pg_temp.aw4_rejected(
  format(
    'select public.apply_workout_session_execution_command_atomic(%L::uuid,%L::uuid,%L::uuid,9,''move_cursor'',%L::jsonb)',
    :'owner_id',
    :'session_id',
    'a4000000-0000-4000-8000-000000000111',
    jsonb_build_object(
      'active_snapshot_item_id', :'snapshot_item_id',
      'active_item_order', 1,
      'active_set_number', 4,
      'view_state', 'set_entry',
      'controller_device_id', null
    )::text
  ),
  array['23514'],
  'AW-4 accepted a set above the frozen prescription without performed identity.'
);

select public.upsert_workout_set_logs_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  jsonb_build_array(jsonb_build_object(
    'plan_exercise_id', 'a4000000-0000-4000-8000-000000000012',
    'exercise_order', 1,
    'exercise_name', 'AW-4 exercise',
    'planned_sets', 3,
    'set_number', 4,
    'reps', 8,
    'weight_kg', 50,
    'completed_at', clock_timestamp()
  ))
);
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000112'::uuid,
  9,
  'move_cursor',
  jsonb_build_object(
    'active_snapshot_item_id', :'snapshot_item_id',
    'active_item_order', 1,
    'active_set_number', 4,
    'view_state', 'set_entry',
    'controller_device_id', null
  )
) as extra_set_response \gset
select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'a4000000-0000-4000-8000-000000000113'::uuid,
  10,
  'reset_timer',
  '{"controller_device_id":null}'::jsonb
) as old_command_response \gset
select pg_temp.aw4_assert(
  (:'extra_set_response'::jsonb->>'outcome') = 'applied'
  and (:'old_command_response'::jsonb->>'outcome') = 'applied'
  and (
    select state.revision = 11 and state.active_set_number = 4
    from public.workout_session_execution_states state
    where state.workout_session_id = :'session_id'::uuid
  ),
  'AW-4 performed extra-set boundary or old command compatibility failed.'
);

select pg_temp.aw4_rejected(
  format(
    'select public.apply_workout_session_execution_command_atomic(%L::uuid,%L::uuid,%L::uuid,11,''unknown_command'',''{}''::jsonb)',
    :'owner_id',
    :'session_id',
    'a4000000-0000-4000-8000-000000000114'
  ),
  array['22023'],
  'AW-4 accepted an unknown command type.'
);
select pg_temp.aw4_rejected(
  format(
    'select public.apply_workout_session_execution_command_atomic(%L::uuid,%L::uuid,%L::uuid,11,''pause'',''{"unknown":true}''::jsonb)',
    :'owner_id',
    :'session_id',
    'a4000000-0000-4000-8000-000000000115'
  ),
  array['22023'],
  'AW-4 accepted an unknown payload key.'
);
select pg_temp.aw4_rejected(
  format(
    'select public.apply_workout_session_execution_command_atomic(%L::uuid,%L::uuid,%L::uuid,11,''pause'',jsonb_build_object(''padding'',repeat(''x'',5000)))',
    :'owner_id',
    :'session_id',
    'a4000000-0000-4000-8000-000000000116'
  ),
  array['22023'],
  'AW-4 accepted an oversized payload.'
);

select set_config('request.jwt.claim.sub', :'other_id', true);
select pg_temp.aw4_rejected(
  format(
    'select public.apply_workout_session_execution_command_atomic(%L::uuid,%L::uuid,%L::uuid,11,''pause'',''{"controller_device_id":null}''::jsonb)',
    :'owner_id',
    :'session_id',
    'a4000000-0000-4000-8000-000000000117'
  ),
  array['42501'],
  'AW-4 cross-user command actor succeeded.'
);
select set_config('request.jwt.claim.sub', :'owner_id', true);

select pg_temp.aw4_assert(
  (
    select count(*) = 1
    from public.workout_session_timeline_events event
    where event.workout_session_id = :'session_id'::uuid
      and event.event_type = 'session_paused'
  )
  and (
    select count(*) = 1
    from public.workout_session_timeline_events event
    where event.workout_session_id = :'session_id'::uuid
      and event.event_type = 'session_resumed'
  )
  and (
    select count(*) = 1
      and bool_and(event.payload->>'reason' = 'natural_expiration')
    from public.workout_session_timeline_events event
    where event.workout_session_id = :'session_id'::uuid
      and event.event_type = 'rest_ended'
  )
  and not exists (
    select 1
    from public.workout_session_timeline_events event
    where event.workout_session_id = :'session_id'::uuid
      and event.command_id in (
        'a4000000-0000-4000-8000-000000000102'::uuid,
        'a4000000-0000-4000-8000-000000000106'::uuid,
        'a4000000-0000-4000-8000-000000000107'::uuid,
        'a4000000-0000-4000-8000-000000000109'::uuid,
        'a4000000-0000-4000-8000-000000000110'::uuid
      )
  ),
  'AW-4 timeline events are duplicated, incomplete, or include activity display noise.'
);

reset role;
select pg_temp.aw4_rejected(
  format(
    'update public.workout_session_execution_states set activity_timer_kind=''invalid'' where workout_session_id=%L::uuid',
    :'session_id'
  ),
  array['23514'],
  'AW-4 activity timer kind constraint accepted an invalid tuple.'
);
select pg_temp.aw4_rejected(
  format(
    'update public.workout_session_execution_states set activity_timer_kind=''block'',activity_timer_elapsed_seconds=0,activity_timer_duration_seconds=86401,activity_timer_running_since=clock_timestamp(),activity_timer_ends_at=clock_timestamp()+interval ''1 day'' where workout_session_id=%L::uuid',
    :'session_id'
  ),
  array['23514'],
  'AW-4 activity timer maximum constraint accepted an oversized duration.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.cancel_workout_session_atomic(
  :'owner_id'::uuid,
  :'session_id'::uuid,
  'user_cancelled'
);
reset role;
select pg_temp.aw4_assert(
  not exists (
    select 1
    from public.workout_session_execution_states state
    where state.workout_session_id = :'session_id'::uuid
  )
  and exists (
    select 1
    from public.workout_sessions session
    where session.id = :'session_id'::uuid
      and session.status = 'cancelled'
  ),
  'AW-4 terminal cleanup retained execution authority.'
);

rollback;
