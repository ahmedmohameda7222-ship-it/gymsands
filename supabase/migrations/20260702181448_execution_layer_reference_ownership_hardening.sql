-- Ensure foreign references on execution-layer rows also belong to the caller.

drop policy if exists user_progression_targets_insert_own on public.user_progression_targets;
create policy user_progression_targets_insert_own on public.user_progression_targets
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_workout_plan_exercises exercise
      join public.user_workout_plan_days day on day.id = exercise.plan_day_id
      join public.user_workout_plans plan on plan.id = day.plan_id
      where exercise.id = plan_exercise_id and plan.user_id = (select auth.uid())
    )
  );

drop policy if exists user_progression_targets_update_own on public.user_progression_targets;
create policy user_progression_targets_update_own on public.user_progression_targets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_workout_plan_exercises exercise
      join public.user_workout_plan_days day on day.id = exercise.plan_day_id
      join public.user_workout_plans plan on plan.id = day.plan_id
      where exercise.id = plan_exercise_id and plan.user_id = (select auth.uid())
    )
  );

drop policy if exists user_exercise_alternatives_insert_own on public.user_exercise_alternatives;
create policy user_exercise_alternatives_insert_own on public.user_exercise_alternatives
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_workout_plan_exercises exercise
      join public.user_workout_plan_days day on day.id = exercise.plan_day_id
      join public.user_workout_plans plan on plan.id = day.plan_id
      where exercise.id = plan_exercise_id and plan.user_id = (select auth.uid())
    )
  );

drop policy if exists user_exercise_alternatives_update_own on public.user_exercise_alternatives;
create policy user_exercise_alternatives_update_own on public.user_exercise_alternatives
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_workout_plan_exercises exercise
      join public.user_workout_plan_days day on day.id = exercise.plan_day_id
      join public.user_workout_plans plan on plan.id = day.plan_id
      where exercise.id = plan_exercise_id and plan.user_id = (select auth.uid())
    )
  );

drop policy if exists user_grocery_items_insert_own on public.user_grocery_items;
create policy user_grocery_items_insert_own on public.user_grocery_items
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (
      source_meal_plan_item_id is null
      or exists (
        select 1 from public.user_meal_plan_items meal
        where meal.id = source_meal_plan_item_id and meal.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists user_grocery_items_update_own on public.user_grocery_items;
create policy user_grocery_items_update_own on public.user_grocery_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      source_meal_plan_item_id is null
      or exists (
        select 1 from public.user_meal_plan_items meal
        where meal.id = source_meal_plan_item_id and meal.user_id = (select auth.uid())
      )
    )
  );
