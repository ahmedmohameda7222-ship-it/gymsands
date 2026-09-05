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
);

-- Attempt 1 establishes the semantic batch.
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

-- Pre-create attempt 2 before reconciliation so the post-reconciliation staging guard
-- is exercised even for a run that already existed before the freeze transaction.
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
  from public.food_ingestion_batches batch
  join public.food_ingestion_reconciliations reconciliation on reconciliation.batch_id=batch.id
  where batch.id=(select batch_id from plan4_freeze_ids)
), 'successful reconciliation exists while human review state remains prepared');

select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object(
  'operationId','55000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('3',64),
  'runId',(select attempt1_id from plan4_freeze_ids)
));

-- This is the confirmed P1: current authority allows attempt 2 to expand batch membership.
-- Correct authority must reject it based on the exact successful reconciliation, not review_state.
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

-- Existing frozen authority cannot be changed through a second attempt either.
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

-- A fresh post-freeze dry-run attempt must not create a new mutable interpretation.
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

select pg_temp.plan4_freeze_assert((select count(*)=0 from public.food_items), 'batch-freeze verifier creates no Food rows');
select pg_temp.plan4_freeze_assert((select count(*)=0 from public.food_catalog_generations), 'batch-freeze verifier creates no generations');

rollback;
