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

create table if not exists public.food_kitchens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.food_subcategories (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.food_kitchens(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(kitchen_id, name)
);

alter table public.food_items
  add column if not exists kitchen_id uuid references public.food_kitchens(id) on delete set null;

alter table public.food_items
  add column if not exists subcategory_id uuid references public.food_subcategories(id) on delete set null;

alter table public.food_items
  add column if not exists fiber_g numeric(8,2) check (fiber_g is null or fiber_g >= 0);

alter table public.food_items
  add column if not exists sugar_g numeric(8,2) check (sugar_g is null or sugar_g >= 0);

alter table public.food_items
  add column if not exists sodium_mg numeric(8,2) check (sodium_mg is null or sodium_mg >= 0);

alter table public.user_food_items
  add column if not exists cuisine text;

alter table public.user_food_items
  add column if not exists kitchen_id uuid references public.food_kitchens(id) on delete set null;

alter table public.user_food_items
  add column if not exists subcategory_id uuid references public.food_subcategories(id) on delete set null;

alter table public.user_food_items
  add column if not exists fiber_g numeric(8,2) check (fiber_g is null or fiber_g >= 0);

alter table public.user_food_items
  add column if not exists sugar_g numeric(8,2) check (sugar_g is null or sugar_g >= 0);

alter table public.user_food_items
  add column if not exists sodium_mg numeric(8,2) check (sodium_mg is null or sodium_mg >= 0);

alter table public.meals
  add column if not exists meal_category text;

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  amount_ml int not null check (amount_ml > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.user_exercise_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  custom_video_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, exercise_id)
);

insert into public.food_kitchens (name, is_system)
select 'Egyptian Food', true
where not exists (
  select 1 from public.food_kitchens where name = 'Egyptian Food' and is_system = true
);

with egyptian as (
  select id from public.food_kitchens where name = 'Egyptian Food' and is_system = true limit 1
)
insert into public.food_subcategories (kitchen_id, name)
select egyptian.id, category.name
from egyptian
cross join (
  values
    ('Bread'),
    ('Breakfast'),
    ('Carb'),
    ('Dairy'),
    ('Dessert'),
    ('Dip'),
    ('Drink'),
    ('Legumes'),
    ('Snack'),
    ('Soup'),
    ('Stew'),
    ('Vegetable')
) as category(name)
on conflict (kitchen_id, name) do nothing;

with egyptian as (
  select id from public.food_kitchens where name = 'Egyptian Food' and is_system = true limit 1
)
update public.food_items
set
  cuisine = 'Egyptian Food',
  kitchen_id = egyptian.id,
  category = case
    when category in ('Bread','Breakfast','Carb','Dairy','Dessert','Dip','Drink','Legumes','Snack','Soup','Stew','Vegetable') then category
    when category in ('Rice') then 'Carb'
    when category in ('Sauce','Salad') then 'Dip'
    when category in ('Protein','Sandwich','Meal','Side') then 'Breakfast'
    else 'Snack'
  end
from egyptian
where public.food_items.is_global = true
  and coalesce(public.food_items.cuisine, 'Egyptian') in ('Egyptian', 'Egyptian Food');

update public.food_items food
set subcategory_id = subcategory.id
from public.food_kitchens kitchen
join public.food_subcategories subcategory on subcategory.kitchen_id = kitchen.id
where kitchen.name = 'Egyptian Food'
  and kitchen.is_system = true
  and food.kitchen_id = kitchen.id
  and food.category = subcategory.name
  and food.subcategory_id is distinct from subcategory.id;

create index if not exists idx_food_kitchens_user on public.food_kitchens(user_id, name);
create unique index if not exists idx_food_kitchens_system_name on public.food_kitchens(name) where is_system = true;
create index if not exists idx_food_subcategories_kitchen on public.food_subcategories(kitchen_id, name);
create index if not exists idx_food_items_kitchen_subcategory on public.food_items(kitchen_id, subcategory_id, food_name);
create index if not exists idx_user_food_items_user_kitchen on public.user_food_items(user_id, kitchen_id, subcategory_id, food_name);
create index if not exists idx_water_logs_user_date on public.water_logs(user_id, log_date desc);
create index if not exists idx_user_exercise_videos_user_exercise on public.user_exercise_videos(user_id, exercise_id);

drop trigger if exists food_kitchens_updated_at on public.food_kitchens;
create trigger food_kitchens_updated_at
before update on public.food_kitchens
for each row execute function public.set_updated_at();

drop trigger if exists food_subcategories_updated_at on public.food_subcategories;
create trigger food_subcategories_updated_at
before update on public.food_subcategories
for each row execute function public.set_updated_at();

drop trigger if exists user_exercise_videos_updated_at on public.user_exercise_videos;
create trigger user_exercise_videos_updated_at
before update on public.user_exercise_videos
for each row execute function public.set_updated_at();

alter table public.food_kitchens enable row level security;
alter table public.food_subcategories enable row level security;
alter table public.water_logs enable row level security;
alter table public.user_exercise_videos enable row level security;

grant select, insert, update, delete on public.food_kitchens to authenticated;
grant select, insert, update, delete on public.food_subcategories to authenticated;
grant select, insert, update, delete on public.water_logs to authenticated;
grant select, insert, update, delete on public.user_exercise_videos to authenticated;

drop policy if exists "food_kitchens_read_system_or_own" on public.food_kitchens;
create policy "food_kitchens_read_system_or_own" on public.food_kitchens
for select
using (is_system = true or user_id = auth.uid() or public.is_admin());

drop policy if exists "food_kitchens_own_insert" on public.food_kitchens;
create policy "food_kitchens_own_insert" on public.food_kitchens
for insert
with check ((user_id = auth.uid() and is_system = false) or public.is_admin());

drop policy if exists "food_kitchens_own_update_delete" on public.food_kitchens;
create policy "food_kitchens_own_update_delete" on public.food_kitchens
for all
using ((user_id = auth.uid() and is_system = false) or public.is_admin())
with check ((user_id = auth.uid() and is_system = false) or public.is_admin());

drop policy if exists "food_subcategories_read_system_or_own" on public.food_subcategories;
create policy "food_subcategories_read_system_or_own" on public.food_subcategories
for select
using (
  exists (
    select 1 from public.food_kitchens kitchen
    where kitchen.id = kitchen_id
    and (kitchen.is_system = true or kitchen.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "food_subcategories_own_all" on public.food_subcategories;
create policy "food_subcategories_own_all" on public.food_subcategories
for all
using (
  exists (
    select 1 from public.food_kitchens kitchen
    where kitchen.id = kitchen_id
    and ((kitchen.user_id = auth.uid() and kitchen.is_system = false) or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.food_kitchens kitchen
    where kitchen.id = kitchen_id
    and ((kitchen.user_id = auth.uid() and kitchen.is_system = false) or public.is_admin())
  )
);

drop policy if exists "water_logs_own_all" on public.water_logs;
create policy "water_logs_own_all" on public.water_logs
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_exercise_videos_own_all" on public.user_exercise_videos;
create policy "user_exercise_videos_own_all" on public.user_exercise_videos
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());
