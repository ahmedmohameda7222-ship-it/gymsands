-- Nutrition V1 read-only legacy continuity evidence.
-- This file reports compatibility coverage and unresolved classification only.

select
  'saved_recipes_classification' as check_name,
  count(*)::bigint as source_rows,
  count(*) filter (where saved_item_type = 'recipe' and source_custom_meal_id is null)::bigint as recipe_rows,
  count(*) filter (where saved_item_type = 'meal')::bigint as saved_meal_rows,
  count(*) filter (where saved_item_type = 'template' and source_custom_meal_id is null)::bigint as template_rows,
  count(*) filter (
    where saved_item_type not in ('recipe', 'meal', 'template')
       or saved_item_type is null
       or (saved_item_type in ('recipe', 'template') and source_custom_meal_id is not null)
  )::bigint as unresolved_rows
from public.saved_recipes;

select
  'custom_meals_source_links' as check_name,
  (select count(*) from public.custom_meals)::bigint as source_rows,
  (select count(*) from public.saved_recipes where source_custom_meal_id is not null)::bigint as linked_rows,
  (
    select count(*)
    from public.custom_meals source
    where not exists (
      select 1
      from public.saved_recipes compatible
      where compatible.source_custom_meal_id = source.id
    )
  )::bigint as unresolved_rows;

select
  'legacy_plan_intent' as check_name,
  count(*)::bigint as source_rows,
  count(*) filter (where status in ('planned', 'done', 'completed', 'skipped'))::bigint as recognized_status_rows,
  count(*) filter (where status is null or status not in ('planned', 'done', 'completed', 'skipped'))::bigint as unresolved_rows
from public.user_meal_plan_items;

select
  'legacy_food_logs_actuals' as check_name,
  count(*)::bigint as source_rows,
  count(*) filter (
    where calories is null or protein_g is null or carbs_g is null or fat_g is null
  )::bigint as incomplete_nutrition_rows,
  0::bigint as unresolved_rows
from public.food_logs;

select
  'grouped_actual_links' as check_name,
  (select count(*) from public.food_logs)::bigint as legacy_actual_rows,
  (select count(*) from public.nutrition_log_group_items where food_log_id is not null)::bigint as grouped_link_rows,
  (
    select count(*)
    from public.food_logs legacy
    where not exists (
      select 1
      from public.nutrition_log_group_items grouped
      where grouped.food_log_id = legacy.id
    )
  )::bigint as compatibility_only_rows;
