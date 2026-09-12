\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);

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

insert into public.food_market_assignments(
  id,food_id,scope_code,relevance_level,source_record_id,assignment_action,policy_version,created_at
) values (
  '71000000-0000-4000-8000-000000000e21','71000000-0000-4000-8000-000000000101','GLOBAL','primary','71000000-0000-4000-8000-000000000201','assign','plan7-fixture-v1','2026-09-10T18:30:12Z'
);
insert into public.food_catalog_generation_markets(generation_id,food_id,market_assignment_id)
values('71000000-0000-4000-8000-000000000901','71000000-0000-4000-8000-000000000101','71000000-0000-4000-8000-000000000e21');

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

select public.rebuild_food_catalog_search_projection_v2('71000000-0000-4000-8000-000000000903','search-projection-v2','plan7-runtime-golden-v1');
select public.rebuild_food_catalog_search_projection_v2('71000000-0000-4000-8000-000000000901','search-projection-v2','plan7-runtime-golden-v1');

create function pg_temp.plan7_search(
  p_query text default '', p_language text default 'en', p_script text default 'Latn', p_market text default 'DE',
  p_cursor text default null, p_limit integer default 20, p_category text default null, p_cuisine text default null,
  p_scope text default 'all', p_filters jsonb default '{}'::jsonb
) returns jsonb language sql as $fn$
  select public.search_food_catalog_v2(p_query,p_language,p_script,p_market,p_cursor,p_limit,p_category,p_cuisine,p_scope,p_filters)
$fn$;
create function pg_temp.plan7_case(p_id text,p_result jsonb,p_passed boolean)
returns text language sql as $fn$
  select '__PLAN7_GOLDEN__' || json_build_object('id',p_id,'passed',p_passed,'actual',p_result)::text
$fn$;
create function pg_temp.plan7_cursor_mismatch(p_cursor text)
returns boolean language plpgsql as $fn$
begin
  perform pg_temp.plan7_search('Plan7','en','Latn','GLOBAL',p_cursor,1);
  return false;
exception when sqlstate '22023' then
  return true;
end
$fn$;

with q as (select pg_temp.plan7_search('Plan7 Portable Chicken') r)
select pg_temp.plan7_case('exact',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('Portable Poultry') r)
select pg_temp.plan7_case('alias',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('Plan7 Port') r)
select pg_temp.plan7_case('prefix',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('Portable Chicken') r)
select pg_temp.plan7_case('contains',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('Plan7 Tragbares Huhn','de','Latn','DE') r)
select pg_temp.plan7_case('locale_script',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101' and r->'items'->0->>'locale'='de') from q;
with q as (select pg_temp.plan7_search('Plan7 Portable Chicken','en','Latn','DE') r)
select pg_temp.plan7_case('market_direct',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('Plan7 Portable Chicken','en','Latn','DE-BY') r)
select pg_temp.plan7_case('market_parent',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('Plan7 Portable Chicken','en','Latn','GLOBAL') r)
select pg_temp.plan7_case('market_global',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('','en','Latn','DE',null,20,'plan7_runtime_protein') r)
select pg_temp.plan7_case('category',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('Plan7 Portable Chicken') r)
select pg_temp.plan7_case('current_cuisine',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101' and r->'items'->0->>'cuisine' is null) from q;
with q as (select pg_temp.plan7_search('Plan7 My Food','en','Latn','DE',null,20,null,null,'my_food','{"protein":{"operator":"gt","value":0}}') r)
select pg_temp.plan7_case('nullable_numerics',r,jsonb_array_length(r->'items')=0) from q;
with q as (select pg_temp.plan7_search('Plan7 Portable Chicken','en','Latn','DE',null,20,null,null,'all','{"presets":["high-protein","low-carb"]}') r)
select pg_temp.plan7_case('presets',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('','en','Latn','DE',null,20,null,null,'favorites') r)
select pg_temp.plan7_case('favorites',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('','en','Latn','DE',null,20,null,null,'recent') r)
select pg_temp.plan7_case('recent',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from q;
with q as (select pg_temp.plan7_search('Plan7 My Food','en','Latn','DE',null,20,null,null,'my_food') r)
select pg_temp.plan7_case('my_food',r,r->'items'->0->>'id'='71000000-0000-4000-8000-000000000e01' and r->'items'->0->>'source'='my_food') from q;
with first_page as (select pg_temp.plan7_search('Plan7','en','Latn','DE',null,1) r),
second_page as (select r first_r, pg_temp.plan7_search('Plan7','en','Latn','DE',r->>'nextCursor',1) second_r from first_page),
evidence as (select jsonb_build_object('first',first_r,'second',second_r) r from second_page)
select pg_temp.plan7_case('cursor_continuation',r,r->'first'->>'nextCursor' is not null and jsonb_array_length(r->'second'->'items')=1 and r->'first'->'items'->0->>'id' is distinct from r->'second'->'items'->0->>'id') from evidence;
with q as (select pg_temp.plan7_search('Plan7','en','Latn','DE',null,1) r), e as (select jsonb_build_object('cursorPresent',r->>'nextCursor' is not null) r, r->>'nextCursor' c from q)
select pg_temp.plan7_case('cursor_context_mismatch',r,pg_temp.plan7_cursor_mismatch(c)) from e;
with q as (select pg_temp.plan7_search('Plan7 Portable Chicken') r), e as (
  select r, exists(select 1 from public.food_catalog_generation_redirects where generation_id='71000000-0000-4000-8000-000000000901' and source_food_id='71000000-0000-4000-8000-000000000102' and target_food_id='71000000-0000-4000-8000-000000000101') redirect_ok from q
)
select pg_temp.plan7_case('redirect',r,redirect_ok and r->'items'->0->>'id'='71000000-0000-4000-8000-000000000101') from e;
with q as (select pg_temp.plan7_search('Plan7 Stale Turkey','en','Latn','GLOBAL') r)
select pg_temp.plan7_case('stale_generation_isolation',r,jsonb_array_length(r->'items')=0) from q;
with q as (select pg_temp.plan7_search('No Such Plan7 Food') r)
select pg_temp.plan7_case('zero_row',r,jsonb_array_length(r->'items')=0) from q;

rollback;
