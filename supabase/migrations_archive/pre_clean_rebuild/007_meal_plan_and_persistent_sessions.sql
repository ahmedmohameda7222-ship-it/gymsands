create extension if not exists "pgcrypto";

create table if not exists public.user_meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null default current_date,
  meal_type text not null default 'Breakfast',
  food_item_id uuid references public.food_items(id) on delete set null,
  user_food_item_id uuid references public.user_food_items(id) on delete set null,
  food_name text not null,
  serving_size text not null,
  quantity numeric(8,3) not null check (quantity > 0),
  calories numeric(8,2) not null check (calories >= 0),
  protein_g numeric(8,2) not null check (protein_g >= 0),
  carbs_g numeric(8,2) not null check (carbs_g >= 0),
  fat_g numeric(8,2) not null check (fat_g >= 0),
  status text not null default 'planned',
  food_log_id uuid references public.food_logs(id) on delete set null,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_meal_plan_items
  add column if not exists food_log_id uuid references public.food_logs(id) on delete set null;

alter table public.user_meal_plan_items
  add column if not exists completed_at timestamptz;

alter table public.user_meal_plan_items
  drop constraint if exists user_meal_plan_items_meal_type_check;

alter table public.user_meal_plan_items
  add constraint user_meal_plan_items_meal_type_check
  check (meal_type in ('Breakfast', 'Lunch', 'Snack', 'Dinner'));

alter table public.user_meal_plan_items
  drop constraint if exists user_meal_plan_items_status_check;

alter table public.user_meal_plan_items
  add constraint user_meal_plan_items_status_check
  check (status in ('planned', 'done'));

create index if not exists idx_user_meal_plan_items_user_date
on public.user_meal_plan_items(user_id, plan_date desc, meal_type);

create index if not exists idx_user_meal_plan_items_status
on public.user_meal_plan_items(user_id, status, plan_date desc);

create index if not exists idx_workout_sessions_user_plan_day_status
on public.workout_sessions(user_id, plan_day_id, status, started_at desc);

alter table public.user_meal_plan_items enable row level security;

drop trigger if exists user_meal_plan_items_updated_at on public.user_meal_plan_items;

create trigger user_meal_plan_items_updated_at
before update on public.user_meal_plan_items
for each row execute function public.set_updated_at();

drop policy if exists "user_meal_plan_items_own_all" on public.user_meal_plan_items;

create policy "user_meal_plan_items_own_all"
on public.user_meal_plan_items
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());
