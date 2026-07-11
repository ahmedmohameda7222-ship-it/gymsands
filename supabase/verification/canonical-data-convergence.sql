-- Read-only cutover evidence for ADRs 0001-0003.
-- Run after the additive convergence migration in an isolated environment and
-- again in production before enabling canonical-only reads. This script returns
-- aggregate evidence only; it does not mutate data or expose user identifiers.

with schedule_executed as (
  select count(*)::bigint total
  from public.user_workout_sessions
  where status in ('started', 'completed', 'skipped')
), linked as (
  select count(*)::bigint total
  from public.workout_sessions
  where scheduled_session_id is not null
)
select
  'performed_session_links' as check_name,
  schedule_executed.total as source_rows,
  linked.total as target_rows,
  schedule_executed.total = linked.total as passed
from schedule_executed cross join linked;

select
  'scheduled_snapshot_links' as check_name,
  (select count(*) from public.user_exercise_logs)::bigint as source_rows,
  (select count(*) from public.exercise_logs where source_user_exercise_log_id is not null)::bigint as target_rows,
  (select count(*) from public.user_exercise_logs)
    = (select count(*) from public.exercise_logs where source_user_exercise_log_id is not null) as passed;

select
  'exercise_catalog_backfill' as check_name,
  (select count(*) from public.workouts)::bigint as source_rows,
  (select count(*) from public.exercises where legacy_workout_id is not null)::bigint as target_rows,
  (select count(*) from public.workouts)
    = (select count(*) from public.exercises where legacy_workout_id is not null) as passed;

select
  'saved_content_headers' as check_name,
  (select count(*) from public.custom_meals)::bigint as source_rows,
  (select count(*) from public.saved_recipes where source_custom_meal_id is not null)::bigint as target_rows,
  (select count(*) from public.custom_meals)
    = (select count(*) from public.saved_recipes where source_custom_meal_id is not null) as passed;

select
  'saved_content_items' as check_name,
  (select count(*) from public.custom_meal_items)::bigint as source_rows,
  (select count(*) from public.saved_recipe_ingredients where source_custom_meal_item_id is not null)::bigint as target_rows,
  (select count(*) from public.custom_meal_items)
    = (select count(*) from public.saved_recipe_ingredients where source_custom_meal_item_id is not null) as passed;

with source_totals as (
  select meal.user_id,
         count(distinct meal.id)::bigint headers,
         count(item.id)::bigint items,
         coalesce(sum(item.calories), 0) total_calories
  from public.custom_meals meal
  left join public.custom_meal_items item on item.meal_id = meal.id
  group by meal.user_id
), target_totals as (
  select recipe.user_id,
         count(distinct recipe.id)::bigint headers,
         count(ingredient.id)::bigint items,
         coalesce(sum(ingredient.calories), 0) total_calories
  from public.saved_recipes recipe
  left join public.saved_recipe_ingredients ingredient on ingredient.recipe_id = recipe.id
  where recipe.source_custom_meal_id is not null
  group by recipe.user_id
), owners as (
  select user_id from source_totals union select user_id from target_totals
)
select
  'saved_content_per_user_totals' as check_name,
  count(*)::bigint as owners_checked,
  count(*) filter (
    where coalesce(source_totals.headers, 0) <> coalesce(target_totals.headers, 0)
       or coalesce(source_totals.items, 0) <> coalesce(target_totals.items, 0)
       or coalesce(source_totals.total_calories, 0) <> coalesce(target_totals.total_calories, 0)
  )::bigint as owners_with_mismatch
from owners
left join source_totals using (user_id)
left join target_totals using (user_id);
