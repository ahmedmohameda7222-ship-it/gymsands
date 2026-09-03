\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.plan3_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.plan3_rejected(p_sql text, p_message text)
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

-- Schema bootstrap must not invent a generation.
select pg_temp.plan3_assert(
  (select count(*) = 0 from public.food_catalog_generations)
  and (select current_generation_id is null
       and current_event_id is null
       and current_validation_report_id is null
       and pointer_revision = 0
       from public.food_catalog_current_generation where singleton_key),
  'Plan 3 bootstrap must contain no generation and a NULL current pointer.'
);

-- Task 3 RED: all eight narrow RPCs are required.
select pg_temp.plan3_assert(
  to_regprocedure('public.food_catalog_create_activation_set_v1(jsonb)') is not null
  and to_regprocedure('public.food_catalog_grant_activation_set_v1(jsonb)') is not null
  and to_regprocedure('public.food_catalog_invalidate_activation_grant_v1(jsonb)') is not null
  and to_regprocedure('public.food_catalog_create_generation_v1(jsonb)') is not null
  and to_regprocedure('public.food_catalog_record_generation_validation_v1(jsonb)') is not null
  and to_regprocedure('public.food_catalog_promote_generation_v1(jsonb)') is not null
  and to_regprocedure('public.food_catalog_rollback_generation_v1(jsonb)') is not null
  and to_regprocedure('public.food_catalog_revoke_generation_v1(jsonb)') is not null,
  'Plan 3 service-role control-plane RPCs are missing.'
);

-- Privileged transitions must never be executable by member roles.
select pg_temp.plan3_assert(
  not has_function_privilege('anon', 'public.food_catalog_create_activation_set_v1(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.food_catalog_create_activation_set_v1(jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.food_catalog_create_activation_set_v1(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.food_catalog_promote_generation_v1(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.food_catalog_promote_generation_v1(jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.food_catalog_promote_generation_v1(jsonb)', 'execute'),
  'Plan 3 RPC privilege boundary is incorrect.'
);

-- Deterministic immutable source fixtures.
insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  source_type, is_global, lifecycle_status
) values
  ('d3000000-0000-4000-8000-000000000001', 'Plan3 A', '100 g', null, 0, null, null, 'admin_created', true, 'draft'),
  ('d3000000-0000-4000-8000-000000000002', 'Plan3 B', '100 g', 10, 1, 1, 1, 'admin_created', true, 'draft'),
  ('d3000000-0000-4000-8000-000000000003', 'Plan3 C', '100 g', 20, 2, 2, 2, 'admin_created', true, 'draft'),
  ('d3000000-0000-4000-8000-000000000004', 'Plan3 redirect source', '100 g', 30, 3, 3, 3, 'admin_created', true, 'draft');

insert into public.food_source_records (
  id, food_id, provider, source_record_id, source_reference,
  license_name, license_reference, retrieved_at, source_nutrition, source_serving,
  review_metadata, source_dataset, source_version, source_release_date,
  source_record_checksum_sha256
) values
  ('d3000000-0000-4000-8000-000000000011', 'd3000000-0000-4000-8000-000000000001',
   'plan3-fixture', 'a', 'fixture://a', 'Fixture', 'fixture://license', now(),
   '{"calories":0}'::jsonb, '{"amount":100,"unit":"g"}'::jsonb, '{}'::jsonb,
   'plan3-fixture', 'v1', '2026-09-02', repeat('1',64)),
  ('d3000000-0000-4000-8000-000000000012', 'd3000000-0000-4000-8000-000000000002',
   'plan3-fixture', 'b', 'fixture://b', 'Fixture', 'fixture://license', now(),
   '{"calories":10}'::jsonb, '{"amount":100,"unit":"g"}'::jsonb, '{}'::jsonb,
   'plan3-fixture', 'v1', '2026-09-02', repeat('2',64)),
  ('d3000000-0000-4000-8000-000000000013', 'd3000000-0000-4000-8000-000000000003',
   'plan3-fixture', 'c', 'fixture://c', 'Fixture', 'fixture://license', now(),
   '{"calories":20}'::jsonb, '{"amount":100,"unit":"g"}'::jsonb, '{}'::jsonb,
   'plan3-fixture', 'v1', '2026-09-02', repeat('3',64));

insert into public.food_nutrition_revisions (
  id, food_id, revision_number, calories, protein_g, carbs_g, fat_g,
  basis_amount, basis_unit, source_record_id, nutrient_mapping_version, authority_reference
) values
  ('d3000000-0000-4000-8000-000000000021', 'd3000000-0000-4000-8000-000000000001', 1, 0, null, null, null, 100, 'g', 'd3000000-0000-4000-8000-000000000011', 'v1', 'fixture'),
  ('d3000000-0000-4000-8000-000000000022', 'd3000000-0000-4000-8000-000000000002', 1, 10, 1, 1, 1, 100, 'g', 'd3000000-0000-4000-8000-000000000012', 'v1', 'fixture'),
  ('d3000000-0000-4000-8000-000000000023', 'd3000000-0000-4000-8000-000000000003', 1, 20, 2, 2, 2, 100, 'g', 'd3000000-0000-4000-8000-000000000013', 'v1', 'fixture');

insert into public.food_serving_options (
  id, food_id, label, amount, unit_code, source_record_id, evidence_class, source_primary, authority_reference
) values
  ('d3000000-0000-4000-8000-000000000031', 'd3000000-0000-4000-8000-000000000001', '100 g', 100, 'g', 'd3000000-0000-4000-8000-000000000011', 'exact_source', true, 'fixture'),
  ('d3000000-0000-4000-8000-000000000032', 'd3000000-0000-4000-8000-000000000002', '100 g', 100, 'g', 'd3000000-0000-4000-8000-000000000012', 'exact_source', true, 'fixture');

insert into public.food_names (
  id, food_id, language_tag, name_role, name_text, normalized_text, origin, source_record_id, policy_version
) values
  ('d3000000-0000-4000-8000-000000000041', 'd3000000-0000-4000-8000-000000000001', 'en', 'source_name', 'Plan3 A', 'plan3 a', 'source', 'd3000000-0000-4000-8000-000000000011', 'v1'),
  ('d3000000-0000-4000-8000-000000000042', 'd3000000-0000-4000-8000-000000000002', 'en', 'source_name', 'Plan3 B', 'plan3 b', 'source', 'd3000000-0000-4000-8000-000000000012', 'v1');

insert into public.food_taxonomy_assignments (id, food_id, node_code, assignment_action, policy_version)
values
 ('d3000000-0000-4000-8000-000000000051', 'd3000000-0000-4000-8000-000000000001', 'protein_foods', 'assign', 'v1'),
 ('d3000000-0000-4000-8000-000000000052', 'd3000000-0000-4000-8000-000000000001', 'protein_foods', 'remove', 'v1');

insert into public.food_market_assignments (id, food_id, scope_code, relevance_level, assignment_action, policy_version)
values
 ('d3000000-0000-4000-8000-000000000061', 'd3000000-0000-4000-8000-000000000001', 'GLOBAL', 'primary', 'assign', 'v1'),
 ('d3000000-0000-4000-8000-000000000062', 'd3000000-0000-4000-8000-000000000001', 'GLOBAL', 'primary', 'remove', 'v1');

insert into public.food_verification_assertions (
  id, food_id, assertion_scope, assertion_state, policy_version, source_record_id,
  reason_code, authority_reference
) values
 ('d3000000-0000-4000-8000-000000000071', 'd3000000-0000-4000-8000-000000000001', 'identity', 'verified', 'v1', 'd3000000-0000-4000-8000-000000000011', 'verified', 'fixture'),
 ('d3000000-0000-4000-8000-000000000072', 'd3000000-0000-4000-8000-000000000001', 'nutrition', 'verified', 'v1', 'd3000000-0000-4000-8000-000000000011', 'verified', 'fixture'),
 ('d3000000-0000-4000-8000-000000000073', 'd3000000-0000-4000-8000-000000000001', 'serving', 'verified', 'v1', 'd3000000-0000-4000-8000-000000000011', 'verified', 'fixture'),
 ('d3000000-0000-4000-8000-000000000074', 'd3000000-0000-4000-8000-000000000002', 'identity', 'verified', 'v1', 'd3000000-0000-4000-8000-000000000012', 'verified', 'fixture'),
 ('d3000000-0000-4000-8000-000000000075', 'd3000000-0000-4000-8000-000000000002', 'nutrition', 'verified', 'v1', 'd3000000-0000-4000-8000-000000000012', 'verified', 'fixture');

-- Verification successor forks must fail while immutable predecessor history remains intact.
insert into public.food_verification_assertions (
 id, food_id, assertion_scope, assertion_state, policy_version, supersedes_assertion_id,
 reason_code, authority_reference
) values (
 'd3000000-0000-4000-8000-000000000076', 'd3000000-0000-4000-8000-000000000001',
 'identity', 'verified', 'v2', 'd3000000-0000-4000-8000-000000000071', 'renewed', 'fixture'
);
select pg_temp.plan3_rejected(
 $$insert into public.food_verification_assertions (
   id, food_id, assertion_scope, assertion_state, policy_version, supersedes_assertion_id,
   reason_code, authority_reference
 ) values (
   'd3000000-0000-4000-8000-000000000077', 'd3000000-0000-4000-8000-000000000001',
   'identity', 'revoked', 'v2', 'd3000000-0000-4000-8000-000000000071', 'fork', 'fixture'
 )$$,
 'Verification predecessor fork was accepted.'
);

-- Create activation set and prove trusted semantic operation replay semantics.
select public.food_catalog_create_activation_set_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000001',
 'command_checksum_sha256',repeat('a',64),
 'activation_set_id','d3200000-0000-4000-8000-000000000001',
 'manifest_schema_version','activation-manifest-v1',
 'activation_policy_version','activation-policy-v1',
 'manifest_checksum_sha256',repeat('b',64),
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','fixture','policy_version','control-v1'),
 'members',jsonb_build_array(
   jsonb_build_object('id','d3300000-0000-4000-8000-000000000001','food_id','d3000000-0000-4000-8000-000000000001','expected_precondition_lifecycle','draft','evidence_reference','fixture:a','evidence_checksum_sha256',repeat('c',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('d',64)),
   jsonb_build_object('id','d3300000-0000-4000-8000-000000000002','food_id','d3000000-0000-4000-8000-000000000002','expected_precondition_lifecycle','draft','evidence_reference','fixture:b','evidence_checksum_sha256',repeat('e',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('f',64))
 )
));

-- Identical semantic retry must converge to the original immutable result.
select public.food_catalog_create_activation_set_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000001',
 'command_checksum_sha256',repeat('a',64),
 'activation_set_id','d3200000-0000-4000-8000-000000000001',
 'manifest_schema_version','activation-manifest-v1',
 'activation_policy_version','activation-policy-v1',
 'manifest_checksum_sha256',repeat('b',64),
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','fixture','policy_version','control-v1'),
 'members',jsonb_build_array(
   jsonb_build_object('id','d3300000-0000-4000-8000-000000000001','food_id','d3000000-0000-4000-8000-000000000001','expected_precondition_lifecycle','draft','evidence_reference','fixture:a','evidence_checksum_sha256',repeat('c',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('d',64)),
   jsonb_build_object('id','d3300000-0000-4000-8000-000000000002','food_id','d3000000-0000-4000-8000-000000000002','expected_precondition_lifecycle','draft','evidence_reference','fixture:b','evidence_checksum_sha256',repeat('e',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('f',64))
 )
));
select pg_temp.plan3_assert((select count(*)=1 from public.food_catalog_control_operations where operation_id='d3100000-0000-4000-8000-000000000001'), 'Identical operation retry did not converge.');

-- Same operation ID and same caller checksum with a changed semantic payload must conflict.
select pg_temp.plan3_rejected(
 $$select public.food_catalog_create_activation_set_v1(jsonb_build_object(
   'operation_id','d3100000-0000-4000-8000-000000000001','command_checksum_sha256',repeat('a',64),
   'activation_set_id','d3200000-0000-4000-8000-000000000001','manifest_schema_version','activation-manifest-v1',
   'activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('b',64),
   'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','fixture','policy_version','control-v1'),
   'members','[]'::jsonb
 ))$$,
 'Changed semantic command reused an operation ID by trusting the caller checksum.'
);
select pg_temp.plan3_rejected(
 $$select public.food_catalog_create_activation_set_v1('{"operation_id":"d3100000-0000-4000-8000-000000000001","command_checksum_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","activation_set_id":"d3200000-0000-4000-8000-000000000001"}'::jsonb)$$,
 'Conflicting operation-ID reuse was accepted.'
);

-- Every Plan 3 RPC must derive replay identity through the same trusted DB helper.
select pg_temp.plan3_assert(
  position('private.food_catalog_plan3_command_fingerprint_v1' in pg_get_functiondef('public.food_catalog_create_activation_set_v1(jsonb)'::regprocedure)) > 0
  and position('private.food_catalog_plan3_command_fingerprint_v1' in pg_get_functiondef('public.food_catalog_grant_activation_set_v1(jsonb)'::regprocedure)) > 0
  and position('private.food_catalog_plan3_command_fingerprint_v1' in pg_get_functiondef('public.food_catalog_invalidate_activation_grant_v1(jsonb)'::regprocedure)) > 0
  and position('private.food_catalog_plan3_command_fingerprint_v1' in pg_get_functiondef('public.food_catalog_create_generation_v1(jsonb)'::regprocedure)) > 0
  and position('private.food_catalog_plan3_command_fingerprint_v1' in pg_get_functiondef('public.food_catalog_record_generation_validation_v1(jsonb)'::regprocedure)) > 0
  and position('private.food_catalog_plan3_command_fingerprint_v1' in pg_get_functiondef('public.food_catalog_promote_generation_v1(jsonb)'::regprocedure)) > 0
  and position('private.food_catalog_plan3_command_fingerprint_v1' in pg_get_functiondef('public.food_catalog_rollback_generation_v1(jsonb)'::regprocedure)) > 0
  and position('private.food_catalog_plan3_command_fingerprint_v1' in pg_get_functiondef('public.food_catalog_revoke_generation_v1(jsonb)'::regprocedure)) > 0,
  'Plan 3 RPCs do not share the trusted DB semantic fingerprint helper.'
);

select public.food_catalog_grant_activation_set_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000002','command_checksum_sha256',repeat('1',64),
 'activation_set_id','d3200000-0000-4000-8000-000000000001','event_id','d3400000-0000-4000-8000-000000000001',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','grant','policy_version','control-v1')
));

-- A second set/grant will be invalidated before sealing and must be rejected for a future active candidate.
select public.food_catalog_create_activation_set_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000003','command_checksum_sha256',repeat('2',64),
 'activation_set_id','d3200000-0000-4000-8000-000000000002','manifest_schema_version','activation-manifest-v1',
 'activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('3',64),
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','fixture','policy_version','control-v1'),
 'members',jsonb_build_array(jsonb_build_object('id','d3300000-0000-4000-8000-000000000003','food_id','d3000000-0000-4000-8000-000000000003','expected_precondition_lifecycle','draft','evidence_reference','fixture:c','evidence_checksum_sha256',repeat('4',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('5',64)))
));
select public.food_catalog_grant_activation_set_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000004','command_checksum_sha256',repeat('6',64),
 'activation_set_id','d3200000-0000-4000-8000-000000000002','event_id','d3400000-0000-4000-8000-000000000002',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','grant','policy_version','control-v1')
));
select public.food_catalog_invalidate_activation_grant_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000005','command_checksum_sha256',repeat('7',64),
 'activation_set_id','d3200000-0000-4000-8000-000000000002','event_id','d3400000-0000-4000-8000-000000000003','target_grant_event_id','d3400000-0000-4000-8000-000000000002',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','invalidate','policy_version','control-v1')
));

select pg_temp.plan3_rejected(
 $$select public.food_catalog_create_generation_v1(jsonb_build_object(
   'operation_id','d3100000-0000-4000-8000-000000000006','command_checksum_sha256',repeat('8',64),
   'generation_id','d3500000-0000-4000-8000-000000000099','composition_schema_version','composition-v1','generation_policy_version','generation-v1','activation_policy_version','activation-policy-v1','trust_policy_version','trust-v1','projection_version','projection-v1','change_manifest_checksum_sha256',repeat('9',64),'composition_checksum_sha256',repeat('a',64),'authority_reference','fixture-authority','event_id','d3600000-0000-4000-8000-000000000099',
   'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','candidate','policy_version','control-v1'),
   'foods',jsonb_build_array(jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000003','lifecycle','active','nutrition_revision_id','d3000000-0000-4000-8000-000000000023','activation_set_id','d3200000-0000-4000-8000-000000000002','activation_set_member_id','d3300000-0000-4000-8000-000000000003','activation_grant_event_id','d3400000-0000-4000-8000-000000000002')),
   'servings','[]'::jsonb,'names','[]'::jsonb,'taxonomy','[]'::jsonb,'markets','[]'::jsonb,'verification','[]'::jsonb,'redirects','[]'::jsonb
 ))$$,
 'Invalidated activation grant authorized a future generation.'
);

-- Sealed bootstrap generation A with direct redirect D -> A and exact selections.
select public.food_catalog_create_generation_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000007','command_checksum_sha256',repeat('b',64),
 'generation_id','d3500000-0000-4000-8000-000000000001','base_generation_id',null,
 'composition_schema_version','composition-v1','generation_policy_version','generation-v1','activation_policy_version','activation-policy-v1','trust_policy_version','trust-v1','projection_version','projection-v1','change_manifest_checksum_sha256',repeat('c',64),'composition_checksum_sha256',repeat('d',64),'authority_reference','fixture-authority','event_id','d3600000-0000-4000-8000-000000000001',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','candidate','policy_version','control-v1'),
 'foods',jsonb_build_array(
   jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','lifecycle','active','nutrition_revision_id','d3000000-0000-4000-8000-000000000021','activation_set_id','d3200000-0000-4000-8000-000000000001','activation_set_member_id','d3300000-0000-4000-8000-000000000001','activation_grant_event_id','d3400000-0000-4000-8000-000000000001'),
   jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000002','lifecycle','active','nutrition_revision_id','d3000000-0000-4000-8000-000000000022','activation_set_id','d3200000-0000-4000-8000-000000000001','activation_set_member_id','d3300000-0000-4000-8000-000000000002','activation_grant_event_id','d3400000-0000-4000-8000-000000000001')
 ),
 'servings',jsonb_build_array(jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','serving_option_id','d3000000-0000-4000-8000-000000000031')),
 'names',jsonb_build_array(jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','name_fact_id','d3000000-0000-4000-8000-000000000041')),
 'taxonomy',jsonb_build_array(jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','taxonomy_assignment_id','d3000000-0000-4000-8000-000000000051')),
 'markets',jsonb_build_array(jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','market_assignment_id','d3000000-0000-4000-8000-000000000061')),
 'verification',jsonb_build_array(
   jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','assertion_scope','identity','assertion_id','d3000000-0000-4000-8000-000000000076'),
   jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','assertion_scope','nutrition','assertion_id','d3000000-0000-4000-8000-000000000072')
 ),
 'redirects',jsonb_build_array(jsonb_build_object('source_food_id','d3000000-0000-4000-8000-000000000004','target_food_id','d3000000-0000-4000-8000-000000000001'))
));
set constraints all immediate;

select pg_temp.plan3_assert(
 (select count(*)=1 from public.food_catalog_generation_redirects where generation_id='d3500000-0000-4000-8000-000000000001' and source_food_id='d3000000-0000-4000-8000-000000000004' and target_food_id='d3000000-0000-4000-8000-000000000001'),
 'Flattened direct redirect was not persisted.'
);

-- Cross-Food fact references and remove-action selections must fail.
select pg_temp.plan3_rejected(
 $$insert into public.food_catalog_generation_servings(generation_id,food_id,serving_option_id)
 values('d3500000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000032')$$,
 'Cross-Food generation selection was accepted.'
);
select pg_temp.plan3_rejected(
 $$insert into public.food_catalog_generation_taxonomy(generation_id,food_id,taxonomy_assignment_id)
 values('d3500000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000052')$$,
 'Taxonomy remove fact was selected.'
);
select pg_temp.plan3_rejected(
 $$insert into public.food_catalog_generation_markets(generation_id,food_id,market_assignment_id)
 values('d3500000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000062')$$,
 'Market remove fact was selected.'
);

-- Validation report bound to exact generation checksum and deterministic report semantics, with one blocking report first.
select public.food_catalog_record_generation_validation_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000008','command_checksum_sha256',repeat('e',64),
 'report_id','d3700000-0000-4000-8000-000000000001','generation_id','d3500000-0000-4000-8000-000000000001','generation_checksum_sha256',repeat('d',64),'validator_set_version','validator-v1','policy_version','generation-v1','report_checksum_sha256','e6a6ca21cc5fffb9c50312d668a4a2c00291b50241b2680390a571c6cb712402','blocker_count',1,'error_count',1,'warning_count',0,'info_count',0,'event_id','d3600000-0000-4000-8000-000000000002',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','validate','policy_version','control-v1'),
 'findings',jsonb_build_array(jsonb_build_object('id','d3800000-0000-4000-8000-000000000001','finding_ordinal',1,'reason_code','BLOCKER','food_id','d3000000-0000-4000-8000-000000000001','severity','error','blocking',true,'evidence_reference','fixture:blocker','validator_policy_version','validation-v1','details',jsonb_build_object('fixture',true)))
));
select pg_temp.plan3_rejected(
 $$select public.food_catalog_promote_generation_v1(jsonb_build_object('operation_id','d3100000-0000-4000-8000-000000000009','command_checksum_sha256',repeat('1',64),'candidate_generation_id','d3500000-0000-4000-8000-000000000001','expected_current_generation_id',null,'candidate_checksum_sha256',repeat('d',64),'validation_report_id','d3700000-0000-4000-8000-000000000001','validation_report_checksum_sha256','e6a6ca21cc5fffb9c50312d668a4a2c00291b50241b2680390a571c6cb712402','event_id','d3600000-0000-4000-8000-000000000003','actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','promote','policy_version','control-v1')))$$,
 'Blocking validation report allowed promotion.'
);

select public.food_catalog_record_generation_validation_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000010','command_checksum_sha256',repeat('2',64),
 'report_id','d3700000-0000-4000-8000-000000000002','generation_id','d3500000-0000-4000-8000-000000000001','generation_checksum_sha256',repeat('d',64),'validator_set_version','validator-v1','policy_version','generation-v1','report_checksum_sha256','878ba5ee0f18ff5396a31d8901515f68296368595aae09ed2d73238b400290ff','blocker_count',0,'error_count',0,'warning_count',0,'info_count',0,'event_id','d3600000-0000-4000-8000-000000000004',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','validate','policy_version','control-v1'),'findings','[]'::jsonb
));

select pg_temp.plan3_rejected(
 $$select public.food_catalog_promote_generation_v1(jsonb_build_object('operation_id','d3100000-0000-4000-8000-000000000011','command_checksum_sha256',repeat('4',64),'candidate_generation_id','d3500000-0000-4000-8000-000000000001','expected_current_generation_id',null,'candidate_checksum_sha256',repeat('0',64),'validation_report_id','d3700000-0000-4000-8000-000000000002','validation_report_checksum_sha256','878ba5ee0f18ff5396a31d8901515f68296368595aae09ed2d73238b400290ff','event_id','d3600000-0000-4000-8000-000000000005','actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','promote','policy_version','control-v1')))$$,
 'Wrong candidate checksum allowed promotion.'
);

select public.food_catalog_promote_generation_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000012','command_checksum_sha256',repeat('5',64),
 'candidate_generation_id','d3500000-0000-4000-8000-000000000001','expected_current_generation_id',null,'candidate_checksum_sha256',repeat('d',64),'validation_report_id','d3700000-0000-4000-8000-000000000002','validation_report_checksum_sha256','878ba5ee0f18ff5396a31d8901515f68296368595aae09ed2d73238b400290ff','event_id','d3600000-0000-4000-8000-000000000006',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','promote','policy_version','control-v1')
));
select pg_temp.plan3_assert(
 (select current_generation_id='d3500000-0000-4000-8000-000000000001'
  and current_event_id='d3600000-0000-4000-8000-000000000006'
  and current_validation_report_id='d3700000-0000-4000-8000-000000000002'
  and pointer_revision=1 from public.food_catalog_current_generation where singleton_key),
 'Promotion did not atomically switch all current pointer evidence.'
);
select pg_temp.plan3_rejected(
 $$select public.food_catalog_promote_generation_v1(jsonb_build_object('operation_id','d3100000-0000-4000-8000-000000000013','command_checksum_sha256',repeat('6',64),'candidate_generation_id','d3500000-0000-4000-8000-000000000001','expected_current_generation_id',null,'candidate_checksum_sha256',repeat('d',64),'validation_report_id','d3700000-0000-4000-8000-000000000002','validation_report_checksum_sha256','878ba5ee0f18ff5396a31d8901515f68296368595aae09ed2d73238b400290ff','event_id','d3600000-0000-4000-8000-000000000007','actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','promote','policy_version','control-v1')))$$,
 'Stale expected-current CAS was accepted.'
);

-- Later grant invalidation must not rewrite already sealed generation A.
select public.food_catalog_invalidate_activation_grant_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000014','command_checksum_sha256',repeat('7',64),
 'activation_set_id','d3200000-0000-4000-8000-000000000001','event_id','d3400000-0000-4000-8000-000000000004','target_grant_event_id','d3400000-0000-4000-8000-000000000001',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','invalidate','policy_version','control-v1')
));
select pg_temp.plan3_assert((select count(*)=2 from public.food_catalog_generation_foods where generation_id='d3500000-0000-4000-8000-000000000001'), 'Later invalidation rewrote sealed generation composition.');

-- Build a second healthy generation under an independent live activation grant.
select public.food_catalog_create_activation_set_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000015','command_checksum_sha256',repeat('8',64),
 'activation_set_id','d3200000-0000-4000-8000-000000000003','manifest_schema_version','activation-manifest-v1',
 'activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('9',64),
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','fixture-b','policy_version','control-v1'),
 'members',jsonb_build_array(
   jsonb_build_object('id','d3300000-0000-4000-8000-000000000004','food_id','d3000000-0000-4000-8000-000000000001','expected_precondition_lifecycle','draft','evidence_reference','fixture:a2','evidence_checksum_sha256',repeat('a',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('b',64)),
   jsonb_build_object('id','d3300000-0000-4000-8000-000000000005','food_id','d3000000-0000-4000-8000-000000000002','expected_precondition_lifecycle','draft','evidence_reference','fixture:b2','evidence_checksum_sha256',repeat('c',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('d',64))
 )
));
select public.food_catalog_grant_activation_set_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000016','command_checksum_sha256',repeat('e',64),
 'activation_set_id','d3200000-0000-4000-8000-000000000003','event_id','d3400000-0000-4000-8000-000000000005',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','grant-b','policy_version','control-v1')
));
select public.food_catalog_create_generation_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000017','command_checksum_sha256',repeat('f',64),
 'generation_id','d3500000-0000-4000-8000-000000000002','base_generation_id','d3500000-0000-4000-8000-000000000001',
 'composition_schema_version','composition-v1','generation_policy_version','generation-v1','activation_policy_version','activation-policy-v1','trust_policy_version','trust-v1','projection_version','projection-v1','change_manifest_checksum_sha256',repeat('1',64),'composition_checksum_sha256',repeat('8',64),'authority_reference','fixture-authority','event_id','d3600000-0000-4000-8000-000000000008',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','candidate-b','policy_version','control-v1'),
 'foods',jsonb_build_array(
   jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','lifecycle','active','nutrition_revision_id','d3000000-0000-4000-8000-000000000021','activation_set_id','d3200000-0000-4000-8000-000000000003','activation_set_member_id','d3300000-0000-4000-8000-000000000004','activation_grant_event_id','d3400000-0000-4000-8000-000000000005'),
   jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000002','lifecycle','active','nutrition_revision_id','d3000000-0000-4000-8000-000000000022','activation_set_id','d3200000-0000-4000-8000-000000000003','activation_set_member_id','d3300000-0000-4000-8000-000000000005','activation_grant_event_id','d3400000-0000-4000-8000-000000000005')
 ),
 'servings',jsonb_build_array(jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','serving_option_id','d3000000-0000-4000-8000-000000000031')),
 'names',jsonb_build_array(jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','name_fact_id','d3000000-0000-4000-8000-000000000041')),
 'taxonomy',jsonb_build_array(jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','taxonomy_assignment_id','d3000000-0000-4000-8000-000000000051')),
 'markets',jsonb_build_array(jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','market_assignment_id','d3000000-0000-4000-8000-000000000061')),
 'verification',jsonb_build_array(
   jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','assertion_scope','identity','assertion_id','d3000000-0000-4000-8000-000000000076'),
   jsonb_build_object('food_id','d3000000-0000-4000-8000-000000000001','assertion_scope','nutrition','assertion_id','d3000000-0000-4000-8000-000000000072')
 ),
 'redirects',jsonb_build_array(jsonb_build_object('source_food_id','d3000000-0000-4000-8000-000000000004','target_food_id','d3000000-0000-4000-8000-000000000001'))
));
set constraints all immediate;
select public.food_catalog_record_generation_validation_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000018','command_checksum_sha256',repeat('2',64),
 'report_id','d3700000-0000-4000-8000-000000000003','generation_id','d3500000-0000-4000-8000-000000000002','generation_checksum_sha256',repeat('8',64),'validator_set_version','validator-v1','policy_version','generation-v1','report_checksum_sha256','94c4c08b53fe253b168fdbb63ec1b430c2bd9c22e0d3f04421a90ef80cfe725c','blocker_count',0,'error_count',0,'warning_count',0,'info_count',0,'event_id','d3600000-0000-4000-8000-000000000009',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','validate-b','policy_version','control-v1'),'findings','[]'::jsonb
));
select public.food_catalog_promote_generation_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000019','command_checksum_sha256',repeat('3',64),
 'candidate_generation_id','d3500000-0000-4000-8000-000000000002','expected_current_generation_id','d3500000-0000-4000-8000-000000000001','candidate_checksum_sha256',repeat('8',64),'validation_report_id','d3700000-0000-4000-8000-000000000003','validation_report_checksum_sha256','94c4c08b53fe253b168fdbb63ec1b430c2bd9c22e0d3f04421a90ef80cfe725c','event_id','d3600000-0000-4000-8000-000000000010',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','promote-b','policy_version','control-v1')
));
select pg_temp.plan3_assert(
 (select current_generation_id='d3500000-0000-4000-8000-000000000002'
  and current_event_id='d3600000-0000-4000-8000-000000000010'
  and current_validation_report_id='d3700000-0000-4000-8000-000000000003'
  and pointer_revision=2 from public.food_catalog_current_generation where singleton_key),
 'Second promotion did not atomically advance the pointer.'
);

-- Current generation cannot be revoked; explicit rollback must happen first.
select pg_temp.plan3_rejected(
 $$select public.food_catalog_revoke_generation_v1(jsonb_build_object('operation_id','d3100000-0000-4000-8000-000000000020','command_checksum_sha256',repeat('4',64),'generation_id','d3500000-0000-4000-8000-000000000002','generation_checksum_sha256',repeat('8',64),'event_id','d3600000-0000-4000-8000-000000000015','actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','revoke-current','policy_version','control-v1')))$$,
 'Current generation was revocable without rollback.'
);

-- Rollback names generation A and its exact prior promotion evidence, never a heuristic previous row.
select public.food_catalog_rollback_generation_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000021','command_checksum_sha256',repeat('5',64),
 'expected_current_generation_id','d3500000-0000-4000-8000-000000000002','target_generation_id','d3500000-0000-4000-8000-000000000001','target_checksum_sha256',repeat('d',64),'target_promotion_event_id','d3600000-0000-4000-8000-000000000006','target_validation_report_id','d3700000-0000-4000-8000-000000000002','target_validation_report_checksum_sha256','878ba5ee0f18ff5396a31d8901515f68296368595aae09ed2d73238b400290ff','event_id','d3600000-0000-4000-8000-000000000011',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','rollback-a','policy_version','control-v1')
));
select pg_temp.plan3_assert(
 (select current_generation_id='d3500000-0000-4000-8000-000000000001'
  and current_event_id='d3600000-0000-4000-8000-000000000011'
  and current_validation_report_id='d3700000-0000-4000-8000-000000000002'
  and pointer_revision=3 from public.food_catalog_current_generation where singleton_key),
 'Rollback did not atomically restore the exact target generation evidence.'
);

-- B is now non-current and may be revoked; revoked generations cannot return through promote or rollback.
select public.food_catalog_revoke_generation_v1(jsonb_build_object(
 'operation_id','d3100000-0000-4000-8000-000000000022','command_checksum_sha256',repeat('6',64),
 'generation_id','d3500000-0000-4000-8000-000000000002','generation_checksum_sha256',repeat('8',64),'event_id','d3600000-0000-4000-8000-000000000012',
 'actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','revoke-b','policy_version','control-v1')
));
select pg_temp.plan3_rejected(
 $$select public.food_catalog_promote_generation_v1(jsonb_build_object('operation_id','d3100000-0000-4000-8000-000000000023','command_checksum_sha256',repeat('7',64),'candidate_generation_id','d3500000-0000-4000-8000-000000000002','expected_current_generation_id','d3500000-0000-4000-8000-000000000001','candidate_checksum_sha256',repeat('8',64),'validation_report_id','d3700000-0000-4000-8000-000000000003','validation_report_checksum_sha256','94c4c08b53fe253b168fdbb63ec1b430c2bd9c22e0d3f04421a90ef80cfe725c','event_id','d3600000-0000-4000-8000-000000000013','actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','promote-revoked','policy_version','control-v1')))$$,
 'Revoked generation was promotable.'
);
select pg_temp.plan3_rejected(
 $$select public.food_catalog_rollback_generation_v1(jsonb_build_object('operation_id','d3100000-0000-4000-8000-000000000024','command_checksum_sha256',repeat('a',64),'expected_current_generation_id','d3500000-0000-4000-8000-000000000001','target_generation_id','d3500000-0000-4000-8000-000000000002','target_checksum_sha256',repeat('8',64),'target_promotion_event_id','d3600000-0000-4000-8000-000000000010','target_validation_report_id','d3700000-0000-4000-8000-000000000003','target_validation_report_checksum_sha256','94c4c08b53fe253b168fdbb63ec1b430c2bd9c22e0d3f04421a90ef80cfe725c','event_id','d3600000-0000-4000-8000-000000000014','actor',jsonb_build_object('principal_id','planner-fixture','principal_type','human','authority_reference','fixture-authority','reason_code','rollback-revoked','policy_version','control-v1')))$$,
 'Revoked generation was a rollback target.'
);

-- Immutable authority rows reject mutation.
select pg_temp.plan3_rejected(
 $$update public.food_catalog_generations set authority_reference='mutated' where id='d3500000-0000-4000-8000-000000000001'$$,
 'Generation row was mutable.'
);
select pg_temp.plan3_rejected(
 $$delete from public.food_catalog_generation_events where id='d3600000-0000-4000-8000-000000000006'$$,
 'Generation event was deletable.'
);

rollback;