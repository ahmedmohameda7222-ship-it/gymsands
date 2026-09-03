\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.plan3_activation_try(p_sql text)
returns boolean
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception when others then
    return true;
  end;
  return false;
end
$function$;

create or replace function pg_temp.plan3_activation_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create temporary table plan3_activation_gate_results (
  case_name text primary key,
  rejected boolean not null
) on commit drop;

insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  source_type, is_global, lifecycle_status
) values
  ('d4a00000-0000-4000-8000-000000000001', 'Plan3 activation valid', '100 g', 10, 1, 1, 1, 'admin_created', true, 'draft'),
  ('d4a00000-0000-4000-8000-000000000002', 'Plan3 activation blockers', '100 g', 10, 1, 1, 1, 'admin_created', true, 'draft'),
  ('d4a00000-0000-4000-8000-000000000003', 'Plan3 activation legal', '100 g', 10, 1, 1, 1, 'admin_created', true, 'draft'),
  ('d4a00000-0000-4000-8000-000000000004', 'Plan3 activation identity', '100 g', 10, 1, 1, 1, 'admin_created', true, 'draft'),
  ('d4a00000-0000-4000-8000-000000000005', 'Plan3 activation nutrition', '100 g', 10, 1, 1, 1, 'admin_created', true, 'draft'),
  ('d4a00000-0000-4000-8000-000000000006', 'Plan3 activation display', '100 g', 10, 1, 1, 1, 'admin_created', true, 'draft'),
  ('d4a00000-0000-4000-8000-000000000007', 'Plan3 activation rejected', '100 g', 10, 1, 1, 1, 'admin_created', true, 'draft'),
  ('d4a00000-0000-4000-8000-000000000008', 'Plan3 activation grant defense', '100 g', 10, 1, 1, 1, 'admin_created', true, 'draft');

-- Valid immutable activation evidence must remain admissible and grantable.
select public.food_catalog_create_activation_set_v1(jsonb_build_object(
  'operation_id','d4a10000-0000-4000-8000-000000000001',
  'command_checksum_sha256',repeat('1',64),
  'activation_set_id','d4a20000-0000-4000-8000-000000000001',
  'manifest_schema_version','activation-manifest-v1',
  'activation_policy_version','activation-policy-v1',
  'manifest_checksum_sha256',repeat('2',64),
  'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','VALID_CASE','policy_version','control-v1'),
  'members',jsonb_build_array(jsonb_build_object(
    'id','d4a30000-0000-4000-8000-000000000001','food_id','d4a00000-0000-4000-8000-000000000001',
    'expected_precondition_lifecycle','draft','evidence_reference','fixture:valid','evidence_checksum_sha256',repeat('3',64),
    'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,
    'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('4',64)
  ))
));
select public.food_catalog_grant_activation_set_v1(jsonb_build_object(
  'operation_id','d4a10000-0000-4000-8000-000000000002','command_checksum_sha256',repeat('5',64),
  'activation_set_id','d4a20000-0000-4000-8000-000000000001','event_id','d4a40000-0000-4000-8000-000000000001',
  'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','VALID_GRANT','policy_version','control-v1')
));

-- Contradictory immutable evidence must never be stored as eligible.
insert into plan3_activation_gate_results values
('blockers', pg_temp.plan3_activation_try($sql$
  select public.food_catalog_create_activation_set_v1(jsonb_build_object(
    'operation_id','d4a10000-0000-4000-8000-000000000011','command_checksum_sha256',repeat('6',64),
    'activation_set_id','d4a20000-0000-4000-8000-000000000011','manifest_schema_version','activation-manifest-v1','activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('7',64),
    'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','BLOCKERS','policy_version','control-v1'),
    'members',jsonb_build_array(jsonb_build_object('id','d4a30000-0000-4000-8000-000000000011','food_id','d4a00000-0000-4000-8000-000000000002','expected_precondition_lifecycle','draft','evidence_reference','fixture:blockers','evidence_checksum_sha256',repeat('8',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',1,'eligibility','eligible','member_checksum_sha256',repeat('9',64)))
  ))
$sql$)),
('source_legal', pg_temp.plan3_activation_try($sql$
  select public.food_catalog_create_activation_set_v1(jsonb_build_object(
    'operation_id','d4a10000-0000-4000-8000-000000000012','command_checksum_sha256',repeat('a',64),
    'activation_set_id','d4a20000-0000-4000-8000-000000000012','manifest_schema_version','activation-manifest-v1','activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('b',64),
    'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','SOURCE_LEGAL','policy_version','control-v1'),
    'members',jsonb_build_array(jsonb_build_object('id','d4a30000-0000-4000-8000-000000000012','food_id','d4a00000-0000-4000-8000-000000000003','expected_precondition_lifecycle','draft','evidence_reference','fixture:legal','evidence_checksum_sha256',repeat('c',64),'source_legal_accepted',false,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('d',64)))
  ))
$sql$)),
('identity', pg_temp.plan3_activation_try($sql$
  select public.food_catalog_create_activation_set_v1(jsonb_build_object(
    'operation_id','d4a10000-0000-4000-8000-000000000013','command_checksum_sha256',repeat('e',64),
    'activation_set_id','d4a20000-0000-4000-8000-000000000013','manifest_schema_version','activation-manifest-v1','activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('f',64),
    'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','IDENTITY','policy_version','control-v1'),
    'members',jsonb_build_array(jsonb_build_object('id','d4a30000-0000-4000-8000-000000000013','food_id','d4a00000-0000-4000-8000-000000000004','expected_precondition_lifecycle','draft','evidence_reference','fixture:identity','evidence_checksum_sha256',repeat('1',64),'source_legal_accepted',true,'identity_resolved',false,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('2',64)))
  ))
$sql$)),
('nutrition_basis', pg_temp.plan3_activation_try($sql$
  select public.food_catalog_create_activation_set_v1(jsonb_build_object(
    'operation_id','d4a10000-0000-4000-8000-000000000014','command_checksum_sha256',repeat('3',64),
    'activation_set_id','d4a20000-0000-4000-8000-000000000014','manifest_schema_version','activation-manifest-v1','activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('4',64),
    'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','NUTRITION_BASIS','policy_version','control-v1'),
    'members',jsonb_build_array(jsonb_build_object('id','d4a30000-0000-4000-8000-000000000014','food_id','d4a00000-0000-4000-8000-000000000005','expected_precondition_lifecycle','draft','evidence_reference','fixture:nutrition','evidence_checksum_sha256',repeat('5',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',false,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('6',64)))
  ))
$sql$)),
('display_identity', pg_temp.plan3_activation_try($sql$
  select public.food_catalog_create_activation_set_v1(jsonb_build_object(
    'operation_id','d4a10000-0000-4000-8000-000000000015','command_checksum_sha256',repeat('7',64),
    'activation_set_id','d4a20000-0000-4000-8000-000000000015','manifest_schema_version','activation-manifest-v1','activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('8',64),
    'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','DISPLAY_IDENTITY','policy_version','control-v1'),
    'members',jsonb_build_array(jsonb_build_object('id','d4a30000-0000-4000-8000-000000000015','food_id','d4a00000-0000-4000-8000-000000000006','expected_precondition_lifecycle','draft','evidence_reference','fixture:display','evidence_checksum_sha256',repeat('9',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',false,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('a',64)))
  ))
$sql$));

-- Explicit rejection remains an immutable negative outcome and cannot be granted.
select public.food_catalog_create_activation_set_v1(jsonb_build_object(
  'operation_id','d4a10000-0000-4000-8000-000000000021','command_checksum_sha256',repeat('b',64),
  'activation_set_id','d4a20000-0000-4000-8000-000000000021','manifest_schema_version','activation-manifest-v1','activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('c',64),
  'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','EXPLICIT_REJECT','policy_version','control-v1'),
  'members',jsonb_build_array(jsonb_build_object('id','d4a30000-0000-4000-8000-000000000021','food_id','d4a00000-0000-4000-8000-000000000007','expected_precondition_lifecycle','draft','evidence_reference','fixture:rejected','evidence_checksum_sha256',repeat('d',64),'source_legal_accepted',true,'identity_resolved',true,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','rejected','member_checksum_sha256',repeat('e',64)))
));
insert into plan3_activation_gate_results values
('explicit_rejected_grant', pg_temp.plan3_activation_try($sql$
  select public.food_catalog_grant_activation_set_v1(jsonb_build_object(
    'operation_id','d4a10000-0000-4000-8000-000000000022','command_checksum_sha256',repeat('f',64),
    'activation_set_id','d4a20000-0000-4000-8000-000000000021','event_id','d4a40000-0000-4000-8000-000000000021',
    'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','EXPLICIT_REJECT_GRANT','policy_version','control-v1')
  ))
$sql$));

-- Defense in depth: even if the structural consistency check is removed in this disposable transaction,
-- the trusted grant RPC must independently evaluate the authoritative evidence predicate.
alter table public.food_catalog_activation_set_members
  drop constraint if exists food_catalog_activation_set_members_eligible_evidence_check;

select public.food_catalog_create_activation_set_v1(jsonb_build_object(
  'operation_id','d4a10000-0000-4000-8000-000000000031','command_checksum_sha256',repeat('1',64),
  'activation_set_id','d4a20000-0000-4000-8000-000000000031','manifest_schema_version','activation-manifest-v1','activation_policy_version','activation-policy-v1','manifest_checksum_sha256',repeat('2',64),
  'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','GRANT_DEFENSE','policy_version','control-v1'),
  'members',jsonb_build_array(jsonb_build_object('id','d4a30000-0000-4000-8000-000000000031','food_id','d4a00000-0000-4000-8000-000000000008','expected_precondition_lifecycle','draft','evidence_reference','fixture:grant-defense','evidence_checksum_sha256',repeat('3',64),'source_legal_accepted',true,'identity_resolved',false,'nutrition_basis_valid',true,'display_identity_valid',true,'blocking_condition_count',0,'eligibility','eligible','member_checksum_sha256',repeat('4',64)))
));
insert into plan3_activation_gate_results values
('grant_independent_identity', pg_temp.plan3_activation_try($sql$
  select public.food_catalog_grant_activation_set_v1(jsonb_build_object(
    'operation_id','d4a10000-0000-4000-8000-000000000032','command_checksum_sha256',repeat('5',64),
    'activation_set_id','d4a20000-0000-4000-8000-000000000031','event_id','d4a40000-0000-4000-8000-000000000031',
    'actor',jsonb_build_object('principal_id','plan3-activation-verifier','principal_type','service','authority_reference','plan3-activation-verifier','reason_code','GRANT_DEFENSE_CHECK','policy_version','control-v1')
  ))
$sql$));

select pg_temp.plan3_activation_assert(
  (select bool_and(rejected) from plan3_activation_gate_results),
  'Activation eligibility contradictions were accepted: ' || coalesce((
    select string_agg(case_name, ', ' order by case_name)
    from plan3_activation_gate_results
    where not rejected
  ), 'none')
);

rollback;
