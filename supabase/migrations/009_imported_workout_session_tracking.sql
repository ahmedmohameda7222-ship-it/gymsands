-- FitLife Hub does not generate or recommend workout plans internally.
-- This migration only adds imported/manual plan metadata and scheduled-session storage.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.onboarding_answers
  add column if not exists available_equipment text[] not null default '{}';

alter table public.user_workout_plans
  add column if not exists source text not null default 'manual';

alter table public.user_workout_plans
  add column if not exists program_duration_weeks int;

alter table public.user_workout_plans
  add column if not exists days_per_week int;

alter table public.user_workout_plans
  drop constraint if exists user_workout_plans_source_check;

alter table public.user_workout_plans
  add constraint user_workout_plans_source_check
  check (source in ('manual', 'chatgpt', 'imported'));

create table if not exists public.user_workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_workout_plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
  plan_day_id uuid references public.user_workout_plan_days(id) on delete set null,
  week_index int not null check (week_index > 0),
  day_index int not null check (day_index > 0),
  session_number int not null check (session_number > 0),
  scheduled_date date not null,
  day_title text not null,
  status text not null default 'scheduled',
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_workout_plan_id, week_index, day_index)
);

alter table public.user_workout_sessions
  drop constraint if exists user_workout_sessions_status_check;

alter table public.user_workout_sessions
  add constraint user_workout_sessions_status_check
  check (status in ('scheduled', 'started', 'completed', 'skipped'));

create table if not exists public.user_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_workout_session_id uuid not null references public.user_workout_sessions(id) on delete cascade,
  plan_exercise_id uuid references public.user_workout_plan_exercises(id) on delete set null,
  exercise_order int not null check (exercise_order > 0),
  exercise_name text not null,
  planned_sets text,
  planned_reps text,
  weight_kg numeric(8,2) check (weight_kg is null or weight_kg >= 0),
  reps int check (reps is null or reps >= 0),
  notes text,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_workout_session_id, exercise_order)
);

create index if not exists idx_user_workout_sessions_user_date
on public.user_workout_sessions(user_id, scheduled_date);

create index if not exists idx_user_workout_sessions_user_status
on public.user_workout_sessions(user_id, status, scheduled_date);

create index if not exists idx_user_exercise_logs_session
on public.user_exercise_logs(user_workout_session_id, exercise_order);

drop trigger if exists user_workout_sessions_updated_at on public.user_workout_sessions;
create trigger user_workout_sessions_updated_at
before update on public.user_workout_sessions
for each row execute function public.set_updated_at();

drop trigger if exists user_exercise_logs_updated_at on public.user_exercise_logs;
create trigger user_exercise_logs_updated_at
before update on public.user_exercise_logs
for each row execute function public.set_updated_at();

alter table public.user_workout_sessions enable row level security;
alter table public.user_exercise_logs enable row level security;

grant all on public.user_workout_sessions to authenticated;
grant all on public.user_exercise_logs to authenticated;

drop policy if exists "user_workout_sessions_own_all" on public.user_workout_sessions;
create policy "user_workout_sessions_own_all" on public.user_workout_sessions
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_exercise_logs_own_all" on public.user_exercise_logs;
create policy "user_exercise_logs_own_all" on public.user_exercise_logs
for all
using (
  exists (
    select 1
    from public.user_workout_sessions s
    where s.id = user_workout_session_id
    and (s.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.user_workout_sessions s
    where s.id = user_workout_session_id
    and (s.user_id = auth.uid() or public.is_admin())
  )
);
