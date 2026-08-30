-- Disposable local RED/GREEN verification for nullable legacy Meal Plan nutrition snapshots.
\set ON_ERROR_STOP on

begin;

do $contract$
declare
  v_nullable_count integer;
begin
  select count(*)
    into v_nullable_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_meal_plan_items'
    and column_name in ('calories', 'protein_g', 'carbs_g', 'fat_g')
    and is_nullable = 'YES';

  if v_nullable_count <> 4 then
    raise exception 'user_meal_plan_items nullable nutrition contract missing: expected 4 nullable core nutrition columns, found %.', v_nullable_count;
  end if;
end
$contract$;

rollback;
