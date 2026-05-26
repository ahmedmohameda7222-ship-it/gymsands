alter type public.workout_session_status add value if not exists 'skipped';

alter table public.workout_sessions
  add column if not exists workout_category text;

alter table public.workout_sessions
  add column if not exists skipped_at timestamptz;

alter table public.exercise_logs
  add column if not exists exercise_category text;

create index if not exists idx_workout_sessions_user_status_started
on public.workout_sessions(user_id, status, started_at desc);

create index if not exists idx_workout_sessions_user_plan_started
on public.workout_sessions(user_id, plan_day_id, started_at desc);
