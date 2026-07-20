\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.assert_rejected(p_sql text, p_expected_codes text[], p_message text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any(p_expected_codes) then
      return;
    end if;
    raise exception '% Unexpected SQLSTATE %: %', p_message, sqlstate, sqlerrm;
  end;
  raise exception '%', p_message;
end
$function$;

grant execute on function pg_temp.assert_true(boolean,text) to public;
grant execute on function pg_temp.assert_rejected(text,text[],text) to public;

-- Disposable owner fixtures.
insert into public.profiles (id, email, full_name, role, created_at, updated_at)
values
  ('a2000000-0000-4000-8000-000000000001', 'aw2a-owner@example.test', 'AW2A Owner', 'member', now(), now()),
  ('a2000000-0000-4000-8000-000000000002', 'aw2a-other@example.test', 'AW2A Other', 'member', now(), now()),
  ('a2000000-0000-4000-8000-000000000003', 'aw2a-delete@example.test', 'AW2A Delete', 'member', now(), now());
\set owner_id 'a2000000-0000-4000-8000-000000000001'
\set other_member_id 'a2000000-0000-4000-8000-000000000002'
\set delete_member_id 'a2000000-0000-4000-8000-000000000003'

-- Plan-day session creation uses stable plan identities and must create one state row.
insert into public.user_workout_plans (id,user_id,name,is_active,is_default,source,created_at,updated_at)
values ('a2000000-0000-4000-8000-000000000010', :'owner_id'::uuid, 'AW-2A plan', true, true, 'manual', now(), now());
insert into public.user_workout_plan_days (id,plan_id,day_number,day_name,weekday,created_at,updated_at)
values ('a2000000-0000-4000-8000-000000000011', 'a2000000-0000-4000-8000-000000000010', 1, 'AW-2A day', 'Monday', now(), now());
insert into public.user_workout_plan_exercises
  (id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at,updated_at)
values
  ('a2000000-0000-4000-8000-000000000012','a2000000-0000-4000-8000-000000000011','AW-2A first',3,'8',60,1,1,now(),now()),
  ('a2000000-0000-4000-8000-000000000013','a2000000-0000-4000-8000-000000000011','AW-2A second',2,'10',90,2,2,now(),now());
insert into public.user_workout_sessions
  (id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,created_at,updated_at)
values ('a2000000-0000-4000-8000-000000000014', :'owner_id'::uuid, 'a2000000-0000-4000-8000-000000000010', 'a2000000-0000-4000-8000-000000000011', 1, 1, 1, current_date, 'AW-2A day', 'scheduled', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_workout_session_atomic(
  :'owner_id'::uuid,
  'a2000000-0000-4000-8000-000000000011'::uuid,
  'a2000000-0000-4000-8000-000000000014'::uuid
)->'session'->>'id') as plan_session_id \gset
set constraints all immediate;
select pg_temp.assert_true(
  (select count(*) from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid) = 1,
  'Plan-day start did not create exactly one execution-state row.'
);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid and user_id = :'owner_id'::uuid) = 1,
  'Owner cannot read the plan-day execution-state row.'
);

-- Deterministic unfinished cursor: complete first set then refresh initialization idempotently.
update public.exercise_logs
set completed_at = clock_timestamp(), reps = 8
where workout_session_id = :'plan_session_id'::uuid
  and exercise_order = 1
  and set_number = 1;
select private.initialize_workout_session_execution_state(:'plan_session_id'::uuid, 'session_start', clock_timestamp());
select pg_temp.assert_true(
  (select active_item_order = 1 and active_set_number = 1 from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid),
  'Idempotent initialization rewrote the existing cursor.'
);

-- Revision is database-managed on effective updates and stable on no-op updates.
update public.workout_session_execution_states
set active_set_number = 2
where workout_session_id = :'plan_session_id'::uuid;
select revision as plan_revision_after_update
from public.workout_session_execution_states
where workout_session_id = :'plan_session_id'::uuid \gset
update public.workout_session_execution_states
set active_set_number = 2
where workout_session_id = :'plan_session_id'::uuid;
select pg_temp.assert_true(
  (select revision = :'plan_revision_after_update'::bigint from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid),
  'True no-op update incremented execution-state revision.'
);

-- Cross-user RLS isolation.
select set_config('request.jwt.claim.sub', :'other_member_id', true);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid) = 0,
  'Another member can read the owner execution-state row.'
);
select pg_temp.assert_true(
  not exists (
    update public.workout_session_execution_states
    set active_set_number = 3
    where workout_session_id = :'plan_session_id'::uuid
    returning 1
  ),
  'Another member can update the owner execution-state row.'
);
select pg_temp.assert_rejected(
  format('insert into public.workout_session_execution_states (workout_session_id,user_id,session_state,view_state,active_item_order,active_set_number,session_elapsed_seconds,session_running_since,bootstrap_source) values (%L::uuid,%L::uuid,''active'',''set_entry'',1,1,0,clock_timestamp(),''session_start'')', :'plan_session_id', :'other_member_id'),
  array['42501'], 'Another member can create execution state for the owner session.'
);
reset role;

-- Direct start creates exactly one execution row; retry does not duplicate it.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'other_member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_direct_workout_session_atomic(
  :'other_member_id'::uuid,
  'provider_activity',
  'aw2a-unlinked-direct-activity',
  'plaivra_activity_catalog',
  'AW-2A direct',
  'Strength',
  '{"sets":2,"reps":"8","restSeconds":60}'::jsonb,
  null
)->'session'->>'id') as direct_session_id \gset
set constraints all immediate;
select pg_temp.assert_true(
  (select count(*) from public.workout_session_execution_states where workout_session_id = :'direct_session_id'::uuid) = 1,
  'Direct start did not create exactly one execution-state row.'
);
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

select item.id as direct_snapshot_item_id
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
  format('update public.workout_session_execution_states set active_item_order=0 where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514','23503'], 'Invalid active item order unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set active_set_number=0 where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Invalid active set number unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set session_elapsed_seconds=-1 where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Negative elapsed time unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set session_state=''review'', view_state=''set_entry'' where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Invalid session/view combination unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set view_state=''rest'', rest_started_at=null, rest_duration_seconds=60, rest_ends_at=clock_timestamp() where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Invalid rest tuple unexpectedly succeeded.'
);
select pg_temp.assert_rejected(
  format('update public.workout_session_execution_states set revision=999 where workout_session_id=%L::uuid', :'plan_session_id'),
  array['23514'], 'Caller-controlled revision unexpectedly succeeded.'
);

-- Complete all work then prove review initialization for a fresh legacy/open fixture.
update public.exercise_logs
set completed_at = clock_timestamp(), reps = coalesce(reps, 8)
where workout_session_id = :'plan_session_id'::uuid;
delete from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid;
select private.initialize_workout_session_execution_state(:'plan_session_id'::uuid, 'legacy_backfill', clock_timestamp());
select pg_temp.assert_true(
  (select session_state = 'review' and view_state = 'session_review' from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid),
  'All-complete open session did not initialize into review.'
);

-- Terminal cleanup preserves canonical performed history and logs.
update public.workout_sessions
set status = 'completed', completed_at = clock_timestamp()
where id = :'plan_session_id'::uuid;
select pg_temp.assert_true(
  not exists (select 1 from public.workout_session_execution_states where workout_session_id = :'plan_session_id'::uuid),
  'Completing the root session retained execution state.'
);
select pg_temp.assert_true(
  exists (select 1 from public.workout_sessions where id = :'plan_session_id'::uuid and status = 'completed')
  and exists (select 1 from public.exercise_logs where workout_session_id = :'plan_session_id'::uuid),
  'Terminal cleanup damaged performed session history or exercise logs.'
);

update public.workout_sessions
set status = 'skipped', skipped_at = clock_timestamp()
where id = :'direct_session_id'::uuid;
select pg_temp.assert_true(
  not exists (select 1 from public.workout_session_execution_states where workout_session_id = :'direct_session_id'::uuid),
  'Skipping the root session retained execution state.'
);

-- Root deletion cascades execution state.
insert into public.workout_sessions
  (id,user_id,workout_name,started_at,status,source,created_at,updated_at)
values ('a2000000-0000-4000-8000-000000000020', :'owner_id'::uuid, 'AW-2A cancel', clock_timestamp(), 'started', 'manual', now(), now());
insert into public.workout_session_muscle_snapshots
  (id,user_id,workout_session_id,snapshot_schema_version,taxonomy_version,mapping_schema_version,calculation_engine_version,threshold_profile_version,result_schema_version,workload_model_version,prescription_schema_version,custom_identity_schema_version,completeness,reason_codes,source,frozen_at,created_at)
values ('a2000000-0000-4000-8000-000000000021', :'owner_id'::uuid, 'a2000000-0000-4000-8000-000000000020',
  'workout_session_muscle_snapshot_v2','advanced_visible_v1','exercise_muscle_mapping_v2','muscle_load_resistance_sets_v2','advanced_exposure_v1','advanced_muscle_exposure_result_v1','resistance_sets_v1','planned_prescription_v1','custom_exercise_identity_snapshot_v1','unavailable',array['integration_fixture'],'legacy_backfill',clock_timestamp(),now());
insert into public.workout_session_muscle_snapshot_items
  (id,snapshot_id,user_id,item_order,activity_name_snapshot,planned_prescription,planned_sets,state,created_at,updated_at)
values ('a2000000-0000-4000-8000-000000000022','a2000000-0000-4000-8000-000000000021',:'owner_id'::uuid,1,'AW-2A cancel item','{"sets":1}'::jsonb,1,'planned',now(),now());
set constraints all immediate;
select pg_temp.assert_true(
  exists (select 1 from public.workout_session_execution_states where workout_session_id = 'a2000000-0000-4000-8000-000000000020'),
  'Cancel fixture did not receive execution state.'
);
delete from public.workout_sessions where id = 'a2000000-0000-4000-8000-000000000020';
select pg_temp.assert_true(
  not exists (select 1 from public.workout_session_execution_states where workout_session_id = 'a2000000-0000-4000-8000-000000000020'),
  'Deleting the open root did not cascade execution state.'
);

-- Trusted account-deletion path remains functional because it deletes workout_sessions first.
insert into public.account_deletion_jobs (id,user_id,state,stage,created_at,updated_at)
values ('a2000000-0000-4000-8000-000000000030', :'delete_member_id'::uuid, 'processing', 'deleting_database', now(), now());
insert into public.account_access_states (user_id,state,disabled_at,created_at,updated_at)
values (:'delete_member_id'::uuid, 'deletion_processing', now(), now(), now())
on conflict (user_id) do update set state='deletion_processing', disabled_at=excluded.disabled_at, updated_at=excluded.updated_at;
insert into public.workout_sessions
  (id,user_id,workout_name,started_at,status,source,created_at,updated_at)
values ('a2000000-0000-4000-8000-000000000031', :'delete_member_id'::uuid, 'AW-2A delete', clock_timestamp(), 'started', 'manual', now(), now());
insert into public.workout_session_muscle_snapshots
  (id,user_id,workout_session_id,snapshot_schema_version,taxonomy_version,mapping_schema_version,calculation_engine_version,threshold_profile_version,result_schema_version,workload_model_version,prescription_schema_version,custom_identity_schema_version,completeness,reason_codes,source,frozen_at,created_at)
values ('a2000000-0000-4000-8000-000000000032', :'delete_member_id'::uuid, 'a2000000-0000-4000-8000-000000000031',
  'workout_session_muscle_snapshot_v2','advanced_visible_v1','exercise_muscle_mapping_v2','muscle_load_resistance_sets_v2','advanced_exposure_v1','advanced_muscle_exposure_result_v1','resistance_sets_v1','planned_prescription_v1','custom_exercise_identity_snapshot_v1','unavailable',array['integration_fixture'],'legacy_backfill',clock_timestamp(),now());
insert into public.workout_session_muscle_snapshot_items
  (id,snapshot_id,user_id,item_order,activity_name_snapshot,planned_prescription,planned_sets,state,created_at,updated_at)
values ('a2000000-0000-4000-8000-000000000033','a2000000-0000-4000-8000-000000000032',:'delete_member_id'::uuid,1,'AW-2A delete item','{"sets":1}'::jsonb,1,'planned',now(),now());
set constraints all immediate;
select pg_temp.assert_true(
  exists (select 1 from public.workout_session_execution_states where workout_session_id = 'a2000000-0000-4000-8000-000000000031'),
  'Account-deletion fixture did not receive execution state.'
);
select public.purge_account_application_data_atomic(:'delete_member_id'::uuid);
select pg_temp.assert_true(
  not exists (select 1 from public.workout_session_execution_states where user_id = :'delete_member_id'::uuid)
  and not exists (select 1 from public.workout_sessions where user_id = :'delete_member_id'::uuid)
  and not exists (select 1 from public.profiles where id = :'delete_member_id'::uuid),
  'Trusted account deletion left execution state or owner rows behind.'
);

rollback;
\echo 'AW-2A execution-state integration verification passed.'
