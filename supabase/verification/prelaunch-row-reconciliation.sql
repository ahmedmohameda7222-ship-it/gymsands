-- Run before and after the full pending migration chain on an isolated production-like database.
-- Export each result as JSON and compare stable counts/links; do not run destructive cleanup here.

select jsonb_build_object(
  'workouts', (select count(*) from public.workouts),
  'exercises', (select count(*) from public.exercises),
  'legacy_workouts_linked', (select count(*) from public.exercises where legacy_workout_id is not null),
  'custom_meals', (select count(*) from public.custom_meals),
  'saved_recipes', (select count(*) from public.saved_recipes),
  'custom_meals_linked', (select count(*) from public.saved_recipes where source_custom_meal_id is not null),
  'custom_meal_items', (select count(*) from public.custom_meal_items),
  'saved_recipe_ingredients', (select count(*) from public.saved_recipe_ingredients),
  'custom_meal_items_linked', (select count(*) from public.saved_recipe_ingredients where source_custom_meal_item_id is not null),
  'scheduled_sessions', (select count(*) from public.user_workout_sessions),
  'performed_sessions', (select count(*) from public.workout_sessions),
  'linked_performed_sessions', (select count(*) from public.workout_sessions where scheduled_session_id is not null),
  'exercise_logs', (select count(*) from public.exercise_logs),
  'linked_snapshot_logs', (select count(*) from public.exercise_logs where source_user_exercise_log_id is not null)
) as reconciliation_counts;

select 'duplicate_scheduled_session_link' as violation, scheduled_session_id::text as key, count(*) as count
from public.workout_sessions where scheduled_session_id is not null
group by scheduled_session_id having count(*) > 1
union all
select 'duplicate_legacy_workout_link', legacy_workout_id::text, count(*)
from public.exercises where legacy_workout_id is not null
group by legacy_workout_id having count(*) > 1
union all
select 'duplicate_custom_meal_link', source_custom_meal_id::text, count(*)
from public.saved_recipes where source_custom_meal_id is not null
group by source_custom_meal_id having count(*) > 1;
