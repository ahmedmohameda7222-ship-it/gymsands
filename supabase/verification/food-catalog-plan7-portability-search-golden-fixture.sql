-- Runtime-only fixture for the Plan 7 canonical Search V2 golden matrix.
-- Transaction ownership and projection rebuild orchestration belong to
-- scripts/capture-food-catalog-restored-search-runtime.mjs.

insert into public.food_catalog_search_nutrition_policies(
  policy_version,high_protein_min_g_per_100,low_carb_max_g_per_100,authority_reference,created_at
) values (
  'plan7-runtime-golden-v1',30,5,'fixture://plan7/runtime-golden','2026-09-10T18:30:00Z'
);

insert into public.food_names(
  id,food_id,language_tag,name_role,name_text,normalized_text,script_code,origin,source_record_id,policy_version,created_at
) values
  ('71000000-0000-4000-8000-000000000e11','71000000-0000-4000-8000-000000000101','en','search_alias','Portable Poultry','portable poultry','Latn','curated','71000000-0000-4000-8000-000000000201','plan7-fixture-v1','2026-09-10T18:30:10Z'),
  ('71000000-0000-4000-8000-000000000e12','71000000-0000-4000-8000-000000000101','de','preferred_display','Plan7 Tragbares Huhn','plan7 tragbares huhn','Latn','curated','71000000-0000-4000-8000-000000000201','plan7-fixture-v1','2026-09-10T18:30:11Z');
insert into public.food_catalog_generation_names(generation_id,food_id,name_fact_id) values
  ('71000000-0000-4000-8000-000000000901','71000000-0000-4000-8000-000000000101','71000000-0000-4000-8000-000000000e11'),
  ('71000000-0000-4000-8000-000000000901','71000000-0000-4000-8000-000000000101','71000000-0000-4000-8000-000000000e12');

-- Runtime-only golden assignments exercise canonical market semantics without
-- inventing new market scopes: SA is a migration-seeded child of GCC.
insert into public.food_market_assignments(
  id,food_id,scope_code,relevance_level,source_record_id,assignment_action,policy_version,created_at
) values
  ('71000000-0000-4000-8000-000000000e21','71000000-0000-4000-8000-000000000101','GLOBAL','primary','71000000-0000-4000-8000-000000000201','assign','plan7-fixture-v1','2026-09-10T18:30:12Z'),
  ('71000000-0000-4000-8000-000000000e22','71000000-0000-4000-8000-000000000101','GCC','secondary','71000000-0000-4000-8000-000000000201','assign','plan7-fixture-v1','2026-09-10T18:30:13Z');
insert into public.food_catalog_generation_markets(generation_id,food_id,market_assignment_id) values
  ('71000000-0000-4000-8000-000000000901','71000000-0000-4000-8000-000000000101','71000000-0000-4000-8000-000000000e21'),
  ('71000000-0000-4000-8000-000000000901','71000000-0000-4000-8000-000000000101','71000000-0000-4000-8000-000000000e22');

insert into public.user_food_items(
  id,user_id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,category,cuisine,nutrition_basis_amount,nutrition_basis_unit,created_at,updated_at
) values (
  '71000000-0000-4000-8000-000000000e01','71000000-0000-4000-8000-000000000001','Plan7 My Food','1 serving',90,null,10,2,'personal','fixture',1,'serving','2026-09-10T18:30:20Z','2026-09-10T18:30:20Z'
);
insert into public.food_logs(
  id,user_id,food_item_id,log_date,meal_type,food_name,serving_size,quantity,calories,protein_g,carbs_g,fat_g,created_at,updated_at
) values (
  '71000000-0000-4000-8000-000000000e31','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000101','2026-09-10','Lunch','Plan7 Portable Chicken','100 g',1,165,31,0,3.6,'2026-09-10T18:30:30Z','2026-09-10T18:30:30Z'
);
