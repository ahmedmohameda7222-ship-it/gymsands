begin;

-- Plan 4 disposable verification: live lease, stale takeover, immutable audit,
-- quarantine, reconciliation, service_role command authority. Everything is rollback-only.

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
    'food_ingestion_control_operations','food_ingestion_quarantines','food_ingestion_quarantine_resolutions',
    'food_ingestion_reconciliations','food_ingestion_release_diffs','food_ingestion_release_diff_records',
    'food_ingestion_operational_events'
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
    'food_catalog_ingestion_append_event_v2','food_catalog_ingestion_complete_run_v2'
  ] loop
    perform pg_temp.plan4_assert(has_function_privilege('service_role', 'public.' || v_rpc || '(jsonb)', 'EXECUTE'), v_rpc || ' service_role execute');
    perform pg_temp.plan4_assert(not has_function_privilege('anon', 'public.' || v_rpc || '(jsonb)', 'EXECUTE'), v_rpc || ' anon denied');
    perform pg_temp.plan4_assert(not has_function_privilege('authenticated', 'public.' || v_rpc || '(jsonb)', 'EXECUTE'), v_rpc || ' authenticated denied');
  end loop;
end
$privileges$;

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

-- Stage one source candidate into the prepared batch without canonical Food mutation.
select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000002','commandChecksumSha256',repeat('2',64),
  'runId',(select dry_run_id from plan4_ids),'decisionKind','create','dispositionKind','accept',
  'candidate',jsonb_build_object(
    'sourceRecordId','fixture-create-1','sourceReference','fixture://record/1','sourceRecordChecksumSha256',repeat('e',64),
    'canonicalName','Plan 4 Fixture Food','brandName',null,'servingLabel','100 g','category',null,'cuisine',null,
    'nutrition',jsonb_build_object('calories',100,'protein_g',10,'carbs_g',5,'fat_g',2,'saturated_fat_g',null,'fiber_g',null,'sugars_g',null,'sodium_mg',null,'basis_amount',100,'basis_unit','g'),
    'sourceNutrition',jsonb_build_object('fixture',true),'sourceServing',jsonb_build_object('label','100 g')
  )
));

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

-- Review/approve fixture as privileged database owner; the executor itself has no approval RPC.
update public.food_ingestion_batches set review_state='reviewed', reviewed_at=clock_timestamp()
where id=(select batch_id from plan4_ids);
update public.food_ingestion_batches set review_state='approved', approved_at=clock_timestamp(), approval_reference='plan4-disposable-verifier'
where id=(select batch_id from plan4_ids);

select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('5',64),
  'executionMode','production','attemptNumber',1,'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('b',64),
  'source',jsonb_build_object('provider','synthetic-reference','dataset','fixture-v2','sourceVersion','2026.09','sourceReleaseDate','2026-09-04','licenseName','Fixture License','sourceChecksumSha256',repeat('c',64),'importerVersion','plan4-test','configChecksumSha256',repeat('d',64)),
  'expectedMutations',jsonb_build_object('input',1,'accepted',1,'rejected',0,'matched',0,'created',1,'possibleDuplicate',0,'quarantined',0)
));

alter table plan4_ids add column production_run_id uuid;
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
  jsonb_build_object('operationId','44000000-0000-4000-8000-000000000007','commandChecksumSha256',repeat('7',64),'runId',(select production_run_id from plan4_ids),'leaseOwner','worker-b','leaseToken','44000000-0000-4000-8000-000000000102','leaseSeconds',120)::text
), 'live lease cannot be stolen');

-- stale takeover: expire fixture lease as database owner while preserving the lease-shape CHECK.
update public.food_ingestion_runs
set lease_acquired_at=clock_timestamp()-interval '3 seconds',
    lease_heartbeat_at=clock_timestamp()-interval '2 seconds',
    lease_expires_at=clock_timestamp()-interval '1 second'
where id=(select production_run_id from plan4_ids);
select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000008','commandChecksumSha256',repeat('8',64),
  'runId',(select production_run_id from plan4_ids),'leaseOwner','worker-b','leaseToken','44000000-0000-4000-8000-000000000102','leaseSeconds',120
));
select pg_temp.plan4_assert((select lease_epoch=2 and lease_token='44000000-0000-4000-8000-000000000102'::uuid from public.food_ingestion_runs where id=(select production_run_id from plan4_ids)), 'stale takeover increments epoch');

select public.food_catalog_ingestion_heartbeat_lease_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000009','commandChecksumSha256',repeat('9',64),
  'runId',(select production_run_id from plan4_ids),'leaseToken','44000000-0000-4000-8000-000000000102','leaseEpoch',2,'leaseSeconds',120
));

-- Privileged draft-only mutation: create exactly one lifecycle_status=draft Food.
select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000010','commandChecksumSha256',repeat('a',64),
  'runId',(select production_run_id from plan4_ids),'leaseToken','44000000-0000-4000-8000-000000000102','leaseEpoch',2,
  'foodId','44000000-0000-4000-8000-000000000201','decisionKind','create','dispositionKind','accept',
  'candidate',jsonb_build_object('sourceRecordId','fixture-create-1','canonicalName','Plan 4 Fixture Food','servingLabel','100 g','nutrition',jsonb_build_object('calories',100,'protein_g',10,'carbs_g',5,'fat_g',2,'basis_amount',100,'basis_unit','g'))
));
select pg_temp.plan4_assert((select lifecycle_status='draft' and is_verified=false from public.food_items where id='44000000-0000-4000-8000-000000000201'), 'Production create remains draft and unverified');
select pg_temp.plan4_assert((select count(*)=0 from public.food_catalog_generations), 'Plan 4 does not create generations');

-- Immutable event/quarantine authority rejects direct mutation.
select public.food_catalog_ingestion_append_event_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000011','commandChecksumSha256',repeat('b',64),
  'batchId',(select batch_id from plan4_ids),'runId',(select production_run_id from plan4_ids),
  'leaseToken','44000000-0000-4000-8000-000000000102','leaseEpoch',2,
  'eventType','lease_heartbeat','eventChecksumSha256',repeat('c',64),'payload',jsonb_build_object('fixture',true)
));
select pg_temp.plan4_rejected('delete from public.food_ingestion_operational_events where event_type=''lease_heartbeat''', 'immutable operational event');

-- Reconciliation must fail closed on count divergence before completion.
select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
  'operationId','44000000-0000-4000-8000-000000000012','commandChecksumSha256',repeat('d',64),
  'runId',(select production_run_id from plan4_ids),'leaseToken','44000000-0000-4000-8000-000000000102','leaseEpoch',2,
  'manifestContentChecksumSha256',repeat('a',64),'semanticIdentityChecksumSha256',repeat('b',64),'completed',false
));
select pg_temp.plan4_assert((select not reconciled from public.food_ingestion_reconciliations where run_id=(select production_run_id from plan4_ids)), 'reconciliation fails closed');
select pg_temp.plan4_rejected(format(
  'select public.food_catalog_ingestion_complete_run_v2(%L::jsonb)',
  jsonb_build_object('operationId','44000000-0000-4000-8000-000000000013','commandChecksumSha256',repeat('e',64),'runId',(select production_run_id from plan4_ids),'leaseToken','44000000-0000-4000-8000-000000000102','leaseEpoch',2)::text
), 'failed reconciliation blocks completion');

-- Quarantine remains first-class and distinct from reject; verification stays rollback-only.
select pg_temp.plan4_assert((select count(*)=0 from public.food_catalog_current_generation where current_generation_id is not null), 'current generation remains untouched');

rollback;
