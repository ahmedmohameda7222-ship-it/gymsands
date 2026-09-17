begin;

create or replace function pg_temp.plan7_restore_gate_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Plan 7 restored-ingestion gate assertion failed: %', p_message;
  end if;
end
$$;

create or replace function pg_temp.plan7_restore_gate_expect_55000(p_sql text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 7 expected restore-block rejection did not occur: %', p_message;
  exception
    when sqlstate '55000' then return;
  end;
end
$$;

-- RED harness: remember whether the migration-built table existed, but create the
-- target-local shape transactionally on the starting SHA so the replay bypass can
-- be exercised before the structural assertion below.
create temporary table plan7_restore_gate_meta as
select to_regclass('public.food_catalog_ingestion_restore_blocks') as initial_block_table;

do $red_harness$
begin
  if to_regclass('public.food_catalog_ingestion_restore_blocks') is null then
    create table public.food_catalog_ingestion_restore_blocks (
      run_id uuid primary key references public.food_ingestion_runs(id) on delete restrict,
      restored_status text not null check (restored_status in ('prepared','running')),
      restored_lease_epoch bigint not null,
      blocked_at timestamptz not null default clock_timestamp()
    );
  end if;
end
$red_harness$;

-- Build a valid zero-record batch, complete its dry run, approve it, then prepare
-- two Production attempts. This stays rollback-only.
select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','7a000000-0000-4000-8000-000000000001',
  'commandChecksumSha256',repeat('1',64),
  'executionMode','dry_run','attemptNumber',1,
  'manifestContentChecksumSha256',repeat('7',64),
  'semanticIdentityChecksumSha256',repeat('8',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','restore-gate-fixture','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-17','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://plan7-restore-gate','sourceChecksumSha256',repeat('9',64),
    'importerVersion','plan7-restore-gate-test','configChecksumSha256',repeat('a',64)
  ),
  'expectedMutations',jsonb_build_object('input',0,'accepted',0,'rejected',0,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0)
));

create temporary table plan7_restore_gate_ids as
select batch.id as batch_id, run.id as dry_run_id, null::uuid as running_run_id, null::uuid as prepared_run_id
from public.food_ingestion_batches batch
join public.food_ingestion_runs run on run.batch_id=batch.id
where batch.semantic_identity_checksum_sha256=repeat('8',64)
  and run.execution_mode='dry_run' and run.attempt_number=1;

select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
  'operationId','7a000000-0000-4000-8000-000000000002','commandChecksumSha256',repeat('2',64),
  'runId',(select dry_run_id from plan7_restore_gate_ids),
  'manifestContentChecksumSha256',repeat('7',64),'semanticIdentityChecksumSha256',repeat('8',64),'completed',true
));
select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object(
  'operationId','7a000000-0000-4000-8000-000000000003','commandChecksumSha256',repeat('3',64),
  'runId',(select dry_run_id from plan7_restore_gate_ids)
));
update public.food_ingestion_batches set review_state='reviewed', reviewed_at=clock_timestamp()
where id=(select batch_id from plan7_restore_gate_ids);
update public.food_ingestion_batches set review_state='approved', approved_at=clock_timestamp(), approval_reference='plan7-restore-gate-verifier'
where id=(select batch_id from plan7_restore_gate_ids);

select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','7a000000-0000-4000-8000-000000000004','commandChecksumSha256',repeat('4',64),
  'executionMode','production','attemptNumber',1,
  'manifestContentChecksumSha256',repeat('7',64),'semanticIdentityChecksumSha256',repeat('8',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','restore-gate-fixture','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-17','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://plan7-restore-gate','sourceChecksumSha256',repeat('9',64),
    'importerVersion','plan7-restore-gate-test','configChecksumSha256',repeat('a',64)
  ),
  'expectedMutations',jsonb_build_object('input',0,'accepted',0,'rejected',0,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0)
));
update plan7_restore_gate_ids set running_run_id=(
  select id from public.food_ingestion_runs where batch_id=plan7_restore_gate_ids.batch_id and execution_mode='production' and attempt_number=1
);

-- Normal local acquisition must remain available.
select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
  'operationId','7a000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('5',64),
  'runId',(select running_run_id from plan7_restore_gate_ids),
  'leaseOwner','worker-local','leaseToken','7a000000-0000-4000-8000-000000000101','leaseSeconds',120
));
select pg_temp.plan7_restore_gate_assert((
  select status='running' and lease_epoch=1 and lease_owner='worker-local'
  from public.food_ingestion_runs where id=(select running_run_id from plan7_restore_gate_ids)
), 'unblocked local Production acquisition regression');

-- Normal stale takeover must also remain available before a restore block exists.
update public.food_ingestion_runs
set lease_acquired_at=clock_timestamp()-interval '3 seconds',
    lease_heartbeat_at=clock_timestamp()-interval '2 seconds',
    lease_expires_at=clock_timestamp()-interval '1 second'
where id=(select running_run_id from plan7_restore_gate_ids);
select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
  'operationId','7a000000-0000-4000-8000-000000000006','commandChecksumSha256',repeat('6',64),
  'runId',(select running_run_id from plan7_restore_gate_ids),
  'leaseOwner','worker-takeover','leaseToken','7a000000-0000-4000-8000-000000000102','leaseSeconds',120
));
select pg_temp.plan7_restore_gate_assert((
  select lease_epoch=2 and lease_owner='worker-takeover'
  from public.food_ingestion_runs where id=(select running_run_id from plan7_restore_gate_ids)
), 'ordinary stale takeover authority regression');

insert into public.food_catalog_ingestion_restore_blocks(run_id,restored_status,restored_lease_epoch)
values ((select running_run_id from plan7_restore_gate_ids),'running',2);

-- Strong RED: this exact command already has a replayable success. On the starting
-- SHA it is returned before any restore-aware predicate. Correct authority must
-- fail with SQLSTATE 55000 before replay.
select pg_temp.plan7_restore_gate_expect_55000(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000006','commandChecksumSha256',repeat('6',64),
    'runId',(select running_run_id from plan7_restore_gate_ids),
    'leaseOwner','worker-takeover','leaseToken','7a000000-0000-4000-8000-000000000102','leaseSeconds',120
  )::text
), 'same-command acquire replay after restore block');

-- A fresh command against the blocked running run must fail for the same reason.
select pg_temp.plan7_restore_gate_expect_55000(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000007','commandChecksumSha256',repeat('7',64),
    'runId',(select running_run_id from plan7_restore_gate_ids),
    'leaseOwner','worker-fresh','leaseToken','7a000000-0000-4000-8000-000000000103','leaseSeconds',120
  )::text
), 'fresh acquire against blocked running restore');

select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','7a000000-0000-4000-8000-000000000008','commandChecksumSha256',repeat('8',64),
  'executionMode','production','attemptNumber',2,
  'manifestContentChecksumSha256',repeat('7',64),'semanticIdentityChecksumSha256',repeat('8',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','restore-gate-fixture','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-17','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://plan7-restore-gate','sourceChecksumSha256',repeat('9',64),
    'importerVersion','plan7-restore-gate-test','configChecksumSha256',repeat('a',64)
  ),
  'expectedMutations',jsonb_build_object('input',0,'accepted',0,'rejected',0,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0)
));
update plan7_restore_gate_ids set prepared_run_id=(
  select id from public.food_ingestion_runs where batch_id=plan7_restore_gate_ids.batch_id and execution_mode='production' and attempt_number=2
);
insert into public.food_catalog_ingestion_restore_blocks(run_id,restored_status,restored_lease_epoch)
values ((select prepared_run_id from plan7_restore_gate_ids),'prepared',0);
select pg_temp.plan7_restore_gate_expect_55000(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000009','commandChecksumSha256',repeat('9',64),
    'runId',(select prepared_run_id from plan7_restore_gate_ids),
    'leaseOwner','worker-prepared','leaseToken','7a000000-0000-4000-8000-000000000104','leaseSeconds',120
  )::text
), 'fresh acquire against blocked prepared restore');

-- Structural/privilege authority must have come from the migration, not the RED harness.
select pg_temp.plan7_restore_gate_assert((select initial_block_table is not null from plan7_restore_gate_meta), 'restore-block table exists from migration');
select pg_temp.plan7_restore_gate_assert(to_regprocedure('private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)') is not null, 'private restore guard exists');
select pg_temp.plan7_restore_gate_assert(not has_table_privilege('PUBLIC','public.food_catalog_ingestion_restore_blocks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'PUBLIC has no direct restore-block privileges');
select pg_temp.plan7_restore_gate_assert(not has_table_privilege('anon','public.food_catalog_ingestion_restore_blocks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'anon has no direct restore-block privileges');
select pg_temp.plan7_restore_gate_assert(not has_table_privilege('authenticated','public.food_catalog_ingestion_restore_blocks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'authenticated has no direct restore-block privileges');
select pg_temp.plan7_restore_gate_assert(not has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'service_role has no direct restore-block privileges');
select pg_temp.plan7_restore_gate_assert(not has_function_privilege('PUBLIC','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE'), 'PUBLIC cannot execute private restore guard');
select pg_temp.plan7_restore_gate_assert(not has_function_privilege('anon','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE'), 'anon cannot execute private restore guard');
select pg_temp.plan7_restore_gate_assert(not has_function_privilege('authenticated','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE'), 'authenticated cannot execute private restore guard');
select pg_temp.plan7_restore_gate_assert(not has_function_privilege('service_role','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE'), 'service_role cannot execute private restore guard');
select pg_temp.plan7_restore_gate_assert((
  select count(*)=1 from pg_constraint
  where conrelid='public.food_catalog_ingestion_restore_blocks'::regclass and contype='f'
    and confrelid='public.food_ingestion_runs'::regclass
), 'restore-block run_id FK prevents orphan blocks');
select pg_temp.plan7_restore_gate_assert((
  select count(*)=1 from pg_constraint
  where conrelid='public.food_catalog_ingestion_restore_blocks'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%restored_status%prepared%running%'
), 'restore-block status check is exactly nonterminal prepared/running authority');

-- Terminal history has no restore-block row and cannot be reacquired through normal authority.
select pg_temp.plan7_restore_gate_assert(not exists(
  select 1 from public.food_catalog_ingestion_restore_blocks where run_id=(select dry_run_id from plan7_restore_gate_ids)
), 'terminal completed run needs no restore block');

rollback;
