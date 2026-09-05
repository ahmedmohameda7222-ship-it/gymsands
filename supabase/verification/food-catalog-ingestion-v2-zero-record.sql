begin;

-- Plan 4 regression: a valid zero-record dry run must enter running execution
-- authority before exact reconciliation so its successful reconciliation can
-- still take the legitimate terminal completion path.

create or replace function pg_temp.plan4_zero_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Plan 4 zero-record assertion failed: %', p_message;
  end if;
end
$$;

select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','77000000-0000-4000-8000-000000000001',
  'commandChecksumSha256',repeat('1',64),
  'executionMode','dry_run',
  'attemptNumber',1,
  'manifestContentChecksumSha256',repeat('d',64),
  'semanticIdentityChecksumSha256',repeat('e',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference',
    'dataset','zero-record-fixture',
    'sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-05',
    'licenseName','Fixture License',
    'licenseReference','fixture-license',
    'sourceReference','fixture://zero-record',
    'sourceChecksumSha256',repeat('f',64),
    'importerVersion','plan4-zero-test',
    'configChecksumSha256',repeat('a',64)
  ),
  'expectedMutations',jsonb_build_object(
    'input',0,'accepted',0,'rejected',0,'matched',0,'created',0,
    'possibleDuplicate',0,'quarantined',0
  )
));

create temporary table plan4_zero_ids as
select batch.id batch_id, run.id run_id
from public.food_ingestion_batches batch
join public.food_ingestion_runs run on run.batch_id=batch.id
where batch.semantic_identity_checksum_sha256=repeat('e',64)
  and run.execution_mode='dry_run'
  and run.attempt_number=1;

select pg_temp.plan4_zero_assert(
  (select status='prepared' from public.food_ingestion_runs where id=(select run_id from plan4_zero_ids)),
  'zero-record dry run starts prepared'
);

select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
  'operationId','77000000-0000-4000-8000-000000000002',
  'commandChecksumSha256',repeat('2',64),
  'runId',(select run_id from plan4_zero_ids),
  'manifestContentChecksumSha256',repeat('d',64),
  'semanticIdentityChecksumSha256',repeat('e',64),
  'completed',true
));

select pg_temp.plan4_zero_assert(
  (select reconciled from public.food_ingestion_reconciliations where run_id=(select run_id from plan4_zero_ids))
  and public.food_ingestion_batch_semantically_frozen_v2((select batch_id from plan4_zero_ids)),
  'zero-record dry run reconciles exactly and freezes semantic membership'
);

-- Causal RED on the prior authority: reconciliation succeeds while the run is
-- still prepared, so complete_run rejects it as not running. Correct authority
-- must transition this zero-record execution to running during reconciliation.
select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object(
  'operationId','77000000-0000-4000-8000-000000000003',
  'commandChecksumSha256',repeat('3',64),
  'runId',(select run_id from plan4_zero_ids)
));

select pg_temp.plan4_zero_assert(
  (select status='completed' from public.food_ingestion_runs where id=(select run_id from plan4_zero_ids)),
  'zero-record dry run completes after successful reconciliation'
);

update public.food_ingestion_batches
set review_state='reviewed', reviewed_at=clock_timestamp()
where id=(select batch_id from plan4_zero_ids);

update public.food_ingestion_batches
set review_state='approved', approved_at=clock_timestamp(), approval_reference='plan4-zero-record-verifier'
where id=(select batch_id from plan4_zero_ids);

select pg_temp.plan4_zero_assert(
  (select review_state='approved' and approved_at is not null
   from public.food_ingestion_batches where id=(select batch_id from plan4_zero_ids)),
  'zero-record exact completed dry run permits later independent approval'
);

select pg_temp.plan4_zero_assert((select count(*)=0 from public.food_items), 'zero-record verifier creates no Food rows');
select pg_temp.plan4_zero_assert((select count(*)=0 from public.food_catalog_control_operations), 'zero-record verifier exercises no Catalog control operation');
select pg_temp.plan4_zero_assert((select count(*)=0 from public.food_catalog_generations), 'zero-record verifier creates no generations');

rollback;
