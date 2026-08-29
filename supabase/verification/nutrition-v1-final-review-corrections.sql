do $$
declare
  v_delete_rule text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'water_logs'
      and column_name = 'operation_id'
      and data_type = 'uuid'
  ) then
    raise exception 'water_logs.operation_id is missing.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'water_logs'
      and indexname = 'water_logs_user_operation_id_uq'
      and indexdef ilike '%unique%'
  ) then
    raise exception 'Water owner/operation uniqueness is missing.';
  end if;

  if to_regprocedure('public.log_nutrition_water(uuid,date,integer)') is null then
    raise exception 'log_nutrition_water command is missing.';
  end if;

  if has_function_privilege('anon', 'public.log_nutrition_water(uuid,date,integer)', 'EXECUTE') then
    raise exception 'anon must not execute log_nutrition_water.';
  end if;
  if not has_function_privilege('authenticated', 'public.log_nutrition_water(uuid,date,integer)', 'EXECUTE') then
    raise exception 'authenticated must execute log_nutrition_water.';
  end if;

  select rc.delete_rule into v_delete_rule
  from information_schema.referential_constraints rc
  join information_schema.table_constraints tc
    on tc.constraint_catalog = rc.constraint_catalog
   and tc.constraint_schema = rc.constraint_schema
   and tc.constraint_name = rc.constraint_name
  where tc.table_schema = 'private'
    and tc.table_name = 'nutrition_saved_meal_creation_operations'
    and rc.delete_rule = 'CASCADE'
  limit 1;
  if v_delete_rule is distinct from 'CASCADE' then
    raise exception 'Saved Meal creation replay ownership must cascade on profile deletion.';
  end if;

  if position('private.nutrition_saved_meal_creation_operations' in pg_get_functiondef('public.purge_account_application_data_atomic(uuid)'::regprocedure)) = 0 then
    raise exception 'Account purge does not explicitly cover Saved Meal creation replay rows.';
  end if;
end
$$;
