begin;

-- Plan 4 disposable verification: live lease, stale takeover, immutable audit,
-- reviewed per-record manifest authority, structured Plan 1 facts and fail-closed reconciliation.
-- Added correction evidence: cross-attempt live lease, cross-attempt materialized resume,
-- lease lifecycle events, nullable serving label, explicit milliliter serving evidence,
-- failed reconciliation terminalization, release diff manifest authority. Everything is rollback-only.

create or replace function pg_temp.plan4_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'Plan 4 assertion failed: %', p_message; end if;
end
$$;

create or replace function pg_temp.plan4_rejected(p_sql text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 4 expected rejection did not occur: %', p_message;
  exception when others then
    if sqlerrm like 'Plan 4 expected rejection did not occur:%' then raise; end if;
  end;
end
$$;

-- New authority tables are internal read-only evidence to service_role; mutation is RPC-only.
do $privileges$
declare
  v_table text;
  v_rpc text;
begin
  foreach v_table in array array[
    'food_ingestion_control_operations','food_ingestion_manifest_records','food_ingestion_materialized_results',
    'food_ingestion_quarantines','food_ingestion_quarantine_resolutions','food_ingestion_reconciliations',
    'food_ingestion_release_diffs','food_ingestion_release_diff_records','food_ingestion_operational_events'
  ] loop
    perform pg_temp.plan4_assert(has_table_privilege('service_role', 'public.' || v_table, 'SELECT'), v_table || ' service_role SELECT');
    perform pg_temp.plan4_assert(not has_table_privilege('service_role', 'public.' || v_table, 'INSERT,UPDATE,DELETE,TRUNCATE'), v_table || ' no direct service_role mutation');
    perform pg_temp.plan4_assert(not has_table_privilege('anon', 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE'), v_table || ' anon denied');
    perform pg_temp.plan4_assert(not has_table_privilege('authenticated', 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE'), v_table || ' authenticated denied');
  end loop;

  foreach v_rpc in array array[
    'food_catalog_ingestion_prepare_execution_v2','food_catalog_ingestion_acquire_lease_v2',
    'food_catalog_ingestion_heartbeat_lease_v2','food_catalog_ingestion_persist_candidate_v2',
    'food_catalog_ingestion_record_quarantine_v2','food_catalog_ingestion_resolve_quarantine_v2',
    'food_catalog_ingestion_record_reconciliation_v2','food_catalog_ingestion_record_release_diff_v2',
    'food_catalog_ingestion_append_event_v2','food_catalog_ingestion_complete_run_v2',
    'food_catalog_ingestion_fail_run_v2'
  ] loop
    perform pg_temp.plan4_assert(has_function_privilege('service_role', 'public.' || v_rpc || '(jsonb)', 'EXECUTE'), v_rpc || ' service_role execute');
    perform pg_temp.plan4_assert(not has_function_privilege('anon', 'public.' || v_rpc || '(jsonb)', 'EXECUTE'), v_rpc || ' anon denied');
    perform pg_temp.plan4_assert(not has_function_privilege('authenticated', 'public.' || v_rpc || '(jsonb)', 'EXECUTE'), v_rpc || ' authenticated denied');
  end loop;
end
$privileges$;

create temporary table plan4_fixture(
  candidate jsonb not null,
  decision jsonb not null,
  disposition jsonb not null,
  planned_food_id uuid not null
);
insert into plan4_fixture values (
  jsonb_build_object(
    'sourceRecordId','fixture-create-1',
    'sourceReference','fixture://record/1',
    'sourceRecordChecksumSha256',repeat('e',64),
    'canonicalName','Plan 4 Fixture Food',
    'brandName',null,
    'servingLabel',null,
    'category',null,
    'cuisine',null,
    'nutrition',jsonb_build_object(
      'calories',100,'protein_g',10,'carbs_g',5,'fat_g',2,
      'saturated_fat_g',null,'fiber_g',null,'sugars_g',null,'sodium_mg',null,
      'basis_amount',100,'basis_unit','g'
    ),
    'aliases',jsonb_build_array(jsonb_build_object(
      'locale','en','value','Plan 4 Fixture','normalizedValue','plan 4 fixture'
    )),
    'names',jsonb_build_array(jsonb_build_object(
      'locale','en','script',null,'role','source','value','Plan 4 Fixture Food','normalizedValue','plan 4 fixture food'
    )),
    'identityEvidence',jsonb_build_object(
      'semanticSignature',null,'preparation',null,'state',null,'form',null,'structuredEvidenceKey',null
    ),
    'servings',jsonb_build_array(jsonb_build_object(
      'servingKey','cup-1','amount',1,'unit','cup','gramWeight',null,'milliliterVolume',240,
      'label','1 cup','sourceEvidence',jsonb_build_object('fixture',true,'milliliters',240)
    )),
    'taxonomyEvidence',jsonb_build_array(jsonb_build_object(
      'taxonomy','primary_food_group','sourceCode','fixture-dairy','mappedTaxonomyId','dairy'
    )),
    'gtins',jsonb_build_array('4006381333931'),
    'marketScopes',jsonb_build_array(jsonb_build_object(
      'type','country','code','DE','relevanceLevel','primary'
    )),
    'globallyRelevant',false,
    'sourceNutrition',jsonb_build_object('fixture',true),
    'sourceServing',jsonb_build_object('label','1 cup','milliliterVolume',240)
  ),
  jsonb_build_object('kind','create'),
  jsonb_build_object('kind','accept','reasonCodes',jsonb_build_array()),
  '44000000-0000-4000-8000-000000000201'::uuid
);

-- Prepare deterministic dry-run authority.
select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000001',
  'commandChecksumSha256',repeat('1',64),
  'executionMode','dry_run','attemptNumber',1,
  'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('b',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','fixture-v2','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-04','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://plan4','sourceChecksumSha256',repeat('c',64),
    'importerVersion','plan4-test','configChecksumSha256',repeat('d',64)
  ),
  'expectedMutations',jsonb_build_object('input',1,'accepted',1,'rejected',0,'matched',0,'created',1,'possibleDuplicate',0,'quarantined',0)
));

create temporary table plan4_ids as
select batch.id batch_id, run.id dry_run_id
from public.food_ingestion_batches batch
join public.food_ingestion_runs run on run.batch_id = batch.id
where batch.semantic_identity_checksum_sha256 = repeat('b',64) and run.execution_mode = 'dry_run';

-- Stage one exact source candidate and reviewed per-record manifest without canonical Food mutation.
select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000002','commandChecksumSha256',repeat('2',64),
  'runId',(select dry_run_id from plan4_ids),
  'foodId',(select planned_food_id from plan4_fixture),
  'decisionKind','create','dispositionKind','accept',
  'decision',(select decision from plan4_fixture),
  'disposition',(select disposition from plan4_fixture),
  'candidate',(select candidate from plan4_fixture)
));
select pg_temp.plan4_assert((
  select count(*)=1
  from public.food_ingestion_manifest_records
  where batch_id=(select batch_id from plan4_ids)
    and source_record_key='fixture-create-1'
    and candidate_json=(select candidate from plan4_fixture)
    and decision_json=(select decision from plan4_fixture)
    and disposition_json=(select disposition from plan4_fixture)
    and planned_food_id=(select planned_food_id from plan4_fixture)
), 'reviewed per-record manifest authority staged exactly once');

-- Exact dry-run reconciliation and completion.
select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000003','commandChecksumSha256',repeat('3',64),
  'runId',(select dry_run_id from plan4_ids),'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('b',64),'completed',true
));
select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000004','commandChecksumSha256',repeat('4',64),
  'runId',(select dry_run_id from plan4_ids)
));

-- completed dry-run rejects candidate: immutable reconciliation cannot be corrupted afterward.
select pg_temp.plan4_rejected(format(
  'select public.food_catalog_ingestion_persist_candidate_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','44000000-0000-4000-8000-000000000014','commandChecksumSha256',repeat('4',64),
    'runId',(select dry_run_id from plan4_ids),
    'foodId',(select planned_food_id from plan4_fixture),
    'decisionKind','create','dispositionKind','accept',
    'decision',(select decision from plan4_fixture),
    'disposition',(select disposition from plan4_fixture),
    'candidate',(select candidate from plan4_fixture)
  )::text
), 'completed dry-run rejects candidate');

-- Review/approve fixture as privileged database owner; the executor itself has no approval RPC.
update public.food_ingestion_batches set review_state='reviewed', reviewed_at=clock_timestamp()
where id=(select batch_id from plan4_ids);
update public.food_ingestion_batches set review_state='approved', approved_at=clock_timestamp(), approval_reference='plan4-disposable-verifier'
where id=(select batch_id from plan4_ids);

-- Prepare Production attempt 1.
select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('5',64),
  'executionMode','production','attemptNumber',1,'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('b',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','fixture-v2','sourceVersion','2026.09','sourceReleaseDate','2026-09-04',
    'licenseName','Fixture License','licenseReference','fixture-license','sourceReference','fixture://plan4',
    'sourceChecksumSha256',repeat('c',64),'importerVersion','plan4-test','configChecksumSha256',repeat('d',64)
  ),
  'expectedMutations',jsonb_build_object('input',1,'accepted',1,'rejected',0,'matched',0,'created',1,'possibleDuplicate',0,'quarantined',0)
));

alter table plan4_ids add column production_run_id uuid;
alter table plan4_ids add column production_run2_id uuid;
update plan4_ids set production_run_id = (
  select id from public.food_ingestion_runs where batch_id=plan4_ids.batch_id and execution_mode='production' and attempt_number=1
);

-- live lease: owner A acquires and a concurrent-style second acquisition is rejected.
select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000006','commandChecksumSha256',repeat('6',64),
  'runId',(select production_run_id from plan4_ids),'leaseOwner','worker-a','leaseToken','44000000-0000-4000-8000-000000000101','leaseSeconds',120
));
select pg_temp.plan4_rejected(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','44000000-0000-4000-8000-000000000007','commandChecksumSha256',repeat('7',64),
    'runId',(select production_run_id from plan4_ids),'leaseOwner','worker-b',
    'leaseToken','44000000-0000-4000-8000-000000000102','leaseSeconds',120
  )::text
), 'live lease cannot be stolen');

-- Prepare attempt 2 while attempt 1 is live; batch-wide authority must reject it.
select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000016','commandChecksumSha256',repeat('1',64),
  'executionMode','production','attemptNumber',2,'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('b',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','fixture-v2','sourceVersion','2026.09','sourceReleaseDate','2026-09-04',
    'licenseName','Fixture License','licenseReference','fixture-license','sourceReference','fixture://plan4',
    'sourceChecksumSha256',repeat('c',64),'importerVersion','plan4-test','configChecksumSha256',repeat('d',64)
  ),
  'expectedMutations',jsonb_build_object('input',1,'accepted',1,'rejected',0,'matched',0,'created',1,'possibleDuplicate',0,'quarantined',0)
));
update plan4_ids set production_run2_id = (
  select id from public.food_ingestion_runs where batch_id=plan4_ids.batch_id and execution_mode='production' and attempt_number=2
);
select pg_temp.plan4_rejected(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','44000000-0000-4000-8000-000000000017','commandChecksumSha256',repeat('2',64),
    'runId',(select production_run2_id from plan4_ids),'leaseOwner','worker-c',
    'leaseToken','44000000-0000-4000-8000-000000000103','leaseSeconds',120
  )::text
), 'cross-attempt live lease');

-- stale takeover on the same attempt increments epoch and records loss/takeover history.
update public.food_ingestion_runs
set lease_acquired_at=clock_timestamp()-interval '3 seconds',
    lease_heartbeat_at=clock_timestamp()-interval '2 seconds',
    lease_expires_at=clock_timestamp()-interval '1 second'
where id=(select production_run_id from plan4_ids);
select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000008','commandChecksumSha256',repeat('8',64),
  'runId',(select production_run_id from plan4_ids),'leaseOwner','worker-b','leaseToken','44000000-0000-4000-8000-000000000102','leaseSeconds',120
));
select pg_temp.plan4_assert((
  select lease_epoch=2 and lease_token='44000000-0000-4000-8000-000000000102'::uuid
  from public.food_ingestion_runs where id=(select production_run_id from plan4_ids)
), 'stale takeover increments epoch');

select public.food_catalog_ingestion_heartbeat_lease_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000009','commandChecksumSha256',repeat('9',64),
  'runId',(select production_run_id from plan4_ids),'leaseToken','44000000-0000-4000-8000-000000000102','leaseEpoch',2,'leaseSeconds',120
));
select pg_temp.plan4_assert((
  select count(*) >= 4 from public.food_ingestion_operational_events
  where batch_id=(select batch_id from plan4_ids)
    and event_type in ('lease_acquired','lease_lost','lease_takeover','lease_heartbeat')
), 'lease lifecycle events');

-- manifest tamper: same source identity with altered reviewed candidate bytes must fail closed.
select pg_temp.plan4_rejected(format(
  'select public.food_catalog_ingestion_persist_candidate_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','44000000-0000-4000-8000-000000000015','commandChecksumSha256',repeat('5',64),
    'runId',(select production_run_id from plan4_ids),
    'leaseToken','44000000-0000-4000-8000-000000000102','leaseEpoch',2,
    'foodId',(select planned_food_id from plan4_fixture),
    'decisionKind','create','dispositionKind','accept',
    'decision',(select decision from plan4_fixture),
    'disposition',(select disposition from plan4_fixture),
    'candidate',jsonb_set((select candidate from plan4_fixture),'{canonicalName}','"Tampered Fixture"'::jsonb)
  )::text
), 'manifest tamper is rejected');

-- Privileged draft-only mutation: exact reviewed record creates one lifecycle_status=draft Food.
select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000010','commandChecksumSha256',repeat('a',64),
  'runId',(select production_run_id from plan4_ids),'leaseToken','44000000-0000-4000-8000-000000000102','leaseEpoch',2,
  'foodId',(select planned_food_id from plan4_fixture),
  'decisionKind','create','dispositionKind','accept',
  'decision',(select decision from plan4_fixture),
  'disposition',(select disposition from plan4_fixture),
  'candidate',(select candidate from plan4_fixture)
));
select pg_temp.plan4_assert((
  select lifecycle_status='draft' and is_verified=false and serving_size is null
  from public.food_items where id=(select planned_food_id from plan4_fixture)
), 'nullable serving label');
select pg_temp.plan4_assert((select count(*)=0 from public.food_catalog_generations), 'Plan 4 does not create generations');

-- structured Plan 1 facts are source-backed instead of being discarded after legacy-row creation.
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_nutrition_revisions
  where food_id=(select planned_food_id from plan4_fixture)
), 'structured Plan 1 facts include nutrition revision');
select pg_temp.plan4_assert((
  select count(*)=2 from public.food_names
  where food_id=(select planned_food_id from plan4_fixture)
), 'structured Plan 1 facts include source name and alias');
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_serving_options
  where food_id=(select planned_food_id from plan4_fixture) and amount=240 and unit_code='ml' and gram_weight is null
), 'explicit milliliter serving evidence');
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_barcodes
  where food_id=(select planned_food_id from plan4_fixture) and gtin='4006381333931'
), 'structured Plan 1 facts include GTIN evidence');
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_taxonomy_assignments
  where food_id=(select planned_food_id from plan4_fixture) and node_code='dairy'
), 'structured Plan 1 facts include taxonomy evidence');
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_market_assignments
  where food_id=(select planned_food_id from plan4_fixture) and scope_code='DE'
), 'structured Plan 1 facts include explicit market evidence');
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_ingestion_materialized_results
  where batch_id=(select batch_id from plan4_ids) and source_record_key='fixture-create-1'
), 'materialized accepted mutation recorded once');

-- Expire attempt 1 and let attempt 2 take over the semantic batch.
update public.food_ingestion_runs
set lease_acquired_at=clock_timestamp()-interval '3 seconds',
    lease_heartbeat_at=clock_timestamp()-interval '2 seconds',
    lease_expires_at=clock_timestamp()-interval '1 second'
where id=(select production_run_id from plan4_ids);
select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000018','commandChecksumSha256',repeat('3',64),
  'runId',(select production_run2_id from plan4_ids),'leaseOwner','worker-c','leaseToken','44000000-0000-4000-8000-000000000103','leaseSeconds',120
));

-- New attempt acknowledges the already materialized write without duplicating canonical facts.
select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000019','commandChecksumSha256',repeat('4',64),
  'runId',(select production_run2_id from plan4_ids),'leaseToken','44000000-0000-4000-8000-000000000103','leaseEpoch',1,
  'foodId',(select planned_food_id from plan4_fixture),
  'decisionKind','create','dispositionKind','accept',
  'decision',(select decision from plan4_fixture),
  'disposition',(select disposition from plan4_fixture),
  'candidate',(select candidate from plan4_fixture)
));
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_items where id=(select planned_food_id from plan4_fixture)
), 'cross-attempt materialized resume');
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_nutrition_revisions where food_id=(select planned_food_id from plan4_fixture)
), 'cross-attempt materialized resume keeps nutrition single');
select pg_temp.plan4_assert((
  select count(*)=2 from public.food_names where food_id=(select planned_food_id from plan4_fixture)
), 'cross-attempt materialized resume keeps names single');
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_serving_options where food_id=(select planned_food_id from plan4_fixture)
), 'cross-attempt materialized resume keeps serving single');
select pg_temp.plan4_assert((
  select observed_input_count=1 and observed_accepted_count=1 and observed_created_count=1
  from public.food_ingestion_runs where id=(select production_run2_id from plan4_ids)
), 'cross-attempt materialized resume counts current attempt exactly');

-- Continue final fail-closed evidence on attempt 2, which now owns the live batch lease.
update plan4_ids set production_run_id=production_run2_id;

-- Immutable event/materialized authority rejects direct mutation.
select public.food_catalog_ingestion_append_event_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000011','commandChecksumSha256',repeat('b',64),
  'batchId',(select batch_id from plan4_ids),'runId',(select production_run_id from plan4_ids),
  'leaseToken','44000000-0000-4000-8000-000000000103','leaseEpoch',1,
  'eventType','lease_heartbeat','eventChecksumSha256',repeat('c',64),'payload',jsonb_build_object('fixture',true)
));
select pg_temp.plan4_rejected(
  'delete from public.food_ingestion_operational_events where event_type=''lease_heartbeat''',
  'immutable operational event'
);
select pg_temp.plan4_rejected(
  'delete from public.food_ingestion_manifest_records where source_record_key=''fixture-create-1''',
  'immutable reviewed manifest record'
);
select pg_temp.plan4_rejected(
  'delete from public.food_ingestion_materialized_results where source_record_key=''fixture-create-1''',
  'immutable materialized result'
);

-- Inject a balanced duplicate semantic result as database owner. Run counters stay exact;
-- reconciliation must detect the per-source duplication independently of aggregate counts.
insert into public.food_ingestion_operational_events(
  batch_id, run_id, source_record_key, event_type, payload_json, event_checksum_sha256
) values (
  (select batch_id from plan4_ids), (select production_run_id from plan4_ids),
  'fixture-create-1', 'candidate_persisted', jsonb_build_object('verificationInjection', true), repeat('f',64)
);

-- Reconciliation must fail closed on semantic duplication and partial execution before completion.
select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000012','commandChecksumSha256',repeat('d',64),
  'runId',(select production_run_id from plan4_ids),'leaseToken','44000000-0000-4000-8000-000000000103','leaseEpoch',1,
  'manifestContentChecksumSha256',repeat('a',64),'semanticIdentityChecksumSha256',repeat('b',64),'completed',false
));
select pg_temp.plan4_assert((
  select not reconciled
    and mismatch_codes @> array['duplicate_semantic_result','partial_execution']::text[]
  from public.food_ingestion_reconciliations
  where run_id=(select production_run_id from plan4_ids)
), 'semantic duplicate and partial execution fail reconciliation');
select pg_temp.plan4_rejected(format(
  'select public.food_catalog_ingestion_complete_run_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','44000000-0000-4000-8000-000000000013','commandChecksumSha256',repeat('e',64),
    'runId',(select production_run_id from plan4_ids),
    'leaseToken','44000000-0000-4000-8000-000000000103','leaseEpoch',1
  )::text
), 'failed reconciliation blocks completion');

select public.food_catalog_ingestion_fail_run_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000020','commandChecksumSha256',repeat('0',64),
  'runId',(select production_run_id from plan4_ids),
  'leaseToken','44000000-0000-4000-8000-000000000103','leaseEpoch',1,
  'reconciliationId',(
    select id from public.food_ingestion_reconciliations where run_id=(select production_run_id from plan4_ids)
  ),
  'mismatchCodes',(
    select to_jsonb(mismatch_codes) from public.food_ingestion_reconciliations where run_id=(select production_run_id from plan4_ids)
  )
));
select pg_temp.plan4_assert((
  select status='failed' and completed_at is not null and lease_token is null and lease_owner is null and lease_expires_at is null
  from public.food_ingestion_runs where id=(select production_run_id from plan4_ids)
), 'failed reconciliation terminalization');
select pg_temp.plan4_assert((
  select count(*)=1 from public.food_ingestion_operational_events
  where run_id=(select production_run_id from plan4_ids) and event_type='execution_failed'
), 'failed reconciliation terminalization event');

-- Release diff manifest authority: previous/next immutable manifests differ only in raw sourceNutrition.
insert into public.food_ingestion_batches(
  provider, dataset_name, source_version, source_release_date,
  license_name, license_reference, source_reference, source_checksum_sha256,
  importer_version, config_checksum_sha256, manifest_content_checksum_sha256,
  semantic_identity_checksum_sha256, input_count, accepted_count, rejected_count,
  matched_count, created_count, possible_duplicate_count, expected_quarantine_count
)
select
  provider, dataset_name, '2026.08', source_release_date,
  license_name, license_reference, source_reference, source_checksum_sha256,
  importer_version, config_checksum_sha256, repeat('6',64),
  repeat('7',64), input_count, accepted_count, rejected_count,
  matched_count, created_count, possible_duplicate_count, expected_quarantine_count
from public.food_ingestion_batches
where id=(select batch_id from plan4_ids);

create temporary table plan4_release_diff_ids as
select id previous_batch_id
from public.food_ingestion_batches
where semantic_identity_checksum_sha256=repeat('7',64);

insert into public.food_source_records(
  food_id, provider, source_record_id, source_reference, license_name, license_reference,
  retrieved_at, source_nutrition, source_serving, source_dataset, source_version,
  source_release_date, source_record_checksum_sha256
)
select
  null, source.provider, source.source_record_id, source.source_reference,
  source.license_name, source.license_reference, clock_timestamp(),
  jsonb_set(source.source_nutrition, '{fixture}', 'false'::jsonb),
  source.source_serving, source.source_dataset, '2026.08',
  source.source_release_date, source.source_record_checksum_sha256
from public.food_source_records source
join public.food_ingestion_manifest_records manifest on manifest.source_record_id=source.id
where manifest.batch_id=(select batch_id from plan4_ids)
  and manifest.source_record_key='fixture-create-1';

insert into public.food_ingestion_manifest_records(
  batch_id, source_record_key, source_record_id, manifest_content_checksum_sha256,
  candidate_json, issues_json, decision_json, disposition_json, planned_food_id
)
select
  (select previous_batch_id from plan4_release_diff_ids),
  current_manifest.source_record_key,
  previous_source.id,
  repeat('6',64),
  jsonb_set(current_manifest.candidate_json, '{sourceNutrition,fixture}', 'false'::jsonb),
  current_manifest.issues_json,
  current_manifest.decision_json,
  current_manifest.disposition_json,
  current_manifest.planned_food_id
from public.food_ingestion_manifest_records current_manifest
join public.food_source_records previous_source
  on previous_source.provider='synthetic-reference'
 and previous_source.source_dataset='fixture-v2'
 and previous_source.source_version='2026.08'
 and previous_source.source_record_id=current_manifest.source_record_key
where current_manifest.batch_id=(select batch_id from plan4_ids)
  and current_manifest.source_record_key='fixture-create-1';

select pg_temp.plan4_rejected(format(
  'select public.food_catalog_ingestion_record_release_diff_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','44000000-0000-4000-8000-000000000021',
    'commandChecksumSha256',repeat('1',64),
    'batchId',(select batch_id from plan4_ids),
    'previousBatchId',(select previous_batch_id from plan4_release_diff_ids),
    'records',jsonb_build_array(jsonb_build_object(
      'sourceRecordId','fixture-create-1','classifications',jsonb_build_array('unchanged')
    )),
    'diffChecksumSha256',repeat('2',64)
  )::text
), 'false unchanged release diff rejected');

select public.food_catalog_ingestion_record_release_diff_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000022',
  'commandChecksumSha256',repeat('2',64),
  'batchId',(select batch_id from plan4_ids),
  'previousBatchId',(select previous_batch_id from plan4_release_diff_ids),
  'records',jsonb_build_array(jsonb_build_object(
    'sourceRecordId','fixture-create-1','classifications',jsonb_build_array('nutrition_changed')
  )),
  'diffChecksumSha256',encode(extensions.digest(convert_to(
    '{"entries":[{"classifications":["nutrition_changed"],"sourceRecordId":"fixture-create-1"}],"nextBatchIdentity":"'
    || repeat('b',64)
    || '","previousBatchIdentity":"'
    || repeat('7',64)
    || '"}',
    'UTF8'
  ), 'sha256'), 'hex')
));
select pg_temp.plan4_assert((
  select count(*)=1
  from public.food_ingestion_release_diff_records record
  join public.food_ingestion_release_diffs diff on diff.id=record.release_diff_id
  where diff.batch_id=(select batch_id from plan4_ids)
    and diff.previous_batch_id=(select previous_batch_id from plan4_release_diff_ids)
    and record.source_record_key='fixture-create-1'
    and record.classifications=array['nutrition_changed']::text[]
), 'release diff manifest authority');

-- Quarantine remains first-class and distinct from reject; verification stays rollback-only.
select pg_temp.plan4_assert((
  select count(*)=0 from public.food_catalog_current_generation where current_generation_id is not null
), 'current generation remains untouched');

rollback;