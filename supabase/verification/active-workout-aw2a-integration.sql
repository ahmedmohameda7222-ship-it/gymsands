-- Disposable AW-2A integration verification. Run only against a clean local Supabase reset.
\set ON_ERROR_STOP on
\set member_id 'a2000000-0000-4000-8000-000000000001'
\set other_member_id 'a2000000-0000-4000-8000-000000000002'
\set purge_member_id 'a2000000-0000-4000-8000-000000000003'

begin;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then raise exception '%', p_message; end if;
end
$assert$;

create function pg_temp.assert_rejected(p_sql text, p_expected_states text[], p_message text)
returns void language plpgsql as $assert$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any(p_expected_states) then return; end if;
    raise exception '% Expected one of %, received %: %', p_message, p_expected_states, sqlstate, sqlerrm;
  end;
  raise exception '%', p_message;
end
$assert$;

grant execute on function pg_temp.assert_true(boolean, text) to authenticated, service_role;
grant execute on function pg_temp.assert_rejected(text, text[], text) to authenticated, service_role;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (:'member_id'::uuid, 'authenticated', 'authenticated', 'aw2a-member@example.invalid', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'other_member_id'::uuid, 'authenticated', 'authenticated', 'aw2a-other@example.invalid', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'purge_member_id'::uuid, 'authenticated', 'authenticated', 'aw2a-purge@example.invalid', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

select pg_temp.assert_true(
  (select count(*) from public.profiles where id in (:'member_id'::uuid, :'other_member_id'::uuid, :'purge_member_id'::uuid)) = 3,
  'AW-2A integration users did not receive profiles.'
);

-- Plan-day start creates one authoritative state after the snapshot and its items exist.
insert into public.user_workout_plans(id, user_id, name, is_active, is_default, source, archived_at)
values ('a2000000-0000-4000-8000-000000000010', :'member_id'::uuid, 'AW-2A plan', true, true, 'manual', null);
insert into public.user_workout_plan_days(id, plan_id, day_number, day_name)
values ('a2000000-0000-4000-8000-000000000011', 'a2000000-0000-4000-8000-000000000010', 1, 'AW-2A day');
insert into public.user_workout_plan_exercises(
  id, plan_day_id, source_workout_id, exercise_name, sets, reps, rest_seconds, sort_order
) values
  ('a2000000-0000-4000-8000-000000000012', 'a2000000-0000-4000-8000-000000000011',
   '3eab8f04-2b5f-5c5e-9fed-41c63b90d45b', 'Stable exercise one', 3, '8', 60, 1),
  ('a2000000-0000-4000-8000-000000000013', 'a2000000-0000-4000-8000-000000000011',
   '3eab8f04-2b5f-5c5e-9fed-41c63b90d45b', 'Stable exercise two', 2, '10', 75, 2);
insert into public.user_workout_sessions(
  id, user_id, user_workout_plan_id, plan_day_id, week_index, day_index,
  session_number, scheduled_date, day_title, status
) values (
  'a2000000-0000-4000-8000-000000000014', :'member_id'::uuid,
  'a2000000-0000-4000-8000-000000000010', 'a2000000-0000-4000-8000-000000000011',
  1, 1, 1, current_date, 'AW-2A day', 'scheduled'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_workout_session_atomic(
  :'member_id'::uuid,
  'a2000000-0000-4000-8000-000000000011'::uuid,
  'a2000000-0000-4000-8000-000000000014'::uuid
)->'session'->>'id') as plan_session_id \gset
set constraints workout_session_execution_state_snapshot_initializer immediate;
select public.start_or_resume_workout_session_atomic(
  :'member_id'::uuid,
  'a2000000-0000-4000-8000-000000000011'::uuid,
  'a2000000-0000-4000-8000-000000000014'::uuid
);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid) = 1,
  'Plan-day start/resume did not create exactly one execution-state row.'
);
select pg_temp.assert_true(
  (select bootstrap_source = 'session_start' and active_item_order = 1 and active_set_number = 1
   from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid),
  'Plan-day execution state did not initialize at the first stable item and set.'
);

-- Owner update is scoped, effective updates increment revision, and true no-ops do not.
update public.workout_session_execution_states
set active_set_number = 2
where workout_session_id = :'plan_session_id'::uuid and user_id = :'member_id'::uuid;
select revision as revision_after_effective
from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid \gset
update public.workout_session_execution_states
set active_set_number = 2
where workout_session_id = :'plan_session_id'::uuid and user_id = :'member_id'::uuid;
select pg_temp.assert_true(
  :'revision_after_effective'::bigint = 1
  and (select revision from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid) = 1,
  'Execution-state revision did not increment exactly once for an effective update.'
);

-- Another authenticated owner cannot read, update, or create the row.
select set_config('request.jwt.claim.sub', :'other_member_id', true);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid) = 0,
  'Another authenticated user read the execution-state row.'
);
with changed as (
  update public.workout_session_execution_states
  set active_set_number = 3
  where workout_session_id = :'plan_session_id'::uuid
  returning 1
)
select pg_temp.assert_true((select count(*) from changed) = 0, 'Another user updated the execution-state row.');
select pg_temp.assert_rejected(
  format(
    'insert into public.workout_session_execution_states(workout_session_id,user_id) values (%L::uuid,%L::uuid)',
    :'plan_session_id', :'other_member_id'
  ),
  array['42501','23505'],
  'Another user unexpectedly created execution state for the session.'
);
reset role;

-- Direct-session start and repeated resume also preserve exactly one row.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'other_member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_direct_workout_session_atomic(
  :'other_member_id'::uuid,
  'provider_activity',
  'aw2a-unlinked-direct-activity',
  'plaivra_activity_catalog',
  'AW-2A direct session',
  'Strength',
  '{"sets":2,"reps":"8"}'::jsonb,
  null
)->'session'->>'id') as direct_session_id \gset
select (public.start_or_resume_direct_workout_session_atomic(
  :'other_member_id'::uuid,
  'provider_activity',
  'aw2a-unlinked-direct-activity',
  'plaivra_activity_catalog',
  'Different display name',
  'Strength',
  '{"sets":9}'::jsonb,
  :'direct_session_id'::uuid
)->'session'->>'id') as direct_retry_id \gset
select pg_temp.assert_true(
  :'direct_session_id'::uuid = :'direct_retry_id'::uuid
  and (select count(*) from public.workout_session_execution_states where workout_session_id = :'direct_session_id'::uuid) = 1,
  'Direct start/resume did not preserve exactly one execution-state row.'
);
reset role;

select id as direct_snapshot_item_id
from public.workout_session_muscle_snapshot_items item
join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
where snapshot.workout_session_id = :'direct_session_id'::uuid
order by item.item_order limit 1 \gset

-- Trusted integrity rejects cross-session pointers, owner/root mutation, invalid values,
-- invalid state/view and rest tuples, and caller-controlled revisions.
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set active_snapshot_item_id=%L::uuid, active_item_order=1 where workout_session_id=%L::uuid',
    :'direct_snapshot_item_id', :'plan_session_id'),
  array['23514'], 'Cross-session snapshot pointer unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set user_id=%L::uuid where workout_session_id=%L::uuid',
    :'other_member_id', :'plan_session_id'),
  array['23514'], 'Execution-state owner mutation unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set session_elapsed_seconds=-1 where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Negative elapsed time unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set active_item_order=0 where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Zero item order unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set active_set_number=0 where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Zero set number unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set session_state=''review'', view_state=''set_entry'' where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Invalid state/view relation unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set view_state=''rest'', rest_started_at=now(), rest_duration_seconds=60, rest_ends_at=now()+interval ''30 seconds'' where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Invalid rest tuple unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set revision=999 where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Caller-controlled revision unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set revision=0 where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Caller-decreased revision unexpectedly succeeded.'
);

-- Re-initialization after completed logs selects the first unfinished stable item/set.
delete from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid;
insert into public.exercise_logs(
  workout_session_id, plan_exercise_id, exercise_order, exercise_name,
  planned_sets, set_number, reps, completed_at, set_type
) values (
  :'plan_session_id'::uuid, 'a2000000-0000-4000-8000-000000000012', 1,
  'Stable exercise one', 3, 1, 8, now(), 'working'
);
select private.initialize_workout_session_execution_state(:'plan_session_id'::uuid, 'legacy_backfill', clock_timestamp());
select pg_temp.assert_true(
  (select bootstrap_source = 'legacy_backfill' and active_item_order = 1 and active_set_number = 2
   from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid),
  'Legacy backfill did not choose the first unfinished stable set deterministically.'
);

insert into public.exercise_logs(
  workout_session_id, plan_exercise_id, exercise_order, exercise_name,
  planned_sets, set_number, reps, completed_at, set_type
) values
  (:'plan_session_id'::uuid, 'a2000000-0000-4000-8000-000000000012', 1, 'Stable exercise one', 3, 2, 8, now(), 'working'),
  (:'plan_session_id'::uuid, 'a2000000-0000-4000-8000-000000000012', 1, 'Stable exercise one', 3, 3, 8, now(), 'working'),
  (:'plan_session_id'::uuid, 'a2000000-0000-4000-8000-000000000013', 2, 'Stable exercise two', 2, 1, 10, now(), 'working'),
  (:'plan_session_id'::uuid, 'a2000000-0000-4000-8000-000000000013', 2, 'Stable exercise two', 2, 2, 10, now(), 'working');
delete from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid;
select private.initialize_workout_session_execution_state(:'plan_session_id'::uuid, 'session_start', clock_timestamp());
select pg_temp.assert_true(
  (select session_state = 'review' and view_state = 'session_review'
          and active_item_order = 2 and active_set_number = 2
   from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid),
  'All-complete open session did not initialize into deterministic session review.'
);

-- Terminal transitions remove only transient execution state; performed history remains.
update public.workout_sessions
set status = 'completed', completed_at = clock_timestamp(), duration_minutes = 5
where id = :'plan_session_id'::uuid;
select pg_temp.assert_true(
  not exists (select 1 from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid)
  and exists (select 1 from public.workout_sessions where id = :'plan_session_id'::uuid and status = 'completed')
  and (select count(*) from public.exercise_logs where workout_session_id = :'plan_session_id'::uuid) = 5,
  'Completion did not remove only transient state while preserving session history and logs.'
);

update public.workout_sessions
set status = 'skipped', completed_at = clock_timestamp(), skipped_at = clock_timestamp(), duration_minutes = 0
where id = :'direct_session_id'::uuid;
select pg_temp.assert_true(
  not exists (select 1 from public.workout_session_execution_states where workout_session_id = :'direct_session_id'::uuid),
  'Skipped root session retained execution state.'
);

-- Deleting an open root cascades the one-to-one state.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'other_member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_direct_workout_session_atomic(
  :'other_member_id'::uuid, 'provider_activity', 'aw2a-cancel-activity',
  'plaivra_activity_catalog', 'AW-2A cancel session', 'Strength', '{"sets":1}'::jsonb, null
)->'session'->>'id') as cancel_session_id \gset
reset role;
select pg_temp.assert_true(
  exists (select 1 from public.workout_session_execution_states where workout_session_id = :'cancel_session_id'::uuid),
  'Cancel fixture did not receive execution state.'
);
delete from public.workout_sessions where id = :'cancel_session_id'::uuid;
select pg_temp.assert_true(
  not exists (select 1 from public.workout_session_execution_states where workout_session_id = :'cancel_session_id'::uuid),
  'Deleting an open root session did not cascade execution state.'
);

-- Trusted account deletion remains functional and the root-session cascade removes state.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'purge_member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_direct_workout_session_atomic(
  :'purge_member_id'::uuid, 'provider_activity', 'aw2a-purge-activity',
  'plaivra_activity_catalog', 'AW-2A purge session', 'Strength', '{"sets":1}'::jsonb, null
)->'session'->>'id') as purge_session_id \gset
reset role;
select pg_temp.assert_true(
  exists (select 1 from public.workout_session_execution_states where workout_session_id = :'purge_session_id'::uuid),
  'Account purge fixture did not receive execution state.'
);
update public.account_access_states
set state = 'deletion_processing', reason_code = 'aw2a_integration', disabled_at = clock_timestamp()
where user_id = :'purge_member_id'::uuid;
insert into public.account_deletion_jobs(
  user_id, subject_hash, idempotency_key_hash, state, stage, attempt_count, locked_at
) values (
  :'purge_member_id'::uuid,
  'aw2a-subject-' || :'purge_member_id',
  'aw2a-idempotency-' || :'purge_member_id',
  'processing', 'deleting_database', 1, clock_timestamp()
);
set local role service_role;
select public.purge_account_application_data_atomic(:'purge_member_id'::uuid);
reset role;
select pg_temp.assert_true(
  not exists (select 1 from public.profiles where id = :'purge_member_id'::uuid)
  and not exists (select 1 from public.workout_sessions where user_id = :'purge_member_id'::uuid)
  and not exists (select 1 from public.workout_session_execution_states where user_id = :'purge_member_id'::uuid),
  'Trusted account deletion left AW-2A execution state or root data behind.'
);

rollback;
