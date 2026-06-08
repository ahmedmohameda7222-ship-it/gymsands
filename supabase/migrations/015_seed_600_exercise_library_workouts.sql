create extension if not exists "pgcrypto";

create temporary table tmp_fitlife_exercise_seed on commit drop as
with muscle_movements(muscle, movements) as (
  values
    ('Chest', array['Press','Fly','Push-Up','Incline Press','Decline Press','Pullover','Squeeze Press','Chest Dip','Floor Press','Around-the-World']),
    ('Back', array['Row','Pulldown','Pull-Up','Reverse Fly','Straight-Arm Pulldown','Shrug','High Row','Low Row','Back Extension','Scapular Retraction']),
    ('Shoulders', array['Shoulder Press','Lateral Raise','Front Raise','Rear Delt Fly','Upright Row','Arnold Press','Face Pull','Y Raise','External Rotation','Cuban Press']),
    ('Biceps', array['Curl','Hammer Curl','Preacher Curl','Concentration Curl','Incline Curl','Reverse Curl','Spider Curl','Drag Curl','Zottman Curl','Bayesian Curl']),
    ('Triceps', array['Extension','Pushdown','Overhead Extension','Skull Crusher','Close-Grip Press','Kickback','Dip','JM Press','Cross-Body Extension','Tate Press']),
    ('Quads', array['Squat','Front Squat','Split Squat','Lunge','Step-Up','Leg Extension','Hack Squat','Goblet Squat','Sissy Squat','Wall Sit']),
    ('Hamstrings', array['Romanian Deadlift','Leg Curl','Good Morning','Hip Hinge','Single-Leg Deadlift','Nordic Curl','Glute-Ham Raise','Pull-Through','Hamstring Walkout','Stability Curl']),
    ('Glutes', array['Hip Thrust','Glute Bridge','Kickback','Abduction','Bulgarian Split Squat','Reverse Lunge','Step-Up','Frog Pump','Cable Pull-Through','Curtsy Lunge']),
    ('Calves', array['Standing Calf Raise','Seated Calf Raise','Donkey Calf Raise','Single-Leg Calf Raise','Calf Press','Tibialis Raise','Jump Rope','Farmer Calf Walk','Paused Calf Raise','Bent-Knee Calf Raise']),
    ('Abs', array['Crunch','Reverse Crunch','Plank','Side Plank','Dead Bug','Leg Raise','Cable Crunch','Pallof Press','Russian Twist','Mountain Climber']),
    ('Full Body', array['Burpee','Thruster','Clean','Snatch','Farmer Carry','Turkish Get-Up','Bear Crawl','Man Maker','Renegade Row','Kettlebell Swing']),
    ('Cardio', array['Intervals','Steady Ride','Hill Climb','Row Sprint','Sled Push','Battle Rope','Stair Climb','Sprint Drill','Shadow Boxing','Conditioning Circuit'])
), equipment_options(equipment, difficulty, sets, reps, rest_seconds) as (
  values
    ('Bodyweight','Beginner',3,'10-15',60),
    ('Dumbbell','Beginner',3,'8-12',75),
    ('Barbell','Intermediate',4,'6-10',120),
    ('Cable','Beginner',3,'10-15',75),
    ('Machine','Beginner',3,'10-12',90)
), expanded as (
  select
    muscle,
    movement,
    equipment,
    difficulty,
    sets,
    reps,
    rest_seconds
  from muscle_movements
  cross join lateral unnest(movements) as movement
  cross join equipment_options
)
select
  format('%s %s %s', equipment, muscle, movement) as name,
  case
    when muscle = 'Cardio' then 'Cardio'
    when muscle in ('Abs', 'Full Body') then 'Conditioning'
    else 'Strength'
  end as category,
  muscle as target_muscle,
  equipment,
  difficulty,
  sets,
  reps,
  rest_seconds,
  format('Set up for the %s %s %s. Warm up first, brace your core, move through a pain-free range of motion, control the lowering phase, and stop if technique breaks down.', equipment, muscle, movement) as instructions,
  format('Seeded FitLife exercise library item. Primary muscle: %s. Equipment: %s.', muscle, equipment) as notes,
  true as is_global;

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
from tmp_fitlife_exercise_seed seed
where not exists (
  select 1
  from public.workouts existing
  where lower(existing.name) = lower(seed.name)
    and lower(existing.target_muscle) = lower(seed.target_muscle)
    and lower(existing.equipment) = lower(seed.equipment)
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
from tmp_fitlife_exercise_seed seed
where not exists (
  select 1
  from public.exercise_library existing
  where lower(existing.exercise_name) = lower(seed.name)
    and lower(coalesce(existing.target_muscle, '')) = lower(seed.target_muscle)
    and lower(coalesce(existing.equipment, '')) = lower(seed.equipment)
);
