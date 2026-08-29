begin;

-- Nutrition V1 weeks retain an explicit historical start date. The original
-- table creation accidentally constrained that date to ISO Monday, which
-- conflicts with the approved locale-default plus optional user override.
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'nutrition_meal_plan_weeks'
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%isodow%week_start_date%'
  loop
    execute format('alter table public.nutrition_meal_plan_weeks drop constraint %I', v_constraint);
  end loop;
end;
$$;

commit;
