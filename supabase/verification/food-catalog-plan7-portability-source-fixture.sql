\set ON_ERROR_STOP on

-- Deterministic Plan 7 FULL_DR source fixture for disposable certification only.
-- This file is never a migration and never targets Production.
\set owner_uid '71000000-0000-4000-8000-000000000001'
\set owner_principal '71000000-0000-4000-8000-000000000002'
\set food_current '71000000-0000-4000-8000-000000000101'
\set food_merged '71000000-0000-4000-8000-000000000102'
\set food_stale '71000000-0000-4000-8000-000000000103'
\set source_current '71000000-0000-4000-8000-000000000201'
\set source_stale '71000000-0000-4000-8000-000000000203'
\set nutrition_current '71000000-0000-4000-8000-000000000301'
\set nutrition_stale '71000000-0000-4000-8000-000000000303'
\set serving_current '71000000-0000-4000-8000-000000000401'
\set serving_stale '71000000-0000-4000-8000-000000000403'
\set name_current '71000000-0000-4000-8000-000000000501'
\set name_stale '71000000-0000-4000-8000-000000000503'
\set taxonomy_assignment '71000000-0000-4000-8000-000000000601'
\set market_assignment_current '71000000-0000-4000-8000-000000000611'
\set market_assignment_stale '71000000-0000-4000-8000-000000000613'
\set verify_current '71000000-0000-4000-8000-000000000701'
\set verify_stale '71000000-0000-4000-8000-000000000703'
\set merge_event '71000000-0000-4000-8000-000000000711'
\set barcode '71000000-0000-4000-8000-000000000721'
\set activation_set '71000000-0000-4000-8000-000000000801'
\set member_current '71000000-0000-4000-8000-000000000811'
\set member_stale '71000000-0000-4000-8000-000000000813'
\set activation_grant '71000000-0000-4000-8000-000000000821'
\set op_create '71000000-0000-4000-8000-000000000831'
\set op_grant '71000000-0000-4000-8000-000000000833'
\set op_promote '71000000-0000-4000-8000-000000000835'
\set generation_current '71000000-0000-4000-8000-000000000901'
\set generation_stale '71000000-0000-4000-8000-000000000903'
\set validation_report '71000000-0000-4000-8000-000000000911'
\set generation_event '71000000-0000-4000-8000-000000000921'
\set ingestion_batch '71000000-0000-4000-8000-000000000a01'
\set ingestion_run '71000000-0000-4000-8000-000000000a11'
\set ingestion_dry_run '71000000-0000-4000-8000-000000000a12'
\set ingestion_reconciliation '71000000-0000-4000-8000-000000000a13'
\set override_revision '71000000-0000-4000-8000-000000000b01'
\set override_operation '71000000-0000-4000-8000-000000000b11'
\set serving_lineage '71000000-0000-4000-8000-000000000c01'
\set name_lineage '71000000-0000-4000-8000-000000000c11'

insert into auth.users(
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  :'owner_uid'::uuid,'authenticated','authenticated','plan7-owner@example.test','',
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
  '2026-09-10T18:00:00Z'::timestamptz,'2026-09-10T18:00:00Z'::timestamptz
);

-- Stable Food roots. The verified-source compatibility edge is populated only after provenance exists.
insert into public.food_items(
  id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,source_type,is_global,lifecycle_status
) values
  (:'food_current','Plan7 Portable Chicken','100 g',165,31,0,3.6,'admin_created',true,'active'),
  (:'food_merged','Plan7 Legacy Chicken','100 g',160,30,1,3.5,'admin_created',true,'active'),
  (:'food_stale','Plan7 Stale Turkey','100 g',135,29,0,2,'admin_created',true,'active');
update public.food_items
set lifecycle_status='merged', merged_into_food_id=:'food_current'::uuid
where id=:'food_merged'::uuid;

insert into public.food_source_records(
  id,food_id,provider,source_record_id,source_reference,license_name,retrieved_at,
  source_nutrition,source_serving,review_metadata,created_at,updated_at
) values
  (:'source_current',:'food_current','plan7-fixture','current-1','fixture://plan7/current','Plan7 Fixture License',
   '2026-09-10T18:01:00Z','{"calories":165,"protein":31}'::jsonb,'{"amount":100,"unit":"g"}'::jsonb,'{}'::jsonb,
   '2026-09-10T18:01:00Z','2026-09-10T18:01:00Z'),
  (:'source_stale',:'food_stale','plan7-fixture','stale-1','fixture://plan7/stale','Plan7 Fixture License',
   '2026-09-10T18:01:00Z','{"calories":135,"protein":29}'::jsonb,'{"amount":100,"unit":"g"}'::jsonb,'{}'::jsonb,
   '2026-09-10T18:01:00Z','2026-09-10T18:01:00Z');
update public.food_items
set is_verified=true, verified_at='2026-09-10T18:02:00Z', verified_source_record_id=:'source_current'::uuid
where id=:'food_current'::uuid;
update public.food_items
set is_verified=true, verified_at='2026-09-10T18:02:00Z', verified_source_record_id=:'source_stale'::uuid
where id=:'food_stale'::uuid;

insert into public.food_nutrition_revisions(
  id,food_id,revision_number,calories,protein_g,carbs_g,fat_g,basis_amount,basis_unit,
  source_record_id,nutrient_mapping_version,authority_reference,created_at
) values
  (:'nutrition_current',:'food_current',1,165,31,0,3.6,100,'g',:'source_current','plan7-fixture-v1','fixture://plan7/current','2026-09-10T18:03:00Z'),
  (:'nutrition_stale',:'food_stale',1,135,29,0,2,100,'g',:'source_stale','plan7-fixture-v1','fixture://plan7/stale','2026-09-10T18:03:00Z');

insert into public.food_serving_options(
  id,food_id,label,amount,unit_code,gram_weight,source_record_id,evidence_class,source_primary,authority_reference,created_at
) values
  (:'serving_current',:'food_current','100 g',100,'g',100,:'source_current','exact_source',true,'fixture://plan7/current','2026-09-10T18:04:00Z'),
  (:'serving_stale',:'food_stale','100 g',100,'g',100,:'source_stale','exact_source',true,'fixture://plan7/stale','2026-09-10T18:04:00Z');

insert into public.food_names(
  id,food_id,language_tag,name_role,name_text,normalized_text,script_code,origin,source_record_id,policy_version,created_at
) values
  (:'name_current',:'food_current','en','preferred_display','Plan7 Portable Chicken','plan7 portable chicken','Latn','curated',:'source_current','plan7-fixture-v1','2026-09-10T18:05:00Z'),
  (:'name_stale',:'food_stale','en','preferred_display','Plan7 Stale Turkey','plan7 stale turkey','Latn','curated',:'source_stale','plan7-fixture-v1','2026-09-10T18:05:00Z');

-- Mixed migration/runtime ownership: migration seeds remain untouched while runtime extensions are portable.
insert into public.food_taxonomy_nodes(node_code,namespace_code,parent_node_code,lifecycle_status,created_at)
values('plan7_runtime_protein','primary_food_group','protein_foods','active','2026-09-10T18:06:00Z');
insert into public.market_scopes(scope_code,scope_kind,lifecycle_status,created_at)
values('PLAN7_TEST','group','active','2026-09-10T18:06:00Z');
insert into public.market_scope_memberships(child_scope_code,parent_scope_code,created_at)
values('DE','PLAN7_TEST','2026-09-10T18:06:00Z');

insert into public.food_taxonomy_assignments(id,food_id,node_code,source_record_id,assignment_action,policy_version,created_at)
values(:'taxonomy_assignment',:'food_current','plan7_runtime_protein',:'source_current','assign','plan7-fixture-v1','2026-09-10T18:07:00Z');
insert into public.food_market_assignments(id,food_id,scope_code,relevance_level,source_record_id,assignment_action,policy_version,created_at) values
  (:'market_assignment_current',:'food_current','DE','primary',:'source_current','assign','plan7-fixture-v1','2026-09-10T18:07:00Z'),
  (:'market_assignment_stale',:'food_stale','GLOBAL','primary',:'source_stale','assign','plan7-fixture-v1','2026-09-10T18:07:00Z');

insert into public.food_barcodes(id,food_id,gtin,source_record_id,created_at,updated_at)
values(:'barcode',:'food_current','4006381333931',:'source_current','2026-09-10T18:08:00Z','2026-09-10T18:08:00Z');
insert into public.food_verification_assertions(
  id,food_id,assertion_scope,assertion_state,policy_version,source_record_id,reason_code,authority_reference,created_at
) values
  (:'verify_current',:'food_current','identity','verified','plan7-fixture-v1',:'source_current','fixture','fixture://plan7/current','2026-09-10T18:09:00Z'),
  (:'verify_stale',:'food_stale','identity','verified','plan7-fixture-v1',:'source_stale','fixture','fixture://plan7/stale','2026-09-10T18:09:00Z');
insert into public.food_merge_events(id,source_food_id,target_food_id,policy_version,reason_code,evidence_reference,authority_reference,created_at)
values(:'merge_event',:'food_merged',:'food_current','plan7-fixture-v1','duplicate','fixture://plan7/merge','fixture://plan7/merge','2026-09-10T18:10:00Z');

-- Generation/control-plane fixture. IDs are fixed so exact restore and behavioral checks are deterministic.
insert into public.food_catalog_control_operations(operation_id,operation_kind,command_checksum_sha256,result_json,created_at) values
  (:'op_create','create_activation_set',repeat('a',64),'{}'::jsonb,'2026-09-10T18:11:00Z'),
  (:'op_grant','grant_activation_set',repeat('b',64),'{}'::jsonb,'2026-09-10T18:11:00Z'),
  (:'op_promote','promote_generation',repeat('c',64),'{}'::jsonb,'2026-09-10T18:11:00Z');
insert into public.food_catalog_activation_sets(
  id,manifest_schema_version,activation_policy_version,manifest_checksum_sha256,
  principal_id,principal_type,authority_reference,reason_code,policy_version,created_at
) values(
  :'activation_set','plan7-fixture-v1','plan7-fixture-v1',repeat('d',64),
  'plan7-fixture','service','fixture://plan7/activation','fixture','plan7-fixture-v1','2026-09-10T18:12:00Z'
);
insert into public.food_catalog_activation_set_members(
  id,activation_set_id,food_id,expected_precondition_lifecycle,evidence_reference,evidence_checksum_sha256,
  source_legal_accepted,identity_resolved,nutrition_basis_valid,display_identity_valid,blocking_condition_count,
  eligibility,member_checksum_sha256,created_at
) values
  (:'member_current',:'activation_set',:'food_current','active','fixture://plan7/current',repeat('e',64),true,true,true,true,0,'eligible',repeat('f',64),'2026-09-10T18:13:00Z'),
  (:'member_stale',:'activation_set',:'food_stale','active','fixture://plan7/stale',repeat('1',64),true,true,true,true,0,'eligible',repeat('2',64),'2026-09-10T18:13:00Z');
insert into public.food_catalog_activation_events(
  id,activation_set_id,event_type,target_grant_event_id,operation_id,command_checksum_sha256,
  principal_id,principal_type,authority_reference,reason_code,policy_version,created_at
) values(
  :'activation_grant',:'activation_set','grant',null,:'op_grant',repeat('b',64),
  'plan7-fixture','service','fixture://plan7/activation','fixture','plan7-fixture-v1','2026-09-10T18:14:00Z'
);

insert into public.food_catalog_generations(
  id,base_generation_id,generation_ordinal,composition_schema_version,generation_policy_version,
  activation_policy_version,trust_policy_version,projection_version,change_manifest_checksum_sha256,
  composition_checksum_sha256,authority_reference,created_at,sealed_at
) values
  (:'generation_stale',null,7000,'plan7-fixture-v1','plan7-fixture-v1','plan7-fixture-v1','plan7-fixture-v1','search-projection-v2',repeat('3',64),repeat('4',64),'fixture://plan7/stale-generation','2026-09-10T18:15:00Z','2026-09-10T18:15:00Z'),
  (:'generation_current',null,7001,'plan7-fixture-v1','plan7-fixture-v1','plan7-fixture-v1','plan7-fixture-v1','search-projection-v2',repeat('5',64),repeat('6',64),'fixture://plan7/current-generation','2026-09-10T18:15:00Z','2026-09-10T18:15:00Z');
insert into public.food_catalog_generation_foods(
  generation_id,food_id,lifecycle,nutrition_revision_id,activation_set_id,activation_set_member_id,activation_grant_event_id
) values
  (:'generation_current',:'food_current','active',:'nutrition_current',:'activation_set',:'member_current',:'activation_grant'),
  (:'generation_stale',:'food_stale','active',:'nutrition_stale',:'activation_set',:'member_stale',:'activation_grant');
insert into public.food_catalog_generation_names(generation_id,food_id,name_fact_id) values
  (:'generation_current',:'food_current',:'name_current'),
  (:'generation_stale',:'food_stale',:'name_stale');
insert into public.food_catalog_generation_servings(generation_id,food_id,serving_option_id) values
  (:'generation_current',:'food_current',:'serving_current'),
  (:'generation_stale',:'food_stale',:'serving_stale');
insert into public.food_catalog_generation_taxonomy(generation_id,food_id,taxonomy_assignment_id)
values(:'generation_current',:'food_current',:'taxonomy_assignment');
insert into public.food_catalog_generation_markets(generation_id,food_id,market_assignment_id) values
  (:'generation_current',:'food_current',:'market_assignment_current'),
  (:'generation_stale',:'food_stale',:'market_assignment_stale');
insert into public.food_catalog_generation_verification(generation_id,food_id,assertion_scope,assertion_id) values
  (:'generation_current',:'food_current','identity',:'verify_current'),
  (:'generation_stale',:'food_stale','identity',:'verify_stale');
insert into public.food_catalog_generation_redirects(generation_id,source_food_id,target_food_id)
values(:'generation_current',:'food_merged',:'food_current');
insert into public.food_catalog_generation_validation_reports(
  id,generation_id,generation_checksum_sha256,validator_set_version,policy_version,report_checksum_sha256,
  blocker_count,error_count,warning_count,info_count,created_at
) values(
  :'validation_report',:'generation_current',repeat('6',64),'plan7-fixture-v1','plan7-fixture-v1',repeat('7',64),0,0,0,0,'2026-09-10T18:16:00Z'
);
insert into public.food_catalog_generation_events(
  id,event_type,operation_id,command_checksum_sha256,from_generation_id,to_generation_id,
  generation_checksum_sha256,validation_report_id,principal_id,principal_type,authority_reference,reason_code,policy_version,created_at
) values(
  :'generation_event','promote',:'op_promote',repeat('c',64),null,:'generation_current',repeat('6',64),:'validation_report',
  'plan7-fixture','service','fixture://plan7/promotion','fixture','plan7-fixture-v1','2026-09-10T18:17:00Z'
);
update public.food_catalog_current_generation
set current_generation_id=:'generation_current',current_event_id=:'generation_event',
    current_validation_report_id=:'validation_report',pointer_revision=1,updated_at='2026-09-10T18:18:00Z'
where singleton_key=true;

-- Model the real ingestion authority lifecycle before creating a live Production lease:
-- prepared batch -> completed dry-run -> reconciled evidence -> reviewed -> approved -> Production running.
insert into public.food_ingestion_batches(
  id,provider,dataset_name,source_version,license_name,source_checksum_sha256,importer_version,
  config_checksum_sha256,manifest_content_checksum_sha256,semantic_identity_checksum_sha256,review_state,created_at,updated_at
) values(
  :'ingestion_batch','plan7-fixture','portable-dataset','v1','Plan7 Fixture License',repeat('8',64),'plan7-fixture-v1',
  repeat('9',64),repeat('a',64),repeat('b',64),'prepared','2026-09-10T18:19:00Z','2026-09-10T18:19:00Z'
);
insert into public.food_ingestion_runs(
  id,batch_id,execution_mode,attempt_number,status,started_at,completed_at,manifest_content_checksum_sha256,
  observed_input_count,observed_accepted_count,observed_rejected_count,observed_created_count,observed_matched_count,
  observed_possible_duplicate_count,observed_quarantine_count,created_at,updated_at
) values(
  :'ingestion_dry_run',:'ingestion_batch','dry_run',1,'completed','2026-09-10T18:19:05Z','2026-09-10T18:19:10Z',repeat('a',64),
  0,0,0,0,0,0,0,'2026-09-10T18:19:05Z','2026-09-10T18:19:10Z'
);
insert into public.food_ingestion_reconciliations(
  id,run_id,batch_id,manifest_content_checksum_sha256,semantic_identity_checksum_sha256,
  expected_counts,observed_counts,mismatch_codes,reconciled,created_at
) values(
  :'ingestion_reconciliation',:'ingestion_dry_run',:'ingestion_batch',repeat('a',64),repeat('b',64),
  '{"input":0,"accepted":0,"rejected":0,"matched":0,"created":0,"possibleDuplicate":0,"quarantine":0}'::jsonb,
  '{"input":0,"accepted":0,"rejected":0,"matched":0,"created":0,"possibleDuplicate":0,"quarantine":0}'::jsonb,
  '{}'::text[],true,'2026-09-10T18:19:15Z'
);
update public.food_ingestion_batches
set review_state='reviewed',reviewed_at='2026-09-10T18:19:20Z',updated_at='2026-09-10T18:19:20Z'
where id=:'ingestion_batch'::uuid;
update public.food_ingestion_batches
set review_state='approved',approved_at='2026-09-10T18:19:30Z',approval_reference='fixture://plan7/ingestion-approval',updated_at='2026-09-10T18:19:30Z'
where id=:'ingestion_batch'::uuid;
insert into public.food_ingestion_runs(
  id,batch_id,execution_mode,attempt_number,status,started_at,manifest_content_checksum_sha256,
  created_at,updated_at,lease_owner,lease_token,lease_epoch,lease_acquired_at,lease_heartbeat_at,lease_expires_at
) values(
  :'ingestion_run',:'ingestion_batch','production',1,'running','2026-09-10T18:20:00Z',repeat('a',64),
  '2026-09-10T18:20:00Z','2026-09-10T18:20:00Z','plan7-worker','71000000-0000-4000-8000-000000000a21',3,
  '2026-09-10T18:20:00Z','2026-09-10T18:20:30Z','2026-09-10T19:20:00Z'
);

-- Protected FULL_DR authority: live human binding, runtime policy extension, lineage, and personal override.
insert into public.food_catalog_governance_principals(
  id,principal_type,subject_id,role_class,active,created_at
) values(:'owner_principal','human',:'owner_uid','owner',true,'2026-09-10T18:21:00Z');
insert into public.food_catalog_governance_capability_assignments(
  id,principal_id,capability,granted_at,reason
) values('71000000-0000-4000-8000-000000000d01',:'owner_principal','food.governance.manage_principals','2026-09-10T18:21:00Z','plan7 fixture owner');
insert into public.food_catalog_governance_policy_versions(policy_version,evidence_policy,evidence_required_categories,created_at)
select 'plan7-runtime-v1',evidence_policy,evidence_required_categories,'2026-09-10T18:22:00Z'::timestamptz
from public.food_catalog_governance_policy_versions where policy_version='plan6-v1';
update public.food_catalog_governance_policy_pointer
set current_policy_version='plan7-runtime-v1',pointer_revision=1,updated_at='2026-09-10T18:23:00Z'
where singleton=true;

insert into public.food_catalog_serving_fact_lineages(lineage_id,food_id,created_at)
values(:'serving_lineage',:'food_current','2026-09-10T18:24:00Z');
insert into public.food_catalog_serving_fact_revisions(serving_option_id,lineage_id,predecessor_serving_option_id,created_at)
values(:'serving_current',:'serving_lineage',null,'2026-09-10T18:24:00Z');
insert into public.food_catalog_name_fact_lineages(lineage_id,food_id,created_at)
values(:'name_lineage',:'food_current','2026-09-10T18:24:00Z');
insert into public.food_catalog_name_fact_revisions(name_fact_id,lineage_id,predecessor_name_fact_id,created_at)
values(:'name_current',:'name_lineage',null,'2026-09-10T18:24:00Z');

insert into public.food_personal_override_revisions(
  id,user_id,food_id,revision_number,supersedes_revision_id,nutrition_override,serving_label,note,is_deleted,created_at
) values(
  :'override_revision',:'owner_uid',:'food_current',1,null,'{"protein_g":32.5}'::jsonb,'my serving','private-plan7-note',false,'2026-09-10T18:25:00Z'
);
insert into public.food_personal_overrides(user_id,food_id,current_revision_id,pointer_revision,updated_at)
values(:'owner_uid',:'food_current',:'override_revision',1,'2026-09-10T18:25:00Z');
insert into public.food_personal_override_operations(
  user_id,operation_id,food_id,command_name,semantic_checksum_sha256,result_json,created_at,completed_at
) values(
  :'owner_uid',:'override_operation',:'food_current','set',repeat('b',64),'{"revisionId":"71000000-0000-4000-8000-000000000b01"}'::jsonb,
  '2026-09-10T18:25:00Z','2026-09-10T18:25:00Z'
);

-- Fixture self-checks are part of the source proof, not certification.
-- psql variables are intentionally not used inside this dollar-quoted block: psql
-- does not interpolate :'name' tokens inside dollar-quoted PL/pgSQL bodies.
do $plan7_fixture$
begin
  if not exists(
    select 1 from public.food_catalog_current_generation
    where singleton_key
      and current_generation_id='71000000-0000-4000-8000-000000000901'::uuid
      and pointer_revision=1
  ) then
    raise exception 'Plan7 source fixture current pointer was not established.';
  end if;
  if not exists(select 1 from public.food_taxonomy_nodes where node_code='plan7_runtime_protein')
     or not exists(select 1 from public.market_scopes where scope_code='PLAN7_TEST') then
    raise exception 'Plan7 source fixture mixed runtime reference extensions are missing.';
  end if;
  if not exists(
    select 1
    from public.food_personal_overrides current_override
    join public.food_personal_override_revisions revision on revision.id=current_override.current_revision_id
    where current_override.user_id='71000000-0000-4000-8000-000000000001'::uuid
      and revision.note='private-plan7-note'
  ) then
    raise exception 'Plan7 source fixture protected personal authority is missing.';
  end if;
  if not exists(
    select 1
    from public.food_ingestion_batches batch
    join public.food_ingestion_runs dry_run
      on dry_run.id='71000000-0000-4000-8000-000000000a12'::uuid
     and dry_run.batch_id=batch.id
    join public.food_ingestion_reconciliations reconciliation
      on reconciliation.run_id=dry_run.id
     and reconciliation.batch_id=batch.id
    where batch.id='71000000-0000-4000-8000-000000000a01'::uuid
      and batch.review_state='approved' and batch.approved_at is not null
      and lower(batch.manifest_content_checksum_sha256)=repeat('a',64)
      and lower(batch.semantic_identity_checksum_sha256)=repeat('b',64)
      and dry_run.execution_mode='dry_run' and dry_run.status='completed'
      and reconciliation.reconciled
  ) then
    raise exception 'Plan7 source fixture approved ingestion authority was not established.';
  end if;
  if not exists(
    select 1 from public.food_ingestion_runs
    where id='71000000-0000-4000-8000-000000000a11'::uuid
      and execution_mode='production' and status='running'
      and lease_owner='plan7-worker' and lease_token is not null and lease_epoch=3
      and lease_acquired_at is not null and lease_heartbeat_at is not null and lease_expires_at is not null
  ) then
    raise exception 'Plan7 source fixture valid live lease was not established.';
  end if;
end
$plan7_fixture$;