-- Disposable Phase 3 verification. Run only after a clean local reset.
\set ON_ERROR_STOP on
\set member_id '47000000-0000-4000-8000-000000000007'
\set other_member_id '47000000-0000-4000-8000-000000000008'

begin;

do $schema$
declare
  table_name text;
  routine_oid oid;
begin
  foreach table_name in array array[
    'workout_session_muscle_snapshots',
    'workout_session_muscle_snapshot_items'
  ] loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Missing Phase 3 table: %', table_name;
    end if;
    if not exists (select 1 from pg_class where oid = ('public.' || table_name)::regclass and relrowsecurity) then
      raise exception 'RLS is not enabled on Phase 3 table: %', table_name;
    end if;
    if has_table_privilege('anon', 'public.' || table_name, 'SELECT')
       or has_table_privilege('anon', 'public.' || table_name, 'INSERT')
       or has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('anon', 'public.' || table_name, 'DELETE') then
      raise exception 'Anonymous role has Phase 3 table access: %', table_name;
    end if;
    if has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') then
      raise exception 'Member has authoritative Phase 3 table mutation access: %', table_name;
    end if;
  end loop;

  routine_oid := to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)');
  if routine_oid is null or not (select prosecdef from pg_proc where oid = routine_oid) then
    raise exception 'Replacement RPC is missing or is not SECURITY DEFINER.';
  end if;
  if coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = routine_oid), '') not like '%search_path=%' then
    raise exception 'Replacement RPC search_path is not hardened.';
  end if;
  if has_function_privilege('anon', routine_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', routine_oid, 'EXECUTE') then
    raise exception 'Replacement RPC grants are incorrect.';
  end if;

  routine_oid := to_regprocedure('public.get_workout_session_frozen_global_mappings(uuid,uuid)');
  if routine_oid is null or not (select prosecdef from pg_proc where oid = routine_oid) then
    raise exception 'Historical mapping loader is missing or is not SECURITY DEFINER.';
  end if;
  if has_function_privilege('anon', routine_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', routine_oid, 'EXECUTE') then
    raise exception 'Historical mapping loader grants are incorrect.';
  end if;
end
$schema$;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then raise exception '%', p_message; end if;
end
$assert$;

create function pg_temp.assert_snapshot_item_update_denied(p_item_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    update public.workout_session_muscle_snapshot_items set state = 'completed' where id = p_item_id;
  exception when check_violation then return;
  end;
  raise exception 'Frozen snapshot item update unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_plan_delete_denied(p_plan_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    delete from public.user_workout_plans where id = p_plan_id;
  exception when check_violation or foreign_key_violation then return;
  end;
  raise exception 'Plan delete unexpectedly erased performed history.';
end
$assert$;

create function pg_temp.assert_cross_owner_replacement_denied(
  p_other_user_id uuid, p_session_id uuid, p_plan_exercise_id uuid
)
returns void language plpgsql as $assert$
begin
  begin
    perform public.replace_workout_session_snapshot_item_atomic(
      p_other_user_id, p_session_id, p_plan_exercise_id,
      'global_exercise', '1ee4a77a-0f7a-5fad-b281-52a191a2a685', null
    );
  exception when insufficient_privilege then return;
  end;
  raise exception 'Cross-owner replacement unexpectedly succeeded.';
end
$assert$;
grant execute on function pg_temp.assert_cross_owner_replacement_denied(uuid, uuid, uuid) to authenticated;
grant execute on function pg_temp.assert_true(boolean, text) to authenticated;

create function pg_temp.assert_snapshot_update_denied(p_snapshot_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    update public.workout_session_muscle_snapshots set completeness = 'complete' where id = p_snapshot_id;
  exception when check_violation then return;
  end;
  raise exception 'Frozen snapshot update unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_name_only_replacement_denied(p_user_id uuid, p_session_id uuid, p_plan_exercise_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    perform public.replace_workout_session_snapshot_item_atomic(
      p_user_id, p_session_id, p_plan_exercise_id, 'global_exercise', 'Bench Press', null
    );
  exception when invalid_parameter_value then return;
  end;
  raise exception 'Name-only replacement unexpectedly succeeded.';
end
$assert$;
grant execute on function pg_temp.assert_name_only_replacement_denied(uuid, uuid, uuid) to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  :'member_id'::uuid, 'authenticated', 'authenticated', 'phase3@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
), (
  :'other_member_id'::uuid, 'authenticated', 'authenticated', 'phase3-other@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.user_workout_plans(user_id, name, is_active)
values (:'member_id'::uuid, 'Phase 3 verification plan', true)
returning id as plan_id \gset
insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'plan_id'::uuid, 1, 'Snapshot day')
returning id as plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, rest_seconds, sort_order
) values (
  :'plan_day_id'::uuid, '3eab8f04-2b5f-5c5e-9fed-41c63b90d45b',
  'Frozen display name', 3, '8', 90, 1
) returning id as plan_exercise_id \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_workout_session_atomic(:'member_id'::uuid, :'plan_day_id'::uuid, null)->'session'->>'id') as session_id \gset
select public.start_or_resume_workout_session_atomic(:'member_id'::uuid, :'plan_day_id'::uuid, null);

select pg_temp.assert_true(
  (select count(*) from public.workout_session_muscle_snapshots where workout_session_id = :'session_id'::uuid) = 1,
  'Start/resume did not preserve exactly one snapshot.'
);

select id as snapshot_id from public.workout_session_muscle_snapshots where workout_session_id = :'session_id'::uuid \gset
select id as snapshot_item_id from public.workout_session_muscle_snapshot_items where snapshot_id = :'snapshot_id'::uuid \gset

-- A different authenticated member cannot read or mutate this snapshot.
select set_config('request.jwt.claim.sub', :'other_member_id', true);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_muscle_snapshots where id = :'snapshot_id'::uuid) = 0,
  'Cross-owner snapshot read unexpectedly succeeded.'
);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_muscle_snapshot_items where id = :'snapshot_item_id'::uuid) = 0,
  'Cross-owner snapshot item read unexpectedly succeeded.'
);
select pg_temp.assert_cross_owner_replacement_denied(:'member_id'::uuid, :'session_id'::uuid, :'plan_exercise_id'::uuid);
select set_config('request.jwt.claim.sub', :'member_id', true);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_muscle_snapshot_items item
   join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
   where snapshot.workout_session_id = :'session_id'::uuid
     and item.source_plan_exercise_id = :'plan_exercise_id'::uuid
     and item.planned_global_exercise_id = '3eab8f04-2b5f-5c5e-9fed-41c63b90d45b'
     and item.planned_mapping_set_id is not null
     and item.planned_mapping_checksum ~ '^[0-9a-f]{64}$') = 1,
  'Session start did not freeze exact planned identity and mapping.'
);

select pg_temp.assert_name_only_replacement_denied(:'member_id'::uuid, :'session_id'::uuid, :'plan_exercise_id'::uuid);
select public.replace_workout_session_snapshot_item_atomic(
  :'member_id'::uuid,
  :'session_id'::uuid,
  :'plan_exercise_id'::uuid,
  'global_exercise',
  '1ee4a77a-0f7a-5fad-b281-52a191a2a685',
  null
);

select actual_mapping_set_id as frozen_actual_mapping_id,
       actual_mapping_checksum as frozen_actual_mapping_checksum
from public.workout_session_muscle_snapshot_items
where snapshot_id = :'snapshot_id'::uuid \gset

-- Publish a later version for the same replacement exercise. The accepted
-- replacement retry must retain the original frozen mapping, and the owner-
-- validated historical loader must continue returning the now-retired set.
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
-- Retry is idempotent even after later publication.
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

-- Plan archive cannot erase performed history; direct deletion is denied by
-- the existing history-identity protection.
update public.user_workout_plans
set archived_at = now(), is_active = false
where id = :'plan_id'::uuid;
select pg_temp.assert_true(
  exists (
    select 1 from public.workout_session_muscle_snapshots
    where id = :'snapshot_id'::uuid and workout_session_id = :'session_id'::uuid
  ),
  'Plan archive erased performed snapshot history.'
);
select pg_temp.assert_plan_delete_denied(:'plan_id'::uuid);

-- Global exercise deactivation and mapping retirement do not remove the
-- immutable mapping rows required by this completed session.
update public.exercises set is_approved = false
where id = '1ee4a77a-0f7a-5fad-b281-52a191a2a685';
select pg_temp.assert_true(
  exists (
    select 1 from public.get_workout_session_frozen_global_mappings(:'member_id'::uuid, :'session_id'::uuid)
    where id = :'frozen_actual_mapping_id'::uuid
  ),
  'Global deactivation made completed historical analysis unreadable.'
);

-- A compact custom mapping snapshot survives deletion of the editable custom
-- source and its published mapping rows.
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
insert into public.user_workout_plans(user_id, name, is_active)
values (:'member_id'::uuid, 'Custom snapshot verification plan', true)
returning id as custom_plan_id \gset
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
delete from public.user_custom_exercises where id = :'custom_exercise_id'::uuid;
select pg_temp.assert_true(
  exists (
    select 1
    from public.workout_session_muscle_snapshot_items
    where snapshot_id = :'custom_snapshot_id'::uuid
      and planned_custom_exercise_id = :'custom_exercise_id'::uuid
      and planned_custom_mapping_set_id = :'custom_mapping_id'::uuid
      and planned_custom_identity_snapshot->>'name' = 'Disposable custom squat'
      and jsonb_array_length(planned_custom_mapping_entries) = 1
  ),
  'Custom exercise deletion erased compact historical interpretation.'
);

-- Actual account teardown must cascade through FK nullification, snapshot
-- deletion, and item deletion without the immutability guards blocking it.
delete from auth.users where id = :'member_id'::uuid;
select pg_temp.assert_true(
  not exists (select 1 from public.workout_session_muscle_snapshots where id = :'snapshot_id'::uuid)
  and not exists (select 1 from public.workout_session_muscle_snapshot_items where id = :'snapshot_item_id'::uuid),
  'Account deletion did not remove owner-scoped snapshot history.'
);

rollback;
