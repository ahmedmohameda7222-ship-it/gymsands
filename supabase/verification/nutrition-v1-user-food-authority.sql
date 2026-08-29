-- Nutrition V1 Custom Food authority verification. Read-only.

do $$
declare
  nullable_macro_count integer;
  basis_column_count integer;
  deleted_column_count integer;
begin
  select count(*) into nullable_macro_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_food_items'
    and column_name in ('protein_g', 'carbs_g', 'fat_g')
    and is_nullable = 'YES';
  if nullable_macro_count <> 3 then
    raise exception 'Nutrition V1 user Food nullable macro authority missing';
  end if;

  select count(*) into basis_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_food_items'
    and column_name in ('nutrition_basis_amount', 'nutrition_basis_unit');
  if basis_column_count <> 2 then
    raise exception 'Nutrition V1 user Food basis authority missing';
  end if;

  select count(*) into deleted_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_food_items'
    and column_name = 'deleted_at';
  if deleted_column_count <> 1 then
    raise exception 'Nutrition V1 user Food soft-delete authority missing';
  end if;
end $$;
