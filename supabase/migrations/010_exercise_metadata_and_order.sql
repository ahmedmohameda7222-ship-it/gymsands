alter table public.exercise_videos
  add column if not exists muscle_category text;

alter table public.exercise_videos
  add column if not exists equipment_required text;

alter table public.exercise_videos
  add column if not exists mechanics text;

alter table public.exercise_videos
  add column if not exists force_type text;

alter table public.exercise_videos
  add column if not exists experience_level text;

alter table public.exercise_videos
  add column if not exists secondary_muscles text[] not null default '{}';

alter table public.workouts
  add column if not exists muscle_category text;

alter table public.workouts
  add column if not exists equipment_required text;

alter table public.workouts
  add column if not exists mechanics text;

alter table public.workouts
  add column if not exists force_type text;

alter table public.workouts
  add column if not exists experience_level text;

alter table public.workouts
  add column if not exists secondary_muscles text[] not null default '{}';

alter table public.workouts
  add column if not exists exercise_url text;

alter table public.exercise_logs
  add column if not exists exercise_order int;

create index if not exists idx_exercise_videos_metadata
on public.exercise_videos(muscle_category, equipment_required, mechanics, force_type, experience_level);

create index if not exists idx_workouts_metadata
on public.workouts(muscle_category, equipment_required, mechanics, force_type, experience_level);

drop index if exists public.idx_exercise_logs_session_order;

create index if not exists idx_exercise_logs_session_order
on public.exercise_logs(workout_session_id, exercise_order, set_number, created_at);
