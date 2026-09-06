\set ON_ERROR_STOP on

-- Plan 5 Search Projection V2 verification.
-- All fixture mutations are transactional and rolled back. The benchmark is
-- deterministic: fixed fixture cardinality, repeated result equality, bounded page size.

begin;

create or replace function pg_temp.plan5_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.plan5_rejected(p_sql text, p_message text)
returns void language plpgsql as $function$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception '%', p_message;
end
$function$;

-- Schema/security surface.
select pg_temp.plan5_assert(to_regclass('public.food_catalog_search_documents') is not null,
  'Plan 5 SearchDocument table is missing.');
select pg_temp.plan5_assert(to_regclass('public.food_catalog_search_nutrition_policies') is not null,
  'Plan 5 nutrition policy table is missing.');
select pg_temp.plan5_assert(
  (select relrowsecurity from pg_class where oid='public.food_catalog_search_documents'::regclass),
  'SearchDocument RLS must be enabled.');
select pg_temp.plan5_assert(
  not has_table_privilege('anon','public.food_catalog_search_documents','select,insert,update,delete')
  and not has_table_privilege('authenticated','public.food_catalog_search_documents','select,insert,update,delete')
  and not has_table_privilege('service_role','public.food_catalog_search_documents','insert,update,delete'),
  'SearchDocument direct mutation isolation is incorrect.');
select pg_temp.plan5_assert(
  to_regprocedure('public.rebuild_food_catalog_search_projection_v2(uuid,text,text)') is not null
  and to_regprocedure('public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)') is not null,
  'Plan 5 rebuild/search RPCs are missing.');
select pg_temp.plan5_assert(
  has_function_privilege('service_role','public.rebuild_food_catalog_search_projection_v2(uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.rebuild_food_catalog_search_projection_v2(uuid,text,text)','execute')
  and not has_function_privilege('anon','public.rebuild_food_catalog_search_projection_v2(uuid,text,text)','execute')
  and has_function_privilege('authenticated','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','execute')
  and has_function_privilege('service_role','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','execute')
  and not has_function_privilege('anon','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','execute'),
  'Plan 5 RPC privilege boundary is incorrect.');
select pg_temp.plan5_assert(
  (select count(*)=0 from public.food_catalog_search_nutrition_policies),
  'Plan 5 migration must not invent High Protein / Low Carb threshold policy.');

-- Numeric gt lt eq behavior, independent per nutrient and null-safe.
select pg_temp.plan5_assert(
  private.food_catalog_search_numeric_filter_matches_v2(31, '{"operator":"gt","value":30}'::jsonb)
  and private.food_catalog_search_numeric_filter_matches_v2(4, '{"operator":"lt","value":5}'::jsonb)
  and private.food_catalog_search_numeric_filter_matches_v2(2, '{"operator":"eq","value":2}'::jsonb)
  and not private.food_catalog_search_numeric_filter_matches_v2(null, '{"operator":"gt","value":0}'::jsonb),
  'numeric gt lt eq predicates are incorrect.');

-- Deterministic synthetic generation fixture: 25 active Foods, 26 language documents.
insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  source_type, is_global, lifecycle_status
)
select
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'Bench Food ' || lpad(gs::text,2,'0'),
  '100 g',
  100 + gs,
  case when gs in (1,3,4) then 31 when gs=2 then 30 else 10 end,
  case when gs in (1,2,4) then 4 when gs=3 then 5 else 20 end,
  case when gs in (1,2,3) then 2 when gs=4 then 3 else 5 end,
  'admin_created', true, 'active'
from generate_series(1,25) gs;

insert into public.food_nutrition_revisions (
  id, food_id, revision_number, calories, protein_g, carbs_g, fat_g,
  basis_amount, basis_unit, nutrient_mapping_version, authority_reference
)
select
  ('a5100000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  1,
  100 + gs,
  case when gs in (1,3,4) then 31 when gs=2 then 30 else 10 end,
  case when gs in (1,2,4) then 4 when gs=3 then 5 else 20 end,
  case when gs in (1,2,3) then 2 when gs=4 then 3 else 5 end,
  100, 'g', 'plan5-fixture-v1', 'plan5-fixture'
from generate_series(1,25) gs;

insert into public.food_names (
  id, food_id, language_tag, name_role, name_text, normalized_text, script_code, origin, policy_version
)
select
  ('a5200000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'en', 'preferred_display',
  'Bench Food ' || lpad(gs::text,2,'0'),
  'bench food ' || lpad(gs::text,2,'0'),
  'Latn', 'curated', 'plan5-fixture-v1'
from generate_series(1,25) gs;

insert into public.food_names (
  id, food_id, language_tag, name_role, name_text, normalized_text, script_code, origin, policy_version
) values (
  'a5210000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'de', 'preferred_display', 'Test Huhn', 'test huhn', 'Latn', 'curated', 'plan5-fixture-v1'
);

insert into public.food_catalog_control_operations(operation_id,operation_kind,command_checksum_sha256,result_json)
values
 ('a5300000-0000-4000-8000-000000000001','create_activation_set',repeat('a',64),'{}'),
 ('a5300000-0000-4000-8000-000000000002','grant_activation_set',repeat('b',64),'{}'),
 ('a5300000-0000-4000-8000-000000000003','promote_generation',repeat('c',64),'{}');

insert into public.food_catalog_activation_sets(
  id,manifest_schema_version,activation_policy_version,manifest_checksum_sha256,
  principal_id,principal_type,authority_reference,reason_code,policy_version
) values (
  'a5400000-0000-4000-8000-000000000001','plan5-fixture-v1','plan5-fixture-v1',repeat('d',64),
  'plan5-verifier','service','plan5-fixture','verify','plan5-fixture-v1'
);

insert into public.food_catalog_activation_set_members(
  id,activation_set_id,food_id,expected_precondition_lifecycle,evidence_reference,
  evidence_checksum_sha256,source_legal_accepted,identity_resolved,nutrition_basis_valid,
  display_identity_valid,blocking_condition_count,eligibility,member_checksum_sha256
)
select
  ('a5500000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'a5400000-0000-4000-8000-000000000001',
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'active','plan5-fixture',repeat('e',64),true,true,true,true,0,'eligible',repeat('f',64)
from generate_series(1,25) gs;

insert into public.food_catalog_activation_events(
  id,activation_set_id,event_type,target_grant_event_id,operation_id,command_checksum_sha256,
  principal_id,principal_type,authority_reference,reason_code,policy_version
) values (
  'a5600000-0000-4000-8000-000000000001','a5400000-0000-4000-8000-000000000001',
  'grant',null,'a5300000-0000-4000-8000-000000000002',repeat('b',64),
  'plan5-verifier','service','plan5-fixture','verify','plan5-fixture-v1'
);

insert into public.food_catalog_generations(
  id,base_generation_id,generation_ordinal,composition_schema_version,generation_policy_version,
  activation_policy_version,trust_policy_version,projection_version,
  change_manifest_checksum_sha256,composition_checksum_sha256,authority_reference
) values (
  'a5700000-0000-4000-8000-000000000001',null,5001,'plan5-fixture-v1','plan5-fixture-v1',
  'plan5-fixture-v1','plan5-fixture-v1','search-projection-v2',repeat('1',64),repeat('2',64),'plan5-fixture'
);

insert into public.food_catalog_generation_foods(
  generation_id,food_id,lifecycle,nutrition_revision_id,activation_set_id,activation_set_member_id,activation_grant_event_id
)
select
  'a5700000-0000-4000-8000-000000000001',
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'active',
  ('a5100000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'a5400000-0000-4000-8000-000000000001',
  ('a5500000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'a5600000-0000-4000-8000-000000000001'
from generate_series(1,25) gs;

insert into public.food_catalog_generation_names(generation_id,food_id,name_fact_id)
select
  'a5700000-0000-4000-8000-000000000001',
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  ('a5200000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid
from generate_series(1,25) gs;
insert into public.food_catalog_generation_names(generation_id,food_id,name_fact_id)
values ('a5700000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a5210000-0000-4000-8000-000000000001');

insert into public.food_market_assignments(id,food_id,scope_code,relevance_level,assignment_action,policy_version)
values
 ('a5800000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','DE','primary','assign','plan5-fixture-v1'),
 ('a5800000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000002','GLOBAL','primary','assign','plan5-fixture-v1');
insert into public.food_catalog_generation_markets(generation_id,food_id,market_assignment_id)
values
 ('a5700000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a5800000-0000-4000-8000-000000000001'),
 ('a5700000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002','a5800000-0000-4000-8000-000000000002');

insert into public.food_verification_assertions(
  id,food_id,assertion_scope,assertion_state,policy_version,reason_code,authority_reference
)
select
  ('a5900000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'identity','verified','plan5-fixture-v1','verified','plan5-fixture'
from generate_series(1,25) gs;
insert into public.food_verification_assertions(
  id,food_id,assertion_scope,assertion_state,policy_version,reason_code,authority_reference
)
select
  ('a5910000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'nutrition','verified','plan5-fixture-v1','verified','plan5-fixture'
from generate_series(1,25) gs;

insert into public.food_catalog_generation_verification(generation_id,food_id,assertion_scope,assertion_id)
select 'a5700000-0000-4000-8000-000000000001',
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'identity',('a5900000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid
from generate_series(1,25) gs;
insert into public.food_catalog_generation_verification(generation_id,food_id,assertion_scope,assertion_id)
select 'a5700000-0000-4000-8000-000000000001',
  ('a5000000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  'nutrition',('a5910000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid
from generate_series(1,25) gs;

-- projection rebuild equality: no policy first, therefore no convenience labels.
create temporary table plan5_rebuild_results(result jsonb);
insert into plan5_rebuild_results
select public.rebuild_food_catalog_search_projection_v2(
  'a5700000-0000-4000-8000-000000000001','search-projection-v2',null
);
insert into plan5_rebuild_results
select public.rebuild_food_catalog_search_projection_v2(
  'a5700000-0000-4000-8000-000000000001','search-projection-v2',null
);
select pg_temp.plan5_assert(
  (select count(*)=26 from public.food_catalog_search_documents where generation_id='a5700000-0000-4000-8000-000000000001')
  and (select count(distinct result->>'projectionChecksumSha256')=1 from plan5_rebuild_results),
  'projection rebuild equality failed.');
select pg_temp.plan5_assert(
  not exists (select 1 from public.food_catalog_search_documents where cardinality(nutrition_labels)<>0),
  'Convenience labels appeared without explicit Product policy.');

-- Synthetic verifier policy proves mechanism only; it is rolled back and is NOT Product authority.
insert into public.food_catalog_search_nutrition_policies(
  policy_version,high_protein_min_g_per_100,low_carb_max_g_per_100,authority_reference
) values ('plan5-test-only-policy-v1',30,5,'test-only rolled-back verifier policy');
select public.rebuild_food_catalog_search_projection_v2(
  'a5700000-0000-4000-8000-000000000001','search-projection-v2','plan5-test-only-policy-v1'
);
select pg_temp.plan5_assert(
  (select nutrition_labels @> array['high-protein','low-carb']::text[]
   from public.food_catalog_search_documents
   where generation_id='a5700000-0000-4000-8000-000000000001'
     and food_id='a5000000-0000-4000-8000-000000000001'
     and language_tag='en'),
  'Versioned convenience labels were not derived from exact policy.');

-- Point the current-generation singleton at the synthetic generation inside this rollback only.
insert into public.food_catalog_generation_validation_reports(
  id,generation_id,generation_checksum_sha256,validator_set_version,policy_version,
  report_checksum_sha256,blocker_count,error_count,warning_count,info_count
) values (
  'a5a00000-0000-4000-8000-000000000001','a5700000-0000-4000-8000-000000000001',repeat('2',64),
  'plan5-fixture-v1','plan5-fixture-v1',repeat('3',64),0,0,0,0
);
insert into public.food_catalog_generation_events(
  id,event_type,operation_id,command_checksum_sha256,from_generation_id,to_generation_id,
  generation_checksum_sha256,validation_report_id,principal_id,principal_type,
  authority_reference,reason_code,policy_version
) values (
  'a5b00000-0000-4000-8000-000000000001','promote','a5300000-0000-4000-8000-000000000003',repeat('c',64),
  null,'a5700000-0000-4000-8000-000000000001',repeat('2',64),'a5a00000-0000-4000-8000-000000000001',
  'plan5-verifier','service','plan5-fixture','verify','plan5-fixture-v1'
);
update public.food_catalog_current_generation
set current_generation_id='a5700000-0000-4000-8000-000000000001',
    current_event_id='a5b00000-0000-4000-8000-000000000001',
    current_validation_report_id='a5a00000-0000-4000-8000-000000000001',
    pointer_revision=pointer_revision+1,
    updated_at=now()
where singleton_key;

select set_config('request.jwt.claim.sub','a5c00000-0000-4000-8000-000000000001',true);

-- Explicit language/script + explicit market ranking: DE Food is first, no market hiding.
create temporary table plan5_search_results(kind text,result jsonb);
insert into plan5_search_results
select 'market', public.search_food_catalog_v2(
  'Bench Food','en','Latn','DE',null,20,null,null,'all','{}'::jsonb
);
select pg_temp.plan5_assert(
  (select jsonb_array_length(result->'items')=20 and result->>'nextCursor' is not null
   from plan5_search_results where kind='market'),
  'bounded page size / keyset page failed.');
select pg_temp.plan5_assert(
  (select result->'items'->0->>'id'='a5000000-0000-4000-8000-000000000001'
   from plan5_search_results where kind='market'),
  'Explicit market relevance did not boost the exact DE result.');

insert into plan5_search_results
select 'language', public.search_food_catalog_v2(
  'Test Huhn','de','Latn',null,null,20,null,null,'all','{}'::jsonb
);
select pg_temp.plan5_assert(
  (select result->'items'->0->>'id'='a5000000-0000-4000-8000-000000000001'
   from plan5_search_results where kind='language'),
  'Explicit language/script search did not preserve one Food identity.');

-- protein >, carbs <, fat = are AND predicates: only Food 01 satisfies all three.
insert into plan5_search_results
select 'numeric', public.search_food_catalog_v2(
  'Bench Food','en','Latn',null,null,20,null,null,'all',
  '{"protein":{"operator":"gt","value":30},"carbs":{"operator":"lt","value":5},"fat":{"operator":"eq","value":2}}'::jsonb
);
select pg_temp.plan5_assert(
  (select jsonb_array_length(result->'items')=1
      and result->'items'->0->>'id'='a5000000-0000-4000-8000-000000000001'
   from plan5_search_results where kind='numeric'),
  'Numeric search AND semantics failed.');

-- Both convenience filters selected => every visible result must carry both exact-policy labels.
insert into plan5_search_results
select 'presets', public.search_food_catalog_v2(
  'Bench Food','en','Latn',null,null,20,null,null,'all',
  '{"presets":["high-protein","low-carb"]}'::jsonb
);
select pg_temp.plan5_assert(
  not exists (
    select 1
    from plan5_search_results result_row,
         lateral jsonb_array_elements(result_row.result->'items') item
    where result_row.kind='presets'
      and not ((item->'nutritionLabels') ? 'high-protein' and (item->'nutritionLabels') ? 'low-carb')
  ),
  'High Protein + Low Carb convenience filters did not use AND semantics.');

-- cursor context mismatch must be rejected rather than reused under a different explicit market.
select pg_temp.plan5_rejected(
  format(
    $sql$select public.search_food_catalog_v2('Bench Food','en','Latn','EU',%L,20,null,null,'all','{}'::jsonb)$sql$,
    (select result->>'nextCursor' from plan5_search_results where kind='market')
  ),
  'cursor context mismatch was accepted.'
);

-- Deterministic benchmark: 25 repeated searches over 25 Foods / 26 SearchDocuments
-- must return byte-for-byte identical bounded first pages and never exceed 20 cards.
do $benchmark$
declare
  v_reference jsonb;
  v_current jsonb;
  v_iteration integer;
begin
  v_reference := public.search_food_catalog_v2('Bench Food','en','Latn','DE',null,20,null,null,'all','{}'::jsonb);
  for v_iteration in 1..25 loop
    v_current := public.search_food_catalog_v2('Bench Food','en','Latn','DE',null,20,null,null,'all','{}'::jsonb);
    if v_current is distinct from v_reference then
      raise exception 'deterministic benchmark result changed on iteration %', v_iteration;
    end if;
    if jsonb_array_length(v_current->'items') > 20 then
      raise exception 'deterministic benchmark exceeded bounded page size';
    end if;
  end loop;
end
$benchmark$;

-- Search must remain generation-bound; changing current pointer to NULL removes global documents.
update public.food_catalog_current_generation
set current_generation_id=null,current_event_id=null,current_validation_report_id=null,
    pointer_revision=pointer_revision+1,updated_at=now()
where singleton_key;
select pg_temp.plan5_assert(
  jsonb_array_length(public.search_food_catalog_v2('Bench Food','en','Latn','DE',null,20,null,null,'all','{}'::jsonb)->'items')=0,
  'Search inferred a global current state after the Catalog Generation pointer was cleared.');

rollback;
