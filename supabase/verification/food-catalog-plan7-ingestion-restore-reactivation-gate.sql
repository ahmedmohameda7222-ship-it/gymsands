begin;

create or replace function pg_temp.plan7_restore_gate_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Plan 7 restored-ingestion gate assertion failed: %', p_message;
  end if;
end
$$;

create temporary table plan7_restore_gate_outcomes(
  case_name text primary key,
  passed boolean not null
);

create or replace function pg_temp.plan7_restore_gate_is_55000(p_sql text)
returns boolean language plpgsql as $plan7_is_55000$
begin
  begin
    execute p_sql;
    return false;
  exception
    when sqlstate '55000' then return true;
  end;
end
$plan7_is_55000$;

create or replace function pg_temp.plan7_restore_gate_is_23505(p_sql text)
returns boolean language plpgsql as $plan7_is_23505$
begin
  begin
    execute p_sql;
    return false;
  exception
    when sqlstate '23505' then return true;
  end;
end
$plan7_is_23505$;

create or replace function pg_temp.plan7_restore_gate_is_failure(p_sql text)
returns boolean language plpgsql as $plan7_is_failure$
begin
  begin
    execute p_sql;
    return false;
  exception
    when others then return true;
  end;
end
$plan7_is_failure$;

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

-- Prepare a second valid Production run. It stays unblocked while replay identity
-- tests exercise whether persisted operation authority can be redirected by caller runId.
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

-- Correct acquire replay on an unblocked run must remain idempotent.
select pg_temp.plan7_restore_gate_assert((
  select replay_result->>'runId'=(select running_run_id::text from plan7_restore_gate_ids)
  from (
    select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
      'operationId','7a000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('5',64),
      'runId',(select running_run_id from plan7_restore_gate_ids),
      'leaseOwner','worker-local','leaseToken','7a000000-0000-4000-8000-000000000101','leaseSeconds',120
    )) as replay_result
  ) replay
), 'ordinary unblocked acquire replay regression');

-- RED: an existing unblocked acquire operation must reject caller run substitution
-- instead of returning the persisted result for another run.
insert into plan7_restore_gate_outcomes(case_name,passed)
values ('unblocked_mismatched_replay_rejected', pg_temp.plan7_restore_gate_is_23505(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('5',64),
    'runId',(select prepared_run_id from plan7_restore_gate_ids),
    'leaseOwner','worker-local','leaseToken','7a000000-0000-4000-8000-000000000101','leaseSeconds',120
  )::text
)));

-- RED: persisted acquire authority whose result_json.runId disagrees with its
-- stored operation run_id must fail closed. Mutation is transaction-local.
savepoint plan7_inconsistent_acquire_operation;
alter table public.food_ingestion_control_operations disable trigger food_ingestion_control_operations_immutable;
update public.food_ingestion_control_operations
set result_json=jsonb_set(result_json,'{runId}',to_jsonb((select prepared_run_id::text from plan7_restore_gate_ids)),false)
where operation_id='7a000000-0000-4000-8000-000000000005'::uuid;
alter table public.food_ingestion_control_operations enable trigger food_ingestion_control_operations_immutable;
insert into plan7_restore_gate_outcomes(case_name,passed)
values ('inconsistent_persisted_run_result_rejected', pg_temp.plan7_restore_gate_is_failure(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('5',64),
    'runId',(select running_run_id from plan7_restore_gate_ids),
    'leaseOwner','worker-local','leaseToken','7a000000-0000-4000-8000-000000000101','leaseSeconds',120
  )::text
)));
rollback to savepoint plan7_inconsistent_acquire_operation;
release savepoint plan7_inconsistent_acquire_operation;

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

-- RED: the restore guard must follow persisted replay authority, not caller runId.
-- Run B is valid and unblocked; the same operation/checksum belongs to blocked run A.
insert into plan7_restore_gate_outcomes(case_name,passed)
values ('blocked_substituted_run_replay_rejected', pg_temp.plan7_restore_gate_is_55000(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000006','commandChecksumSha256',repeat('6',64),
    'runId',(select prepared_run_id from plan7_restore_gate_ids),
    'leaseOwner','worker-takeover','leaseToken','7a000000-0000-4000-8000-000000000102','leaseSeconds',120
  )::text
)));

insert into plan7_restore_gate_outcomes(case_name,passed)
values ('blocked_nonexistent_run_replay_rejected', pg_temp.plan7_restore_gate_is_55000(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000006','commandChecksumSha256',repeat('6',64),
    'runId','7a000000-0000-4000-8000-000000000099'::uuid,
    'leaseOwner','worker-takeover','leaseToken','7a000000-0000-4000-8000-000000000102','leaseSeconds',120
  )::text
)));

-- Strong RED: this exact command already has a replayable success. On the starting
-- SHA it is returned before any restore-aware predicate. Correct authority must
-- fail with SQLSTATE 55000 before replay.
insert into plan7_restore_gate_outcomes(case_name,passed)
values ('blocked_exact_run_replay_rejected', pg_temp.plan7_restore_gate_is_55000(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000006','commandChecksumSha256',repeat('6',64),
    'runId',(select running_run_id from plan7_restore_gate_ids),
    'leaseOwner','worker-takeover','leaseToken','7a000000-0000-4000-8000-000000000102','leaseSeconds',120
  )::text
)));

-- A fresh command against the blocked running run must fail for the same reason.
insert into plan7_restore_gate_outcomes(case_name,passed)
values ('blocked_fresh_running_acquire_rejected', pg_temp.plan7_restore_gate_is_55000(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000007','commandChecksumSha256',repeat('7',64),
    'runId',(select running_run_id from plan7_restore_gate_ids),
    'leaseOwner','worker-fresh','leaseToken','7a000000-0000-4000-8000-000000000103','leaseSeconds',120
  )::text
)));

insert into public.food_catalog_ingestion_restore_blocks(run_id,restored_status,restored_lease_epoch)
values ((select prepared_run_id from plan7_restore_gate_ids),'prepared',0);
insert into plan7_restore_gate_outcomes(case_name,passed)
values ('blocked_fresh_prepared_acquire_rejected', pg_temp.plan7_restore_gate_is_55000(format(
  'select public.food_catalog_ingestion_acquire_lease_v2(%L::jsonb)',
  jsonb_build_object(
    'operationId','7a000000-0000-4000-8000-000000000009','commandChecksumSha256',repeat('9',64),
    'runId',(select prepared_run_id from plan7_restore_gate_ids),
    'leaseOwner','worker-prepared','leaseToken','7a000000-0000-4000-8000-000000000104','leaseSeconds',120
  )::text
)));

-- Structural/privilege authority must have come from the migration, not the RED harness.
select pg_temp.plan7_restore_gate_assert((select initial_block_table is not null from plan7_restore_gate_meta), 'restore-block table exists from migration');
select pg_temp.plan7_restore_gate_assert(to_regprocedure('private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)') is not null, 'private restore guard exists');
select pg_temp.plan7_restore_gate_assert((select relrowsecurity from pg_class where oid='public.food_catalog_ingestion_restore_blocks'::regclass), 'restore-block table has RLS enabled');
select pg_temp.plan7_restore_gate_assert(not exists(
  select 1
  from pg_class relation_acl
  cross join lateral aclexplode(coalesce(relation_acl.relacl, acldefault('r', relation_acl.relowner))) grant_acl
  where relation_acl.oid='public.food_catalog_ingestion_restore_blocks'::regclass
    and grant_acl.grantee=0
), 'PUBLIC has no direct restore-block privileges');
select pg_temp.plan7_restore_gate_assert(not has_table_privilege('anon','public.food_catalog_ingestion_restore_blocks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'anon has no direct restore-block privileges');
select pg_temp.plan7_restore_gate_assert(not has_table_privilege('authenticated','public.food_catalog_ingestion_restore_blocks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'authenticated has no direct restore-block privileges');
select pg_temp.plan7_restore_gate_assert(not has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'service_role has no direct restore-block privileges');
select pg_temp.plan7_restore_gate_assert(not exists(
  select 1
  from pg_proc function_acl
  cross join lateral aclexplode(coalesce(function_acl.proacl, acldefault('f', function_acl.proowner))) grant_acl
  where function_acl.oid='private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)'::regprocedure
    and grant_acl.grantee=0
), 'PUBLIC cannot execute private restore guard');
select pg_temp.plan7_restore_gate_assert(not has_function_privilege('anon','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE'), 'anon cannot execute private restore guard');
select pg_temp.plan7_restore_gate_assert(not has_function_privilege('authenticated','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE'), 'authenticated cannot execute private restore guard');
select pg_temp.plan7_restore_gate_assert(not has_function_privilege('service_role','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE'), 'service_role cannot execute private restore guard');
select pg_temp.plan7_restore_gate_assert((
  select count(*)=1 from pg_constraint
  where conrelid='public.food_catalog_ingestion_restore_blocks'::regclass and contype='f'
    and confrelid='public.food_ingestion_runs'::regclass
    and confdeltype='r'
), 'restore-block run_id FK prevents orphan blocks with ON DELETE RESTRICT');
select pg_temp.plan7_restore_gate_assert((
  select count(*)=1 from pg_constraint
  where conrelid='public.food_catalog_ingestion_restore_blocks'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%restored_status%prepared%running%'
), 'restore-block status check is exactly nonterminal prepared/running authority');

select pg_temp.plan7_restore_gate_assert((
  select position('food_catalog_ingestion_require_not_restore_blocked_v1' in definition) > 0
     and position('food_catalog_ingestion_require_not_restore_blocked_v1' in definition)
       < position('food_catalog_ingestion_replay_operation_v2' in definition)
  from (select pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure) as definition) function_definition
), 'restore guard executes before acquire operation replay');

-- Terminal history has no restore-block row and cannot be reacquired through normal authority.
select pg_temp.plan7_restore_gate_assert(not exists(
  select 1 from public.food_catalog_ingestion_restore_blocks where run_id=(select dry_run_id from plan7_restore_gate_ids)
), 'terminal completed run needs no restore block');

select pg_temp.plan7_restore_gate_assert(
  not exists(select 1 from plan7_restore_gate_outcomes where not passed),
  'replay identity cases failed: ' || coalesce((
    select string_agg(case_name, ', ' order by case_name)
    from plan7_restore_gate_outcomes
    where not passed
  ), '<none>')
);

rollback;
