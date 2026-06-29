-- Adds force type, mechanics, and secondary muscles to the 600 real exercise library seed.
-- Safe to run more than once.

alter table public.workouts
  add column if not exists muscle_category text,
  add column if not exists equipment_required text,
  add column if not exists mechanics text,
  add column if not exists force_type text,
  add column if not exists experience_level text,
  add column if not exists secondary_muscles text[] not null default '{}';

alter table public.exercise_library
  add column if not exists muscle_category text,
  add column if not exists equipment_required text,
  add column if not exists mechanics text,
  add column if not exists force_type text,
  add column if not exists experience_level text,
  add column if not exists secondary_muscles text[] not null default '{}';

update public.workouts
set
  muscle_category = coalesce(muscle_category, target_muscle),
  equipment_required = coalesce(equipment_required, equipment),
  experience_level = coalesce(experience_level, difficulty),
  mechanics = case
    when name ilike any (array['%Plank%','%Hold%','%Wall Sit%','%Iso%']) then 'Isometric'
    when name ilike any (array['%Carry%','%Walk%','%Bear Crawl%']) then 'Carry / Locomotion'
    when name ilike any (array['%Fly%','%Raise%','%Curl%','%Extension%','%Kickback%','%Pushdown%','%Pulldown%','%Crunch%','%Leg Raise%','%Calf Raise%','%Abduction%','%Adduction%']) then 'Isolation'
    when name ilike any (array['%Rotation%','%Twist%','%Woodchop%','%Windmill%']) then 'Rotational'
    else 'Compound'
  end,
  force_type = case
    when name ilike any (array['%Plank%','%Hold%','%Wall Sit%','%Iso%']) then 'Static'
    when name ilike any (array['%Carry%','%Farmer%','%Suitcase%','%Waiter%','%Overhead Carry%','%Bear Crawl%']) then 'Carry'
    when name ilike any (array['%Rotation%','%Twist%','%Woodchop%','%Windmill%']) then 'Rotational'
    when target_muscle in ('Chest','Triceps','Quads','Calves') then 'Push'
    when target_muscle in ('Back','Biceps','Hamstrings') then 'Pull'
    when target_muscle in ('Shoulders') and name ilike any (array['%Raise%','%Rear Delt%','%Face Pull%','%Upright Row%','%Shrug%','%External Rotation%']) then 'Pull'
    when target_muscle in ('Shoulders') then 'Push'
    when target_muscle in ('Glutes') and name ilike any (array['%Romanian Deadlift%','%Deadlift%','%Pull-Through%','%Swing%','%Back Extension%','%Reverse Hyperextension%']) then 'Pull'
    when target_muscle in ('Glutes') then 'Push'
    when target_muscle = 'Core' then 'Static / Anti-Movement'
    else 'Mixed'
  end,
  secondary_muscles = case
    when target_muscle = 'Chest' and name ilike any (array['%Fly%','%Pullover%']) then array['Front Delts','Serratus Anterior','Biceps']
    when target_muscle = 'Chest' then array['Triceps','Front Delts','Serratus Anterior']
    when target_muscle = 'Back' and name ilike any (array['%Deadlift%','%Rack Pull%','%Good Morning%','%Back Extension%']) then array['Glutes','Hamstrings','Erector Spinae']
    when target_muscle = 'Back' and name ilike any (array['%Face Pull%','%Y Raise%','%Reverse Fly%']) then array['Rear Delts','Mid Traps','Rotator Cuff']
    when target_muscle = 'Back' then array['Biceps','Rear Delts','Forearms']
    when target_muscle = 'Shoulders' and name ilike any (array['%Rear Delt%','%Face Pull%','%External Rotation%','%Cuban%']) then array['Upper Back','Mid Traps','Rotator Cuff']
    when target_muscle = 'Shoulders' and name ilike any (array['%Press%','%Push Press%']) then array['Triceps','Upper Chest','Upper Traps']
    when target_muscle = 'Shoulders' then array['Upper Traps','Rotator Cuff','Serratus Anterior']
    when target_muscle = 'Biceps' and name ilike any (array['%Hammer%','%Reverse%','%Zottman%']) then array['Brachialis','Brachioradialis','Forearms']
    when target_muscle = 'Biceps' and name ilike any (array['%Chin-Up%']) then array['Lats','Forearms','Upper Back']
    when target_muscle = 'Biceps' then array['Brachialis','Forearms','Front Delts']
    when target_muscle = 'Triceps' and name ilike any (array['%Bench%','%Dip%','%Push-Up%','%Press%']) then array['Chest','Front Delts','Serratus Anterior']
    when target_muscle = 'Triceps' then array['Forearms','Shoulders','Anconeus']
    when target_muscle = 'Quads' and name ilike any (array['%Sled%','%Lunge%','%Split Squat%','%Step-Up%']) then array['Glutes','Hamstrings','Calves']
    when target_muscle = 'Quads' then array['Glutes','Adductors','Core']
    when target_muscle = 'Hamstrings' and name ilike any (array['%Leg Curl%','%Nordic%','%Glute-Ham%']) then array['Calves','Glutes','Erector Spinae']
    when target_muscle = 'Hamstrings' then array['Glutes','Lower Back','Adductors']
    when target_muscle = 'Glutes' and name ilike any (array['%Abduction%','%Clamshell%','%Monster Walk%','%Lateral Band Walk%']) then array['Glute Medius','Hip External Rotators','Core']
    when target_muscle = 'Glutes' then array['Hamstrings','Quads','Core']
    when target_muscle = 'Calves' and name ilike any (array['%Tibialis%','%Toe Raise%','%Dorsiflexion%','%Heel Walk%']) then array['Peroneals','Foot Intrinsics','Anterior Shin']
    when target_muscle = 'Calves' then array['Soleus','Tibialis Posterior','Foot Intrinsics']
    when target_muscle = 'Core' and name ilike any (array['%Side%','%Copenhagen%','%Woodchop%','%Rotation%','%Twist%','%Windmill%','%Side Bend%']) then array['Obliques','Transverse Abdominis','Hip Stabilizers']
    when target_muscle = 'Core' and name ilike any (array['%Leg Raise%','%Knee Raise%','%Flutter%','%Scissor%']) then array['Hip Flexors','Lower Abs','Quads']
    when target_muscle = 'Core' and name ilike any (array['%Carry%','%Turkish Get-Up%']) then array['Obliques','Shoulders','Glutes']
    when target_muscle = 'Core' then array['Obliques','Hip Flexors','Lower Back']
    else array['Core','Stabilizers']
  end,
  notes = case
    when notes ilike '%Force type:%' then notes
    else concat(coalesce(notes, ''), ' Force type: ', case
      when name ilike any (array['%Plank%','%Hold%','%Wall Sit%','%Iso%']) then 'Static'
      when name ilike any (array['%Carry%','%Farmer%','%Suitcase%','%Waiter%','%Overhead Carry%','%Bear Crawl%']) then 'Carry'
      when name ilike any (array['%Rotation%','%Twist%','%Woodchop%','%Windmill%']) then 'Rotational'
      when target_muscle in ('Chest','Triceps','Quads','Calves') then 'Push'
      when target_muscle in ('Back','Biceps','Hamstrings') then 'Pull'
      else 'Mixed'
    end, '.')
  end
where target_muscle in ('Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core')
  and is_global = true
  and (
    notes ilike 'Real FitLife exercise library seed%'
    or notes ilike 'Seeded FitLife exercise library item%'
    or secondary_muscles = '{}'
    or force_type is null
  );

update public.exercise_library el
set
  muscle_category = coalesce(el.muscle_category, w.muscle_category),
  equipment_required = coalesce(el.equipment_required, w.equipment_required),
  experience_level = coalesce(el.experience_level, w.experience_level),
  mechanics = w.mechanics,
  force_type = w.force_type,
  secondary_muscles = w.secondary_muscles,
  notes = case
    when el.notes ilike '%Force type:%' then el.notes
    else concat(coalesce(el.notes, ''), ' Force type: ', w.force_type, '.')
  end
from public.workouts w
where lower(el.exercise_name) = lower(w.name)
  and lower(coalesce(el.target_muscle, '')) = lower(coalesce(w.target_muscle, ''))
  and w.is_global = true
  and w.target_muscle in ('Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core')
  and (
    el.notes ilike 'Real FitLife exercise library seed%'
    or el.notes ilike 'Seeded FitLife exercise library item%'
    or el.secondary_muscles = '{}'
    or el.force_type is null
  );

do $$
declare
  missing_workouts integer;
  missing_library integer;
begin
  select count(*) into missing_workouts
  from public.workouts
  where is_global = true
    and target_muscle in ('Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core')
    and notes ilike 'Real FitLife exercise library seed%'
    and (force_type is null or secondary_muscles = '{}');

  select count(*) into missing_library
  from public.exercise_library
  where target_muscle in ('Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core')
    and notes ilike 'Real FitLife exercise library seed%'
    and (force_type is null or secondary_muscles = '{}');

  if missing_workouts > 0 or missing_library > 0 then
    raise exception 'Missing force_type or secondary_muscles. workouts=%, exercise_library=%', missing_workouts, missing_library;
  end if;
end $$;
