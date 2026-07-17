-- Insert-as-skipped is terminal at the same transaction boundary.
insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'custom_plan_id'::uuid, 2, 'Direct skip day')
returning id as skip_plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, sort_order
) values (
  :'skip_plan_day_id'::uuid, :'custom_exercise_id', 'Skip custom squat', 2, '10', 1
);
insert into public.workout_sessions(
  user_id, plan_id, plan_day_id, workout_name, started_at, completed_at,
  skipped_at, duration_minutes, status, source
) values (
  :'member_id'::uuid, :'custom_plan_id'::uuid, :'skip_plan_day_id'::uuid,
  'Direct skip day', now(), now(), now(), 0, 'skipped', 'manual'
) returning id as insert_skipped_session_id \gset
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
    select 1 from public.workout_session_muscle_snapshot_items item
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

