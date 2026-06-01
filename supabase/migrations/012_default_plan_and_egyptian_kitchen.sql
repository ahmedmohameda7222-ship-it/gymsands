create extension if not exists "pgcrypto";

alter table public.user_workout_plans
  add column if not exists is_default boolean not null default false;

with preferred as (
  select distinct on (user_id) id
  from public.user_workout_plans
  order by user_id, is_active desc, created_at desc
)
update public.user_workout_plans plan
set is_default = plan.id = preferred.id,
    is_active = plan.id = preferred.id
from preferred
where plan.user_id = (select user_id from public.user_workout_plans where id = preferred.id);

create unique index if not exists idx_user_workout_plans_one_default
on public.user_workout_plans(user_id)
where is_default = true;

do $$
declare
  target_kitchen_id uuid;
  legacy_kitchen_id uuid;
begin
  select id into target_kitchen_id
  from public.food_kitchens
  where is_system = true and name = 'Egyptian Kitchen'
  limit 1;

  if target_kitchen_id is null then
    select id into target_kitchen_id
    from public.food_kitchens
    where is_system = true and name = 'Egyptian Food'
    limit 1;

    if target_kitchen_id is not null then
      update public.food_kitchens
      set name = 'Egyptian Kitchen'
      where id = target_kitchen_id;
    else
      insert into public.food_kitchens (name, is_system)
      values ('Egyptian Kitchen', true)
      returning id into target_kitchen_id;
    end if;
  end if;

  for legacy_kitchen_id in
    select id
    from public.food_kitchens
    where is_system = true
      and id <> target_kitchen_id
      and name in ('Egyptian Food', 'Egyptian', 'Egyptian Kitchen')
  loop
    update public.food_items
    set kitchen_id = target_kitchen_id,
        cuisine = 'Egyptian Kitchen'
    where kitchen_id = legacy_kitchen_id;

    update public.user_food_items
    set kitchen_id = target_kitchen_id,
        cuisine = 'Egyptian Kitchen'
    where kitchen_id = legacy_kitchen_id;

    delete from public.food_subcategories where kitchen_id = legacy_kitchen_id;
    delete from public.food_kitchens where id = legacy_kitchen_id;
  end loop;
end $$;

with egyptian as (
  select id from public.food_kitchens where name = 'Egyptian Kitchen' and is_system = true limit 1
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
  select id from public.food_kitchens where name = 'Egyptian Kitchen' and is_system = true limit 1
)
update public.food_items
set
  cuisine = 'Egyptian Kitchen',
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
  and (
    public.food_items.kitchen_id is null
    or public.food_items.kitchen_id = egyptian.id
    or coalesce(public.food_items.cuisine, 'Egyptian') in ('Egyptian', 'Egyptian Food', 'Egyptian Kitchen')
  );

update public.food_items food
set subcategory_id = subcategory.id
from public.food_kitchens kitchen
join public.food_subcategories subcategory on subcategory.kitchen_id = kitchen.id
where kitchen.name = 'Egyptian Kitchen'
  and kitchen.is_system = true
  and food.kitchen_id = kitchen.id
  and food.category = subcategory.name
  and food.subcategory_id is distinct from subcategory.id;
