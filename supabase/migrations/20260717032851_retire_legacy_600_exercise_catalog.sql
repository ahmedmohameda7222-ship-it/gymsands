begin;

-- Retire only the generated 600-row FitLife/Plaivra legacy catalog. The
-- canonical catalog is intentionally empty until the reviewed curated cohort
-- is introduced in a later phase.
do $migration$
declare
  target_exercise_count bigint;
  target_workout_count bigint;
  target_library_count bigint;
  invalid_count bigint;
  reference_count bigint;
  linked_count bigint;
  non_target_exercises_before bigint;
  non_target_workouts_before bigint;
  non_target_library_before bigint;
  custom_exercises_before bigint;
  user_plans_before bigint;
  workout_sessions_before bigint;
  exercise_logs_before bigint;
  user_exercise_logs_before bigint;
begin
  select count(*) into target_exercise_count
  from public.exercises
  where source = 'plaivra_legacy_workouts';

  select count(*) into target_workout_count
  from public.workouts
  where notes ilike 'Real FitLife exercise library seed%';

  select count(*) into target_library_count
  from public.exercise_library
  where notes ilike 'Real FitLife exercise library seed%';

  if target_exercise_count <> 600
     or target_workout_count <> 600
     or target_library_count <> 600 then
    raise exception
      'Legacy catalog reset expected exactly 600 rows in exercises, workouts, and exercise_library; found %, %, %.',
      target_exercise_count, target_workout_count, target_library_count
      using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.exercises
  where source = 'plaivra_legacy_workouts'
    and (is_global is distinct from true
      or is_approved is distinct from true
      or legacy_workout_id is null);
  if invalid_count <> 0 then
    raise exception 'Legacy canonical exercise provenance/global/approval validation failed for % rows.', invalid_count
      using errcode = '23514';
  end if;

  select count(distinct legacy_workout_id) into linked_count
  from public.exercises
  where source = 'plaivra_legacy_workouts';
  if linked_count <> 600 then
    raise exception 'Legacy canonical exercises do not contain 600 distinct legacy_workout_id values.'
      using errcode = '23514';
  end if;

  select count(*) into linked_count
  from public.exercises exercise
  join public.workouts workout on workout.id = exercise.legacy_workout_id
  where exercise.source = 'plaivra_legacy_workouts'
    and workout.notes ilike 'Real FitLife exercise library seed%';
  if linked_count <> 600 then
    raise exception 'Legacy canonical-to-workout provenance linkage is incomplete: % of 600.', linked_count
      using errcode = '23514';
  end if;

  select count(*) into reference_count
  from public.user_workout_plan_block_items item
  join public.exercises exercise on exercise.id = item.exercise_id
  where exercise.source = 'plaivra_legacy_workouts';
  if reference_count <> 0 then
    raise exception 'Legacy catalog is referenced by % user_workout_plan_block_items rows.', reference_count
      using errcode = '23503';
  end if;

  select count(*) into reference_count
  from public.user_workout_plan_exercises item
  join public.workouts workout on workout.id = item.workout_id
  where workout.notes ilike 'Real FitLife exercise library seed%';
  if reference_count <> 0 then
    raise exception 'Legacy catalog is referenced by % user_workout_plan_exercises rows.', reference_count
      using errcode = '23503';
  end if;

  select count(*) into reference_count
  from public.workout_sessions session
  join public.workouts workout on workout.id = session.workout_id
  where workout.notes ilike 'Real FitLife exercise library seed%';
  if reference_count <> 0 then
    raise exception 'Legacy catalog is referenced by % workout_sessions rows.', reference_count
      using errcode = '23503';
  end if;

  select count(*) into reference_count
  from public.workout_exercises item
  join public.workouts workout on workout.id = item.workout_id
  where workout.notes ilike 'Real FitLife exercise library seed%';
  if reference_count <> 0 then
    raise exception 'Legacy catalog is referenced by % workout_exercises workout links.', reference_count
      using errcode = '23503';
  end if;

  select count(*) into reference_count
  from public.workout_exercises item
  join public.exercise_library exercise on exercise.id = item.exercise_id
  where exercise.notes ilike 'Real FitLife exercise library seed%';
  if reference_count <> 0 then
    raise exception 'Legacy catalog is referenced by % workout_exercises library links.', reference_count
      using errcode = '23503';
  end if;

  select count(*) into reference_count
  from public.user_exercise_favorites favorite
  join public.exercises exercise on favorite.exercise_id = exercise.id::text
  where exercise.source = 'plaivra_legacy_workouts';
  if reference_count <> 0 then
    raise exception 'Legacy catalog is referenced by % user_exercise_favorites rows.', reference_count
      using errcode = '23503';
  end if;

  select count(*) into reference_count
  from public.user_exercise_videos video
  join public.exercises exercise on video.exercise_id = exercise.id::text
  where exercise.source = 'plaivra_legacy_workouts';
  if reference_count <> 0 then
    raise exception 'Legacy catalog is referenced by % user_exercise_videos rows.', reference_count
      using errcode = '23503';
  end if;

  select count(*) into reference_count
  from public.exercise_provider_links link
  join public.exercises exercise on exercise.id = link.exercise_id
  where exercise.source = 'plaivra_legacy_workouts';
  if reference_count <> 0 then
    raise exception 'Legacy catalog is referenced by % exercise_provider_links rows.', reference_count
      using errcode = '23503';
  end if;

  select count(*) into reference_count
  from public.exercise_muscle_mapping_sets mapping_set
  join public.exercises exercise on exercise.id = mapping_set.exercise_id
  where exercise.source = 'plaivra_legacy_workouts';
  if reference_count <> 0 then
    raise exception 'Legacy catalog is referenced by % exercise_muscle_mapping_sets rows.', reference_count
      using errcode = '23503';
  end if;

  select count(*) into non_target_exercises_before
  from public.exercises
  where source is distinct from 'plaivra_legacy_workouts';
  select count(*) into non_target_workouts_before
  from public.workouts
  where notes is null or notes not ilike 'Real FitLife exercise library seed%';
  select count(*) into non_target_library_before
  from public.exercise_library
  where notes is null or notes not ilike 'Real FitLife exercise library seed%';
  select count(*) into custom_exercises_before from public.user_custom_exercises;
  select count(*) into user_plans_before from public.user_workout_plans;
  select count(*) into workout_sessions_before from public.workout_sessions;
  select count(*) into exercise_logs_before from public.exercise_logs;
  select count(*) into user_exercise_logs_before from public.user_exercise_logs;

  delete from public.exercises
  where source = 'plaivra_legacy_workouts';

  delete from public.exercise_library
  where notes ilike 'Real FitLife exercise library seed%';

  delete from public.workouts
  where notes ilike 'Real FitLife exercise library seed%';

  if exists (select 1 from public.exercises where source = 'plaivra_legacy_workouts')
     or exists (select 1 from public.workouts where notes ilike 'Real FitLife exercise library seed%')
     or exists (select 1 from public.exercise_library where notes ilike 'Real FitLife exercise library seed%') then
    raise exception 'Legacy 600-exercise catalog retirement postcondition failed.'
      using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.exercises
  where source is distinct from 'plaivra_legacy_workouts';
  if invalid_count <> non_target_exercises_before then
    raise exception 'Non-target exercises changed during legacy catalog retirement.' using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.workouts
  where notes is null or notes not ilike 'Real FitLife exercise library seed%';
  if invalid_count <> non_target_workouts_before then
    raise exception 'Non-target workouts changed during legacy catalog retirement.' using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.exercise_library
  where notes is null or notes not ilike 'Real FitLife exercise library seed%';
  if invalid_count <> non_target_library_before then
    raise exception 'Non-target exercise_library rows changed during legacy catalog retirement.' using errcode = '23514';
  end if;

  if (select count(*) from public.user_custom_exercises) <> custom_exercises_before
     or (select count(*) from public.user_workout_plans) <> user_plans_before
     or (select count(*) from public.workout_sessions) <> workout_sessions_before
     or (select count(*) from public.exercise_logs) <> exercise_logs_before
     or (select count(*) from public.user_exercise_logs) <> user_exercise_logs_before then
    raise exception 'User-owned workout or custom-exercise data changed during legacy catalog retirement.'
      using errcode = '23514';
  end if;
end
$migration$;

commit;
