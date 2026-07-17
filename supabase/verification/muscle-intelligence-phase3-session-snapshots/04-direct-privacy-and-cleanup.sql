-- Direct session raw inserts are contained; authoritative RPCs freeze one stable item.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_raw_direct_insert_denied(:'member_id'::uuid);

select exercise.id as direct_global_id
from public.exercises exercise
where exercise.is_global and exercise.is_approved
  and exists (
    select 1 from public.exercise_muscle_mapping_sets mapping
    where mapping.exercise_id = exercise.id and mapping.status = 'published'
  )
order by exercise.id
limit 1 \gset
select (public.start_or_resume_direct_workout_session_atomic(
  :'member_id'::uuid, 'global_exercise', :'direct_global_id',
  null, 'Forged display is not identity', 'Strength', '{"sets":3,"reps":"8"}'::jsonb, null
)->'session'->>'id') as direct_global_session_id \gset
select (public.start_or_resume_direct_workout_session_atomic(
  :'member_id'::uuid, 'global_exercise', :'direct_global_id',
  null, 'Different retry name', 'Strength', '{"sets":9}'::jsonb, :'direct_global_session_id'::uuid
)->'session'->>'id') as direct_global_retry_id \gset
select pg_temp.assert_true(
  :'direct_global_retry_id'::uuid = :'direct_global_session_id'::uuid
  and (select count(*) from public.workout_session_muscle_snapshots where workout_session_id = :'direct_global_session_id'::uuid) = 1
  and (select count(*) from public.workout_session_muscle_snapshot_items item
       join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
       where snapshot.workout_session_id = :'direct_global_session_id'::uuid
         and item.planned_global_exercise_id = :'direct_global_id'::uuid
         and item.planned_mapping_set_id is not null) = 1,
  'Direct global resume was not stable and idempotent.'
);
reset role;
insert into public.exercise_logs(
  workout_session_id, exercise_name, set_number, reps, completed_at, exercise_order
) values (
  :'direct_global_session_id'::uuid, 'Direct global exercise', 1, 8, now(), 1
);
update public.workout_sessions
set status = 'completed', completed_at = now(), duration_minutes = 5
where id = :'direct_global_session_id'::uuid;
select pg_temp.assert_true(
  exists (
    select 1 from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'direct_global_session_id'::uuid
      and item.state in ('adjusted', 'completed')
  ),
  'Direct global completed session did not reconcile.'
);

select link.provider as linked_provider,
       link.provider_activity_id as linked_provider_activity_id,
       link.exercise_id as linked_global_id
from public.exercise_provider_links link
where link.verification_status = 'verified'
  and exists (
    select 1 from public.exercise_muscle_mapping_sets mapping
    where mapping.exercise_id = link.exercise_id and mapping.status = 'published'
  )
order by link.provider, link.provider_activity_id
limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_direct_workout_session_atomic(
  :'member_id'::uuid, 'provider_activity', :'linked_provider_activity_id',
  :'linked_provider', 'Linked provider display', 'Strength', '{"sets":2}'::jsonb, null
)->'session'->>'id') as direct_linked_session_id \gset
select pg_temp.assert_true(
  exists (
    select 1 from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'direct_linked_session_id'::uuid
      and item.planned_provider = :'linked_provider'
      and item.planned_provider_activity_id = :'linked_provider_activity_id'
      and item.planned_global_exercise_id = :'linked_global_id'::uuid
      and item.planned_mapping_set_id is not null
  ),
  'Direct linked provider session did not resolve exact canonical mapping.'
);
reset role;
update public.workout_sessions
set status = 'skipped', completed_at = now(), skipped_at = now(), duration_minutes = 0
where id = :'direct_linked_session_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_direct_workout_session_atomic(
  :'member_id'::uuid, 'provider_activity', :'unlinked_provider_activity_id',
  'plaivra_activity_catalog', 'Unlinked direct provider', 'Strength', '{"sets":2}'::jsonb, null
)->'session'->>'id') as direct_unlinked_session_id \gset
select pg_temp.assert_true(
  exists (
    select 1 from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'direct_unlinked_session_id'::uuid
      and item.planned_provider = 'plaivra_activity_catalog'
      and item.planned_provider_activity_id = :'unlinked_provider_activity_id'
      and item.planned_global_exercise_id is null
      and item.planned_mapping_set_id is null
  )
  and exists (
    select 1 from public.workout_session_muscle_snapshots snapshot
    where snapshot.workout_session_id = :'direct_unlinked_session_id'::uuid
      and snapshot.completeness = 'unavailable'
      and 'provider_bridge_unavailable' = any(snapshot.reason_codes)
  ),
  'Direct unlinked provider identity was not preserved as explicitly unavailable.'
);
reset role;
update public.workout_sessions
set status = 'skipped', completed_at = now(), skipped_at = now(), duration_minutes = 0
where id = :'direct_unlinked_session_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_direct_workout_session_atomic(
  :'member_id'::uuid, 'custom_exercise', :'custom_exercise_id',
  null, 'Forged custom name', 'Strength', '{"sets":2,"reps":"10"}'::jsonb, null
)->'session'->>'id') as direct_custom_session_id \gset
select pg_temp.assert_true(
  exists (
    select 1 from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'direct_custom_session_id'::uuid
      and item.planned_custom_exercise_id = :'custom_exercise_id'::uuid
      and item.planned_custom_mapping_set_id = :'custom_mapping_id'::uuid
      and item.planned_custom_identity_snapshot->>'name' = 'Disposable custom squat'
      and jsonb_array_length(item.planned_custom_mapping_entries) = 1
  ),
  'Direct custom session did not preserve compact owner-custom identity.'
);

select public.get_workout_replacement_candidate_eligibility(
  :'member_id'::uuid,
  jsonb_build_array(
    jsonb_build_object('key','linked','targetType','provider_activity','identity',:'linked_provider_activity_id','provider',:'linked_provider'),
    jsonb_build_object('key','unlinked','targetType','provider_activity','identity',:'unlinked_provider_activity_id','provider','plaivra_activity_catalog'),
    jsonb_build_object('key','global','targetType','global_exercise','identity',:'direct_global_id'),
    jsonb_build_object('key','custom','targetType','custom_exercise','identity',:'custom_exercise_id')
  )
) as eligibility_results \gset
select pg_temp.assert_true(
  exists (select 1 from jsonb_array_elements(:'eligibility_results'::jsonb) row where row->>'key'='linked' and (row->>'eligible')::boolean)
  and exists (select 1 from jsonb_array_elements(:'eligibility_results'::jsonb) row where row->>'key'='unlinked' and not (row->>'eligible')::boolean)
  and exists (select 1 from jsonb_array_elements(:'eligibility_results'::jsonb) row where row->>'key'='global' and (row->>'eligible')::boolean)
  and exists (select 1 from jsonb_array_elements(:'eligibility_results'::jsonb) row where row->>'key'='custom' and (row->>'eligible')::boolean),
  'Replacement eligibility did not distinguish linked, unlinked, global, and custom candidates.'
);
reset role;
update public.workout_sessions
set status = 'skipped', completed_at = now(), skipped_at = now(), duration_minutes = 0
where id = :'direct_custom_session_id'::uuid;

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
  )
  and exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where snapshot.workout_session_id = :'direct_custom_session_id'::uuid
      and item.planned_custom_identity_snapshot->>'name' = 'Disposable custom squat'
  ),
  'Custom exercise deletion erased copied historical interpretation.'
);

delete from auth.users where id = :'member_id'::uuid;
select pg_temp.assert_true(
  not exists (select 1 from public.workout_session_muscle_snapshots where user_id = :'member_id'::uuid)
  and not exists (select 1 from public.workout_session_muscle_snapshot_items where user_id = :'member_id'::uuid),
  'Account deletion did not remove owner-scoped snapshot history.'
);
