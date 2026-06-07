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

-- FitLife no longer generates workout plans internally. Keep user-owned plan storage and expand it
-- so ChatGPT can persist exact manual plans without depending on a global exercise library.
alter table public.user_workout_plans
  add column if not exists goal text;

alter table public.user_workout_plans
  add column if not exists description text;

alter table public.user_workout_plans
  add column if not exists session_duration_minutes int check (session_duration_minutes is null or session_duration_minutes > 0);

alter table public.user_workout_plans
  add column if not exists chatgpt_source boolean not null default false;

alter table public.user_workout_plans
  add column if not exists is_default boolean not null default false;

alter table public.user_workout_plans
  drop constraint if exists user_workout_plans_source_check;

alter table public.user_workout_plans
  add constraint user_workout_plans_source_check
  check (source in ('manual', 'chatgpt', 'imported', 'template_recommendation', 'generated_rules'));

alter table public.user_workout_plan_days
  add column if not exists focus text;

alter table public.user_workout_plan_days
  add column if not exists weekday text;

alter table public.user_workout_plan_days
  add column if not exists session_duration_minutes int check (session_duration_minutes is null or session_duration_minutes > 0);

alter table public.user_workout_plan_exercises
  add column if not exists weight text;

alter table public.user_workout_plan_exercises
  add column if not exists tempo text;

alter table public.user_workout_plan_exercises
  add column if not exists block_type text;

alter table public.user_workout_plan_exercises
  add column if not exists order_index int;

alter table public.user_workout_plan_exercises
  add column if not exists instructions text;

alter table public.user_workout_plan_exercises
  add column if not exists exercise_url text;

alter table public.user_workout_plan_exercises
  add column if not exists video_url text;

alter table public.user_workout_plan_exercises
  add column if not exists custom_video_url text;

update public.user_workout_plan_exercises
set order_index = sort_order
where order_index is null;

create index if not exists idx_user_workout_plans_user_active
on public.user_workout_plans(user_id, is_active, created_at desc);

create index if not exists idx_user_workout_plan_exercises_block
on public.user_workout_plan_exercises(plan_day_id, block_type, coalesce(order_index, sort_order));

-- Kitchen/custom food support for ChatGPT-created foods.
create table if not exists public.food_kitchens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

alter table public.user_food_items
  add column if not exists cuisine text;

alter table public.user_food_items
  add column if not exists kitchen_id uuid references public.food_kitchens(id) on delete set null;

alter table public.user_food_items
  add column if not exists fiber_g numeric(8,2) check (fiber_g is null or fiber_g >= 0);

alter table public.user_food_items
  add column if not exists sugar_g numeric(8,2) check (sugar_g is null or sugar_g >= 0);

alter table public.user_food_items
  add column if not exists sodium_mg numeric(10,2) check (sodium_mg is null or sodium_mg >= 0);

create index if not exists idx_food_kitchens_user_name on public.food_kitchens(user_id, name);
create index if not exists idx_user_food_items_user_kitchen_name on public.user_food_items(user_id, kitchen_id, food_name);

-- Profile/target fields commonly updated through ChatGPT.
alter table public.profiles
  add column if not exists height_cm numeric(8,2);

alter table public.profiles
  add column if not exists weight_kg numeric(8,2);

alter table public.profiles
  add column if not exists target_weight_kg numeric(8,2);

alter table public.profiles
  add column if not exists age int;

alter table public.profiles
  add column if not exists gender text;

alter table public.profiles
  add column if not exists activity_level text;

alter table public.profiles
  add column if not exists training_level text;

alter table public.profiles
  add column if not exists goal text;

alter table public.profiles
  add column if not exists body_goal text;

alter table public.calorie_targets
  add column if not exists water_ml int;

alter table public.food_kitchens enable row level security;

grant select, insert, update, delete on public.food_kitchens to authenticated;

drop policy if exists "food_kitchens_read_system_or_own" on public.food_kitchens;
create policy "food_kitchens_read_system_or_own"
on public.food_kitchens
for select
using (is_system = true or user_id = auth.uid() or public.is_admin());

drop policy if exists "food_kitchens_insert_own" on public.food_kitchens;
create policy "food_kitchens_insert_own"
on public.food_kitchens
for insert
with check ((user_id = auth.uid() and is_system = false) or public.is_admin());

drop policy if exists "food_kitchens_update_delete_own" on public.food_kitchens;
create policy "food_kitchens_update_delete_own"
on public.food_kitchens
for all
using ((user_id = auth.uid() and is_system = false) or public.is_admin())
with check ((user_id = auth.uid() and is_system = false) or public.is_admin());

drop trigger if exists food_kitchens_updated_at on public.food_kitchens;
create trigger food_kitchens_updated_at
before update on public.food_kitchens
for each row execute function public.set_updated_at();
