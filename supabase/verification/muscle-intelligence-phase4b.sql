begin;

set local transaction read only;

do $verify$
declare
  v_v1_count bigint;
  v_v2_count bigint;
  v_v2_entry_count bigint;
  v_v2_checksum_drift bigint;
  v_missing_v1 bigint;
  v_custom_v2_count bigint;
  v_v2_snapshot_count bigint;
  v_compatibility_marker text;
begin
  select count(*) into v_v1_count
  from public.exercise_muscle_mapping_sets mapping
  join public.exercises exercise on exercise.id = mapping.exercise_id
  where exercise.source = 'plaivra_curated'
    and exercise.is_global
    and exercise.is_approved
    and mapping.mapping_version = 1
    and mapping.schema_version = 'exercise_muscle_mapping_v1'
    and mapping.status = 'published';

  if v_v1_count <> 60 then
    raise exception 'Phase 4B verification expected 60 unchanged published curated V1 mappings, found %.', v_v1_count;
  end if;

  select count(*) into v_v2_count
  from public.exercise_muscle_mapping_sets mapping
  join public.exercises exercise on exercise.id = mapping.exercise_id
  where exercise.source = 'plaivra_curated'
    and exercise.is_global
    and exercise.is_approved
    and mapping.mapping_version = 2
    and mapping.schema_version = 'exercise_muscle_mapping_v2'
    and mapping.status = 'published'
    and mapping.source = 'plaivra_reviewed_phase4b';

  if v_v2_count <> 60 then
    raise exception 'Phase 4B verification expected 60 published reviewed V2 mappings, found %.', v_v2_count;
  end if;

  if exists (
    select 1
    from public.exercise_muscle_mapping_sets mapping
    where mapping.schema_version = 'exercise_muscle_mapping_v2'
      and mapping.mapping_version = 2
      and mapping.source = 'plaivra_reviewed_phase4b'
      and mapping.status <> 'published'
  ) then
    raise exception 'Phase 4B reviewed V2 mappings must not remain draft or retired.';
  end if;

  select count(*) into v_v2_entry_count
  from public.exercise_muscle_mapping_entries entry
  join public.exercise_muscle_mapping_sets mapping on mapping.id = entry.mapping_set_id
  where mapping.schema_version = 'exercise_muscle_mapping_v2'
    and mapping.mapping_version = 2
    and mapping.status = 'published'
    and mapping.source = 'plaivra_reviewed_phase4b';

  if v_v2_entry_count <> 453 then
    raise exception 'Phase 4B verification expected 453 V2 entries, found %.', v_v2_entry_count;
  end if;

  select count(*) into v_v2_checksum_drift
  from public.exercise_muscle_mapping_sets mapping
  where mapping.schema_version = 'exercise_muscle_mapping_v2'
    and mapping.mapping_version = 2
    and mapping.status = 'published'
    and mapping.source = 'plaivra_reviewed_phase4b'
    and private.exercise_muscle_mapping_checksum(mapping.id) is distinct from mapping.checksum;

  if v_v2_checksum_drift <> 0 then
    raise exception 'Phase 4B verification found % V2 checksum mismatches.', v_v2_checksum_drift;
  end if;

  select count(*) into v_missing_v1
  from public.exercise_muscle_mapping_sets v2
  where v2.schema_version = 'exercise_muscle_mapping_v2'
    and v2.mapping_version = 2
    and v2.status = 'published'
    and v2.source = 'plaivra_reviewed_phase4b'
    and not exists (
      select 1
      from public.exercise_muscle_mapping_sets v1
      where v1.exercise_id = v2.exercise_id
        and v1.schema_version = 'exercise_muscle_mapping_v1'
        and v1.mapping_version = 1
        and v1.status = 'published'
    );

  if v_missing_v1 <> 0 then
    raise exception 'Phase 4B verification found % V2 mappings without their preserved published V1 counterpart.', v_missing_v1;
  end if;

  select count(*) into v_custom_v2_count
  from public.user_custom_exercise_mapping_sets
  where schema_version = 'exercise_muscle_mapping_v2';

  if v_custom_v2_count <> 0 then
    raise exception 'Phase 4B must not populate custom-exercise V2 mappings; found %.', v_custom_v2_count;
  end if;

  select count(*) into v_v2_snapshot_count
  from public.workout_session_muscle_snapshots
  where mapping_schema_version = 'exercise_muscle_mapping_v2';

  if v_v2_snapshot_count <> 0 then
    raise exception 'Phase 4B must not create or cut over V2 session snapshots; found %.', v_v2_snapshot_count;
  end if;

  select migration_version into v_compatibility_marker
  from public.release_schema_compatibility
  where singleton = true;

  if v_compatibility_marker is distinct from '20260717051011' then
    raise exception 'Phase 4B must not advance the release compatibility marker; found %.', v_compatibility_marker;
  end if;

  if to_regprocedure('private.phase4b_publish_reviewed_advanced_mapping_part(jsonb,integer)') is not null then
    raise exception 'Temporary Phase 4B publication helper must be removed after part 6.';
  end if;
end
$verify$;

select
  (select count(*) from public.exercise_muscle_mapping_sets where schema_version = 'exercise_muscle_mapping_v1' and status = 'published') as published_v1_mapping_count,
  (select count(*) from public.exercise_muscle_mapping_sets where schema_version = 'exercise_muscle_mapping_v2' and status = 'published' and source = 'plaivra_reviewed_phase4b') as published_phase4b_v2_mapping_count,
  (select count(*) from public.exercise_muscle_mapping_entries entry join public.exercise_muscle_mapping_sets mapping on mapping.id = entry.mapping_set_id where mapping.schema_version = 'exercise_muscle_mapping_v2' and mapping.status = 'published' and mapping.source = 'plaivra_reviewed_phase4b') as published_phase4b_v2_entry_count,
  (select count(*) from public.workout_session_muscle_snapshots where mapping_schema_version = 'exercise_muscle_mapping_v2') as v2_snapshot_count,
  (select migration_version from public.release_schema_compatibility where singleton = true) as compatibility_marker;

rollback;
