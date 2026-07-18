-- Insert-as-skipped is terminal at the same transaction boundary.
insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'custom_plan_id'::uuid, 2, 'Direct skip day')
returning id as skip_plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, sort_order
) values (
  :'skip_plan_day_id'::uuid, :'custom_exercise_id', 'Skip custom squat', 2, '10', 1
) returning id as skip_plan_exercise_id \gset
insert into public.workout_sessions(
  user_id, plan_id, plan_day_id, workout_name, started_at, completed_at,
  skipped_at, duration_minutes, status, source
) values (
  :'member_id'::uuid, :'custom_plan_id'::uuid, :'skip_plan_day_id'::uuid,
  'Direct skip day', now(), now(), now(), 0, 'skipped', 'manual'
) returning id as insert_skipped_session_id \gset
select id as insert_skipped_snapshot_id
from public.workout_session_muscle_snapshots
where workout_session_id = :'insert_skipped_session_id'::uuid \gset
select md5(to_jsonb(snapshot)::text) as insert_skipped_snapshot_hash
from public.workout_session_muscle_snapshots snapshot
where snapshot.id = :'insert_skipped_snapshot_id'::uuid \gset
select md5(coalesce(string_agg(md5(to_jsonb(item)::text), '' order by item.id), '')) as insert_skipped_item_hash
from public.workout_session_muscle_snapshot_items item
where item.snapshot_id = :'insert_skipped_snapshot_id'::uuid \gset
select pg_temp.assert_true(
  exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    where snapshot.workout_session_id = :'insert_skipped_session_id'::uuid
      and snapshot.source = 'terminal_insert'
      and 'session_skipped' = any(snapshot.reason_codes)
  )
  and not exists (
    select 1 from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'insert_skipped_session_id'::uuid
      and item.state <> 'skipped'
  ),
  'Insert-as-skipped was mislabeled or left non-terminal.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_upsert_failure(
  :'member_id'::uuid,
  :'insert_skipped_session_id'::uuid,
  jsonb_build_array(jsonb_build_object(
    'plan_exercise_id', :'skip_plan_exercise_id',
    'exercise_order', 1,
    'exercise_name', 'Skip custom squat',
    'set_number', 1,
    'reps', 10,
    'weight_kg', 0
  )),
  '23514',
  'Skipped session unexpectedly accepted set logs.'
);
select pg_temp.assert_completion_failure(
  :'member_id'::uuid,
  :'insert_skipped_session_id'::uuid,
  null,
  0,
  '23514',
  'Skipped session unexpectedly accepted completion.'
);
reset role;
select pg_temp.assert_true(
  not exists (select 1 from public.exercise_logs where workout_session_id = :'insert_skipped_session_id'::uuid)
  and (select status = 'skipped' from public.workout_sessions where id = :'insert_skipped_session_id'::uuid)
  and (select md5(to_jsonb(snapshot)::text) = :'insert_skipped_snapshot_hash'
       from public.workout_session_muscle_snapshots snapshot where snapshot.id = :'insert_skipped_snapshot_id'::uuid)
  and (select md5(coalesce(string_agg(md5(to_jsonb(item)::text), '' order by item.id), ''))
       from public.workout_session_muscle_snapshot_items item where item.snapshot_id = :'insert_skipped_snapshot_id'::uuid) = :'insert_skipped_item_hash',
  'Skipped-session denial left logs, state drift, or snapshot mutation.'
);

-- Compatibility insert-as-completed with no performed logs cannot remain planned.
insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'custom_plan_id'::uuid, 3, 'Compatibility completed day')
returning id as completed_plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, sort_order
) values (
  :'completed_plan_day_id'::uuid, :'custom_exercise_id', 'Compatibility custom squat', 2, '10', 1
);
insert into public.workout_sessions(
  user_id, plan_id, plan_day_id, workout_name, started_at, completed_at,
  duration_minutes, status, source
) values (
  :'member_id'::uuid, :'custom_plan_id'::uuid, :'completed_plan_day_id'::uuid,
  'Compatibility completed day', now(), now(), 0, 'completed', 'manual'
) returning id as insert_completed_session_id \gset
select pg_temp.assert_true(
  exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'insert_completed_session_id'::uuid
      and item.state = 'skipped'
  )
  and exists (
    select 1 from public.workout_session_muscle_snapshots snapshot
    where snapshot.workout_session_id = :'insert_completed_session_id'::uuid
      and snapshot.source = 'terminal_insert'
      and 'completed_without_performed_logs' = any(snapshot.reason_codes)
  ),
  'Insert-as-completed with zero logs remained planned.'
);

-- External plan identity survives without a provider bridge.
insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'custom_plan_id'::uuid, 4, 'Unlinked provider plan day')
returning id as external_plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, sort_order
) values (
  :'external_plan_day_id'::uuid, null, 'Unlinked provider activity', 3, '12', 1
) returning id as external_plan_exercise_id \gset
insert into public.user_workout_plan_week_templates(plan_id, name, sort_order, source)
values (:'custom_plan_id'::uuid, 'External identity week', 1, 'manual')
returning id as external_week_template_id \gset
insert into public.user_workout_plan_sessions(
  week_template_id, source_legacy_plan_day_id, source, title, day_offset,
  sport_slug, sport_name_snapshot, sort_order
) values (
  :'external_week_template_id'::uuid, :'external_plan_day_id'::uuid, 'manual',
  'External identity session', 0, 'strength', 'Strength', 1
) returning id as external_plan_session_id \gset
insert into public.user_workout_plan_phases(
  plan_session_id, phase_slug, phase_name_snapshot, sort_order
) values (
  :'external_plan_session_id'::uuid, 'main', 'Main', 1
) returning id as external_plan_phase_id \gset
select ('phase3-unlinked-' || gen_random_uuid()::text) as unlinked_provider_activity_id \gset
insert into public.user_workout_plan_activities(
  plan_phase_id, source_legacy_plan_exercise_id, catalog_activity_id,
  catalog_slug, catalog_version, catalog_source, activity_name_snapshot,
  planned_prescription, sort_order
) values (
  :'external_plan_phase_id'::uuid, :'external_plan_exercise_id'::uuid,
  :'unlinked_provider_activity_id', 'unlinked-provider-activity', '1', 'external',
  'Unlinked provider activity', '{"sets":3,"reps":"12"}'::jsonb, 1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_workout_session_atomic(
  :'member_id'::uuid, :'external_plan_day_id'::uuid, null
)->'session'->>'id') as external_plan_session_run_id \gset
select pg_temp.assert_true(
  exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'external_plan_session_run_id'::uuid
      and item.planned_provider = 'plaivra_activity_catalog'
      and item.planned_provider_activity_id = :'unlinked_provider_activity_id'
      and item.planned_global_exercise_id is null
      and item.planned_mapping_set_id is null
  )
  and exists (
    select 1 from public.workout_session_muscle_snapshots snapshot
    where snapshot.workout_session_id = :'external_plan_session_run_id'::uuid
      and snapshot.completeness = 'unavailable'
      and 'provider_bridge_unavailable' = any(snapshot.reason_codes)
  ),
  'External plan activity did not preserve provider identity without a bridge.'
);
reset role;
update public.workout_sessions
set status = 'skipped', completed_at = now(), skipped_at = now(), duration_minutes = 0
where id = :'external_plan_session_run_id'::uuid;
select pg_temp.assert_true(
  not exists (
    select 1 from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'external_plan_session_run_id'::uuid
      and item.state <> 'skipped'
  ),
  'Started-then-skipped session did not reconcile exactly once.'
);

-- A controlled late failure must roll back logs and both terminal transitions.
insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'custom_plan_id'::uuid, 5, 'Atomic completion failure day')
returning id as failure_plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, rest_seconds, sort_order
) values (
  :'failure_plan_day_id'::uuid, :'custom_exercise_id', 'Atomic failure exercise', 1, '5', 30, 1
) returning id as failure_plan_exercise_id \gset
insert into public.user_workout_sessions(
  user_id, user_workout_plan_id, plan_day_id, week_index, day_index,
  session_number, scheduled_date, day_title, status
) values (
  :'member_id'::uuid, :'custom_plan_id'::uuid, :'failure_plan_day_id'::uuid, 1, 5,
  5, current_date, 'Atomic completion failure day', 'scheduled'
) returning id as failure_scheduled_session_id \gset
set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_workout_session_atomic(
  :'member_id'::uuid, :'failure_plan_day_id'::uuid, :'failure_scheduled_session_id'::uuid
)->'session'->>'id') as failure_session_id \gset
reset role;
select id as failure_snapshot_id from public.workout_session_muscle_snapshots
where workout_session_id = :'failure_session_id'::uuid \gset
select md5(to_jsonb(snapshot)::text) as failure_snapshot_hash
from public.workout_session_muscle_snapshots snapshot where snapshot.id = :'failure_snapshot_id'::uuid \gset
select md5(coalesce(string_agg(md5(to_jsonb(item)::text), '' order by item.id), '')) as failure_item_hash
from public.workout_session_muscle_snapshot_items item where item.snapshot_id = :'failure_snapshot_id'::uuid \gset
create function pg_temp.fail_scheduled_completion_for_phase3()
returns trigger language plpgsql as $trigger$
begin
  if new.status = 'completed' and new.day_title = 'Atomic completion failure day' then
    raise exception 'controlled late completion failure';
  end if;
  return new;
end
$trigger$;
create trigger phase3_controlled_late_completion_failure
before update on public.user_workout_sessions
for each row execute function pg_temp.fail_scheduled_completion_for_phase3();
set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_completion_failure(
  :'member_id'::uuid,
  :'failure_session_id'::uuid,
  jsonb_build_array(jsonb_build_object(
    'plan_exercise_id', :'failure_plan_exercise_id', 'exercise_order', 1,
    'exercise_name', 'Atomic failure exercise', 'planned_sets', 1,
    'planned_reps', '5', 'planned_rest_seconds', 30, 'set_number', 1,
    'reps', 5, 'weight_kg', 10, 'completed_at', now()
  )),
  5,
  'P0001',
  'Controlled late completion failure unexpectedly committed.'
);
reset role;
select pg_temp.assert_true(
  not exists (select 1 from public.exercise_logs where workout_session_id = :'failure_session_id'::uuid)
  and (select status = 'started' from public.workout_sessions where id = :'failure_session_id'::uuid)
  and (select status = 'started' from public.user_workout_sessions where id = :'failure_scheduled_session_id'::uuid)
  and (select md5(to_jsonb(snapshot)::text) = :'failure_snapshot_hash' from public.workout_session_muscle_snapshots snapshot where snapshot.id = :'failure_snapshot_id'::uuid)
  and (select md5(coalesce(string_agg(md5(to_jsonb(item)::text), '' order by item.id), '')) from public.workout_session_muscle_snapshot_items item where item.snapshot_id = :'failure_snapshot_id'::uuid) = :'failure_item_hash',
  'Late completion failure left partial logs, terminal state, or snapshot mutation.'
);
drop trigger phase3_controlled_late_completion_failure on public.user_workout_sessions;
drop function pg_temp.fail_scheduled_completion_for_phase3();
update public.workout_sessions
set status = 'skipped', completed_at = now(), skipped_at = now(), duration_minutes = 0
where id = :'failure_session_id'::uuid;
update public.user_workout_sessions
set status = 'skipped', skipped_at = now(), updated_at = now()
where id = :'failure_scheduled_session_id'::uuid;
