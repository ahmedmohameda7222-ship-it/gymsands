-- S&S Gym user workout plans
-- Run this once in Supabase SQL Editor before using the workout plan builder.

create table if not exists public.user_workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_workout_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
  day_number int not null check (day_number > 0),
  day_name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, day_number)
);

create table if not exists public.user_workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.user_workout_plan_days(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  exercise_name text not null,
  category text,
  target_muscle text,
  equipment text,
  sets int check (sets is null or sets > 0),
  reps text,
  rest_seconds int check (rest_seconds is null or rest_seconds >= 0),
  sort_order int not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

create trigger user_workout_plans_updated_at
before update on public.user_workout_plans
for each row execute function public.set_updated_at();

create trigger user_workout_plan_days_updated_at
before update on public.user_workout_plan_days
for each row execute function public.set_updated_at();

create index if not exists idx_user_workout_plans_user on public.user_workout_plans(user_id, created_at desc);
create index if not exists idx_user_workout_plan_days_plan on public.user_workout_plan_days(plan_id, day_number);
create index if not exists idx_user_workout_plan_exercises_day on public.user_workout_plan_exercises(plan_day_id, sort_order);

alter table public.user_workout_plans enable row level security;
alter table public.user_workout_plan_days enable row level security;
alter table public.user_workout_plan_exercises enable row level security;

drop policy if exists "user_workout_plans_own_all" on public.user_workout_plans;
create policy "user_workout_plans_own_all" on public.user_workout_plans
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_workout_plan_days_own_all" on public.user_workout_plan_days;
create policy "user_workout_plan_days_own_all" on public.user_workout_plan_days
for all
using (
  exists (
    select 1 from public.user_workout_plans p
    where p.id = plan_id and (p.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.user_workout_plans p
    where p.id = plan_id and (p.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "user_workout_plan_exercises_own_all" on public.user_workout_plan_exercises;
create policy "user_workout_plan_exercises_own_all" on public.user_workout_plan_exercises
for all
using (
  exists (
    select 1
    from public.user_workout_plan_days d
    join public.user_workout_plans p on p.id = d.plan_id
    where d.id = plan_day_id and (p.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.user_workout_plan_days d
    join public.user_workout_plans p on p.id = d.plan_id
    where d.id = plan_day_id and (p.user_id = auth.uid() or public.is_admin())
  )
);
