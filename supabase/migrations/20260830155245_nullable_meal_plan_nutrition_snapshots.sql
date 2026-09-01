begin;

-- Catalog-derived Meal Plan snapshots may carry independently unknown nutrition.
-- Dropping NOT NULL is catalog metadata only: existing rows and non-negative CHECKs remain unchanged.
alter table public.user_meal_plan_items
  alter column calories drop not null,
  alter column protein_g drop not null,
  alter column carbs_g drop not null,
  alter column fat_g drop not null;

commit;
