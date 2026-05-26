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

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  main_goal text not null,
  workout_type text,
  training_level text not null,
  program_duration_weeks int not null check (program_duration_weeks > 0),
  days_per_week int not null check (days_per_week between 1 and 7),
  time_per_workout text,
  equipment_required text[] not null default '{}',
  target_gender text not null default 'Male & Female',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(title)
);

create table if not exists public.workout_template_days (
  id uuid primary key default gen_random_uuid(),
  workout_template_id uuid not null references public.workout_templates(id) on delete cascade,
  day_index int not null check (day_index > 0),
  day_title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workout_template_id, day_index)
);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_template_day_id uuid not null references public.workout_template_days(id) on delete cascade,
  exercise_order int not null check (exercise_order > 0),
  exercise_name text not null,
  sets text,
  reps text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workout_template_day_id, exercise_order)
);

create table if not exists public.user_onboarding (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  main_goal text not null,
  training_level text not null,
  days_per_week int not null check (days_per_week between 1 and 7),
  workout_time_minutes int not null check (workout_time_minutes > 0),
  available_equipment text[] not null default '{}',
  gender text not null,
  onboarding_answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.onboarding_answers
  add column if not exists available_equipment text[] not null default '{}';

alter table public.user_workout_plans
  add column if not exists template_id uuid references public.workout_templates(id) on delete set null;

alter table public.user_workout_plans
  add column if not exists source text not null default 'manual';

alter table public.user_workout_plans
  add column if not exists match_score int;

alter table public.user_workout_plans
  add column if not exists match_explanation text;

alter table public.user_workout_plans
  add column if not exists match_reasons text[] not null default '{}';

alter table public.user_workout_plans
  add column if not exists generated_from_onboarding_id uuid references public.user_onboarding(id) on delete set null;

alter table public.user_workout_plans
  add column if not exists program_duration_weeks int;

alter table public.user_workout_plans
  add column if not exists days_per_week int;

alter table public.user_workout_plans
  drop constraint if exists user_workout_plans_source_check;

alter table public.user_workout_plans
  add constraint user_workout_plans_source_check
  check (source in ('manual', 'template_recommendation'));

create table if not exists public.user_workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_workout_plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
  workout_template_day_id uuid references public.workout_template_days(id) on delete set null,
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
  workout_template_exercise_id uuid references public.workout_template_exercises(id) on delete set null,
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

create index if not exists idx_workout_templates_match
on public.workout_templates(main_goal, training_level, days_per_week);

create index if not exists idx_workout_template_days_template
on public.workout_template_days(workout_template_id, day_index);

create index if not exists idx_workout_template_exercises_day
on public.workout_template_exercises(workout_template_day_id, exercise_order);

create index if not exists idx_user_onboarding_user
on public.user_onboarding(user_id);

create index if not exists idx_user_workout_plans_template
on public.user_workout_plans(template_id);

create index if not exists idx_user_workout_sessions_user_date
on public.user_workout_sessions(user_id, scheduled_date);

create index if not exists idx_user_workout_sessions_user_status
on public.user_workout_sessions(user_id, status, scheduled_date);

create index if not exists idx_user_exercise_logs_session
on public.user_exercise_logs(user_workout_session_id, exercise_order);

drop trigger if exists workout_templates_updated_at on public.workout_templates;
create trigger workout_templates_updated_at
before update on public.workout_templates
for each row execute function public.set_updated_at();

drop trigger if exists workout_template_days_updated_at on public.workout_template_days;
create trigger workout_template_days_updated_at
before update on public.workout_template_days
for each row execute function public.set_updated_at();

drop trigger if exists workout_template_exercises_updated_at on public.workout_template_exercises;
create trigger workout_template_exercises_updated_at
before update on public.workout_template_exercises
for each row execute function public.set_updated_at();

drop trigger if exists user_onboarding_updated_at on public.user_onboarding;
create trigger user_onboarding_updated_at
before update on public.user_onboarding
for each row execute function public.set_updated_at();

drop trigger if exists user_workout_sessions_updated_at on public.user_workout_sessions;
create trigger user_workout_sessions_updated_at
before update on public.user_workout_sessions
for each row execute function public.set_updated_at();

drop trigger if exists user_exercise_logs_updated_at on public.user_exercise_logs;
create trigger user_exercise_logs_updated_at
before update on public.user_exercise_logs
for each row execute function public.set_updated_at();

alter table public.workout_templates enable row level security;
alter table public.workout_template_days enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.user_onboarding enable row level security;
alter table public.user_workout_sessions enable row level security;
alter table public.user_exercise_logs enable row level security;

grant select on public.workout_templates to authenticated;
grant select on public.workout_template_days to authenticated;
grant select on public.workout_template_exercises to authenticated;
grant all on public.user_onboarding to authenticated;
grant all on public.user_workout_sessions to authenticated;
grant all on public.user_exercise_logs to authenticated;

drop policy if exists "workout_templates_read_auth" on public.workout_templates;
create policy "workout_templates_read_auth" on public.workout_templates
for select
using (auth.role() = 'authenticated');

drop policy if exists "workout_templates_admin_all" on public.workout_templates;
create policy "workout_templates_admin_all" on public.workout_templates
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "workout_template_days_read_auth" on public.workout_template_days;
create policy "workout_template_days_read_auth" on public.workout_template_days
for select
using (
  auth.role() = 'authenticated'
  and exists (select 1 from public.workout_templates t where t.id = workout_template_id)
);

drop policy if exists "workout_template_days_admin_all" on public.workout_template_days;
create policy "workout_template_days_admin_all" on public.workout_template_days
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "workout_template_exercises_read_auth" on public.workout_template_exercises;
create policy "workout_template_exercises_read_auth" on public.workout_template_exercises
for select
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.workout_template_days d
    join public.workout_templates t on t.id = d.workout_template_id
    where d.id = workout_template_day_id
  )
);

drop policy if exists "workout_template_exercises_admin_all" on public.workout_template_exercises;
create policy "workout_template_exercises_admin_all" on public.workout_template_exercises
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "user_onboarding_own_all" on public.user_onboarding;
create policy "user_onboarding_own_all" on public.user_onboarding
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

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
