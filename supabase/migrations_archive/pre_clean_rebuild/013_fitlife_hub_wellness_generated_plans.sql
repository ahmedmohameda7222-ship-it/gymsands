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
  add column if not exists goals text[] not null default '{}';

alter table public.onboarding_answers
  add column if not exists training_cycle text;

alter table public.onboarding_answers
  add column if not exists min_workout_duration_minutes int;

alter table public.onboarding_answers
  add column if not exists max_workout_duration_minutes int;

alter table public.user_workout_plan_exercises
  add column if not exists exercise_url text;

alter table public.user_workout_plan_exercises
  add column if not exists custom_video_url text;

create table if not exists public.daily_fit_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_date date not null default current_date,
  title text not null,
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitness_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_date date not null default current_date,
  name text not null,
  completed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sleep_recovery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  hours_slept numeric(4,2) check (hours_slept is null or hours_slept >= 0),
  sleep_quality text,
  recovery_level text,
  fatigue_level text,
  soreness_level text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  supplement_date date not null default current_date,
  name text not null,
  dose text,
  time text,
  reminder text,
  taken_today boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_name text not null,
  record_type text not null,
  weight_kg numeric(8,2) check (weight_kg is null or weight_kg >= 0),
  reps int check (reps is null or reps >= 0),
  record_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_daily_fit_tasks_user_date on public.daily_fit_tasks(user_id, task_date desc);
create index if not exists idx_fitness_habits_user_date on public.fitness_habits(user_id, habit_date desc);
create index if not exists idx_sleep_recovery_logs_user_date on public.sleep_recovery_logs(user_id, log_date desc);
create index if not exists idx_supplement_logs_user_date on public.supplement_logs(user_id, supplement_date desc);
create index if not exists idx_personal_records_user_exercise on public.personal_records(user_id, exercise_name, record_date desc);

drop trigger if exists daily_fit_tasks_updated_at on public.daily_fit_tasks;
create trigger daily_fit_tasks_updated_at
before update on public.daily_fit_tasks
for each row execute function public.set_updated_at();

drop trigger if exists fitness_habits_updated_at on public.fitness_habits;
create trigger fitness_habits_updated_at
before update on public.fitness_habits
for each row execute function public.set_updated_at();

drop trigger if exists sleep_recovery_logs_updated_at on public.sleep_recovery_logs;
create trigger sleep_recovery_logs_updated_at
before update on public.sleep_recovery_logs
for each row execute function public.set_updated_at();

drop trigger if exists supplement_logs_updated_at on public.supplement_logs;
create trigger supplement_logs_updated_at
before update on public.supplement_logs
for each row execute function public.set_updated_at();

drop trigger if exists personal_records_updated_at on public.personal_records;
create trigger personal_records_updated_at
before update on public.personal_records
for each row execute function public.set_updated_at();

alter table public.daily_fit_tasks enable row level security;
alter table public.fitness_habits enable row level security;
alter table public.sleep_recovery_logs enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.personal_records enable row level security;

grant select, insert, update, delete on public.daily_fit_tasks to authenticated;
grant select, insert, update, delete on public.fitness_habits to authenticated;
grant select, insert, update, delete on public.sleep_recovery_logs to authenticated;
grant select, insert, update, delete on public.supplement_logs to authenticated;
grant select, insert, update, delete on public.personal_records to authenticated;

drop policy if exists "daily_fit_tasks_own_all" on public.daily_fit_tasks;
create policy "daily_fit_tasks_own_all" on public.daily_fit_tasks
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "fitness_habits_own_all" on public.fitness_habits;
create policy "fitness_habits_own_all" on public.fitness_habits
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "sleep_recovery_logs_own_all" on public.sleep_recovery_logs;
create policy "sleep_recovery_logs_own_all" on public.sleep_recovery_logs
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "supplement_logs_own_all" on public.supplement_logs;
create policy "supplement_logs_own_all" on public.supplement_logs
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "personal_records_own_all" on public.personal_records;
create policy "personal_records_own_all" on public.personal_records
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());
