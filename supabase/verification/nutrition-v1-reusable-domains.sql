-- Disposable local-database verification for Nutrition V1 reusable domains.
-- Every fixture and test-only helper is rolled back.

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1_rejected(p_sql text, p_message text)
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

grant execute on function pg_temp.nv1_assert(boolean, text) to public;
grant execute on function pg_temp.nv1_rejected(text, text) to public;

do $catalog$
declare
  v_signature text;
  v_routine oid;
  v_is_definer boolean;
  v_settings text[];
begin
  if exists (
    select 1
    from (values
      ('nutrition_recipes'),
      ('nutrition_recipe_versions'),
      ('nutrition_recipe_drafts'),
      ('nutrition_recipe_ingredients'),
      ('nutrition_recipe_actions'),
      ('nutrition_recipe_equipment'),
      ('nutrition_saved_meals'),
      ('nutrition_saved_meal_items')
    ) required(table_name)
    left join pg_class relation
      on relation.relname = required.table_name
     and relation.relnamespace = 'public'::regnamespace
     and relation.relkind = 'r'
    where relation.oid is null
  ) then
    raise exception 'Nutrition V1 reusable domain table missing.';
  end if;

  if exists (
    select 1
    from (values
      ('nutrition_recipes'),
      ('nutrition_recipe_versions'),
      ('nutrition_recipe_drafts'),
      ('nutrition_recipe_ingredients'),
      ('nutrition_recipe_actions'),
      ('nutrition_recipe_equipment'),
      ('nutrition_saved_meals'),
      ('nutrition_saved_meal_items')
    ) required(table_name)
    join pg_class relation
      on relation.relname = required.table_name
     and relation.relnamespace = 'public'::regnamespace
    where relation.relrowsecurity is not true
  ) then
    raise exception 'Nutrition V1 reusable domain RLS missing.';
  end if;

  if exists (
    select 1
    from (values ('saved_recipes'), ('custom_meals'), ('custom_meal_items')) required(table_name)
    left join pg_class relation
      on relation.relname = required.table_name
     and relation.relnamespace = 'public'::regnamespace
     and relation.relkind = 'r'
    where relation.oid is null
  ) then
    raise exception 'Legacy Nutrition compatibility table missing.';
  end if;

  if exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.nutrition_saved_meal_items'::regclass
      and constraint_row.contype = 'f'
      and pg_get_constraintdef(constraint_row.oid) ~* '(recipe_id|recipe_version_id)'
  ) then
    raise exception 'Saved Meal Recipe lineage unexpectedly cascades.';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'recipe-covers'
      and name = 'recipe-covers'
      and public is false
  ) then
    raise exception 'Recipe cover bucket is not private.';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'recipe_covers_storage_owner_select',
        'recipe_covers_storage_owner_insert',
        'recipe_covers_storage_owner_update',
        'recipe_covers_storage_owner_delete'
      )
  ) <> 4 then
    raise exception 'Recipe cover owner policies are incomplete.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.nutrition_recipe_versions'::regclass
      and tgname = 'prevent_nutrition_recipe_version_update'
      and not tgisinternal
  ) then
    raise exception 'Published Recipe immutability trigger is missing.';
  end if;

  foreach v_signature in array array[
    'public.soft_delete_nutrition_recipe(uuid)',
    'public.restore_nutrition_recipe(uuid)',
    'public.purge_nutrition_recipe_now(uuid)',
    'public.soft_delete_nutrition_saved_meal(uuid)',
    'public.restore_nutrition_saved_meal(uuid)',
    'public.purge_nutrition_saved_meal_now(uuid)'
  ] loop
    v_routine := to_regprocedure(v_signature);
    if v_routine is null then
      raise exception 'Nutrition V1 lifecycle RPC missing: %', v_signature;
    end if;

    select prosecdef, proconfig
      into v_is_definer, v_settings
    from pg_proc
    where oid = v_routine;

    if not v_is_definer
       or coalesce(array_to_string(v_settings, ','), '') not like '%search_path=pg_catalog, public%'
    then
      raise exception 'Nutrition V1 lifecycle RPC is not hardened: %', v_signature;
    end if;
    if has_function_privilege('anon', v_routine, 'execute')
       or not has_function_privilege('authenticated', v_routine, 'execute')
       or not has_function_privilege('service_role', v_routine, 'execute')
    then
      raise exception 'Nutrition V1 lifecycle RPC grants are invalid: %', v_signature;
    end if;
  end loop;

  v_routine := to_regprocedure('public.purge_expired_nutrition_reusable_sources()');
  if v_routine is null
     or has_function_privilege('anon', v_routine, 'execute')
     or has_function_privilege('authenticated', v_routine, 'execute')
     or not has_function_privilege('service_role', v_routine, 'execute')
  then
    raise exception 'Nutrition V1 retention purge authority grants are invalid.';
  end if;
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a2100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'nutrition-v1-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'nutrition-v1-intruder@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.nutrition_recipes (id, user_id, name)
values (
  'a2100000-0000-4000-8000-000000000010',
  'a2100000-0000-4000-8000-000000000001',
  'Frozen lineage recipe'
);

insert into public.nutrition_recipe_drafts (id, recipe_id, user_id, name, servings)
values (
  'a2100000-0000-4000-8000-000000000011',
  'a2100000-0000-4000-8000-000000000010',
  'a2100000-0000-4000-8000-000000000001',
  'Frozen lineage recipe',
  2
);

select pg_temp.nv1_rejected(
  $$insert into public.nutrition_recipe_versions (
    recipe_id, user_id, version_number, name, servings
  ) values (
    'a2100000-0000-4000-8000-000000000010',
    'a2100000-0000-4000-8000-000000000001',
    1, 'Forged published version', 2
  )$$,
  'Authenticated client published a Recipe version directly.'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.nutrition_recipe_versions (
  id, recipe_id, user_id, version_number, name, servings, metadata
) values (
  'a2100000-0000-4000-8000-000000000012',
  'a2100000-0000-4000-8000-000000000010',
  'a2100000-0000-4000-8000-000000000001',
  1, 'Frozen lineage recipe', 2, '{"nutritionComplete":false}'::jsonb
);

select pg_temp.nv1_rejected(
  $$update public.nutrition_recipe_versions
    set name = 'Mutated published version'
    where id = 'a2100000-0000-4000-8000-000000000012'$$,
  'Published Recipe version was mutable.'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.nutrition_saved_meals (id, user_id, name)
values (
  'a2100000-0000-4000-8000-000000000020',
  'a2100000-0000-4000-8000-000000000001',
  'Frozen Recipe meal'
);

insert into public.nutrition_saved_meal_items (
  id, saved_meal_id, user_id, position, item_type,
  recipe_id, recipe_version_id, resolved_quantity,
  resolved_serving_label, frozen_name, frozen_snapshot
) values (
  'a2100000-0000-4000-8000-000000000021',
  'a2100000-0000-4000-8000-000000000020',
  'a2100000-0000-4000-8000-000000000001',
  0, 'recipe',
  'a2100000-0000-4000-8000-000000000010',
  'a2100000-0000-4000-8000-000000000012',
  1, '1 serving', 'Frozen lineage recipe',
  '{"nutrition":{"caloriesKcal":null},"nutritionComplete":false}'::jsonb
);

select public.soft_delete_nutrition_recipe(
  'a2100000-0000-4000-8000-000000000010'
);
select pg_temp.nv1_assert(
  (
    select deleted_at is not null
       and purge_after = deleted_at + interval '30 days'
    from public.nutrition_recipes
    where id = 'a2100000-0000-4000-8000-000000000010'
  ),
  'Recipe recovery window is not exactly 30 days.'
);

select public.restore_nutrition_recipe(
  'a2100000-0000-4000-8000-000000000010'
);
select pg_temp.nv1_assert(
  (
    select id = 'a2100000-0000-4000-8000-000000000010'
       and deleted_at is null
       and purge_after is null
    from public.nutrition_recipes
    where id = 'a2100000-0000-4000-8000-000000000010'
  ),
  'Recipe restore did not preserve the same identity.'
);

select public.soft_delete_nutrition_saved_meal(
  'a2100000-0000-4000-8000-000000000020'
);
select public.restore_nutrition_saved_meal(
  'a2100000-0000-4000-8000-000000000020'
);
select pg_temp.nv1_assert(
  (
    select id = 'a2100000-0000-4000-8000-000000000020'
       and deleted_at is null
       and purge_after is null
    from public.nutrition_saved_meals
    where id = 'a2100000-0000-4000-8000-000000000020'
  ),
  'Saved Meal restore did not preserve the same identity.'
);

select public.soft_delete_nutrition_recipe(
  'a2100000-0000-4000-8000-000000000010'
);
select public.purge_nutrition_recipe_now(
  'a2100000-0000-4000-8000-000000000010'
);
select pg_temp.nv1_assert(
  not exists (
    select 1 from public.nutrition_recipes
    where id = 'a2100000-0000-4000-8000-000000000010'
  )
  and exists (
    select 1
    from public.nutrition_saved_meal_items
    where id = 'a2100000-0000-4000-8000-000000000021'
      and recipe_id = 'a2100000-0000-4000-8000-000000000010'
      and recipe_version_id = 'a2100000-0000-4000-8000-000000000012'
      and frozen_snapshot->'nutrition'->>'caloriesKcal' is null
  ),
  'Permanent Recipe deletion destroyed frozen Saved Meal lineage.'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2100000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select pg_temp.nv1_assert(
  not exists (
    select 1
    from public.nutrition_saved_meals
    where id = 'a2100000-0000-4000-8000-000000000020'
  ),
  'Nutrition V1 reusable-domain owner RLS exposed another user row.'
);
select pg_temp.nv1_rejected(
  $$select public.soft_delete_nutrition_saved_meal(
    'a2100000-0000-4000-8000-000000000020'
  )$$,
  'Non-owner lifecycle command mutated a Saved Meal.'
);

rollback;

\echo 'Nutrition V1 reusable-domain verification passed: additive tables, owner RLS, immutable versions, 30-day restore, frozen lineage, legacy preservation, lifecycle grants, and private Recipe covers.'
