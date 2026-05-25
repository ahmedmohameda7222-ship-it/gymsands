-- S&S Gym workout video import helper.
-- Run this after importing rows into public.exercise_videos.
--
-- Expected import columns:
-- exercise_name, category_type, category, exercise_url
--
-- The muscleandstrength.com URLs are instruction pages, not direct embeddable video files.
-- S&S Gym stores them as instruction sources. If a direct YouTube, Vimeo, or hosted video URL
-- is later added in video_url, the app embeds it in the workout details page.

insert into public.workout_video_imports (status, imported_count, notes)
select
  'completed',
  count(*),
  'Materialized imported exercise_videos rows as category-browsable workouts.'
from public.exercise_videos;

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
  ev.exercise_name,
  coalesce(ev.category_type, 'Exercise') as category,
  coalesce(ev.category, 'General') as target_muscle,
  case
    when ev.category_type = 'Equipment' then coalesce(ev.category, 'Varies')
    else 'Varies'
  end as equipment,
  'Beginner' as difficulty,
  3 as sets,
  '8-12' as reps,
  75 as rest_seconds,
  coalesce(ev.instructions, 'Warm up first, keep each rep controlled, use a pain-free range of motion, and stop if you feel sharp or serious pain.') as instructions,
  ev.exercise_url as notes,
  true as is_global
from public.exercise_videos ev
where ev.is_global = true
  and not exists (
    select 1
    from public.workouts w
    where lower(w.name) = lower(ev.exercise_name)
      and lower(w.target_muscle) = lower(coalesce(ev.category, 'General'))
  );
