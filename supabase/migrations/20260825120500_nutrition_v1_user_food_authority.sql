-- Nutrition V1 Custom Food authority correction.
-- Additive/preservation-safe and intentionally pending: no Production execution is authorized here.

alter table public.user_food_items
  alter column protein_g drop not null,
  alter column carbs_g drop not null,
  alter column fat_g drop not null,
  add column if not exists nutrition_basis_amount numeric check (nutrition_basis_amount is null or nutrition_basis_amount > 0),
  add column if not exists nutrition_basis_unit text check (nutrition_basis_unit is null or nutrition_basis_unit in ('g', 'ml', 'serving', 'piece', 'custom')),
  add column if not exists deleted_at timestamptz;

create index if not exists user_food_items_owner_active_idx
  on public.user_food_items(user_id, updated_at desc, id)
  where deleted_at is null;
