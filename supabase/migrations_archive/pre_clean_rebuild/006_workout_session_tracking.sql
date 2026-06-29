create extension if not exists "pgcrypto";

alter table public.workout_sessions
  add column if not exists plan_id uuid references public.user_workout_plans(id) on delete set null;

alter table public.workout_sessions
  add column if not exists plan_day_id uuid references public.user_workout_plan_days(id) on delete set null;

alter table public.workout_sessions
  add column if not exists workout_day_name text;

alter table public.user_workout_plan_exercises
  add column if not exists instructions text;

alter table public.user_workout_plan_exercises
  add column if not exists video_url text;

alter table public.exercise_logs
  add column if not exists plan_exercise_id uuid references public.user_workout_plan_exercises(id) on delete set null;

alter table public.exercise_logs
  add column if not exists planned_sets int check (planned_sets is null or planned_sets > 0);

alter table public.exercise_logs
  add column if not exists planned_reps text;

alter table public.exercise_logs
  add column if not exists planned_rest_seconds int check (planned_rest_seconds is null or planned_rest_seconds >= 0);

alter table public.exercise_logs
  add column if not exists completed_at timestamptz;

create index if not exists idx_workout_sessions_plan_day
on public.workout_sessions(user_id, plan_day_id, started_at desc);

create index if not exists idx_exercise_logs_session_order
on public.exercise_logs(workout_session_id, exercise_name, set_number);

create index if not exists idx_exercise_logs_plan_exercise
on public.exercise_logs(plan_exercise_id);

alter table public.workout_sessions enable row level security;
alter table public.exercise_logs enable row level security;

drop policy if exists "workout_sessions_own_all" on public.workout_sessions;

create policy "workout_sessions_own_all"
on public.workout_sessions
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "exercise_logs_own_all" on public.exercise_logs;

create policy "exercise_logs_own_all"
on public.exercise_logs
for all
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_id
    and (ws.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_id
    and (ws.user_id = auth.uid() or public.is_admin())
  )
);
