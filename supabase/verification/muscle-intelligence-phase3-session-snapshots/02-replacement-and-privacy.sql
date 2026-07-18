reset role;
insert into public.exercise_muscle_mapping_sets(
  exercise_id, mapping_version, status, source, schema_version, checksum
)
select current.exercise_id,
       (select max(existing.mapping_version) + 1 from public.exercise_muscle_mapping_sets existing where existing.exercise_id = current.exercise_id),
       'draft', 'phase3_verification', current.schema_version, current.checksum
from public.exercise_muscle_mapping_sets current
where current.id = :'frozen_actual_mapping_id'::uuid
returning id as newer_mapping_id \gset
insert into public.exercise_muscle_mapping_entries(
  mapping_set_id, muscle_id, role, contribution, side_scope, sort_order
)
select :'newer_mapping_id'::uuid, muscle_id, role, contribution, side_scope, sort_order
from public.exercise_muscle_mapping_entries
where mapping_set_id = :'frozen_actual_mapping_id'::uuid;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.publish_exercise_muscle_mapping_set(:'newer_mapping_id'::uuid);

insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'plan_id'::uuid, 2, 'Foreign exercise day')
returning id as foreign_plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, rest_seconds, sort_order
) values (
  :'foreign_plan_day_id'::uuid, '1ee4a77a-0f7a-5fad-b281-52a191a2a685',
  'Outside session day', 2, '10', 60, 1
) returning id as foreign_plan_exercise_id \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.replace_workout_session_snapshot_item_atomic(
  :'member_id'::uuid, :'session_id'::uuid, :'plan_exercise_id'::uuid,
  'global_exercise', '1ee4a77a-0f7a-5fad-b281-52a191a2a685', null
);
select pg_temp.assert_true(
  (select actual_mapping_set_id = :'frozen_actual_mapping_id'::uuid
   from public.workout_session_muscle_snapshot_items where id = :'snapshot_item_id'::uuid),
  'Identical replacement retry rewrote the frozen mapping version.'
);
select pg_temp.assert_true(
  exists (select 1 from public.get_workout_session_frozen_global_mappings(:'member_id'::uuid, :'session_id'::uuid)
          where id = :'frozen_actual_mapping_id'::uuid and checksum = :'frozen_actual_mapping_checksum'),
  'Historical mapping loader could not read the retired frozen mapping.'
);
select jsonb_build_array(jsonb_build_object(
  'plan_exercise_id', :'plan_exercise_id', 'exercise_order', 1,
  'exercise_name', 'Incline Dumbbell Bench Press', 'planned_sets', 3,
  'planned_reps', '8', 'planned_rest_seconds', 90, 'set_number', 1,
  'reps', 8, 'weight_kg', 20, 'completed_at', now()
))::text as first_set_payload \gset
select jsonb_build_array(jsonb_build_object(
  'plan_exercise_id', :'plan_exercise_id', 'exercise_order', 1,
  'exercise_name', 'Incline Dumbbell Bench Press', 'planned_sets', 3,
  'planned_reps', '8', 'planned_rest_seconds', 90, 'set_number', 1,
  'reps', 9, 'weight_kg', 22, 'completed_at', now()
))::text as final_set_payload \gset
select md5(to_jsonb(snapshot)::text) as active_snapshot_hash
from public.workout_session_muscle_snapshots snapshot where snapshot.id = :'snapshot_id'::uuid \gset
select md5(to_jsonb(item)::text) as active_item_hash
from public.workout_session_muscle_snapshot_items item where item.id = :'snapshot_item_id'::uuid \gset
select public.upsert_workout_set_logs_atomic(:'member_id'::uuid, :'session_id'::uuid, :'first_set_payload'::jsonb);
select public.upsert_workout_set_logs_atomic(:'member_id'::uuid, :'session_id'::uuid, :'final_set_payload'::jsonb);
select pg_temp.assert_true(
  (select count(*) from public.exercise_logs where workout_session_id = :'session_id'::uuid
   and plan_exercise_id = :'plan_exercise_id'::uuid and set_number = 1) = 1
  and (select reps = 9 and weight_kg = 22 from public.exercise_logs
       where workout_session_id = :'session_id'::uuid and plan_exercise_id = :'plan_exercise_id'::uuid and set_number = 1)
  and (select status = 'started' from public.workout_sessions where id = :'session_id'::uuid)
  and (select status = 'started' from public.user_workout_sessions where id = :'scheduled_session_id'::uuid)
  and (select md5(to_jsonb(snapshot)::text) = :'active_snapshot_hash' from public.workout_session_muscle_snapshots snapshot where snapshot.id = :'snapshot_id'::uuid)
  and (select md5(to_jsonb(item)::text) = :'active_item_hash' from public.workout_session_muscle_snapshot_items item where item.id = :'snapshot_item_id'::uuid),
  'Direct set save/retry duplicated the key or mutated active session snapshot state.'
);
reset role;
create temporary table phase3_active_persistence_baseline on commit drop as
select count(*) log_count,
       md5(coalesce(string_agg(md5(to_jsonb(log_row)::text), '' order by log_row.id), '')) log_hash
from public.exercise_logs log_row where log_row.workout_session_id = :'session_id'::uuid;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select pg_temp.assert_upsert_failure(:'member_id'::uuid, :'session_id'::uuid, '[]'::jsonb, '42501', 'Anonymous set-log execution unexpectedly succeeded.');
select pg_temp.assert_completion_failure(:'member_id'::uuid, :'session_id'::uuid, null, 12, '42501', 'Anonymous completion execution unexpectedly succeeded.');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'other_member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_upsert_failure(:'member_id'::uuid, :'session_id'::uuid, '[]'::jsonb, '42501', 'User B supplied User A identity for set saving.');
select pg_temp.assert_completion_failure(:'member_id'::uuid, :'session_id'::uuid, null, 12, '42501', 'User B supplied User A identity for completion.');
select pg_temp.assert_upsert_failure(:'other_member_id'::uuid, :'session_id'::uuid, '[]'::jsonb, 'P0002', 'User B matched identity to a foreign session for set saving.');
select pg_temp.assert_completion_failure(:'other_member_id'::uuid, :'session_id'::uuid, null, 12, 'P0002', 'User B matched identity to a foreign session for completion.');
select set_config('request.jwt.claim.sub', :'member_id', true);
select pg_temp.assert_upsert_failure(
  :'member_id'::uuid, :'session_id'::uuid,
  jsonb_build_array(jsonb_build_object('plan_exercise_id', :'foreign_plan_exercise_id', 'exercise_name', 'Outside session day', 'set_number', 1, 'reps', 10, 'weight_kg', 10)),
  '23514', 'A plan exercise outside the session day unexpectedly saved.'
);
select pg_temp.assert_upsert_failure(:'member_id'::uuid, :'session_id'::uuid, '{}'::jsonb, '23514', 'Malformed set-log payload unexpectedly saved.');
select jsonb_agg(jsonb_build_object(
  'plan_exercise_id', :'plan_exercise_id', 'exercise_name', 'Oversized payload',
  'set_number', item_number, 'reps', 1, 'weight_kg', 1
) order by item_number)::text as oversized_logs
from generate_series(1, 501) item_number \gset
select pg_temp.assert_upsert_failure(:'member_id'::uuid, :'session_id'::uuid, :'oversized_logs'::jsonb, '22023', 'Oversized set-log payload unexpectedly saved.');
reset role;
select pg_temp.assert_true(
  (select count(*) from public.exercise_logs where workout_session_id = :'session_id'::uuid) = (select log_count from phase3_active_persistence_baseline)
  and (select md5(coalesce(string_agg(md5(to_jsonb(log_row)::text), '' order by log_row.id), '')) from public.exercise_logs log_row where log_row.workout_session_id = :'session_id'::uuid) = (select log_hash from phase3_active_persistence_baseline)
  and (select status = 'started' from public.workout_sessions where id = :'session_id'::uuid)
  and (select status = 'started' from public.user_workout_sessions where id = :'scheduled_session_id'::uuid)
  and (select md5(to_jsonb(snapshot)::text) = :'active_snapshot_hash' from public.workout_session_muscle_snapshots snapshot where snapshot.id = :'snapshot_id'::uuid)
  and (select md5(to_jsonb(item)::text) = :'active_item_hash' from public.workout_session_muscle_snapshot_items item where item.id = :'snapshot_item_id'::uuid),
  'A denied persistence call left a partial mutation.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.complete_workout_session_atomic(
  :'member_id'::uuid, :'session_id'::uuid, :'final_set_payload'::jsonb, 12, null
) as completion_result \gset
select pg_temp.assert_true(
  not coalesce((:'completion_result'::jsonb->>'already_completed')::boolean, true)
  and (select status = 'completed' from public.workout_sessions where id = :'session_id'::uuid)
  and (select status = 'completed' from public.user_workout_sessions where id = :'scheduled_session_id'::uuid)
  and (select count(*) from public.exercise_logs where workout_session_id = :'session_id'::uuid
       and plan_exercise_id = :'plan_exercise_id'::uuid and set_number = 1) = 1
  and exists (select 1 from public.workout_session_muscle_snapshot_items item
       where item.id = :'snapshot_item_id'::uuid and item.state = 'adjusted'
       and item.planned_global_exercise_id = '3eab8f04-2b5f-5c5e-9fed-41c63b90d45b'
       and item.actual_global_exercise_id = '1ee4a77a-0f7a-5fad-b281-52a191a2a685'
       and item.actual_mapping_set_id is not null),
  'Completion lost planned or actual replacement identity or linked schedule state.'
);
select count(*) as completed_log_count,
       md5(coalesce(string_agg(md5(to_jsonb(log_row)::text), '' order by log_row.id), '')) as completed_log_hash
from public.exercise_logs log_row where log_row.workout_session_id = :'session_id'::uuid \gset
select md5(to_jsonb(snapshot)::text) as completed_snapshot_hash
from public.workout_session_muscle_snapshots snapshot where snapshot.id = :'snapshot_id'::uuid \gset
select md5(to_jsonb(item)::text) as completed_item_hash
from public.workout_session_muscle_snapshot_items item where item.id = :'snapshot_item_id'::uuid \gset
select public.complete_workout_session_atomic(
  :'member_id'::uuid, :'session_id'::uuid, :'final_set_payload'::jsonb, 12, null
) as completion_retry_result \gset
select pg_temp.assert_true(
  coalesce((:'completion_retry_result'::jsonb->>'already_completed')::boolean, false)
  and (select count(*) from public.exercise_logs where workout_session_id = :'session_id'::uuid) = :'completed_log_count'::integer
  and (select md5(coalesce(string_agg(md5(to_jsonb(log_row)::text), '' order by log_row.id), '')) from public.exercise_logs log_row where log_row.workout_session_id = :'session_id'::uuid) = :'completed_log_hash'
  and (select md5(to_jsonb(snapshot)::text) = :'completed_snapshot_hash' from public.workout_session_muscle_snapshots snapshot where snapshot.id = :'snapshot_id'::uuid)
  and (select md5(to_jsonb(item)::text) = :'completed_item_hash' from public.workout_session_muscle_snapshot_items item where item.id = :'snapshot_item_id'::uuid),
  'Completion retry duplicated logs or mutated the terminal snapshot.'
);
reset role;

select pg_temp.assert_snapshot_update_denied(:'snapshot_id'::uuid);
select pg_temp.assert_snapshot_item_update_denied(:'snapshot_item_id'::uuid);
update public.user_workout_plans
set archived_at = now(), is_active = false, is_default = false
where id = :'plan_id'::uuid;
select pg_temp.assert_true(
  (select not is_active and not is_default and archived_at is not null from public.user_workout_plans where id = :'plan_id'::uuid),
  'Phase 3 archived plan fixture violates active/default/archive invariants.'
);
select pg_temp.assert_true(
  exists (select 1 from public.workout_session_muscle_snapshots where id = :'snapshot_id'::uuid and workout_session_id = :'session_id'::uuid),
  'Plan archive erased performed snapshot history.'
);
select pg_temp.assert_plan_delete_denied(:'plan_id'::uuid);
update public.exercises set is_approved = false where id = '1ee4a77a-0f7a-5fad-b281-52a191a2a685';
select pg_temp.assert_true(
  exists (select 1 from public.get_workout_session_frozen_global_mappings(:'member_id'::uuid, :'session_id'::uuid) where id = :'frozen_actual_mapping_id'::uuid),
  'Global deactivation made completed historical analysis unreadable.'
);

insert into public.user_custom_exercises(user_id, name, target_muscle, equipment, sets, reps)
values (:'member_id'::uuid, 'Disposable custom squat', 'Quadriceps', 'Bodyweight', 2, '10')
returning id as custom_exercise_id \gset
insert into public.user_custom_exercise_mapping_sets(
  user_id, custom_exercise_id, mapping_version, status, schema_version, checksum
) values (
  :'member_id'::uuid, :'custom_exercise_id'::uuid, 1, 'draft',
  'exercise_muscle_mapping_v1', repeat('0', 64)
) returning id as custom_mapping_id \gset
insert into public.user_custom_exercise_mapping_entries(
  mapping_set_id, muscle_id, role, contribution, side_scope, sort_order
) values (:'custom_mapping_id'::uuid, 'quadriceps', 'primary', 1.00, 'bilateral', 1);
update public.user_custom_exercise_mapping_sets
set checksum = private.user_custom_exercise_mapping_checksum(:'custom_mapping_id'::uuid)
where id = :'custom_mapping_id'::uuid;
insert into public.user_workout_plans(user_id, name, is_active, is_default, archived_at)
values (:'member_id'::uuid, 'Custom snapshot verification plan', true, true, null)
returning id as custom_plan_id \gset
select pg_temp.assert_true(
  (select is_active and is_default and archived_at is null from public.user_workout_plans where id = :'custom_plan_id'::uuid),
  'Phase 3 custom active plan fixture violates active/default/archive invariants.'
);
insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'custom_plan_id'::uuid, 1, 'Custom snapshot day')
returning id as custom_plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, sort_order
) values (:'custom_plan_day_id'::uuid, :'custom_exercise_id', 'Disposable custom squat', 2, '10', 1)
returning id as custom_plan_exercise_id \gset
set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.publish_user_custom_exercise_mapping_set(:'custom_mapping_id'::uuid);
select (public.start_or_resume_workout_session_atomic(:'member_id'::uuid, :'custom_plan_day_id'::uuid, null)->'session'->>'id') as custom_session_id \gset
reset role;
select id as custom_snapshot_id from public.workout_session_muscle_snapshots where workout_session_id = :'custom_session_id'::uuid \gset
