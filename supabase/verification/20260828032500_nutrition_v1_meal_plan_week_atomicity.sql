do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'mutate_nutrition_meal_plan_week'
      and pg_get_function_identity_arguments(p.oid) = 'p_week_id uuid, p_base_revision bigint, p_mutation jsonb'
      and p.prosecdef
      and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, public%'
  ) then
    raise exception 'Meal Plan week mutation authority is missing or unhardened.';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'nutrition_planned_occurrences'
      and t.tgname = 'enforce_nutrition_planned_occurrence_week_date'
      and not t.tgisinternal
  ) then
    raise exception 'Meal Plan occurrence week/date trigger is missing.';
  end if;

  if exists (
    select 1
    from public.nutrition_planned_occurrences occurrence
    join public.nutrition_meal_plan_weeks week
      on week.id = occurrence.week_id
     and week.user_id = occurrence.user_id
    where occurrence.plan_date < week.week_start_date
       or occurrence.plan_date >= week.week_start_date + 7
  ) then
    raise exception 'Meal Plan contains an occurrence outside its target week.';
  end if;

  if has_function_privilege('anon', 'public.mutate_nutrition_meal_plan_week(uuid,bigint,jsonb)', 'execute') then
    raise exception 'Anonymous role must not execute Meal Plan week mutation authority.';
  end if;

  if not has_function_privilege('authenticated', 'public.mutate_nutrition_meal_plan_week(uuid,bigint,jsonb)', 'execute') then
    raise exception 'Authenticated role cannot execute Meal Plan week mutation authority.';
  end if;
end;
$$;
