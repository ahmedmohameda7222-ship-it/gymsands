-- Disposable local verification for nullable legacy Meal Plan nutrition snapshots.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1n_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1n_rejected(p_sql text, p_message text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception '%', p_message;
end
$function$;

grant execute on function pg_temp.nv1n_assert(boolean, text) to public;
grant execute on function pg_temp.nv1n_rejected(text, text) to public;

-- Chronological replay must leave all four frozen snapshot nutrients nullable.
do $columns$
declare
  v_nullable_count integer;
  v_column text;
  v_has_check boolean;
begin
  select count(*)
    into v_nullable_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_meal_plan_items'
    and column_name in ('calories', 'protein_g', 'carbs_g', 'fat_g')
    and is_nullable = 'YES';

  if v_nullable_count <> 4 then
    raise exception 'user_meal_plan_items nullable nutrition contract missing: expected 4 nullable core nutrition columns, found %.', v_nullable_count;
  end if;

  foreach v_column in array array['calories', 'protein_g', 'carbs_g', 'fat_g'] loop
    select exists (
      select 1
      from pg_constraint
      where conrelid = 'public.user_meal_plan_items'::regclass
        and contype = 'c'
        and lower(pg_get_constraintdef(oid)) like '%' || v_column || '%'
        and pg_get_constraintdef(oid) like '%>=%'
    ) into v_has_check;

    if not v_has_check then
      raise exception 'Non-negative CHECK constraint for user_meal_plan_items.% is missing.', v_column;
    end if;
  end loop;
end
$columns$;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a2300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'nullable-meal-plan-owner@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

-- Nullable catalog-derived snapshot: NULL and known zero must remain distinct.
insert into public.user_meal_plan_items (
  id, user_id, plan_date, meal_type, food_item_id, user_food_item_id,
  food_name, serving_size, quantity, calories, protein_g, carbs_g, fat_g,
  status, food_log_id, completed_at, notes
) values (
  'a2300000-0000-4000-8000-000000000010',
  'a2300000-0000-4000-8000-000000000001',
  date '2026-08-30', 'Lunch', null, null,
  'Incomplete catalog lunch', '1 serving', 1,
  null, 0, null, 4,
  'planned', null, null, 'nullable snapshot verification'
);

select pg_temp.nv1n_assert(
  (
    select calories is null
       and protein_g = 0
       and carbs_g is null
       and fat_g = 4
    from public.user_meal_plan_items
    where id = 'a2300000-0000-4000-8000-000000000010'
  ),
  'Nullable Meal Plan snapshot did not preserve NULL and known zero distinctly.'
);

-- Existing fully-known persistence must continue to work.
insert into public.user_meal_plan_items (
  id, user_id, plan_date, meal_type, food_item_id, user_food_item_id,
  food_name, serving_size, quantity, calories, protein_g, carbs_g, fat_g,
  status, food_log_id, completed_at, notes
) values (
  'a2300000-0000-4000-8000-000000000011',
  'a2300000-0000-4000-8000-000000000001',
  date '2026-08-30', 'Dinner', null, null,
  'Fully known dinner', '1 plate', 1,
  500, 35, 55, 14,
  'planned', null, null, null
);

select pg_temp.nv1n_assert(
  (
    select calories = 500 and protein_g = 35 and carbs_g = 55 and fat_g = 14
    from public.user_meal_plan_items
    where id = 'a2300000-0000-4000-8000-000000000011'
  ),
  'Fully-known Meal Plan persistence regressed.'
);

-- The migration must not weaken the existing non-negative behavior.
select pg_temp.nv1n_rejected(
  $$update public.user_meal_plan_items set calories = -1 where id = 'a2300000-0000-4000-8000-000000000011'$$,
  'Negative known calories were accepted.'
);
select pg_temp.nv1n_rejected(
  $$update public.user_meal_plan_items set protein_g = -1 where id = 'a2300000-0000-4000-8000-000000000011'$$,
  'Negative known protein was accepted.'
);
select pg_temp.nv1n_rejected(
  $$update public.user_meal_plan_items set carbs_g = -1 where id = 'a2300000-0000-4000-8000-000000000011'$$,
  'Negative known carbs were accepted.'
);
select pg_temp.nv1n_rejected(
  $$update public.user_meal_plan_items set fat_g = -1 where id = 'a2300000-0000-4000-8000-000000000011'$$,
  'Negative known fat was accepted.'
);

-- DROP NOT NULL is catalog-only and must not rewrite a pre-existing row.
create temporary table nv1n_row_before on commit drop as
select id, calories, protein_g, carbs_g, fat_g, xmin::text as row_xmin
from public.user_meal_plan_items
where id = 'a2300000-0000-4000-8000-000000000011';

alter table public.user_meal_plan_items
  alter column calories drop not null,
  alter column protein_g drop not null,
  alter column carbs_g drop not null,
  alter column fat_g drop not null;

select pg_temp.nv1n_assert(
  (
    select before.calories is not distinct from after.calories
       and before.protein_g is not distinct from after.protein_g
       and before.carbs_g is not distinct from after.carbs_g
       and before.fat_g is not distinct from after.fat_g
       and before.row_xmin = after.xmin::text
    from nv1n_row_before before
    join public.user_meal_plan_items after using (id)
  ),
  'Nullable snapshot DDL rewrote an existing Meal Plan row.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- The real completion function must copy NULL snapshots into the linked Food Log.
select public.complete_meal_plan_item('a2300000-0000-4000-8000-000000000010');
reset role;

select pg_temp.nv1n_assert(
  (
    select item.status = 'done'
       and item.food_log_id is not null
       and log.calories is null
       and log.protein_g = 0
       and log.carbs_g is null
       and log.fat_g = 4
    from public.user_meal_plan_items item
    join public.food_logs log on log.id = item.food_log_id
    where item.id = 'a2300000-0000-4000-8000-000000000010'
  ),
  'Completed Meal Plan -> Food Log flow did not preserve NULL nutrition.'
);

-- The real completed-item correction function must preserve NULL rather than fabricate zero.
set local role authenticated;
select public.correct_completed_meal_plan_item(
  'a2300000-0000-4000-8000-000000000010',
  date '2026-08-31',
  'Dinner',
  'Corrected incomplete catalog dinner',
  '2 servings',
  2,
  null,
  0,
  null,
  8,
  'corrected nullable snapshot'
);
reset role;

select pg_temp.nv1n_assert(
  (
    select item.plan_date = date '2026-08-31'
       and item.calories is null
       and item.protein_g = 0
       and item.carbs_g is null
       and item.fat_g = 8
       and log.log_date = date '2026-08-31'
       and log.calories is null
       and log.protein_g = 0
       and log.carbs_g is null
       and log.fat_g = 8
    from public.user_meal_plan_items item
    join public.food_logs log on log.id = item.food_log_id
    where item.id = 'a2300000-0000-4000-8000-000000000010'
  ),
  'Completed Meal Plan correction fabricated nutrition or lost NULL state.'
);

-- Existing manual/execution-value validation still rejects invalid known nutrition.
set local role authenticated;
select pg_temp.nv1n_rejected(
  $$select public.complete_meal_plan_item_with_values(
    'a2300000-0000-4000-8000-000000000011',
    'Dinner', 'Manual dinner', '1 plate', 1,
    -1, 35, 55, 14, null, true
  )$$,
  'Manual/direct Meal Plan execution accepted negative known nutrition.'
);
reset role;

select pg_temp.nv1n_assert(
  (
    select status = 'planned'
       and calories = 500
       and protein_g = 35
       and carbs_g = 55
       and fat_g = 14
    from public.user_meal_plan_items
    where id = 'a2300000-0000-4000-8000-000000000011'
  ),
  'Rejected manual/direct execution mutated the saved Meal Plan snapshot.'
);

rollback;
