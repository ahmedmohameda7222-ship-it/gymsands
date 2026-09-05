begin;

-- Plan 4 P1 regression: a successful exact dry-run reconciliation freezes
-- semantic batch manifest membership even while review_state remains prepared.

create or replace function pg_temp.plan4_freeze_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Plan 4 batch-freeze assertion failed: %', p_message;
  end if;
end
$$;

create or replace function pg_temp.plan4_freeze_rejected(p_sql text, p_message text)
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

create temporary table plan4_freeze_fixture(
  source_record_id text primary key,
  candidate jsonb not null,
  decision jsonb not null,
  disposition jsonb not null
);

insert into plan4_freeze_fixture values
(
  'freeze-a',
  jsonb_build_object(
    'sourceRecordId','freeze-a',
    'sourceReference','fixture://freeze/a',
    'sourceRecordChecksumSha256',repeat('1',64),
    'canonicalName','Freeze A',
    'sourceNutrition',jsonb_build_object('fixture','a'),
    'sourceServing',jsonb_build_object('fixture','a')
  ),
  jsonb_build_object('kind','reject'),
  jsonb_build_object('kind','reject','reasonCodes',jsonb_build_array())
),
(
  'freeze-b',
  jsonb_build_object(
    'sourceRecordId','freeze-b',
    'sourceReference','fixture://freeze/b',
    'sourceRecordChecksumSha256',repeat('2',64),
    'canonicalName','Freeze B',
    'sourceNutrition',jsonb_build_object('fixture','b'),
    'sourceServing',jsonb_build_object('fixture','b')
  ),
  jsonb_build_object('kind','reject'),
  jsonb_build_object('kind','reject','reasonCodes',jsonb_build_array())
),
(
  'recover-a',
  jsonb_build_object(
    'sourceRecordId','recover-a',
    'sourceReference','fixture://recover/a',
    'sourceRecordChecksumSha256',repeat('7',64),
    'canonicalName','Recover A',
    'sourceNutrition',jsonb_build_object('fixture','recover-a'),
    'sourceServing',jsonb_build_object('fixture','recover-a')
  ),
  jsonb_build_object('kind','reject'),
  jsonb_build_object('kind','reject','reasonCodes',jsonb_build_array())
),
(
  'recover-b',
  jsonb_build_object(
    'sourceRecordId','recover-b',
    'sourceReference','fixture://recover/b',
    'sourceRecordChecksumSha256',repeat('8',64),
    'canonicalName','Recover B',
    'sourceNutrition',jsonb_build_object('fixture','recover-b'),
    'sourceServing',jsonb_build_object('fixture','recover-b')
  ),
  jsonb_build_object('kind','reject'),
  jsonb_build_object('kind','reject','reasonCodes',jsonb_build_array())
),
(
  'recover-c',
  jsonb_build_object(
    'sourceRecordId','recover-c',
    'sourceReference','fixture://recover/c',
    'sourceRecordChecksumSha256',repeat('9',64),
    'canonicalName','Recover C',
    'sourceNutrition',jsonb_build_object('fixture','recover-c'),
    'sourceServing',jsonb_build_object('fixture','recover-c')
  ),
  jsonb_build_object('kind','reject'),
  jsonb_build_object('kind','reject','reasonCodes',jsonb_build_array())
);

-- ---------------------------------------------------------------------------
-- A. Successful reconciliation freezes semantic membership immediately.
-- ---------------------------------------------------------------------------
select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','55000000-0000-4000-8000-000000000001',
  'commandChecksumSha256',repeat('a',64),
  'executionMode','dry_run','attemptNumber',1,
  'manifestContentChecksumSha256',repeat('b',64),
  'semanticIdentityChecksumSha256',repeat('c',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','batch-freeze-fixture','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-05','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://batch-freeze','sourceChecksumSha256',repeat('d',64),
    'importerVersion','plan4-freeze-test','configChecksumSha256',repeat('e',64)
  ),
  'expectedMutations',jsonb_build_object(
    'input',1,'accepted',0,'rejected',1,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0
  )
));

-- Pre-create attempt 2 before reconciliation. It must become unable to mutate once
-- attempt 1 successfully reconciles, proving the freeze is batch-scoped not run-scoped.
select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','55000000-0000-4000-8000-000000000002',
  'commandChecksumSha256',repeat('f',64),
  'executionMode','dry_run','attemptNumber',2,
  'manifestContentChecksumSha256',repeat('b',64),
  'semanticIdentityChecksumSha256',repeat('c',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','batch-freeze-fixture','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-05','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://batch-freeze','sourceChecksumSha256',repeat('d',64),
    'importerVersion','plan4-freeze-test','configChecksumSha256',repeat('e',64)
  ),
  'expectedMutations',jsonb_build_object(
    'input',1,'accepted',0,'rejected',1,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0
  )
));

create temporary table plan4_freeze_ids as
select
  batch.id batch_id,
  (
    select run.id
    from public.food_ingestion_runs run
    where run.batch_id = batch.id
      and run.execution_mode = 'dry_run'
      and run.attempt_number = 1
  ) attempt1_id,
  (
    select run.id
    from public.food_ingestion_runs run
    where run.batch_id = batch.id
      and run.execution_mode = 'dry_run'
      and run.attempt_number = 2
  ) attempt2_id
from public.food_ingestion_batches batch
where batch.semantic_identity_checksum_sha256=repeat('c',64);

select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','55000000-0000-4000-8000-000000000003','commandChecksumSha256',repeat('1',64),
  'runId',(select attempt1_id from plan4_freeze_ids),
  'decisionKind','reject','dispositionKind','reject',
  'decision',(select decision from plan4_freeze_fixture where source_record_id='freeze-a'),
  'disposition',(select disposition from plan4_freeze_fixture where source_record_id='freeze-a'),
  'candidate',(select candidate from plan4_freeze_fixture where source_record_id='freeze-a')
));

select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
  'operationId','55000000-0000-4000-8000-000000000004','commandChecksumSha256',repeat('2',64),
  'runId',(select attempt1_id from plan4_freeze_ids),
  'manifestContentChecksumSha256',repeat('b',64),
  'semanticIdentityChecksumSha256',repeat('c',64),
  'completed',true
));

select pg_temp.plan4_freeze_assert((
  select reconciliation.reconciled
    and batch.review_state='prepared'
    and public.food_ingestion_batch_semantically_frozen_v2(batch.id)
  from public.food_ingestion_batches batch
  join public.food_ingestion_reconciliations reconciliation on reconciliation.batch_id=batch.id
  where batch.id=(select batch_id from plan4_freeze_ids)
), 'successful reconciliation freezes semantic membership while human review state remains prepared');

-- Freeze starts at reconciliation, not run completion.
select pg_temp.plan4_freeze_rejected(format(
  'select public.food_catalog_ingestion_persist_candidate_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','55000000-0000-4000-8000-000000000006','commandChecksumSha256',repeat('4',64),
    'runId',(select attempt2_id from plan4_freeze_ids),
    'decisionKind','reject','dispositionKind','reject',
    'decision',(select decision from plan4_freeze_fixture where source_record_id='freeze-b'),
    'disposition',(select disposition from plan4_freeze_fixture where source_record_id='freeze-b'),
    'candidate',(select candidate from plan4_freeze_fixture where source_record_id='freeze-b')
  )::text
), 'successful reconciliation freezes new batch membership');

-- Existing frozen authority cannot be changed by a new command on an already-prepared run.
select pg_temp.plan4_freeze_rejected(format(
  'select public.food_catalog_ingestion_persist_candidate_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','55000000-0000-4000-8000-000000000007','commandChecksumSha256',repeat('5',64),
    'runId',(select attempt2_id from plan4_freeze_ids),
    'decisionKind','reject','dispositionKind','reject',
    'decision',(select decision from plan4_freeze_fixture where source_record_id='freeze-a'),
    'disposition',(select disposition from plan4_freeze_fixture where source_record_id='freeze-a'),
    'candidate',jsonb_set(
      (select candidate from plan4_freeze_fixture where source_record_id='freeze-a'),
      '{canonicalName}',
      '"Freeze A Tampered"'::jsonb
    )
  )::text
), 'successful reconciliation freezes existing manifest authority');

-- Immutable manifest rows cannot be changed directly either.
select pg_temp.plan4_freeze_rejected(format(
  'update public.food_ingestion_manifest_records set candidate_json = jsonb_set(candidate_json, ''{canonicalName}'', ''"Direct Tamper"''::jsonb) where batch_id = %L::uuid and source_record_key = ''freeze-a''',
  (select batch_id from plan4_freeze_ids)::text
), 'changed post-reconciliation manifest candidate authority rejected');

-- The batch semantic identity/count authority itself is frozen before human review.
select pg_temp.plan4_freeze_rejected(format(
  'update public.food_ingestion_batches set input_count = input_count + 1 where id = %L::uuid',
  (select batch_id from plan4_freeze_ids)::text
), 'post-reconciliation batch semantic authority rejected while prepared');

-- Participating source snapshots remain immutable as part of frozen authority.
select pg_temp.plan4_freeze_rejected(format(
  'update public.food_source_records set source_reference = ''fixture://tampered'' where id = (select source_record_id from public.food_ingestion_batch_records where batch_id = %L::uuid limit 1)',
  (select batch_id from plan4_freeze_ids)::text
), 'post-reconciliation source snapshot mutation rejected');

-- A genuinely fresh post-freeze attempt cannot create a second mutable interpretation.
select pg_temp.plan4_freeze_rejected(format(
  'select public.food_catalog_ingestion_prepare_execution_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','55000000-0000-4000-8000-000000000008','commandChecksumSha256',repeat('6',64),
    'executionMode','dry_run','attemptNumber',3,
    'manifestContentChecksumSha256',repeat('b',64),
    'semanticIdentityChecksumSha256',repeat('c',64),
    'source',jsonb_build_object(
      'provider','synthetic-reference','dataset','batch-freeze-fixture','sourceVersion','2026.09',
      'sourceReleaseDate','2026-09-05','licenseName','Fixture License','licenseReference','fixture-license',
      'sourceReference','fixture://batch-freeze','sourceChecksumSha256',repeat('d',64),
      'importerVersion','plan4-freeze-test','configChecksumSha256',repeat('e',64)
    ),
    'expectedMutations',jsonb_build_object(
      'input',1,'accepted',0,'rejected',1,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0
    )
  )::text
), 'successful reconciliation rejects fresh mutable dry-run attempt');

-- Exact operation-ledger replay remains legal after the freeze.
select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','55000000-0000-4000-8000-000000000003','commandChecksumSha256',repeat('1',64),
  'runId',(select attempt1_id from plan4_freeze_ids),
  'decisionKind','reject','dispositionKind','reject',
  'decision',(select decision from plan4_freeze_fixture where source_record_id='freeze-a'),
  'disposition',(select disposition from plan4_freeze_fixture where source_record_id='freeze-a'),
  'candidate',(select candidate from plan4_freeze_fixture where source_record_id='freeze-a')
));

-- The successfully reconciled run can still take its legitimate terminal completion path.
select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object(
  'operationId','55000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('3',64),
  'runId',(select attempt1_id from plan4_freeze_ids)
));

select pg_temp.plan4_freeze_assert((
  select status='completed' from public.food_ingestion_runs where id=(select attempt1_id from plan4_freeze_ids)
), 'successful reconciled run still completes after semantic freeze');

-- ---------------------------------------------------------------------------
-- B. Failed/partial pre-reconciliation recovery remains resumable.
-- ---------------------------------------------------------------------------
select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','66000000-0000-4000-8000-000000000001','commandChecksumSha256',repeat('a',64),
  'executionMode','dry_run','attemptNumber',1,
  'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('f',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','batch-freeze-recovery','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-05','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://batch-freeze-recovery','sourceChecksumSha256',repeat('b',64),
    'importerVersion','plan4-freeze-test','configChecksumSha256',repeat('c',64)
  ),
  'expectedMutations',jsonb_build_object(
    'input',2,'accepted',0,'rejected',2,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0
  )
));

create temporary table plan4_recovery_ids as
select batch.id batch_id,
       (select run.id from public.food_ingestion_runs run where run.batch_id=batch.id and run.execution_mode='dry_run' and run.attempt_number=1) attempt1_id,
       null::uuid attempt2_id
from public.food_ingestion_batches batch
where batch.semantic_identity_checksum_sha256=repeat('f',64);

select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','66000000-0000-4000-8000-000000000002','commandChecksumSha256',repeat('2',64),
  'runId',(select attempt1_id from plan4_recovery_ids),
  'decisionKind','reject','dispositionKind','reject',
  'decision',(select decision from plan4_freeze_fixture where source_record_id='recover-a'),
  'disposition',(select disposition from plan4_freeze_fixture where source_record_id='recover-a'),
  'candidate',(select candidate from plan4_freeze_fixture where source_record_id='recover-a')
));

select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
  'operationId','66000000-0000-4000-8000-000000000003','commandChecksumSha256',repeat('3',64),
  'runId',(select attempt1_id from plan4_recovery_ids),
  'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('f',64),
  'completed',true
));

select pg_temp.plan4_freeze_assert(not public.food_ingestion_batch_semantically_frozen_v2((select batch_id from plan4_recovery_ids)),
  'failed/partial reconciliation does not freeze semantic membership');

select public.food_catalog_ingestion_fail_run_v2(jsonb_build_object(
  'operationId','66000000-0000-4000-8000-000000000004','commandChecksumSha256',repeat('4',64),
  'runId',(select attempt1_id from plan4_recovery_ids),
  'reconciliationId',(select id from public.food_ingestion_reconciliations where run_id=(select attempt1_id from plan4_recovery_ids)),
  'mismatchCodes',(select to_jsonb(mismatch_codes) from public.food_ingestion_reconciliations where run_id=(select attempt1_id from plan4_recovery_ids))
));

select pg_temp.plan4_freeze_assert((
  select status='failed' from public.food_ingestion_runs where id=(select attempt1_id from plan4_recovery_ids)
), 'partial attempt is terminalized without freezing the batch');

-- Attempt 2 remains legal because no successful reconciliation exists yet.
select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','66000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('5',64),
  'executionMode','dry_run','attemptNumber',2,
  'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('f',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','batch-freeze-recovery','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-05','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://batch-freeze-recovery','sourceChecksumSha256',repeat('b',64),
    'importerVersion','plan4-freeze-test','configChecksumSha256',repeat('c',64)
  ),
  'expectedMutations',jsonb_build_object(
    'input',2,'accepted',0,'rejected',2,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0
  )
));

update plan4_recovery_ids ids
set attempt2_id = (
  select run.id from public.food_ingestion_runs run
  where run.batch_id=ids.batch_id and run.execution_mode='dry_run' and run.attempt_number=2
);

-- Identical staged authority is reused across attempts.
select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','66000000-0000-4000-8000-000000000006','commandChecksumSha256',repeat('6',64),
  'runId',(select attempt2_id from plan4_recovery_ids),
  'decisionKind','reject','dispositionKind','reject',
  'decision',(select decision from plan4_freeze_fixture where source_record_id='recover-a'),
  'disposition',(select disposition from plan4_freeze_fixture where source_record_id='recover-a'),
  'candidate',(select candidate from plan4_freeze_fixture where source_record_id='recover-a')
));

select pg_temp.plan4_freeze_assert((
  select count(*)=1
  from public.food_ingestion_manifest_records
  where batch_id=(select batch_id from plan4_recovery_ids) and source_record_key='recover-a'
), 'identical pre-freeze staged manifest authority is reused');

-- Missing membership can still be completed before a successful reconciliation exists.
select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
  'operationId','66000000-0000-4000-8000-000000000007','commandChecksumSha256',repeat('7',64),
  'runId',(select attempt2_id from plan4_recovery_ids),
  'decisionKind','reject','dispositionKind','reject',
  'decision',(select decision from plan4_freeze_fixture where source_record_id='recover-b'),
  'disposition',(select disposition from plan4_freeze_fixture where source_record_id='recover-b'),
  'candidate',(select candidate from plan4_freeze_fixture where source_record_id='recover-b')
));

select pg_temp.plan4_freeze_assert((
  select count(*)=2
  from public.food_ingestion_manifest_records
  where batch_id=(select batch_id from plan4_recovery_ids)
), 'partial pre-freeze recovery can complete missing membership');

select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
  'operationId','66000000-0000-4000-8000-000000000008','commandChecksumSha256',repeat('8',64),
  'runId',(select attempt2_id from plan4_recovery_ids),
  'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('f',64),
  'completed',true
));

select pg_temp.plan4_freeze_assert(public.food_ingestion_batch_semantically_frozen_v2((select batch_id from plan4_recovery_ids)),
  'first successful recovered reconciliation freezes the batch');

select pg_temp.plan4_freeze_rejected(format(
  'select public.food_catalog_ingestion_persist_candidate_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','66000000-0000-4000-8000-000000000009','commandChecksumSha256',repeat('9',64),
    'runId',(select attempt2_id from plan4_recovery_ids),
    'decisionKind','reject','dispositionKind','reject',
    'decision',(select decision from plan4_freeze_fixture where source_record_id='recover-c'),
    'disposition',(select disposition from plan4_freeze_fixture where source_record_id='recover-c'),
    'candidate',(select candidate from plan4_freeze_fixture where source_record_id='recover-c')
  )::text
), 'recovered successful reconciliation blocks further membership expansion');

-- Completion remains legal after freeze, then human review/approval remains a separate authority.
select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object(
  'operationId','66000000-0000-4000-8000-000000000010','commandChecksumSha256',repeat('0',64),
  'runId',(select attempt2_id from plan4_recovery_ids)
));

update public.food_ingestion_batches
set review_state='reviewed', reviewed_at=clock_timestamp()
where id=(select batch_id from plan4_recovery_ids);

select pg_temp.plan4_freeze_assert((
  select review_state='reviewed' and approved_at is null
  from public.food_ingestion_batches where id=(select batch_id from plan4_recovery_ids)
), 'successful reconciliation does not auto-review or auto-approve');

update public.food_ingestion_batches
set review_state='approved', approved_at=clock_timestamp(), approval_reference='plan4-batch-freeze-verifier'
where id=(select batch_id from plan4_recovery_ids);

select pg_temp.plan4_freeze_assert((
  select review_state='approved' and approved_at is not null and approval_reference='plan4-batch-freeze-verifier'
  from public.food_ingestion_batches where id=(select batch_id from plan4_recovery_ids)
), 'prepared to reviewed to approved remains possible after exact successful reconciliation');

-- Entire verifier is rollback-only and exercises no Catalog activation/generation authority.
select pg_temp.plan4_freeze_assert((select count(*)=0 from public.food_items), 'batch-freeze verifier creates no Food rows');
select pg_temp.plan4_freeze_assert((select count(*)=0 from public.food_catalog_control_operations), 'batch-freeze verifier exercises no Catalog control operation');
select pg_temp.plan4_freeze_assert((select count(*)=0 from public.food_catalog_activation_sets), 'batch-freeze verifier creates no activation set');
select pg_temp.plan4_freeze_assert((select count(*)=0 from public.food_catalog_generations), 'batch-freeze verifier creates no generations');
select pg_temp.plan4_freeze_assert((select count(*)=0 from public.food_catalog_generation_foods), 'batch-freeze verifier creates no generation Food membership');

rollback;
