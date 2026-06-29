-- Migration 022: Account-synced saved nutrition helpers
-- Keeps food favorites and recipes available across devices without changing food logs.

create table if not exists public.user_food_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_key text not null,
  label text,
  created_at timestamp with time zone default now(),
  primary key (user_id, food_key)
);

alter table public.user_food_favorites enable row level security;

drop policy if exists "user_food_favorites_own_all" on public.user_food_favorites;
create policy "user_food_favorites_own_all"
  on public.user_food_favorites
  for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  portions integer not null default 1 check (portions > 0),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.saved_recipes enable row level security;

drop policy if exists "saved_recipes_own_all" on public.saved_recipes;
create policy "saved_recipes_own_all"
  on public.saved_recipes
  for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop trigger if exists saved_recipes_updated_at on public.saved_recipes;
create trigger saved_recipes_updated_at
before update on public.saved_recipes
for each row execute function public.set_updated_at();

create table if not exists public.saved_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.saved_recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  serving_unit text not null default 'serving',
  calories numeric not null default 0 check (calories >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  fat_g numeric not null default 0 check (fat_g >= 0),
  created_at timestamp with time zone default now()
);

alter table public.saved_recipe_ingredients enable row level security;

drop policy if exists "saved_recipe_ingredients_own_all" on public.saved_recipe_ingredients;
create policy "saved_recipe_ingredients_own_all"
  on public.saved_recipe_ingredients
  for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create index if not exists idx_user_food_favorites_user_created
  on public.user_food_favorites(user_id, created_at desc);

create index if not exists idx_saved_recipes_user_created
  on public.saved_recipes(user_id, created_at desc);

create index if not exists idx_saved_recipe_ingredients_recipe
  on public.saved_recipe_ingredients(recipe_id);

grant select, insert, update, delete on public.user_food_favorites to authenticated;
grant select, insert, update, delete on public.saved_recipes to authenticated;
grant select, insert, update, delete on public.saved_recipe_ingredients to authenticated;
