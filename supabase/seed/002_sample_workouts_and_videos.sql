-- FitLife Hub manual demo workouts.
-- Safe to re-run: inserts only app-owned starter rows that do not already exist.

begin;

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
values
  ('Bodyweight Squat', 'Strength', 'Quads', 'Bodyweight', 'Beginner', 3, '10-15', 60, 'Stand tall, sit hips down and back, keep knees tracking over toes, then stand with control.', 'manual_demo', true),
  ('Incline Push-Up', 'Strength', 'Chest', 'Bodyweight', 'Beginner', 3, '8-12', 60, 'Place hands on a bench, brace, lower chest toward the surface, then press back up smoothly.', 'manual_demo', true),
  ('Dumbbell Romanian Deadlift', 'Strength', 'Hamstrings', 'Dumbbell', 'Beginner', 3, '8-12', 75, 'Hold dumbbells close, hinge from the hips, keep a neutral spine, then drive hips forward to stand.', 'manual_demo', true),
  ('Seated Cable Row', 'Strength', 'Back', 'Cable', 'Beginner', 3, '10-12', 75, 'Sit tall, pull toward your lower ribs, pause briefly, then return with control.', 'manual_demo', true),
  ('Plank', 'Core', 'Core', 'Bodyweight', 'Beginner', 3, '30-45 seconds', 60, 'Keep elbows under shoulders and hold a straight line while breathing steadily.', 'manual_demo', true)
on conflict do nothing;

commit;
