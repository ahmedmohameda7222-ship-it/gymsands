-- Nutrition V1 privacy purge authority verification.
-- Structural, read-only proof against the locally replayed schema.

do $$
declare
  v_public_oid oid;
  v_nutrition_core_oid oid;
  v_legacy_core_oid oid;
  v_public_definition text;
  v_nutrition_core_definition text;
  v_table text;
begin
  select p.oid
    into v_public_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'purge_account_application_data_atomic'
    and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid';

  if v_public_oid is null then
    raise exception 'purge_account_application_data_atomic(uuid) is missing';
  end if;

  select p.oid
    into v_nutrition_core_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in (
      'nutrition_v1_final_review_core_purge_account_application_data_atomic',
      'nutrition_v1_core_purge_account_application_data_atomic'
    )
    and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid'
  order by case
    when p.proname = 'nutrition_v1_final_review_core_purge_account_application_data_atomic' then 0
    else 1
  end
  limit 1;

  if v_nutrition_core_oid is null then
    raise exception 'Nutrition V1 delegated account purge authority is missing';
  end if;

  select p.oid
    into v_legacy_core_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'nutrition_v1_core_purge_account_application_data_atomic'
    and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid';

  if v_legacy_core_oid is null then
    raise exception 'nutrition_v1_core_purge_account_application_data_atomic(uuid) is missing';
  end if;

  v_public_definition := pg_get_functiondef(v_public_oid);
  v_nutrition_core_definition := pg_get_functiondef(v_nutrition_core_oid);

  foreach v_table in array array[
    'nutrition_recipes',
    'nutrition_recipe_versions',
    'nutrition_recipe_drafts',
    'nutrition_recipe_ingredients',
    'nutrition_recipe_actions',
    'nutrition_recipe_equipment',
    'nutrition_saved_meals',
    'nutrition_saved_meal_items',
    'nutrition_target_periods',
    'nutrition_meal_plan_weeks',
    'nutrition_planned_occurrences',
    'nutrition_meal_plan_change_requests',
    'nutrition_log_groups',
    'nutrition_log_group_items',
    'nutrition_cooking_sessions',
    'nutrition_cooking_action_states',
    'nutrition_cooking_timers',
    'food_personal_corrections',
    'food_favorites'
  ] loop
    if position(v_table in v_nutrition_core_definition) = 0 then
      raise exception 'Nutrition V1 delegated purge authority does not reference %', v_table;
    end if;
  end loop;

  if position('nutrition_saved_meal_creation_operations' in v_public_definition) = 0 then
    raise exception 'Public account purge authority does not explicitly cover Saved Meal creation replay rows';
  end if;

  if position('private.nutrition_v1_final_review_core_purge_account_application_data_atomic' in v_public_definition) = 0 then
    raise exception 'Public account purge authority does not delegate to the reviewed Nutrition V1 purge graph';
  end if;

  if position('private.nutrition_v1_core_purge_account_application_data_atomic' in v_nutrition_core_definition) = 0 then
    raise exception 'Nutrition V1 delegated purge authority does not delegate to prior reviewed purge authority';
  end if;

  if has_function_privilege('authenticated', v_public_oid, 'EXECUTE') then
    raise exception 'authenticated role must not execute account purge authority';
  end if;
  if not has_function_privilege('service_role', v_public_oid, 'EXECUTE') then
    raise exception 'service_role must execute account purge authority';
  end if;
end
$$;
