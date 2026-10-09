-- Permanent verification for Food Catalog Plan 7 Task 17 retirement contract.
\set ON_ERROR_STOP on

begin read only;

do $plan7_retirement_contract$
declare
  v_missing text[];
begin
  if to_regprocedure('public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)') is not null then
    raise exception 'Plan 7 retired Food Library RPC still exists.';
  end if;

  if to_regclass('public.food_aliases') is not null then
    raise exception 'Plan 7 retired public.food_aliases still exists.';
  end if;

  if to_regclass('public.food_market_relevance') is not null then
    raise exception 'Plan 7 retired public.food_market_relevance still exists.';
  end if;

  if to_regclass('public.food_personal_corrections') is null then
    raise exception 'Plan 7 retained public.food_personal_corrections is missing.';
  end if;

  if to_regclass('public.user_food_favorites') is null then
    raise exception 'Plan 7 retained public.user_food_favorites is missing.';
  end if;

  if to_regclass('public.food_favorites') is null then
    raise exception 'Plan 7 retained public.food_favorites is missing.';
  end if;

  if to_regclass('public.food_barcodes') is null
     or to_regclass('public.food_catalog_search_documents') is null
     or to_regclass('public.food_catalog_current_generation') is null then
    raise exception 'Plan 7 retained canonical Food Catalog relations are missing.';
  end if;

  if to_regclass('public.food_personal_overrides') is null
     or to_regclass('public.food_personal_override_revisions') is null
     or to_regclass('public.food_personal_override_operations') is null then
    raise exception 'Plan 7 retained Personal Override authority is missing.';
  end if;

  if to_regprocedure('public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)') is null
     or to_regprocedure('public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)') is null
     or to_regprocedure('public.rebuild_food_catalog_search_projection_v2(uuid,text,text)') is null then
    raise exception 'Plan 7 retained Search V2/rebuild authority is missing.';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)',
      'EXECUTE'
    )
     or has_function_privilege(
      'anon',
      'public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)',
      'EXECUTE'
    ) then
    raise exception 'Plan 7 browser Search V2 execute boundary changed.';
  end if;

  if not has_function_privilege(
      'service_role',
      'public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)',
      'EXECUTE'
    )
     or has_function_privilege(
      'authenticated',
      'public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)',
      'EXECUTE'
    ) then
    raise exception 'Plan 7 MCP Search V2 execute boundary changed.';
  end if;

  select array_agg(required.column_name order by required.column_name)
    into v_missing
  from (
    values
      ('id'),
      ('lifecycle_status'),
      ('food_name'),
      ('serving_size'),
      ('calories'),
      ('protein_g'),
      ('carbs_g'),
      ('fat_g'),
      ('fiber_g'),
      ('sugar_g'),
      ('sodium_mg'),
      ('saturated_fat_g'),
      ('sugars_g'),
      ('nutrition_basis_amount'),
      ('nutrition_basis_unit'),
      ('category'),
      ('cuisine'),
      ('is_verified'),
      ('verified_at'),
      ('verified_source_record_id'),
      ('is_market_global'),
      ('merged_into_food_id')
  ) required(column_name)
  left join information_schema.columns actual
    on actual.table_schema = 'public'
   and actual.table_name = 'food_items'
   and actual.column_name = required.column_name
  where actual.column_name is null;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'Plan 7 retirement removed unapproved food_items columns: %', v_missing;
  end if;

  if not exists (
    select 1
    from public.release_schema_compatibility
    where singleton = true
      and version::text = '2'
      and migration_version::text = '20260724232734'
  ) then
    raise exception 'Plan 7 retirement changed the released compatibility marker.';
  end if;
end
$plan7_retirement_contract$;

rollback;
