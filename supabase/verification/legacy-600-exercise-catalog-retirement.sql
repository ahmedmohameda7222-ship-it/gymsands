begin;

do $verification$
declare
  remaining_count bigint;
begin
  select count(*) into remaining_count
  from public.exercises
  where source = 'plaivra_legacy_workouts';
  if remaining_count <> 0 then
    raise exception 'Expected zero retired legacy canonical exercises, found %.', remaining_count;
  end if;

  select count(*) into remaining_count
  from public.workouts
  where notes ilike 'Real FitLife exercise library seed%';
  if remaining_count <> 0 then
    raise exception 'Expected zero retired legacy workouts, found %.', remaining_count;
  end if;

  select count(*) into remaining_count
  from public.exercise_library
  where notes ilike 'Real FitLife exercise library seed%';
  if remaining_count <> 0 then
    raise exception 'Expected zero retired legacy exercise_library rows, found %.', remaining_count;
  end if;

  if exists (
    select 1
    from public.exercises exercise
    left join public.workouts workout on workout.id = exercise.legacy_workout_id
    where exercise.source = 'plaivra_legacy_workouts'
       or workout.notes ilike 'Real FitLife exercise library seed%'
  ) then
    raise exception 'Legacy exercise/workout provenance remained after retirement.';
  end if;
end
$verification$;

rollback;
