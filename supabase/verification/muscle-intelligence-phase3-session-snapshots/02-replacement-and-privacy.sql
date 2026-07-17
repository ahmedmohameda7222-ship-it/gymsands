
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

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.replace_workout_session_snapshot_item_atomic(
  :'member_id'::uuid,
  :'session_id'::uuid,
  :'plan_exercise_id'::uuid,
  'global_exercise',
  '1ee4a77a-0f7a-5fad-b281-52a191a2a685',
  null
);
select pg_temp.assert_true(
  (select actual_mapping_set_id = :'frozen_actual_mapping_id'::uuid
   from public.workout_session_muscle_snapshot_items where id = :'snapshot_item_id'::uuid),
  'Identical replacement retry rewrote the frozen mapping version.'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.get_workout_session_frozen_global_mappings(:'member_id'::uuid, :'session_id'::uuid)
    where id = :'frozen_actual_mapping_id'::uuid and checksum = :'frozen_actual_mapping_checksum'
  ),
  'Historical mapping loader could not read the retired frozen mapping.'
);

select public.complete_workout_session_atomic(
  :'member_id'::uuid,
  :'session_id'::uuid,
  jsonb_build_array(jsonb_build_object(
    'plan_exercise_id', :'plan_exercise_id',
    'exercise_order', 1,
    'exercise_name', 'Incline Dumbbell Bench Press',
    'planned_sets', 3,
    'planned_reps', '8',
    'planned_rest_seconds', 90,
    'set_number', 1,
    'reps', 8,
    'weight_kg', 20,
    'completed_at', now()
  )),
  12,
  null
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'session_id'::uuid
      and item.state = 'adjusted'
      and item.planned_global_exercise_id = '3eab8f04-2b5f-5c5e-9fed-41c63b90d45b'
      and item.actual_global_exercise_id = '1ee4a77a-0f7a-5fad-b281-52a191a2a685'
      and item.actual_mapping_set_id is not null
  ),
  'Completion lost planned or actual replacement identity.'
);

reset role;
select pg_temp.assert_snapshot_update_denied(:'snapshot_id'::uuid);
select pg_temp.assert_snapshot_item_update_denied(:'snapshot_item_id'::uuid);

update public.user_workout_plans
set archived_at = now(), is_active = false, is_default = false
where id = :'plan_id'::uuid;
select pg_temp.assert_true(
  (select not is_active and not is_default and archived_at is not null
   from public.user_workout_plans where id = :'plan_id'::uuid),
  'Phase 3 archived plan fixture violates active/default/archive invariants.'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.workout_session_muscle_snapshots
    where id = :'snapshot_id'::uuid and workout_session_id = :'session_id'::uuid
  ),
  'Plan archive erased performed snapshot history.'
);
select pg_temp.assert_plan_delete_denied(:'plan_id'::uuid);

update public.exercises set is_approved = false
where id = '1ee4a77a-0f7a-5fad-b281-52a191a2a685';
select pg_temp.assert_true(
  exists (
    select 1 from public.get_workout_session_frozen_global_mappings(:'member_id'::uuid, :'session_id'::uuid)
    where id = :'frozen_actual_mapping_id'::uuid
  ),
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
) values (
  :'custom_mapping_id'::uuid, 'quadriceps', 'primary', 1.00, 'bilateral', 1
);
update public.user_custom_exercise_mapping_sets
set checksum = private.user_custom_exercise_mapping_checksum(:'custom_mapping_id'::uuid)
where id = :'custom_mapping_id'::uuid;

insert into public.user_workout_plans(user_id, name, is_active, is_default, archived_at)
values (:'member_id'::uuid, 'Custom snapshot verification plan', true, true, null)
returning id as custom_plan_id \gset
select pg_temp.assert_true(
  (select is_active and is_default and archived_at is null
   from public.user_workout_plans where id = :'custom_plan_id'::uuid),
  'Phase 3 custom active plan fixture violates active/default/archive invariants.'
);
insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'custom_plan_id'::uuid, 1, 'Custom snapshot day')
returning id as custom_plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, sort_order
) values (
  :'custom_plan_day_id'::uuid, :'custom_exercise_id', 'Disposable custom squat', 2, '10', 1
) returning id as custom_plan_exercise_id \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.publish_user_custom_exercise_mapping_set(:'custom_mapping_id'::uuid);
select (public.start_or_resume_workout_session_atomic(
  :'member_id'::uuid, :'custom_plan_day_id'::uuid, null
)->'session'->>'id') as custom_session_id \gset
reset role;
select id as custom_snapshot_id
from public.workout_session_muscle_snapshots
where workout_session_id = :'custom_session_id'::uuid \gset
