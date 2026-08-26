begin;

-- Nutrition V1 extends the reviewed account-data purge authority additively.
-- Frozen consumer rows are deleted as owner data; source lineage is never
-- rewritten before deletion and no Production migration is applied here.
alter function public.purge_account_application_data_atomic(uuid) set schema private;
alter function private.purge_account_application_data_atomic(uuid)
  rename to nutrition_v1_core_purge_account_application_data_atomic;

create function public.purge_account_application_data_atomic(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_nutrition_recipes integer := 0;
  v_nutrition_recipe_versions integer := 0;
  v_nutrition_recipe_drafts integer := 0;
  v_nutrition_recipe_ingredients integer := 0;
  v_nutrition_recipe_actions integer := 0;
  v_nutrition_recipe_equipment integer := 0;
  v_nutrition_saved_meals integer := 0;
  v_nutrition_saved_meal_items integer := 0;
  v_nutrition_target_periods integer := 0;
  v_nutrition_meal_plan_weeks integer := 0;
  v_nutrition_planned_occurrences integer := 0;
  v_nutrition_meal_plan_change_requests integer := 0;
  v_nutrition_log_groups integer := 0;
  v_nutrition_log_group_items integer := 0;
  v_nutrition_cooking_sessions integer := 0;
  v_nutrition_cooking_action_states integer := 0;
  v_nutrition_cooking_timers integer := 0;
  v_food_personal_corrections integer := 0;
  v_food_favorites integer := 0;
begin
  -- Cooking children first.
  delete from public.nutrition_cooking_timers where user_id = p_user_id;
  get diagnostics v_nutrition_cooking_timers = row_count;
  delete from public.nutrition_cooking_action_states where user_id = p_user_id;
  get diagnostics v_nutrition_cooking_action_states = row_count;
  delete from public.nutrition_cooking_sessions where user_id = p_user_id;
  get diagnostics v_nutrition_cooking_sessions = row_count;

  -- Meal-plan consumers can reference actual log groups with RESTRICT, so
  -- occurrences are removed before the grouped actual-consumption envelope.
  delete from public.nutrition_meal_plan_change_requests where user_id = p_user_id;
  get diagnostics v_nutrition_meal_plan_change_requests = row_count;
  delete from public.nutrition_planned_occurrences where user_id = p_user_id;
  get diagnostics v_nutrition_planned_occurrences = row_count;
  delete from public.nutrition_meal_plan_weeks where user_id = p_user_id;
  get diagnostics v_nutrition_meal_plan_weeks = row_count;
  delete from public.nutrition_log_group_items where user_id = p_user_id;
  get diagnostics v_nutrition_log_group_items = row_count;
  delete from public.nutrition_log_groups where user_id = p_user_id;
  get diagnostics v_nutrition_log_groups = row_count;

  delete from public.nutrition_saved_meal_items where user_id = p_user_id;
  get diagnostics v_nutrition_saved_meal_items = row_count;
  delete from public.nutrition_saved_meals where user_id = p_user_id;
  get diagnostics v_nutrition_saved_meals = row_count;

  -- Recipe draft/version children precede roots. Historical consumers were
  -- already deleted above and therefore never require source-lineage mutation.
  delete from public.nutrition_recipe_ingredients where user_id = p_user_id;
  get diagnostics v_nutrition_recipe_ingredients = row_count;
  delete from public.nutrition_recipe_actions where user_id = p_user_id;
  get diagnostics v_nutrition_recipe_actions = row_count;
  delete from public.nutrition_recipe_equipment where user_id = p_user_id;
  get diagnostics v_nutrition_recipe_equipment = row_count;
  delete from public.nutrition_recipe_drafts where user_id = p_user_id;
  get diagnostics v_nutrition_recipe_drafts = row_count;
  delete from public.nutrition_recipe_versions where user_id = p_user_id;
  get diagnostics v_nutrition_recipe_versions = row_count;
  delete from public.nutrition_recipes where user_id = p_user_id;
  get diagnostics v_nutrition_recipes = row_count;

  delete from public.nutrition_target_periods where user_id = p_user_id;
  get diagnostics v_nutrition_target_periods = row_count;
  delete from public.food_personal_corrections where user_id = p_user_id;
  get diagnostics v_food_personal_corrections = row_count;
  delete from public.food_favorites where user_id = p_user_id;
  get diagnostics v_food_favorites = row_count;

  if exists (
    select 1 from public.nutrition_recipes where user_id = p_user_id
    union all select 1 from public.nutrition_recipe_versions where user_id = p_user_id
    union all select 1 from public.nutrition_recipe_drafts where user_id = p_user_id
    union all select 1 from public.nutrition_recipe_ingredients where user_id = p_user_id
    union all select 1 from public.nutrition_recipe_actions where user_id = p_user_id
    union all select 1 from public.nutrition_recipe_equipment where user_id = p_user_id
    union all select 1 from public.nutrition_saved_meals where user_id = p_user_id
    union all select 1 from public.nutrition_saved_meal_items where user_id = p_user_id
    union all select 1 from public.nutrition_target_periods where user_id = p_user_id
    union all select 1 from public.nutrition_meal_plan_weeks where user_id = p_user_id
    union all select 1 from public.nutrition_planned_occurrences where user_id = p_user_id
    union all select 1 from public.nutrition_meal_plan_change_requests where user_id = p_user_id
    union all select 1 from public.nutrition_log_groups where user_id = p_user_id
    union all select 1 from public.nutrition_log_group_items where user_id = p_user_id
    union all select 1 from public.nutrition_cooking_sessions where user_id = p_user_id
    union all select 1 from public.nutrition_cooking_action_states where user_id = p_user_id
    union all select 1 from public.nutrition_cooking_timers where user_id = p_user_id
    union all select 1 from public.food_personal_corrections where user_id = p_user_id
    union all select 1 from public.food_favorites where user_id = p_user_id
  ) then
    raise exception 'Nutrition V1 account-data purge left owner rows behind.' using errcode = '23514';
  end if;

  v_result := private.nutrition_v1_core_purge_account_application_data_atomic(p_user_id);
  return v_result || jsonb_build_object(
    'nutrition_recipes_deleted', v_nutrition_recipes,
    'nutrition_recipe_versions_deleted', v_nutrition_recipe_versions,
    'nutrition_recipe_drafts_deleted', v_nutrition_recipe_drafts,
    'nutrition_recipe_ingredients_deleted', v_nutrition_recipe_ingredients,
    'nutrition_recipe_actions_deleted', v_nutrition_recipe_actions,
    'nutrition_recipe_equipment_deleted', v_nutrition_recipe_equipment,
    'nutrition_saved_meals_deleted', v_nutrition_saved_meals,
    'nutrition_saved_meal_items_deleted', v_nutrition_saved_meal_items,
    'nutrition_target_periods_deleted', v_nutrition_target_periods,
    'nutrition_meal_plan_weeks_deleted', v_nutrition_meal_plan_weeks,
    'nutrition_planned_occurrences_deleted', v_nutrition_planned_occurrences,
    'nutrition_meal_plan_change_requests_deleted', v_nutrition_meal_plan_change_requests,
    'nutrition_log_groups_deleted', v_nutrition_log_groups,
    'nutrition_log_group_items_deleted', v_nutrition_log_group_items,
    'nutrition_cooking_sessions_deleted', v_nutrition_cooking_sessions,
    'nutrition_cooking_action_states_deleted', v_nutrition_cooking_action_states,
    'nutrition_cooking_timers_deleted', v_nutrition_cooking_timers,
    'food_personal_corrections_deleted', v_food_personal_corrections,
    'food_favorites_deleted', v_food_favorites
  );
end
$$;

revoke all on function private.nutrition_v1_core_purge_account_application_data_atomic(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.purge_account_application_data_atomic(uuid)
  from public, anon, authenticated;
grant execute on function public.purge_account_application_data_atomic(uuid) to service_role;

comment on function public.purge_account_application_data_atomic(uuid) is
  'Service-role account deletion authority. Deletes the complete owner-scoped Nutrition V1 graph in dependency-safe order before delegating to the previously reviewed application-data purge implementation.';

notify pgrst, 'reload schema';
commit;
