-- Nutrition V1 reusable-domain foundation.
-- Additive only: legacy saved_recipes/custom_meals remain compatibility data.

create extension if not exists "pgcrypto";
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Recipe identity, immutable published versions, and mutable working drafts.
-- ---------------------------------------------------------------------------

create table if not exists public.nutrition_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  is_favorite boolean not null default false,
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_after timestamptz,
  check (
    (deleted_at is null and purge_after is null)
    or (deleted_at is not null and purge_after is not null and purge_after > deleted_at)
  ),
  unique (id, user_id)
);

create index if not exists nutrition_recipes_owner_active_idx
on public.nutrition_recipes(user_id, updated_at desc, id)
where deleted_at is null;

create index if not exists nutrition_recipes_owner_deleted_idx
on public.nutrition_recipes(user_id, purge_after, id)
where deleted_at is not null;

create table if not exists public.nutrition_recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  name text not null check (length(trim(name)) between 1 and 200),
  servings numeric(12,4) not null check (servings > 0),
  total_cooked_weight_g numeric(12,3) check (total_cooked_weight_g is null or total_cooked_weight_g > 0),
  total_time_minutes integer check (total_time_minutes is null or total_time_minutes >= 0),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(recipe_id, version_number),
  unique (id, user_id),
  unique (id, recipe_id, user_id),
  foreign key (recipe_id, user_id) references public.nutrition_recipes(id, user_id) on delete cascade
);

create index if not exists nutrition_recipe_versions_owner_recipe_idx
on public.nutrition_recipe_versions(user_id, recipe_id, version_number desc);

create table if not exists public.nutrition_recipe_drafts (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  base_recipe_version_id uuid,
  name text,
  servings numeric(12,4) check (servings is null or servings > 0),
  total_cooked_weight_g numeric(12,3) check (total_cooked_weight_g is null or total_cooked_weight_g > 0),
  total_time_minutes integer check (total_time_minutes is null or total_time_minutes >= 0),
  notes text,
  draft_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (recipe_id, user_id) references public.nutrition_recipes(id, user_id) on delete cascade,
  foreign key (base_recipe_version_id, recipe_id, user_id) references public.nutrition_recipe_versions(id, recipe_id, user_id) on delete set null (base_recipe_version_id)
);

create index if not exists nutrition_recipe_drafts_owner_updated_idx
on public.nutrition_recipe_drafts(user_id, updated_at desc, id);

create index if not exists nutrition_recipe_drafts_base_version_idx
on public.nutrition_recipe_drafts(base_recipe_version_id)
where base_recipe_version_id is not null;

-- Ingredient/action/equipment rows can belong to either a frozen published
-- version or the one mutable working draft. Direct authenticated mutation is
-- permitted only for draft-owned rows; publication is a later transactional RPC.
create table if not exists public.nutrition_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_version_id uuid,
  recipe_draft_id uuid,
  position integer not null check (position >= 0),
  food_id uuid,
  ingredient_name text not null check (length(trim(ingredient_name)) between 1 and 300),
  quantity numeric(14,4) check (quantity is null or quantity > 0),
  unit text,
  frozen_nutrition jsonb,
  created_at timestamptz not null default now(),
  check (
    (recipe_version_id is not null and recipe_draft_id is null)
    or (recipe_version_id is null and recipe_draft_id is not null)
  ),
  foreign key (recipe_version_id, user_id) references public.nutrition_recipe_versions(id, user_id) on delete cascade,
  foreign key (recipe_draft_id, user_id) references public.nutrition_recipe_drafts(id, user_id) on delete cascade
);

create index if not exists nutrition_recipe_ingredients_version_idx
on public.nutrition_recipe_ingredients(recipe_version_id, position, id)
where recipe_version_id is not null;

create index if not exists nutrition_recipe_ingredients_draft_idx
on public.nutrition_recipe_ingredients(recipe_draft_id, position, id)
where recipe_draft_id is not null;

create table if not exists public.nutrition_recipe_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_version_id uuid,
  recipe_draft_id uuid,
  position integer not null check (position >= 0),
  instruction text not null check (length(trim(instruction)) > 0),
  ingredient_refs jsonb not null default '[]'::jsonb,
  equipment_refs jsonb not null default '[]'::jsonb,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  heat_or_temperature text,
  doneness_or_result_cue text,
  prep_ahead_cue text,
  track_key text,
  dependency_action_ids uuid[] not null default '{}',
  can_run_in_background boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (recipe_version_id is not null and recipe_draft_id is null)
    or (recipe_version_id is null and recipe_draft_id is not null)
  ),
  foreign key (recipe_version_id, user_id) references public.nutrition_recipe_versions(id, user_id) on delete cascade,
  foreign key (recipe_draft_id, user_id) references public.nutrition_recipe_drafts(id, user_id) on delete cascade
);

create index if not exists nutrition_recipe_actions_version_idx
on public.nutrition_recipe_actions(recipe_version_id, position, id)
where recipe_version_id is not null;

create index if not exists nutrition_recipe_actions_draft_idx
on public.nutrition_recipe_actions(recipe_draft_id, position, id)
where recipe_draft_id is not null;

create table if not exists public.nutrition_recipe_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_version_id uuid,
  recipe_draft_id uuid,
  position integer not null check (position >= 0),
  name text not null check (length(trim(name)) between 1 and 200),
  quantity numeric(12,3) check (quantity is null or quantity > 0),
  note text,
  created_at timestamptz not null default now(),
  check (
    (recipe_version_id is not null and recipe_draft_id is null)
    or (recipe_version_id is null and recipe_draft_id is not null)
  ),
  foreign key (recipe_version_id, user_id) references public.nutrition_recipe_versions(id, user_id) on delete cascade,
  foreign key (recipe_draft_id, user_id) references public.nutrition_recipe_drafts(id, user_id) on delete cascade
);

create index if not exists nutrition_recipe_equipment_version_idx
on public.nutrition_recipe_equipment(recipe_version_id, position, id)
where recipe_version_id is not null;

create index if not exists nutrition_recipe_equipment_draft_idx
on public.nutrition_recipe_equipment(recipe_draft_id, position, id)
where recipe_draft_id is not null;

-- ---------------------------------------------------------------------------
-- Saved Meal identity and frozen reusable children.
-- Recipe lineage is intentionally stored without a FK to purgeable Recipe
-- source/version rows so permanent source deletion cannot corrupt consumers.
-- ---------------------------------------------------------------------------

create table if not exists public.nutrition_saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  note text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_after timestamptz,
  check (
    (deleted_at is null and purge_after is null)
    or (deleted_at is not null and purge_after is not null and purge_after > deleted_at)
  ),
  unique (id, user_id)
);

create index if not exists nutrition_saved_meals_owner_active_idx
on public.nutrition_saved_meals(user_id, updated_at desc, id)
where deleted_at is null;

create index if not exists nutrition_saved_meals_owner_deleted_idx
on public.nutrition_saved_meals(user_id, purge_after, id)
where deleted_at is not null;

create table if not exists public.nutrition_saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null check (position >= 0),
  item_type text not null check (item_type in ('food', 'recipe')),
  food_id uuid,
  recipe_id uuid,
  recipe_version_id uuid,
  resolved_quantity numeric(14,4) not null check (resolved_quantity > 0),
  resolved_serving_label text not null check (length(trim(resolved_serving_label)) > 0),
  frozen_name text not null check (length(trim(frozen_name)) > 0),
  frozen_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (item_type = 'food' and food_id is not null and recipe_id is null and recipe_version_id is null)
    or
    (item_type = 'recipe' and food_id is null and recipe_id is not null and recipe_version_id is not null)
  ),
  foreign key (saved_meal_id, user_id) references public.nutrition_saved_meals(id, user_id) on delete cascade
);

create index if not exists nutrition_saved_meal_items_parent_idx
on public.nutrition_saved_meal_items(saved_meal_id, position, id);

create index if not exists nutrition_saved_meal_items_recipe_lineage_idx
on public.nutrition_saved_meal_items(user_id, recipe_id, recipe_version_id)
where item_type = 'recipe';

-- ---------------------------------------------------------------------------
-- Updated-at triggers and immutable published Recipe-version guard.
-- ---------------------------------------------------------------------------

drop trigger if exists nutrition_recipes_updated_at on public.nutrition_recipes;
create trigger nutrition_recipes_updated_at
before update on public.nutrition_recipes
for each row execute function public.set_updated_at();

drop trigger if exists nutrition_recipe_drafts_updated_at on public.nutrition_recipe_drafts;
create trigger nutrition_recipe_drafts_updated_at
before update on public.nutrition_recipe_drafts
for each row execute function public.set_updated_at();

drop trigger if exists nutrition_saved_meals_updated_at on public.nutrition_saved_meals;
create trigger nutrition_saved_meals_updated_at
before update on public.nutrition_saved_meals
for each row execute function public.set_updated_at();

drop trigger if exists nutrition_saved_meal_items_updated_at on public.nutrition_saved_meal_items;
create trigger nutrition_saved_meal_items_updated_at
before update on public.nutrition_saved_meal_items
for each row execute function public.set_updated_at();

create or replace function private.prevent_nutrition_recipe_version_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Published Recipe versions are immutable.' using errcode = '42501';
end;
$$;

revoke all on function private.prevent_nutrition_recipe_version_update() from public, anon, authenticated;

drop trigger if exists prevent_nutrition_recipe_version_update on public.nutrition_recipe_versions;
create trigger prevent_nutrition_recipe_version_update
before update on public.nutrition_recipe_versions
for each row execute function private.prevent_nutrition_recipe_version_update();

-- ---------------------------------------------------------------------------
-- RLS and grants. Published version/components are read-only to direct clients;
-- draft rows are directly mutable only by their owner. Publication later uses
-- a reviewed transactional server/database command.
-- ---------------------------------------------------------------------------

alter table public.nutrition_recipes enable row level security;
alter table public.nutrition_recipe_versions enable row level security;
alter table public.nutrition_recipe_drafts enable row level security;
alter table public.nutrition_recipe_ingredients enable row level security;
alter table public.nutrition_recipe_actions enable row level security;
alter table public.nutrition_recipe_equipment enable row level security;
alter table public.nutrition_saved_meals enable row level security;
alter table public.nutrition_saved_meal_items enable row level security;

revoke all on public.nutrition_recipes from anon, authenticated;
revoke all on public.nutrition_recipe_versions from anon, authenticated;
revoke all on public.nutrition_recipe_drafts from anon, authenticated;
revoke all on public.nutrition_recipe_ingredients from anon, authenticated;
revoke all on public.nutrition_recipe_actions from anon, authenticated;
revoke all on public.nutrition_recipe_equipment from anon, authenticated;
revoke all on public.nutrition_saved_meals from anon, authenticated;
revoke all on public.nutrition_saved_meal_items from anon, authenticated;

grant select, insert on public.nutrition_recipes to authenticated;
grant update (name, is_favorite, cover_path) on public.nutrition_recipes to authenticated;
revoke delete on public.nutrition_recipes from authenticated;

grant select on public.nutrition_recipe_versions to authenticated;
revoke insert, update, delete on public.nutrition_recipe_versions from authenticated;

grant select, insert, update, delete on public.nutrition_recipe_drafts to authenticated;
grant select, insert, update, delete on public.nutrition_recipe_ingredients to authenticated;
grant select, insert, update, delete on public.nutrition_recipe_actions to authenticated;
grant select, insert, update, delete on public.nutrition_recipe_equipment to authenticated;

grant select, insert on public.nutrition_saved_meals to authenticated;
grant update (name, note, is_favorite) on public.nutrition_saved_meals to authenticated;
revoke delete on public.nutrition_saved_meals from authenticated;
grant select, insert, update, delete on public.nutrition_saved_meal_items to authenticated;

grant all privileges on public.nutrition_recipes to service_role;
grant all privileges on public.nutrition_recipe_versions to service_role;
grant all privileges on public.nutrition_recipe_drafts to service_role;
grant all privileges on public.nutrition_recipe_ingredients to service_role;
grant all privileges on public.nutrition_recipe_actions to service_role;
grant all privileges on public.nutrition_recipe_equipment to service_role;
grant all privileges on public.nutrition_saved_meals to service_role;
grant all privileges on public.nutrition_saved_meal_items to service_role;

-- Recipe root policies.
drop policy if exists "nutrition_recipes_select_own" on public.nutrition_recipes;
drop policy if exists "nutrition_recipes_insert_own" on public.nutrition_recipes;
drop policy if exists "nutrition_recipes_update_own" on public.nutrition_recipes;
create policy "nutrition_recipes_select_own"
on public.nutrition_recipes for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_recipes_insert_own"
on public.nutrition_recipes for insert to authenticated
with check (user_id = (select auth.uid()) and deleted_at is null and purge_after is null);
create policy "nutrition_recipes_update_own"
on public.nutrition_recipes for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Published versions are owner-readable only. No authenticated INSERT/UPDATE/DELETE policy.
drop policy if exists "nutrition_recipe_versions_select_own" on public.nutrition_recipe_versions;
create policy "nutrition_recipe_versions_select_own"
on public.nutrition_recipe_versions for select to authenticated
using (user_id = (select auth.uid()));

-- Working draft owner CRUD.
drop policy if exists "nutrition_recipe_drafts_select_own" on public.nutrition_recipe_drafts;
drop policy if exists "nutrition_recipe_drafts_insert_own" on public.nutrition_recipe_drafts;
drop policy if exists "nutrition_recipe_drafts_update_own" on public.nutrition_recipe_drafts;
drop policy if exists "nutrition_recipe_drafts_delete_own" on public.nutrition_recipe_drafts;
create policy "nutrition_recipe_drafts_select_own"
on public.nutrition_recipe_drafts for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_recipe_drafts_insert_own"
on public.nutrition_recipe_drafts for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.nutrition_recipes recipe
    where recipe.id = recipe_id
      and recipe.user_id = (select auth.uid())
      and recipe.deleted_at is null
  )
);
create policy "nutrition_recipe_drafts_update_own"
on public.nutrition_recipe_drafts for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "nutrition_recipe_drafts_delete_own"
on public.nutrition_recipe_drafts for delete to authenticated
using (user_id = (select auth.uid()));

-- Shared component owner SELECT; direct writes are draft-only.
drop policy if exists "nutrition_recipe_ingredients_select_own" on public.nutrition_recipe_ingredients;
drop policy if exists "nutrition_recipe_ingredients_insert_draft" on public.nutrition_recipe_ingredients;
drop policy if exists "nutrition_recipe_ingredients_update_draft" on public.nutrition_recipe_ingredients;
drop policy if exists "nutrition_recipe_ingredients_delete_draft" on public.nutrition_recipe_ingredients;
create policy "nutrition_recipe_ingredients_select_own"
on public.nutrition_recipe_ingredients for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_recipe_ingredients_insert_draft"
on public.nutrition_recipe_ingredients for insert to authenticated
with check (
  user_id = (select auth.uid())
  and recipe_version_id is null
  and recipe_draft_id is not null
  and exists (
    select 1 from public.nutrition_recipe_drafts draft
    where draft.id = recipe_draft_id and draft.user_id = (select auth.uid())
  )
);
create policy "nutrition_recipe_ingredients_update_draft"
on public.nutrition_recipe_ingredients for update to authenticated
using (user_id = (select auth.uid()) and recipe_version_id is null and recipe_draft_id is not null)
with check (user_id = (select auth.uid()) and recipe_version_id is null and recipe_draft_id is not null);
create policy "nutrition_recipe_ingredients_delete_draft"
on public.nutrition_recipe_ingredients for delete to authenticated
using (user_id = (select auth.uid()) and recipe_version_id is null and recipe_draft_id is not null);

drop policy if exists "nutrition_recipe_actions_select_own" on public.nutrition_recipe_actions;
drop policy if exists "nutrition_recipe_actions_insert_draft" on public.nutrition_recipe_actions;
drop policy if exists "nutrition_recipe_actions_update_draft" on public.nutrition_recipe_actions;
drop policy if exists "nutrition_recipe_actions_delete_draft" on public.nutrition_recipe_actions;
create policy "nutrition_recipe_actions_select_own"
on public.nutrition_recipe_actions for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_recipe_actions_insert_draft"
on public.nutrition_recipe_actions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and recipe_version_id is null
  and recipe_draft_id is not null
  and exists (
    select 1 from public.nutrition_recipe_drafts draft
    where draft.id = recipe_draft_id and draft.user_id = (select auth.uid())
  )
);
create policy "nutrition_recipe_actions_update_draft"
on public.nutrition_recipe_actions for update to authenticated
using (user_id = (select auth.uid()) and recipe_version_id is null and recipe_draft_id is not null)
with check (user_id = (select auth.uid()) and recipe_version_id is null and recipe_draft_id is not null);
create policy "nutrition_recipe_actions_delete_draft"
on public.nutrition_recipe_actions for delete to authenticated
using (user_id = (select auth.uid()) and recipe_version_id is null and recipe_draft_id is not null);

drop policy if exists "nutrition_recipe_equipment_select_own" on public.nutrition_recipe_equipment;
drop policy if exists "nutrition_recipe_equipment_insert_draft" on public.nutrition_recipe_equipment;
drop policy if exists "nutrition_recipe_equipment_update_draft" on public.nutrition_recipe_equipment;
drop policy if exists "nutrition_recipe_equipment_delete_draft" on public.nutrition_recipe_equipment;
create policy "nutrition_recipe_equipment_select_own"
on public.nutrition_recipe_equipment for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_recipe_equipment_insert_draft"
on public.nutrition_recipe_equipment for insert to authenticated
with check (
  user_id = (select auth.uid())
  and recipe_version_id is null
  and recipe_draft_id is not null
  and exists (
    select 1 from public.nutrition_recipe_drafts draft
    where draft.id = recipe_draft_id and draft.user_id = (select auth.uid())
  )
);
create policy "nutrition_recipe_equipment_update_draft"
on public.nutrition_recipe_equipment for update to authenticated
using (user_id = (select auth.uid()) and recipe_version_id is null and recipe_draft_id is not null)
with check (user_id = (select auth.uid()) and recipe_version_id is null and recipe_draft_id is not null);
create policy "nutrition_recipe_equipment_delete_draft"
on public.nutrition_recipe_equipment for delete to authenticated
using (user_id = (select auth.uid()) and recipe_version_id is null and recipe_draft_id is not null);

-- Saved Meal owner CRUD except root deletion, which is lifecycle-RPC only.
drop policy if exists "nutrition_saved_meals_select_own" on public.nutrition_saved_meals;
drop policy if exists "nutrition_saved_meals_insert_own" on public.nutrition_saved_meals;
drop policy if exists "nutrition_saved_meals_update_own" on public.nutrition_saved_meals;
create policy "nutrition_saved_meals_select_own"
on public.nutrition_saved_meals for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_saved_meals_insert_own"
on public.nutrition_saved_meals for insert to authenticated
with check (user_id = (select auth.uid()) and deleted_at is null and purge_after is null);
create policy "nutrition_saved_meals_update_own"
on public.nutrition_saved_meals for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "nutrition_saved_meal_items_select_own" on public.nutrition_saved_meal_items;
drop policy if exists "nutrition_saved_meal_items_insert_own" on public.nutrition_saved_meal_items;
drop policy if exists "nutrition_saved_meal_items_update_own" on public.nutrition_saved_meal_items;
drop policy if exists "nutrition_saved_meal_items_delete_own" on public.nutrition_saved_meal_items;
create policy "nutrition_saved_meal_items_select_own"
on public.nutrition_saved_meal_items for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_saved_meal_items_insert_own"
on public.nutrition_saved_meal_items for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.nutrition_saved_meals meal
    where meal.id = saved_meal_id
      and meal.user_id = (select auth.uid())
      and meal.deleted_at is null
  )
);
create policy "nutrition_saved_meal_items_update_own"
on public.nutrition_saved_meal_items for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.nutrition_saved_meals meal
    where meal.id = saved_meal_id
      and meal.user_id = (select auth.uid())
      and meal.deleted_at is null
  )
);
create policy "nutrition_saved_meal_items_delete_own"
on public.nutrition_saved_meal_items for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.nutrition_saved_meals meal
    where meal.id = saved_meal_id
      and meal.user_id = (select auth.uid())
      and meal.deleted_at is null
  )
);

-- ---------------------------------------------------------------------------
-- Approved 30-day user recovery lifecycle. These commands derive owner identity
-- from auth.uid(); callers cannot choose an owner.
-- ---------------------------------------------------------------------------

create or replace function public.soft_delete_nutrition_recipe(p_recipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.nutrition_recipes
  set deleted_at = v_now,
      purge_after = v_now + interval '30 days'
  where id = p_recipe_id
    and user_id = v_user_id
    and deleted_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'Recipe not found or already deleted.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_id, 'deletedAt', v_now, 'purgeAfter', v_now + interval '30 days');
end;
$$;

create or replace function public.restore_nutrition_recipe(p_recipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.nutrition_recipes
  set deleted_at = null,
      purge_after = null
  where id = p_recipe_id
    and user_id = v_user_id
    and deleted_at is not null
    and purge_after > clock_timestamp()
  returning id into v_id;

  if v_id is null then
    raise exception 'Recipe is not restorable.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_id, 'restored', true);
end;
$$;

create or replace function public.purge_nutrition_recipe_now(p_recipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  delete from public.nutrition_recipes
  where id = p_recipe_id
    and user_id = v_user_id
    and deleted_at is not null
  returning id into v_id;

  if v_id is null then
    raise exception 'Deleted Recipe not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_id, 'permanentlyDeleted', true);
end;
$$;

create or replace function public.soft_delete_nutrition_saved_meal(p_saved_meal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.nutrition_saved_meals
  set deleted_at = v_now,
      purge_after = v_now + interval '30 days'
  where id = p_saved_meal_id
    and user_id = v_user_id
    and deleted_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'Saved Meal not found or already deleted.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_id, 'deletedAt', v_now, 'purgeAfter', v_now + interval '30 days');
end;
$$;

create or replace function public.restore_nutrition_saved_meal(p_saved_meal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.nutrition_saved_meals
  set deleted_at = null,
      purge_after = null
  where id = p_saved_meal_id
    and user_id = v_user_id
    and deleted_at is not null
    and purge_after > clock_timestamp()
  returning id into v_id;

  if v_id is null then
    raise exception 'Saved Meal is not restorable.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_id, 'restored', true);
end;
$$;

create or replace function public.purge_nutrition_saved_meal_now(p_saved_meal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  delete from public.nutrition_saved_meals
  where id = p_saved_meal_id
    and user_id = v_user_id
    and deleted_at is not null
  returning id into v_id;

  if v_id is null then
    raise exception 'Deleted Saved Meal not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_id, 'permanentlyDeleted', true);
end;
$$;

-- Service-role maintenance command for automatic retention expiry. Scheduling is
-- an operational concern; the function itself is not executable by members.
create or replace function public.purge_expired_nutrition_reusable_sources()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recipe_count integer := 0;
  v_saved_meal_count integer := 0;
begin
  delete from public.nutrition_saved_meals
  where deleted_at is not null
    and purge_after is not null
    and purge_after <= clock_timestamp();
  get diagnostics v_saved_meal_count = row_count;

  delete from public.nutrition_recipes
  where deleted_at is not null
    and purge_after is not null
    and purge_after <= clock_timestamp();
  get diagnostics v_recipe_count = row_count;

  return jsonb_build_object(
    'recipesPurged', v_recipe_count,
    'savedMealsPurged', v_saved_meal_count
  );
end;
$$;

revoke all on function public.soft_delete_nutrition_recipe(uuid) from public, anon;
revoke all on function public.restore_nutrition_recipe(uuid) from public, anon;
revoke all on function public.purge_nutrition_recipe_now(uuid) from public, anon;
revoke all on function public.soft_delete_nutrition_saved_meal(uuid) from public, anon;
revoke all on function public.restore_nutrition_saved_meal(uuid) from public, anon;
revoke all on function public.purge_nutrition_saved_meal_now(uuid) from public, anon;
revoke all on function public.purge_expired_nutrition_reusable_sources() from public, anon, authenticated;

grant execute on function public.soft_delete_nutrition_recipe(uuid) to authenticated, service_role;
grant execute on function public.restore_nutrition_recipe(uuid) to authenticated, service_role;
grant execute on function public.purge_nutrition_recipe_now(uuid) to authenticated, service_role;
grant execute on function public.soft_delete_nutrition_saved_meal(uuid) to authenticated, service_role;
grant execute on function public.restore_nutrition_saved_meal(uuid) to authenticated, service_role;
grant execute on function public.purge_nutrition_saved_meal_now(uuid) to authenticated, service_role;
grant execute on function public.purge_expired_nutrition_reusable_sources() to service_role;

-- ---------------------------------------------------------------------------
-- Optional Recipe cover: one private owner-folder bucket, presentation metadata
-- only. Recipe versions do not carry or own cover imagery.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-covers', 'recipe-covers', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "recipe_covers_storage_owner_select" on storage.objects;
drop policy if exists "recipe_covers_storage_owner_insert" on storage.objects;
drop policy if exists "recipe_covers_storage_owner_update" on storage.objects;
drop policy if exists "recipe_covers_storage_owner_delete" on storage.objects;

create policy "recipe_covers_storage_owner_select"
on storage.objects for select to authenticated
using (bucket_id = 'recipe-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recipe_covers_storage_owner_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'recipe-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recipe_covers_storage_owner_update"
on storage.objects for update to authenticated
using (bucket_id = 'recipe-covers' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'recipe-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recipe_covers_storage_owner_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'recipe-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

notify pgrst, 'reload schema';
