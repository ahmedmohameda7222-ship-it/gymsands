do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'nutrition_meal_plan_weeks'
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%isodow%week_start_date%'
  ) then
    raise exception 'Nutrition V1 Meal Plan week_start_date is still restricted to a fixed weekday.';
  end if;
end;
$$;
