\set ON_ERROR_STOP on

-- Plan 5 serving-semantics correction regression verification.
-- All fixture mutations are rollback-only. This verifier intentionally proves that
-- nutrition normalization basis is not an authoritative serving display selection.

begin;

create or replace function pg_temp.plan5_serving_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  source_type, is_global, lifecycle_status
) values
  ('b6000000-0000-4000-8000-000000000001','Serving Semantics No Nutrition',null,null,null,null,null,'admin_created',true,'active'),
  ('b6000000-0000-4000-8000-000000000002','Serving Semantics 100g Nutrition',null,null,null,null,null,'admin_created',true,'active');

insert into public.food_nutrition_revisions (
  id, food_id, revision_number, calories, protein_g, carbs_g, fat_g,
  basis_amount, basis_unit, nutrient_mapping_version, authority_reference
) values (
  'b6100000-0000-4000-8000-000000000002',
  'b6000000-0000-4000-8000-000000000002',
  1, 210, 18, 12, 9, 100, 'g', 'plan5-serving-semantics-v1', 'rollback-only-verifier'
);

insert into public.food_names (
  id, food_id, language_tag, name_role, name_text, normalized_text, script_code, origin, policy_version
) values
  ('b6200000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','en','preferred_display','Serving Semantics No Nutrition','serving semantics no nutrition','Latn','curated','plan5-serving-semantics-v1'),
  ('b6200000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000002','en','preferred_display','Serving Semantics 100g Nutrition','serving semantics 100g nutrition','Latn','curated','plan5-serving-semantics-v1');

insert into public.food_catalog_control_operations(operation_id,operation_kind,command_checksum_sha256,result_json)
values
  ('b6300000-0000-4000-8000-000000000001','create_activation_set',repeat('a',64),'{}'),
  ('b6300000-0000-4000-8000-000000000002','grant_activation_set',repeat('b',64),'{}');

insert into public.food_catalog_activation_sets(
  id,manifest_schema_version,activation_policy_version,manifest_checksum_sha256,
  principal_id,principal_type,authority_reference,reason_code,policy_version
) values (
  'b6400000-0000-4000-8000-000000000001','plan5-serving-semantics-v1','plan5-serving-semantics-v1',repeat('c',64),
  'plan5-serving-verifier','service','rollback-only-verifier','verify','plan5-serving-semantics-v1'
);

insert into public.food_catalog_activation_set_members(
  id,activation_set_id,food_id,expected_precondition_lifecycle,evidence_reference,
  evidence_checksum_sha256,source_legal_accepted,identity_resolved,nutrition_basis_valid,
  display_identity_valid,blocking_condition_count,eligibility,member_checksum_sha256
) values
  ('b6500000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','active','rollback-only-verifier',repeat('d',64),true,true,true,true,0,'eligible',repeat('e',64)),
  ('b6500000-0000-4000-8000-000000000002','b6400000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000002','active','rollback-only-verifier',repeat('f',64),true,true,true,true,0,'eligible',repeat('1',64));

insert into public.food_catalog_activation_events(
  id,activation_set_id,event_type,target_grant_event_id,operation_id,command_checksum_sha256,
  principal_id,principal_type,authority_reference,reason_code,policy_version
) values (
  'b6600000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000001',
  'grant',null,'b6300000-0000-4000-8000-000000000002',repeat('b',64),
  'plan5-serving-verifier','service','rollback-only-verifier','verify','plan5-serving-semantics-v1'
);

insert into public.food_catalog_generations(
  id,base_generation_id,generation_ordinal,composition_schema_version,generation_policy_version,
  activation_policy_version,trust_policy_version,projection_version,
  change_manifest_checksum_sha256,composition_checksum_sha256,authority_reference
) values (
  'b6700000-0000-4000-8000-000000000001',null,6701,'plan5-serving-semantics-v1','plan5-serving-semantics-v1',
  'plan5-serving-semantics-v1','plan5-serving-semantics-v1','search-projection-v2',repeat('2',64),repeat('3',64),'rollback-only-verifier'
);

insert into public.food_catalog_generation_foods(
  generation_id,food_id,lifecycle,nutrition_revision_id,activation_set_id,activation_set_member_id,activation_grant_event_id
) values
  ('b6700000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','active',null,'b6400000-0000-4000-8000-000000000001','b6500000-0000-4000-8000-000000000001','b6600000-0000-4000-8000-000000000001'),
  ('b6700000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000002','active','b6100000-0000-4000-8000-000000000002','b6400000-0000-4000-8000-000000000001','b6500000-0000-4000-8000-000000000002','b6600000-0000-4000-8000-000000000001');

insert into public.food_catalog_generation_names(generation_id,food_id,name_fact_id)
values
  ('b6700000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b6200000-0000-4000-8000-000000000001'),
  ('b6700000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000002','b6200000-0000-4000-8000-000000000002');

select pg_temp.plan5_serving_assert(
  not exists (
    select 1 from public.food_catalog_generation_servings serving
    where serving.generation_id='b6700000-0000-4000-8000-000000000001'
  ),
  'Serving-semantics fixture must not contain a generation serving selection.'
);

select public.rebuild_food_catalog_search_projection_v2(
  'b6700000-0000-4000-8000-000000000001','search-projection-v2',null
);

select pg_temp.plan5_serving_assert(
  exists (
    select 1
    from public.food_catalog_search_documents doc
    where doc.generation_id='b6700000-0000-4000-8000-000000000001'
      and doc.food_id='b6000000-0000-4000-8000-000000000001'
      and doc.serving_label is null
      and doc.nutrition_basis_unit is null
      and doc.calories_100 is null
      and doc.protein_100 is null
      and doc.carbs_100 is null
      and doc.fat_100 is null
  ),
  'Food without nutrition or serving authority must preserve NULL serving and NULL nutrition.'
);

select pg_temp.plan5_serving_assert(
  exists (
    select 1
    from public.food_catalog_search_documents doc
    where doc.generation_id='b6700000-0000-4000-8000-000000000001'
      and doc.food_id='b6000000-0000-4000-8000-000000000002'
      and doc.serving_label is null
      and doc.nutrition_basis_unit='g'
      and doc.calories_100=210
      and doc.protein_100=18
      and doc.carbs_100=12
      and doc.fat_100=9
  ),
  '100 g nutrition basis must remain nutrition basis only and must not fabricate a serving label.'
);

rollback;
