-- Nutrition V1 privacy purge authority verification.
-- Structural, read-only proof against the locally replayed schema.

do $$
declare
  v_public_oid oid;
  v_core_oid oid;
  v_definition text;
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
    into v_core_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'nutrition_v1_core_purge_account_application_data_atomic'
    and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid';

  if v_core_oid is null then
    raise exception 'nutrition_v1_core_purge_account_application_data_atomic(uuid) is missing';
  end if;

  v_definition := pg_get_functiondef(v_public_oid);
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
    if position(v_table in v_definition) = 0 then
      raise exception 'Nutrition V1 purge authority does not reference %', v_table;
    end if;
  end loop;

  if position('private.nutrition_v1_core_purge_account_application_data_atomic' in v_definition) = 0 then
    raise exception 'Nutrition V1 purge authority does not delegate to prior reviewed purge authority';
  end if;

  if has_function_privilege('authenticated', v_public_oid, 'EXECUTE') then
    raise exception 'authenticated role must not execute account purge authority';
  end if;
  if not has_function_privilege('service_role', v_public_oid, 'EXECUTE') then
    raise exception 'service_role must execute account purge authority';
  end if;
end
$$;
