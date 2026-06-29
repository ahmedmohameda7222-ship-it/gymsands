-- Plaivra deterministic reference data. No user or permission data is created.

-- ===== Consolidated source: 016_seed_real_600_exercise_library.sql =====

create extension if not exists "pgcrypto";

-- Replaces generated combination seed with 600 real exercise names.
-- Distribution: 10 muscle groups x 60 exercises each = 600 library exercises.

delete from public.workouts
where notes ilike 'Seeded FitLife exercise library item%';

delete from public.exercise_library
where notes ilike 'Seeded FitLife exercise library item%';

create temporary table tmp_fitlife_real_exercise_seed on commit drop as
with real_exercises(target_muscle, exercise_names) as (
  values
    ('Chest', array['Barbell Bench Press','Dumbbell Bench Press','Incline Barbell Bench Press','Incline Dumbbell Bench Press','Decline Barbell Bench Press','Decline Dumbbell Bench Press','Close-Grip Bench Press','Wide-Grip Bench Press','Paused Bench Press','Tempo Bench Press','Smith Machine Bench Press','Smith Machine Incline Press','Machine Chest Press','Machine Incline Chest Press','Hammer Strength Chest Press','Hammer Strength Incline Press','Cable Chest Press','Single-Arm Cable Chest Press','Dumbbell Floor Press','Barbell Floor Press','Push-Up','Decline Push-Up','Incline Push-Up','Diamond Push-Up','Wide Push-Up','Weighted Push-Up','Plyometric Push-Up','Archer Push-Up','Ring Push-Up','Deficit Push-Up','Chest Dip','Weighted Chest Dip','Assisted Chest Dip','Machine Chest Dip','Dumbbell Fly','Incline Dumbbell Fly','Decline Dumbbell Fly','Cable Fly','Low Cable Fly','High Cable Fly','Pec Deck Fly','Machine Fly','Single-Arm Pec Deck Fly','Standing Cable Fly','Dumbbell Pullover','Cable Pullover','Plate Squeeze Press','Dumbbell Squeeze Press','Landmine Chest Press','Single-Arm Landmine Press','Guillotine Press','Larsen Press','Spoto Press','Board Press','Reverse-Grip Bench Press','Swiss Bar Bench Press','Medicine Ball Chest Pass','Resistance Band Chest Press','Resistance Band Fly','TRX Chest Press']),
    ('Back', array['Pull-Up','Weighted Pull-Up','Assisted Pull-Up','Chin-Up','Neutral-Grip Pull-Up','Wide-Grip Pull-Up','Close-Grip Pull-Up','Commando Pull-Up','Archer Pull-Up','Scapular Pull-Up','Lat Pulldown','Wide-Grip Lat Pulldown','Close-Grip Lat Pulldown','Neutral-Grip Lat Pulldown','Single-Arm Lat Pulldown','Reverse-Grip Lat Pulldown','Straight-Arm Cable Pulldown','Cable Pullover','Machine Pullover','Dumbbell Pullover','Barbell Bent-Over Row','Pendlay Row','Yates Row','Dumbbell Row','Single-Arm Dumbbell Row','Chest-Supported Dumbbell Row','Incline Bench Dumbbell Row','Seal Row','T-Bar Row','Landmine Row','Meadows Row','Cable Row','Seated Cable Row','Single-Arm Cable Row','Wide-Grip Cable Row','Machine Row','Chest-Supported Machine Row','Hammer Strength Row','High Row Machine','Low Row Machine','Inverted Row','TRX Row','Ring Row','Smith Machine Row','Renegade Row','Kettlebell Row','Resistance Band Row','Resistance Band Pulldown','Back Extension','Reverse Hyperextension','Good Morning','Rack Pull','Deadlift','Deficit Deadlift','Snatch-Grip Deadlift','Trap Bar Deadlift','Farmer Carry','Suitcase Carry','Face Pull','Prone Y Raise']),
    ('Shoulders', array['Barbell Overhead Press','Standing Military Press','Seated Barbell Shoulder Press','Dumbbell Shoulder Press','Seated Dumbbell Shoulder Press','Arnold Press','Single-Arm Dumbbell Press','Neutral-Grip Dumbbell Press','Machine Shoulder Press','Smith Machine Shoulder Press','Landmine Press','Half-Kneeling Landmine Press','Single-Arm Landmine Press','Push Press','Bradford Press','Behind-the-Neck Press','Z Press','Kettlebell Press','Bottoms-Up Kettlebell Press','Resistance Band Shoulder Press','Dumbbell Lateral Raise','Cable Lateral Raise','Machine Lateral Raise','Lean-Away Lateral Raise','Single-Arm Lateral Raise','Seated Lateral Raise','Partial Lateral Raise','Plate Lateral Raise','Resistance Band Lateral Raise','Behind-the-Back Cable Lateral Raise','Dumbbell Front Raise','Cable Front Raise','Plate Front Raise','Barbell Front Raise','Alternating Front Raise','Incline Front Raise','Dumbbell Rear Delt Fly','Cable Rear Delt Fly','Reverse Pec Deck','Chest-Supported Rear Delt Raise','Bent-Over Rear Delt Raise','Face Pull','Cable Face Pull','Band Face Pull','High Pull','Upright Row','Cable Upright Row','Dumbbell Upright Row','Barbell Shrug','Dumbbell Shrug','Cable Shrug','Trap Bar Shrug','Scaption Raise','Prone Y Raise','Prone T Raise','Cuban Press','External Rotation','Cable External Rotation','Band External Rotation','Wall Slide']),
    ('Biceps', array['Barbell Curl','EZ-Bar Curl','Dumbbell Curl','Alternating Dumbbell Curl','Seated Dumbbell Curl','Standing Dumbbell Curl','Incline Dumbbell Curl','Hammer Curl','Cross-Body Hammer Curl','Rope Hammer Curl','Preacher Curl','EZ-Bar Preacher Curl','Dumbbell Preacher Curl','Machine Preacher Curl','Spider Curl','Concentration Curl','Cable Curl','Straight-Bar Cable Curl','Rope Cable Curl','Single-Arm Cable Curl','Bayesian Cable Curl','High Cable Curl','Overhead Cable Curl','Reverse Curl','EZ-Bar Reverse Curl','Dumbbell Reverse Curl','Zottman Curl','Drag Curl','Barbell Drag Curl','Dumbbell Drag Curl','Cheat Curl','21s Curl','Wide-Grip Barbell Curl','Close-Grip Barbell Curl','Scott Curl','Machine Curl','Standing Machine Curl','Resistance Band Curl','TRX Biceps Curl','Ring Biceps Curl','Chin-Up','Close-Grip Chin-Up','Weighted Chin-Up','Isometric Chin-Up Hold','Towel Curl','Plate Curl','Kettlebell Curl','Bottoms-Up Kettlebell Curl','Cable Bayesian Hammer Curl','Incline Hammer Curl','Prone Incline Curl','Supinating Dumbbell Curl','No-Money Curl','Lying Cable Curl','Seated Cable Curl','Arm Blaster Curl','Single-Arm Preacher Curl','Reverse-Grip Cable Curl','Fat-Grip Curl','Tempo Dumbbell Curl']),
    ('Triceps', array['Close-Grip Bench Press','Weighted Dip','Bench Dip','Assisted Dip','Machine Dip','Triceps Pushdown','Rope Triceps Pushdown','Straight-Bar Pushdown','V-Bar Pushdown','Reverse-Grip Pushdown','Overhead Cable Triceps Extension','Rope Overhead Extension','Single-Arm Cable Extension','Cable Kickback','Dumbbell Kickback','Single-Arm Dumbbell Kickback','Dumbbell Overhead Extension','Single-Arm Overhead Dumbbell Extension','Seated Dumbbell Triceps Extension','EZ-Bar Overhead Extension','Skull Crusher','EZ-Bar Skull Crusher','Dumbbell Skull Crusher','Incline Skull Crusher','Decline Skull Crusher','Cable Skull Crusher','JM Press','Tate Press','PJR Pullover','Rolling Dumbbell Extension','Diamond Push-Up','Close-Grip Push-Up','Triceps Push-Up','Ring Triceps Extension','TRX Triceps Extension','Bodyweight Triceps Extension','Resistance Band Pushdown','Resistance Band Overhead Extension','Smith Machine Close-Grip Press','Floor Press Close-Grip','Board Press Close-Grip','Pin Press Close-Grip','French Press','Lying French Press','Cross-Body Cable Extension','Cross-Body Dumbbell Extension','Machine Triceps Extension','Dip Machine Pressdown','Kickback Machine','Reverse-Grip Bench Press','Neutral-Grip Dumbbell Press','Cable Pressdown Burnout','One-Arm Rope Pushdown','Kneeling Cable Extension','High Cable Triceps Extension','Decline Close-Grip Push-Up','Medicine Ball Close-Grip Push-Up','Plate Overhead Extension','Kettlebell Triceps Extension','Paused Close-Grip Bench Press']),
    ('Quads', array['Back Squat','Front Squat','High-Bar Squat','Low-Bar Squat','Pause Squat','Tempo Squat','Box Squat','Pin Squat','Anderson Squat','Goblet Squat','Dumbbell Goblet Squat','Heels-Elevated Goblet Squat','Zercher Squat','Safety Bar Squat','Smith Machine Squat','Hack Squat','Machine Hack Squat','Leg Press','Single-Leg Press','Narrow-Stance Leg Press','Leg Extension','Single-Leg Extension','Sissy Squat','Spanish Squat','Wall Sit','Cyclist Squat','Split Squat','Bulgarian Split Squat','Front-Foot Elevated Split Squat','Rear-Foot Elevated Split Squat','Walking Lunge','Forward Lunge','Reverse Lunge','Deficit Reverse Lunge','Dumbbell Lunge','Barbell Lunge','Step-Up','High Step-Up','Lateral Step-Up','Peterson Step-Up','Poliquin Step-Up','Cossack Squat','Lateral Lunge','Curtsy Lunge','Pistol Squat','Assisted Pistol Squat','Skater Squat','Landmine Squat','Landmine Hack Squat','Belt Squat','Machine Belt Squat','Trap Bar Squat','Kettlebell Front Rack Squat','Double Kettlebell Squat','Dumbbell Front Squat','Jump Squat','Split Squat Jump','Sled Push','Backward Sled Drag','Terminal Knee Extension']),
    ('Hamstrings', array['Romanian Deadlift','Barbell Romanian Deadlift','Dumbbell Romanian Deadlift','Single-Leg Romanian Deadlift','B-Stance Romanian Deadlift','Stiff-Leg Deadlift','Deficit Romanian Deadlift','Good Morning','Seated Good Morning','Safety Bar Good Morning','Conventional Deadlift','Sumo Deadlift','Trap Bar Deadlift','Rack Pull','Block Pull','Cable Pull-Through','Kettlebell Swing','Dumbbell Swing','Hip Hinge Drill','Hamstring Walkout','Lying Leg Curl','Seated Leg Curl','Standing Leg Curl','Single-Leg Curl','Nordic Hamstring Curl','Assisted Nordic Curl','Glute-Ham Raise','Machine Glute-Ham Raise','Stability Ball Leg Curl','Slider Leg Curl','TRX Hamstring Curl','Band Leg Curl','Cable Leg Curl','Prone Dumbbell Leg Curl','Reverse Hyperextension','45-Degree Back Extension','Back Extension Hamstring Bias','Single-Leg Back Extension','Kettlebell Romanian Deadlift','Landmine Romanian Deadlift','Smith Machine Romanian Deadlift','Smith Machine Good Morning','Barbell Hip Hinge','Dumbbell Good Morning','Pull-Through with Rope','Sled Drag Forward Lean','Treadmill Hamstring Walk','Partner Nordic Curl','Eccentric Leg Curl','Tempo Romanian Deadlift','Pause Romanian Deadlift','Snatch-Grip Romanian Deadlift','Wide-Stance Romanian Deadlift','Long-Lever Bridge','Single-Leg Long-Lever Bridge','Hamstring Bridge March','Cable Romanian Deadlift','Band Romanian Deadlift','Swiss Ball Hip Lift and Curl','Reverse Plank Leg Lift']),
    ('Glutes', array['Barbell Hip Thrust','Dumbbell Hip Thrust','Machine Hip Thrust','Smith Machine Hip Thrust','Single-Leg Hip Thrust','B-Stance Hip Thrust','Pause Hip Thrust','Banded Hip Thrust','Glute Bridge','Barbell Glute Bridge','Dumbbell Glute Bridge','Single-Leg Glute Bridge','Frog Pump','Banded Frog Pump','Cable Pull-Through','Kettlebell Swing','Dumbbell Romanian Deadlift','Barbell Romanian Deadlift','Sumo Deadlift','Trap Bar Deadlift','Bulgarian Split Squat','Reverse Lunge','Walking Lunge','Curtsy Lunge','Deficit Reverse Lunge','Step-Up','High Step-Up','Lateral Step-Up','Cable Kickback','Machine Glute Kickback','Banded Kickback','Quadruped Hip Extension','Donkey Kick','Fire Hydrant','Cable Hip Abduction','Machine Hip Abduction','Banded Hip Abduction','Side-Lying Hip Abduction','Clamshell','Banded Clamshell','Monster Walk','Lateral Band Walk','Seated Band Abduction','Standing Hip Abduction','Smith Machine Reverse Lunge','Landmine Reverse Lunge','Landmine Hip Thrust','Kneeling Squat','Sumo Squat','Goblet Sumo Squat','Box Squat Glute Bias','Belt Squat Glute Bias','Sled Push','Backward Sled Drag','Hip Airplane','Single-Leg Box Squat','Cable Romanian Deadlift','45-Degree Back Extension Glute Bias','Reverse Hyperextension Glute Bias','Glute-Focused Leg Press']),
    ('Calves', array['Standing Calf Raise','Seated Calf Raise','Machine Standing Calf Raise','Machine Seated Calf Raise','Smith Machine Calf Raise','Barbell Calf Raise','Dumbbell Calf Raise','Single-Leg Calf Raise','Single-Leg Dumbbell Calf Raise','Donkey Calf Raise','Leg Press Calf Press','Single-Leg Leg Press Calf Press','Hack Squat Calf Raise','Calf Raise on Step','Paused Calf Raise','Tempo Calf Raise','Deficit Calf Raise','Bent-Knee Calf Raise','Straight-Knee Calf Raise','Farmer Walk on Toes','Tiptoe Farmer Carry','Jump Rope','Pogo Jump','Single-Leg Pogo Jump','Line Hop','Box Jump Calf Landing','Stair Calf Raise','Treadmill Incline Walk','Hill Sprint','Sled Push Calf Drive','Tibialis Raise','Wall Tibialis Raise','Dumbbell Tibialis Raise','Tib Bar Raise','Band Tibialis Raise','Seated Toe Raise','Standing Toe Raise','Heel Walk','Toe Walk','Ankle Hop','Resistance Band Plantar Flexion','Resistance Band Dorsiflexion','Resistance Band Inversion','Resistance Band Eversion','Calf Press Machine','Iso Calf Raise Hold','Single-Leg Iso Calf Hold','Eccentric Calf Raise','Bent-Knee Eccentric Calf Raise','Soleus Raise','Donkey Calf Raise Machine','Smith Machine Single-Leg Calf Raise','Kettlebell Calf Raise','Plate-Loaded Calf Raise','Cable Calf Raise','Cable Tibialis Raise','Skater Hop','Lateral Line Hop','Depth Drop to Calf Raise','Marching Calf Raise']),
    ('Core', array['Plank','RKC Plank','Long-Lever Plank','Side Plank','Side Plank Hip Dip','Copenhagen Plank','Reverse Plank','Hollow Body Hold','Dead Bug','Bird Dog','Crunch','Reverse Crunch','Bicycle Crunch','Cross-Body Crunch','Cable Crunch','Kneeling Cable Crunch','Machine Crunch','Stability Ball Crunch','Decline Sit-Up','Weighted Sit-Up','Hanging Leg Raise','Hanging Knee Raise','Captain Chair Knee Raise','Lying Leg Raise','Reverse Leg Raise','Flutter Kick','Scissor Kick','V-Up','Tuck-Up','Toe Touch','Ab Wheel Rollout','Barbell Rollout','Stability Ball Rollout','TRX Fallout','Body Saw','Mountain Climber','Cross-Body Mountain Climber','Bear Crawl','Dead Bug Pullover','Hollow Rock','Russian Twist','Cable Woodchop','Low-to-High Cable Chop','High-to-Low Cable Chop','Pallof Press','Half-Kneeling Pallof Press','Standing Pallof Press','Landmine Rotation','Medicine Ball Slam','Medicine Ball Rotational Throw','Suitcase Carry','Farmer Carry','Overhead Carry','Waiter Carry','Front Rack Carry','Turkish Get-Up','Kettlebell Windmill','Dumbbell Side Bend','Cable Side Bend','Dragon Flag'])
), expanded as (
  select
    target_muscle,
    exercise_name,
    row_number() over (partition by target_muscle order by ordinality) as muscle_index
  from real_exercises
  cross join lateral unnest(exercise_names) with ordinality as item(exercise_name, ordinality)
)
select
  exercise_name as name,
  case when target_muscle = 'Core' then 'Core' else 'Strength' end as category,
  target_muscle,
  case
    when exercise_name ilike '%Cable%' then 'Cable'
    when exercise_name ilike '%Dumbbell%' then 'Dumbbell'
    when exercise_name ilike '%Barbell%' then 'Barbell'
    when exercise_name ilike '%Kettlebell%' then 'Kettlebell'
    when exercise_name ilike '%Smith Machine%' then 'Machine'
    when exercise_name ilike '%Machine%' then 'Machine'
    when exercise_name ilike '%Hammer Strength%' then 'Machine'
    when exercise_name ilike '%Hack Squat%' then 'Machine'
    when exercise_name ilike '%Leg Press%' then 'Machine'
    when exercise_name ilike '%Pec Deck%' then 'Machine'
    when exercise_name ilike '%Resistance Band%' then 'Resistance Band'
    when exercise_name ilike '%Banded%' then 'Resistance Band'
    when exercise_name ilike '%Band %' then 'Resistance Band'
    when exercise_name ilike '%TRX%' then 'Suspension Trainer'
    when exercise_name ilike '%Ring%' then 'Gymnastic Rings'
    when exercise_name ilike '%Landmine%' then 'Barbell'
    when exercise_name ilike '%Sled%' then 'Sled'
    when exercise_name ilike '%Medicine Ball%' then 'Medicine Ball'
    when exercise_name ilike '%Stability Ball%' then 'Stability Ball'
    when exercise_name ilike '%Swiss Ball%' then 'Stability Ball'
    when exercise_name ilike '%Plate%' then 'Plate'
    else 'Bodyweight'
  end as equipment,
  case
    when exercise_name ilike '%Single-Leg%' or exercise_name ilike '%Archer%' or exercise_name ilike '%Dragon Flag%' or exercise_name ilike '%Nordic%' or exercise_name ilike '%Pistol%' then 'Advanced'
    when exercise_name ilike '%Barbell%' or exercise_name ilike '%Deadlift%' or exercise_name ilike '%Snatch%' or exercise_name ilike '%Clean%' or exercise_name ilike '%Turkish Get-Up%' then 'Intermediate'
    else 'Beginner'
  end as difficulty,
  case
    when target_muscle = 'Core' then 3
    when exercise_name ilike '%Deadlift%' or exercise_name ilike '%Squat%' or exercise_name ilike '%Bench Press%' or exercise_name ilike '%Overhead Press%' then 4
    else 3
  end as sets,
  case
    when target_muscle = 'Core' and (exercise_name ilike '%Plank%' or exercise_name ilike '%Hold%' or exercise_name ilike '%Carry%') then '30-60 seconds'
    when target_muscle = 'Core' then '10-20'
    when exercise_name ilike '%Calf%' or target_muscle = 'Calves' then '12-20'
    when exercise_name ilike '%Deadlift%' or exercise_name ilike '%Squat%' or exercise_name ilike '%Bench Press%' or exercise_name ilike '%Overhead Press%' then '5-8'
    else '8-12'
  end as reps,
  case
    when exercise_name ilike '%Deadlift%' or exercise_name ilike '%Squat%' or exercise_name ilike '%Bench Press%' or exercise_name ilike '%Overhead Press%' then 120
    when target_muscle = 'Core' then 45
    else 75
  end as rest_seconds,
  format('Perform %s with controlled form. Warm up first, brace your core, use a pain-free range of motion, control the eccentric phase, and stop if technique breaks down.', exercise_name) as instructions,
  format('Real FitLife exercise library seed. Muscle group: %s. Item %s of 60.', target_muscle, muscle_index) as notes,
  true as is_global
from expanded;

insert into public.workouts (
  name,
  category,
  target_muscle,
  equipment,
  difficulty,
  sets,
  reps,
  rest_seconds,
  instructions,
  notes,
  is_global
)
select
  name,
  category,
  target_muscle,
  equipment,
  difficulty,
  sets,
  reps,
  rest_seconds,
  instructions,
  notes,
  is_global
from tmp_fitlife_real_exercise_seed seed
where not exists (
  select 1
  from public.workouts existing
  where lower(existing.name) = lower(seed.name)
    and lower(existing.target_muscle) = lower(seed.target_muscle)
);

insert into public.exercise_library (
  exercise_name,
  category,
  target_muscle,
  equipment,
  difficulty,
  instructions,
  notes,
  is_global
)
select
  name,
  category,
  target_muscle,
  equipment,
  difficulty,
  instructions,
  notes,
  is_global
from tmp_fitlife_real_exercise_seed seed
where not exists (
  select 1
  from public.exercise_library existing
  where lower(existing.exercise_name) = lower(seed.name)
    and lower(coalesce(existing.target_muscle, '')) = lower(seed.target_muscle)
);

do $$
declare
  seeded_count integer;
begin
  select count(*) into seeded_count from tmp_fitlife_real_exercise_seed;
  if seeded_count <> 600 then
    raise exception 'Expected 600 FitLife exercise seed rows, got %', seeded_count;
  end if;
end $$;


-- ===== Consolidated source: 017_add_force_type_secondary_muscles_to_library.sql =====

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


-- ===== Exercise calorie reference rows =====

insert into public.exercise_calorie_reference (activity_key, display_name, category, default_intensity, met, aliases, source_note)
values
  ('walking_easy', 'Walking', 'Cardio', 'Easy', 3.00, array['walk','walking','steps'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('walking_brisk', 'Brisk walking', 'Cardio', 'Moderate', 4.30, array['brisk walk','fast walk','power walk'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('running_easy', 'Running', 'Cardio', 'Moderate', 8.30, array['run','running','jog','jogging'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('running_fast', 'Fast running', 'Cardio', 'Hard', 11.50, array['sprint','sprinting','fast run'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('cycling_easy', 'Cycling', 'Cardio', 'Moderate', 6.80, array['bike','biking','cycle','cycling'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('cycling_hard', 'Hard cycling', 'Cardio', 'Hard', 10.00, array['hard bike','hard cycling','spin bike'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('elliptical', 'Elliptical trainer', 'Cardio', 'Moderate', 5.00, array['elliptical','cross trainer'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('rowing', 'Rowing machine', 'Cardio', 'Moderate', 7.00, array['row','rowing','rower'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('swimming', 'Swimming', 'Cardio', 'Moderate', 6.00, array['swim','swimming'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('jump_rope', 'Jump rope', 'Cardio', 'Hard', 11.00, array['jump rope','skipping rope','skipping'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('stair_climber', 'Stair climber', 'Cardio', 'Hard', 8.80, array['stairs','stairmaster','stair climber'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('hiit', 'HIIT', 'Conditioning', 'Hard', 8.00, array['hiit','intervals','interval training'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('strength_training', 'Strength training', 'Strength', 'Moderate', 5.00, array['weights','lifting','weight lifting','strength workout','gym workout'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('bodyweight_training', 'Bodyweight training', 'Strength', 'Moderate', 4.00, array['calisthenics','bodyweight','pushups','pullups'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('yoga', 'Yoga', 'Mobility', 'Easy', 2.50, array['yoga','stretch yoga'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('pilates', 'Pilates', 'Mobility', 'Easy', 3.00, array['pilates'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('stretching', 'Stretching', 'Mobility', 'Easy', 2.30, array['stretch','stretching','mobility'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('football', 'Football / soccer', 'Sport', 'Hard', 7.00, array['football','soccer'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('basketball', 'Basketball', 'Sport', 'Hard', 6.50, array['basketball'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('tennis', 'Tennis', 'Sport', 'Moderate', 7.30, array['tennis'], 'Compendium-style MET estimate for general fitness tracking.')
on conflict (activity_key) do update
set display_name = excluded.display_name,
    category = excluded.category,
    default_intensity = excluded.default_intensity,
    met = excluded.met,
    aliases = excluded.aliases,
    source_note = excluded.source_note,
    is_active = true,
    updated_at = now();
