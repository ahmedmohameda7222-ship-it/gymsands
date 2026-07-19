begin;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then raise exception '%', p_message; end if;
end
$assert$;

create function pg_temp.assert_global_schema_flip_rejected(p_mapping_set_id uuid, p_schema_version text)
returns void language plpgsql as $assert$
begin
  begin
    update public.exercise_muscle_mapping_sets
    set schema_version = p_schema_version
    where id = p_mapping_set_id;
  exception when check_violation then return;
  end;
  raise exception 'Global mapping schema_version mutation was not rejected.';
end
$assert$;

create function pg_temp.assert_custom_schema_flip_rejected(p_mapping_set_id uuid, p_schema_version text)
returns void language plpgsql as $assert$
begin
  begin
    update public.user_custom_exercise_mapping_sets
    set schema_version = p_schema_version
    where id = p_mapping_set_id;
  exception when check_violation then return;
  end;
  raise exception 'Custom mapping schema_version mutation was not rejected.';
end
$assert$;

create function pg_temp.assert_unsupported_resolver_rejected(p_exercise_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    perform * from private.resolve_muscle_mapping(p_exercise_id, 'unsupported_schema', clock_timestamp());
  exception when check_violation then return;
  end;
  raise exception 'Mapping resolver did not fail closed for an unsupported schema.';
end
$assert$;

select pg_temp.assert_true(
  not exists (
    select 1 from public.exercise_muscle_mapping_sets
    where schema_version = 'exercise_muscle_mapping_v2' and status in ('published', 'retired')
  ) and not exists (
    select 1 from public.user_custom_exercise_mapping_sets
    where schema_version = 'exercise_muscle_mapping_v2' and status in ('published', 'retired')
  ) and not exists (
    select 1 from public.workout_session_muscle_snapshots
    where snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
  ),
  'Production already contains durable V2 mappings or snapshots.'
);

create temporary table phase4a_correction_existing_snapshots on commit drop as
select id, to_jsonb(snapshot) as payload
from public.workout_session_muscle_snapshots snapshot;

insert into auth.users(
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '94100000-0000-4000-8000-000000000001'::uuid,
  'authenticated', 'authenticated', 'phase4a-correction@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.exercises(id, source, source_id, name, slug, is_approved, is_global)
values (
  '94100000-0000-4000-8000-000000000010'::uuid,
  'manual', 'phase4a-correction', 'Phase 4A Correction Exercise',
  'phase4a-correction-exercise', true, true
);

-- Global schema identity is immutable for empty and populated drafts, while a
-- same-value update remains legal.
insert into public.exercise_muscle_mapping_sets(
  id, exercise_id, mapping_version, source, schema_version, checksum
) values (
  '94100000-0000-4000-8000-000000000014'::uuid,
  '94100000-0000-4000-8000-000000000010'::uuid,
  5, 'phase4a_correction', 'exercise_muscle_mapping_v1', repeat('0', 64)
);
update public.exercise_muscle_mapping_sets
set schema_version = 'exercise_muscle_mapping_v1'
where id = '94100000-0000-4000-8000-000000000014'::uuid;
select pg_temp.assert_global_schema_flip_rejected(
  '94100000-0000-4000-8000-000000000014'::uuid,
  'exercise_muscle_mapping_v2'
);

insert into public.exercise_muscle_mapping_sets(
  id, exercise_id, mapping_version, source, schema_version, checksum
) values
  ('94100000-0000-4000-8000-000000000015'::uuid, '94100000-0000-4000-8000-000000000010'::uuid,
   6, 'phase4a_correction', 'exercise_muscle_mapping_v1', repeat('0', 64)),
  ('94100000-0000-4000-8000-000000000016'::uuid, '94100000-0000-4000-8000-000000000010'::uuid,
   7, 'phase4a_correction', 'exercise_muscle_mapping_v2', repeat('0', 64));
insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
values
  ('94100000-0000-4000-8000-000000000015'::uuid, 'pectoralis_major', 'primary', 1.00, 1),
  ('94100000-0000-4000-8000-000000000016'::uuid, 'pectoralis.upper', 'primary', 1.00, 1);
select pg_temp.assert_global_schema_flip_rejected(
  '94100000-0000-4000-8000-000000000015'::uuid,
  'exercise_muscle_mapping_v2'
);
select pg_temp.assert_global_schema_flip_rejected(
  '94100000-0000-4000-8000-000000000016'::uuid,
  'exercise_muscle_mapping_v1'
);
select pg_temp.assert_unsupported_resolver_rejected('94100000-0000-4000-8000-000000000010'::uuid);

-- Publish one V1 and one V2 mapping concurrently, then prove that replacement
-- publication retires only within its own schema.
insert into public.exercise_muscle_mapping_sets(
  id, exercise_id, mapping_version, source, schema_version, checksum
) values
  ('94100000-0000-4000-8000-000000000020'::uuid, '94100000-0000-4000-8000-000000000010'::uuid,
   1, 'phase4a_correction', 'exercise_muscle_mapping_v1', repeat('0', 64)),
  ('94100000-0000-4000-8000-000000000021'::uuid, '94100000-0000-4000-8000-000000000010'::uuid,
   2, 'phase4a_correction', 'exercise_muscle_mapping_v2', repeat('0', 64)),
  ('94100000-0000-4000-8000-000000000022'::uuid, '94100000-0000-4000-8000-000000000010'::uuid,
   3, 'phase4a_correction', 'exercise_muscle_mapping_v1', repeat('0', 64)),
  ('94100000-0000-4000-8000-000000000023'::uuid, '94100000-0000-4000-8000-000000000010'::uuid,
   4, 'phase4a_correction', 'exercise_muscle_mapping_v2', repeat('0', 64));
insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, side_scope, sort_order)
values
  ('94100000-0000-4000-8000-000000000020'::uuid, 'pectoralis_major', 'primary', 1.00, 'bilateral', 1),
  ('94100000-0000-4000-8000-000000000021'::uuid, 'pectoralis.upper', 'primary', 1.00, 'bilateral', 1),
  ('94100000-0000-4000-8000-000000000022'::uuid, 'pectoralis_major', 'primary', 1.00, 'bilateral', 1),
  ('94100000-0000-4000-8000-000000000023'::uuid, 'pectoralis.upper', 'primary', 1.00, 'bilateral', 1);
update public.exercise_muscle_mapping_sets
set checksum = private.exercise_muscle_mapping_checksum(id)
where id in (
  '94100000-0000-4000-8000-000000000020'::uuid,
  '94100000-0000-4000-8000-000000000021'::uuid,
  '94100000-0000-4000-8000-000000000022'::uuid,
  '94100000-0000-4000-8000-000000000023'::uuid
);

select public.publish_exercise_muscle_mapping_set('94100000-0000-4000-8000-000000000020'::uuid);
select public.publish_exercise_muscle_mapping_set('94100000-0000-4000-8000-000000000021'::uuid);
select pg_temp.assert_true(
  (select count(*) = 2 from public.exercise_muscle_mapping_sets
   where exercise_id = '94100000-0000-4000-8000-000000000010'::uuid and status = 'published'),
  'Published global V1 and V2 mappings did not coexist.'
);
select public.publish_exercise_muscle_mapping_set('94100000-0000-4000-8000-000000000022'::uuid);
select pg_temp.assert_true(
  (select status = 'retired' from public.exercise_muscle_mapping_sets where id = '94100000-0000-4000-8000-000000000020'::uuid)
  and (select status = 'published' from public.exercise_muscle_mapping_sets where id = '94100000-0000-4000-8000-000000000021'::uuid)
  and (select status = 'published' from public.exercise_muscle_mapping_sets where id = '94100000-0000-4000-8000-000000000022'::uuid),
  'New global V1 publication crossed the schema boundary.'
);
select public.publish_exercise_muscle_mapping_set('94100000-0000-4000-8000-000000000023'::uuid);
select pg_temp.assert_true(
  (select status = 'retired' from public.exercise_muscle_mapping_sets where id = '94100000-0000-4000-8000-000000000021'::uuid)
  and (select status = 'published' from public.exercise_muscle_mapping_sets where id = '94100000-0000-4000-8000-000000000022'::uuid)
  and (select status = 'published' from public.exercise_muscle_mapping_sets where id = '94100000-0000-4000-8000-000000000023'::uuid),
  'New global V2 publication crossed the schema boundary.'
);

-- Repeat coexistence and schema-local retirement for owner-scoped custom maps.
insert into public.user_custom_exercises(id, user_id, name)
values (
  '94100000-0000-4000-8000-000000000030'::uuid,
  '94100000-0000-4000-8000-000000000001'::uuid,
  'Phase 4A Correction Custom'
);
insert into public.user_custom_exercise_mapping_sets(
  id, user_id, custom_exercise_id, mapping_version, schema_version, checksum
) values
  ('94100000-0000-4000-8000-000000000031'::uuid, '94100000-0000-4000-8000-000000000001'::uuid,
   '94100000-0000-4000-8000-000000000030'::uuid, 1, 'exercise_muscle_mapping_v1', repeat('0', 64)),
  ('94100000-0000-4000-8000-000000000032'::uuid, '94100000-0000-4000-8000-000000000001'::uuid,
   '94100000-0000-4000-8000-000000000030'::uuid, 2, 'exercise_muscle_mapping_v2', repeat('0', 64)),
  ('94100000-0000-4000-8000-000000000033'::uuid, '94100000-0000-4000-8000-000000000001'::uuid,
   '94100000-0000-4000-8000-000000000030'::uuid, 3, 'exercise_muscle_mapping_v1', repeat('0', 64)),
  ('94100000-0000-4000-8000-000000000034'::uuid, '94100000-0000-4000-8000-000000000001'::uuid,
   '94100000-0000-4000-8000-000000000030'::uuid, 4, 'exercise_muscle_mapping_v2', repeat('0', 64));
insert into public.user_custom_exercise_mapping_entries(mapping_set_id, muscle_id, role, contribution, side_scope, sort_order)
values
  ('94100000-0000-4000-8000-000000000031'::uuid, 'pectoralis_major', 'primary', 1.00, 'bilateral', 1),
  ('94100000-0000-4000-8000-000000000032'::uuid, 'pectoralis.upper', 'primary', 1.00, 'bilateral', 1),
  ('94100000-0000-4000-8000-000000000033'::uuid, 'pectoralis_major', 'primary', 1.00, 'bilateral', 1),
  ('94100000-0000-4000-8000-000000000034'::uuid, 'pectoralis.upper', 'primary', 1.00, 'bilateral', 1);
update public.user_custom_exercise_mapping_sets
set checksum = private.user_custom_exercise_mapping_checksum(id)
where custom_exercise_id = '94100000-0000-4000-8000-000000000030'::uuid;
select pg_temp.assert_custom_schema_flip_rejected(
  '94100000-0000-4000-8000-000000000031'::uuid,
  'exercise_muscle_mapping_v2'
);
select public.publish_user_custom_exercise_mapping_set('94100000-0000-4000-8000-000000000031'::uuid);
select public.publish_user_custom_exercise_mapping_set('94100000-0000-4000-8000-000000000032'::uuid);
select pg_temp.assert_true(
  (select count(*) = 2 from public.user_custom_exercise_mapping_sets
   where custom_exercise_id = '94100000-0000-4000-8000-000000000030'::uuid and status = 'published'),
  'Published custom V1 and V2 mappings did not coexist.'
);
select public.publish_user_custom_exercise_mapping_set('94100000-0000-4000-8000-000000000033'::uuid);
select pg_temp.assert_true(
  (select status = 'retired' from public.user_custom_exercise_mapping_sets where id = '94100000-0000-4000-8000-000000000031'::uuid)
  and (select status = 'published' from public.user_custom_exercise_mapping_sets where id = '94100000-0000-4000-8000-000000000032'::uuid)
  and (select status = 'published' from public.user_custom_exercise_mapping_sets where id = '94100000-0000-4000-8000-000000000033'::uuid),
  'New custom V1 publication crossed the schema boundary.'
);
select public.publish_user_custom_exercise_mapping_set('94100000-0000-4000-8000-000000000034'::uuid);
select pg_temp.assert_true(
  (select status = 'retired' from public.user_custom_exercise_mapping_sets where id = '94100000-0000-4000-8000-000000000032'::uuid)
  and (select status = 'published' from public.user_custom_exercise_mapping_sets where id = '94100000-0000-4000-8000-000000000033'::uuid)
  and (select status = 'published' from public.user_custom_exercise_mapping_sets where id = '94100000-0000-4000-8000-000000000034'::uuid),
  'New custom V2 publication crossed the schema boundary.'
);

-- Plan-session freeze must explicitly select the current V1 global mapping.
insert into public.user_workout_plans(
  id, user_id, name, is_active, is_default, archived_at
) values (
  '94100000-0000-4000-8000-000000000040'::uuid,
  '94100000-0000-4000-8000-000000000001'::uuid,
  'Phase 4A Correction Plan', true, true, null
);
insert into public.user_workout_plan_days(id, plan_id, day_number, day_name)
values
  ('94100000-0000-4000-8000-000000000041'::uuid, '94100000-0000-4000-8000-000000000040'::uuid, 1, 'Global day'),
  ('94100000-0000-4000-8000-000000000042'::uuid, '94100000-0000-4000-8000-000000000040'::uuid, 2, 'Custom day');
insert into public.user_workout_plan_exercises(
  id, plan_day_id, source_workout_id, exercise_name, sets, reps, rest_seconds, sort_order
) values
  ('94100000-0000-4000-8000-000000000043'::uuid, '94100000-0000-4000-8000-000000000041'::uuid,
   '94100000-0000-4000-8000-000000000010', 'Correction global', 3, '8', 90, 1),
  ('94100000-0000-4000-8000-000000000044'::uuid, '94100000-0000-4000-8000-000000000042'::uuid,
   '94100000-0000-4000-8000-000000000030', 'Correction custom', 3, '8', 90, 1);
insert into public.user_workout_sessions(
  id, user_id, user_workout_plan_id, plan_day_id, week_index, day_index,
  session_number, scheduled_date, day_title, status
) values
  ('94100000-0000-4000-8000-000000000045'::uuid, '94100000-0000-4000-8000-000000000001'::uuid,
   '94100000-0000-4000-8000-000000000040'::uuid, '94100000-0000-4000-8000-000000000041'::uuid,
   1, 1, 1, current_date, 'Global day', 'scheduled'),
  ('94100000-0000-4000-8000-000000000046'::uuid, '94100000-0000-4000-8000-000000000001'::uuid,
   '94100000-0000-4000-8000-000000000040'::uuid, '94100000-0000-4000-8000-000000000042'::uuid,
   1, 2, 2, current_date, 'Custom day', 'scheduled');

select public.start_or_resume_workout_session_atomic(
  '94100000-0000-4000-8000-000000000001'::uuid,
  '94100000-0000-4000-8000-000000000041'::uuid,
  '94100000-0000-4000-8000-000000000045'::uuid
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
    where snapshot.user_id = '94100000-0000-4000-8000-000000000001'::uuid
      and snapshot.plan_day_id = '94100000-0000-4000-8000-000000000041'::uuid
      and snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v1'
      and snapshot.mapping_schema_version = 'exercise_muscle_mapping_v1'
      and item.planned_mapping_set_id = '94100000-0000-4000-8000-000000000022'::uuid
      and item.planned_mapping_schema_version = 'exercise_muscle_mapping_v1'
  ),
  'Plan-session freeze did not select the current V1 global mapping.'
);

-- Replacement must use the same explicit V1 resolver even while V2 is also published.
select public.replace_workout_session_snapshot_item_atomic(
  '94100000-0000-4000-8000-000000000001'::uuid,
  (select id from public.workout_sessions
   where user_id = '94100000-0000-4000-8000-000000000001'::uuid
     and plan_day_id = '94100000-0000-4000-8000-000000000041'::uuid),
  '94100000-0000-4000-8000-000000000043'::uuid,
  'custom_exercise',
  '94100000-0000-4000-8000-000000000030',
  null
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.plan_day_id = '94100000-0000-4000-8000-000000000041'::uuid
      and item.actual_custom_mapping_set_id = '94100000-0000-4000-8000-000000000033'::uuid
      and item.actual_mapping_schema_version = 'exercise_muscle_mapping_v1'
  ),
  'Replacement did not select the current V1 custom mapping.'
);

-- Custom plan freeze repeats the V1-only snapshot selection behavior.
select public.start_or_resume_workout_session_atomic(
  '94100000-0000-4000-8000-000000000001'::uuid,
  '94100000-0000-4000-8000-000000000042'::uuid,
  '94100000-0000-4000-8000-000000000046'::uuid
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
    where snapshot.plan_day_id = '94100000-0000-4000-8000-000000000042'::uuid
      and snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v1'
      and snapshot.mapping_schema_version = 'exercise_muscle_mapping_v1'
      and item.planned_custom_mapping_set_id = '94100000-0000-4000-8000-000000000033'::uuid
      and item.planned_mapping_schema_version = 'exercise_muscle_mapping_v1'
  ),
  'Custom plan freeze did not select the current V1 custom mapping.'
);

-- Direct-session start is also a V1 writer.
select public.start_or_resume_direct_workout_session_atomic(
  '94100000-0000-4000-8000-000000000001'::uuid,
  'global_exercise',
  '94100000-0000-4000-8000-000000000010',
  null,
  'Phase 4A Correction Direct',
  'Workout',
  '{"sets":3,"reps":"8"}'::jsonb,
  null
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
    where snapshot.user_id = '94100000-0000-4000-8000-000000000001'::uuid
      and snapshot.plan_day_id is null
      and snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v1'
      and snapshot.mapping_schema_version = 'exercise_muscle_mapping_v1'
      and item.planned_mapping_set_id = '94100000-0000-4000-8000-000000000022'::uuid
      and item.planned_mapping_schema_version = 'exercise_muscle_mapping_v1'
  ),
  'Direct-session start did not select the current V1 global mapping.'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
    where snapshot.user_id = '94100000-0000-4000-8000-000000000001'::uuid
      and (
        snapshot.snapshot_schema_version <> 'workout_session_muscle_snapshot_v1'
        or snapshot.mapping_schema_version <> 'exercise_muscle_mapping_v1'
        or (item.planned_mapping_schema_version is not null and item.planned_mapping_schema_version <> 'exercise_muscle_mapping_v1')
        or (item.actual_mapping_schema_version is not null and item.actual_mapping_schema_version <> 'exercise_muscle_mapping_v1')
      )
  ),
  'A current authoritative writer created a mixed or V2 snapshot bundle.'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from phase4a_correction_existing_snapshots before
    join public.workout_session_muscle_snapshots current using (id)
    where before.payload is distinct from to_jsonb(current)
  ),
  'Historical V1 snapshots changed during correction verification.'
);

rollback;

select jsonb_build_object(
  'published_or_retired_global_v2', (
    select count(*)
    from public.exercise_muscle_mapping_sets
    where schema_version = 'exercise_muscle_mapping_v2'
      and status in ('published', 'retired')
  ),
  'published_or_retired_custom_v2', (
    select count(*)
    from public.user_custom_exercise_mapping_sets
    where schema_version = 'exercise_muscle_mapping_v2'
      and status in ('published', 'retired')
  ),
  'v2_snapshots', (
    select count(*)
    from public.workout_session_muscle_snapshots
    where snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
  ),
  'v1_snapshots', (
    select count(*)
    from public.workout_session_muscle_snapshots
    where snapshot_schema_version = 'workout_session_muscle_snapshot_v1'
  ),
  'v1_snapshot_digest', (
    select md5(coalesce(jsonb_agg(to_jsonb(snapshot) order by snapshot.id)::text, '[]'))
    from public.workout_session_muscle_snapshots snapshot
    where snapshot.snapshot_schema_version = 'workout_session_muscle_snapshot_v1'
  ),
  'compatibility_marker', (
    select migration_version
    from public.release_schema_compatibility
    where singleton
  )
) as production_state_after_rollback;
