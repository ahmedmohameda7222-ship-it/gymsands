from pathlib import Path
import json

migration = r'''begin;

-- Plan 7 portability: restored nonterminal Production ingestion runs remain semantically
-- present but cannot reacquire operational execution authority until an explicit future
-- recovery path removes the target-local block. This migration does not populate or
-- activate Food data and is repository-only until separately authorized for Production.
create table public.food_catalog_ingestion_restore_blocks (
  run_id uuid primary key references public.food_ingestion_runs(id) on delete cascade,
  restored_status text not null check (restored_status in ('prepared', 'running')),
  restored_lease_epoch bigint not null check (restored_lease_epoch >= 0),
  blocked_at timestamptz not null default clock_timestamp()
);

alter table public.food_catalog_ingestion_restore_blocks enable row level security;
revoke all on table public.food_catalog_ingestion_restore_blocks from public, anon, authenticated, service_role;

create or replace function private.food_catalog_ingestion_require_not_restore_blocked_v1(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_run_id is not null and exists (
    select 1
    from public.food_catalog_ingestion_restore_blocks restore_block
    where restore_block.run_id = p_run_id
  ) then
    raise exception 'Restored Food Catalog ingestion run is operationally blocked: %.', p_run_id
      using errcode = '55000';
  end if;
end
$function$;

revoke all on function private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)
from public, anon, authenticated, service_role;

-- Preserve the reviewed Plan 4 implementation behind a private, non-callable entry point.
-- The public surface is recreated with the exact original signature so the restore guard
-- executes before any idempotent operation replay shortcut.
alter function public.food_catalog_ingestion_acquire_lease_v2(jsonb)
  rename to food_catalog_ingestion_acquire_lease_unchecked_v2;
alter function public.food_catalog_ingestion_acquire_lease_unchecked_v2(jsonb)
  set schema private;
revoke all on function private.food_catalog_ingestion_acquire_lease_unchecked_v2(jsonb)
from public, anon, authenticated, service_role;

create or replace function public.food_catalog_ingestion_acquire_lease_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_run_id uuid := (p_command->>'runId')::uuid;
  v_replay jsonb;
begin
  perform private.food_catalog_ingestion_require_not_restore_blocked_v1(v_run_id);

  v_replay := private.food_catalog_ingestion_replay_operation_v2(
    p_command,
    'food_catalog_ingestion_acquire_lease_v2'
  );
  if v_replay is not null then
    return v_replay;
  end if;

  return private.food_catalog_ingestion_acquire_lease_unchecked_v2(p_command);
end
$function$;

revoke all on function public.food_catalog_ingestion_acquire_lease_v2(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.food_catalog_ingestion_acquire_lease_v2(jsonb) to service_role;

commit;
'''
Path('supabase/migrations/20260917100000_food_catalog_ingestion_restore_reactivation_block.sql').write_text(migration)

verification = r'''begin;

create or replace function pg_temp.plan7_restore_block_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Plan 7 restored-ingestion assertion failed: %', p_message;
  end if;
end
$$;

select pg_temp.plan7_restore_block_assert(
  to_regclass('public.food_catalog_ingestion_restore_blocks') is not null,
  'target-local restore block table exists'
);
select pg_temp.plan7_restore_block_assert(
  to_regprocedure('private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)') is not null,
  'private restore block guard exists'
);
select pg_temp.plan7_restore_block_assert(
  position('food_catalog_ingestion_require_not_restore_blocked_v1' in pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure)) > 0
  and position('food_catalog_ingestion_require_not_restore_blocked_v1' in pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure))
    < position('food_catalog_ingestion_replay_operation_v2' in pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure)),
  'restore block guard executes before replay shortcut'
);
select pg_temp.plan7_restore_block_assert(
  has_function_privilege('service_role', 'public.food_catalog_ingestion_acquire_lease_v2(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.food_catalog_ingestion_acquire_lease_v2(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.food_catalog_ingestion_acquire_lease_v2(jsonb)', 'EXECUTE'),
  'public acquire RPC keeps Plan 4 service-role-only authority'
);
select pg_temp.plan7_restore_block_assert(
  not has_function_privilege('service_role', 'private.food_catalog_ingestion_acquire_lease_unchecked_v2(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)', 'EXECUTE'),
  'unchecked acquisition and guard remain private to definer authority'
);
select pg_temp.plan7_restore_block_assert(
  not has_table_privilege('service_role', 'public.food_catalog_ingestion_restore_blocks', 'SELECT')
  and not has_table_privilege('service_role', 'public.food_catalog_ingestion_restore_blocks', 'INSERT')
  and not has_table_privilege('service_role', 'public.food_catalog_ingestion_restore_blocks', 'UPDATE')
  and not has_table_privilege('service_role', 'public.food_catalog_ingestion_restore_blocks', 'DELETE')
  and not has_table_privilege('anon', 'public.food_catalog_ingestion_restore_blocks', 'SELECT')
  and not has_table_privilege('authenticated', 'public.food_catalog_ingestion_restore_blocks', 'SELECT'),
  'target-local block authority has no direct runtime grants'
);

select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','74000000-0000-4000-8000-000000000001','commandChecksumSha256',repeat('1',64),
  'executionMode','dry_run','attemptNumber',1,'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('b',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','plan7-restore-block','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-17','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://plan7-restore-block','sourceChecksumSha256',repeat('c',64),
    'importerVersion','plan7-restore-block','configChecksumSha256',repeat('d',64)
  ),
  'expectedMutations',jsonb_build_object('input',0,'accepted',0,'rejected',0,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0)
));

create temporary table plan7_restore_block_ids as
select batch.id batch_id, run.id dry_run_id
from public.food_ingestion_batches batch
join public.food_ingestion_runs run on run.batch_id=batch.id
where batch.semantic_identity_checksum_sha256=repeat('b',64)
  and run.execution_mode='dry_run';

select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
  'operationId','74000000-0000-4000-8000-000000000002','commandChecksumSha256',repeat('2',64),
  'runId',(select dry_run_id from plan7_restore_block_ids),'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('b',64),'completed',true
));
select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object(
  'operationId','74000000-0000-4000-8000-000000000003','commandChecksumSha256',repeat('3',64),
  'runId',(select dry_run_id from plan7_restore_block_ids)
));
update public.food_ingestion_batches
set review_state='reviewed', reviewed_at=clock_timestamp()
where id=(select batch_id from plan7_restore_block_ids);
update public.food_ingestion_batches
set review_state='approved', approved_at=clock_timestamp(), approval_reference='plan7-restore-block-verifier'
where id=(select batch_id from plan7_restore_block_ids);

select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','74000000-0000-4000-8000-000000000004','commandChecksumSha256',repeat('4',64),
  'executionMode','production','attemptNumber',1,'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('b',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference','dataset','plan7-restore-block','sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-17','licenseName','Fixture License','licenseReference','fixture-license',
    'sourceReference','fixture://plan7-restore-block','sourceChecksumSha256',repeat('c',64),
    'importerVersion','plan7-restore-block','configChecksumSha256',repeat('d',64)
  ),
  'expectedMutations',jsonb_build_object('input',0,'accepted',0,'rejected',0,'matched',0,'created',0,'possibleDuplicate',0,'quarantined',0)
));

create temporary table plan7_restore_block_run as
select id, status, lease_epoch
from public.food_ingestion_runs
where execution_mode='production'
  and attempt_number=1
  and batch_id=(select batch_id from plan7_restore_block_ids);

create temporary table plan7_restore_block_command(command jsonb not null);
insert into plan7_restore_block_command values (jsonb_build_object(
  'operationId','74000000-0000-4000-8000-000000000005','commandChecksumSha256',repeat('5',64),
  'runId',(select id from plan7_restore_block_run),'leaseOwner','plan7-restore-worker',
  'leaseToken','74000000-0000-4000-8000-000000000101','leaseSeconds',120
));

create temporary table plan7_restore_block_first_result(result jsonb not null);
insert into plan7_restore_block_first_result
select public.food_catalog_ingestion_acquire_lease_v2((select command from plan7_restore_block_command));
select pg_temp.plan7_restore_block_assert(
  (select result from plan7_restore_block_first_result)
  = public.food_catalog_ingestion_acquire_lease_v2((select command from plan7_restore_block_command)),
  'unblocked exact replay remains idempotent'
);

insert into public.food_catalog_ingestion_restore_blocks(run_id,restored_status,restored_lease_epoch)
select id,status,lease_epoch from public.food_ingestion_runs
where id=(select id from plan7_restore_block_run);

select pg_temp.plan7_restore_block_assert(
  (select count(*)=1
   from public.food_catalog_ingestion_restore_blocks restore_block
   join public.food_ingestion_runs run on run.id=restore_block.run_id
   where restore_block.run_id=(select id from plan7_restore_block_run)
     and restore_block.restored_status=run.status
     and restore_block.restored_lease_epoch=run.lease_epoch),
  'restore block binds exact run status and lease epoch'
);

do $plan7_restore_block_replay$
begin
  begin
    perform public.food_catalog_ingestion_acquire_lease_v2((select command from plan7_restore_block_command));
    raise exception 'same-command replay bypassed restored ingestion block';
  exception when sqlstate '55000' then
    if sqlerrm not like 'Restored Food Catalog ingestion run is operationally blocked%' then raise; end if;
  end;
end
$plan7_restore_block_replay$;

do $plan7_restore_block_new_command$
begin
  begin
    perform public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
      'operationId','74000000-0000-4000-8000-000000000006','commandChecksumSha256',repeat('6',64),
      'runId',(select id from plan7_restore_block_run),'leaseOwner','plan7-restore-worker-2',
      'leaseToken','74000000-0000-4000-8000-000000000102','leaseSeconds',120
    ));
    raise exception 'new command bypassed restored ingestion block';
  exception when sqlstate '55000' then
    if sqlerrm not like 'Restored Food Catalog ingestion run is operationally blocked%' then raise; end if;
  end;
end
$plan7_restore_block_new_command$;

rollback;
'''
Path('supabase/verification/food-catalog-plan7-ingestion-restore-reactivation.sql').write_text(verification)

restore_test = r'''import assert from "node:assert/strict";
import test from "node:test";
import { FOOD_CATALOG_PORTABLE_RELATIONS_V1 } from "../lib/food-catalog/portability/relation-registry.ts";
import * as restore from "./restore-food-catalog-portable.mjs";

function canonicalRun({ id, executionMode, status, leaseEpoch }) {
  return JSON.stringify([
    ["id", "uuid", id],
    ["execution_mode", "text", executionMode],
    ["status", "text", status],
    ["lease_epoch", "int8", String(leaseEpoch)],
    ["lease_owner", "text", null],
    ["lease_token", "uuid", null],
    ["lease_acquired_at", "timestamptz", null],
    ["lease_heartbeat_at", "timestamptz", null],
    ["lease_expires_at", "timestamptz", null],
  ]);
}

const build = restore.buildRestoredIngestionRunBlockSql;

test("restored Production running and prepared runs reconstruct target-local operational blocks", () => {
  assert.equal(typeof build, "function");
  for (const [status, epoch] of [["running", 9], ["prepared", 4]]) {
    const id = status === "running" ? "71000000-0000-4000-8000-000000000001" : "71000000-0000-4000-8000-000000000002";
    const sql = build(canonicalRun({ id, executionMode: "production", status, leaseEpoch: epoch }));
    assert.equal(typeof sql, "string");
    assert.match(sql, /food_catalog_ingestion_restore_blocks/);
    assert.match(sql, new RegExp(id));
    assert.match(sql, new RegExp(status));
    assert.match(sql, new RegExp(String(epoch)));
    assert.match(sql, /ON CONFLICT \(run_id\) DO NOTHING/);
    assert.match(sql, /RAISE EXCEPTION/);
  }
});

test("terminal and non-Production runs do not receive restore blocks", () => {
  for (const status of ["completed", "failed", "cancelled"]) {
    assert.equal(build(canonicalRun({ id: "71000000-0000-4000-8000-000000000010", executionMode: "production", status, leaseEpoch: 3 })), null);
  }
  assert.equal(build(canonicalRun({ id: "71000000-0000-4000-8000-000000000011", executionMode: "dry_run", status: "running", leaseEpoch: 3 })), null);
});

test("restore block builder rejects malformed stable identity and lease epoch", () => {
  assert.throws(() => build(canonicalRun({ id: "not-a-uuid", executionMode: "production", status: "running", leaseEpoch: 3 })), /uuid|identity/i);
  const malformedEpoch = canonicalRun({ id: "71000000-0000-4000-8000-000000000012", executionMode: "production", status: "running", leaseEpoch: 3 })
    .replace('["lease_epoch","int8","3"]', '["lease_epoch","int8","-1"]');
  assert.throws(() => build(malformedEpoch), /lease epoch/i);
});

test("target-local restore blocks are deliberately excluded from the portable registry", () => {
  assert.equal(FOOD_CATALOG_PORTABLE_RELATIONS_V1.some((rule) => rule.relation === "food_catalog_ingestion_restore_blocks"), false);
});
'''
Path('scripts/restore-food-catalog-ingestion-reactivation.test.mjs').write_text(restore_test)

restore_path = Path('scripts/restore-food-catalog-portable.mjs')
text = restore_path.read_text()
anchor = 'export function materializeRestoreLocalBindings(canonicalRow, rule, unreachableSha256 = () => randomBytes(32).toString("hex")) {'
builder = r'''export function buildRestoredIngestionRunBlockSql(canonicalRow) {
  const row = decodeCanonicalSegmentRow(canonicalRow);
  const runId = row.id?.text;
  const executionMode = row.execution_mode?.text;
  const status = row.status?.text;
  const leaseEpoch = row.lease_epoch?.text;
  if (executionMode !== "production" || !["prepared", "running"].includes(status)) return null;
  if (typeof runId !== "string" || !UUID.test(runId)) throw new Error("Restored ingestion run block requires a valid UUID identity.");
  if (typeof leaseEpoch !== "string" || !/^\d+$/u.test(leaseEpoch)) throw new Error("Restored ingestion run block requires a non-negative integer lease epoch.");
  return `DO $plan7_ingestion_restore_block$\nBEGIN\n  INSERT INTO public.food_catalog_ingestion_restore_blocks (run_id, restored_status, restored_lease_epoch)\n  VALUES ('${runId}'::uuid, '${status}'::text, '${leaseEpoch}'::bigint)\n  ON CONFLICT (run_id) DO NOTHING;\n  IF NOT EXISTS (\n    SELECT 1 FROM public.food_catalog_ingestion_restore_blocks AS b\n    WHERE b.run_id='${runId}'::uuid\n      AND b.restored_status='${status}'::text\n      AND b.restored_lease_epoch='${leaseEpoch}'::bigint\n  ) THEN\n    RAISE EXCEPTION 'Plan7 conflicting restored ingestion reactivation block for ${runId}';\n  END IF;\nEND\n$plan7_ingestion_restore_block$;`;
}

'''
if text.count(anchor) != 1:
    raise SystemExit('restore builder anchor mismatch')
text = text.replace(anchor, builder + anchor)
old = '    } else if (action.kind === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION") {\n      for (const canonicalRow of rows) runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, forceNullColumns: [...(rule.transientNeutralize ?? [])], comparisonOmitColumns: [...(rule.transientNeutralize ?? [])] }));\n'
new = '    } else if (action.kind === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION") {\n      for (const canonicalRow of rows) {\n        runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, forceNullColumns: [...(rule.transientNeutralize ?? [])], comparisonOmitColumns: [...(rule.transientNeutralize ?? [])] }));\n        if (rule.relation === "food_ingestion_runs") {\n          const blockSql = buildRestoredIngestionRunBlockSql(canonicalRow);\n          if (blockSql) runPsql(targetUrl, blockSql);\n        }\n      }\n'
if text.count(old) != 1:
    raise SystemExit('restore transient branch anchor mismatch')
restore_path.write_text(text.replace(old, new))

verifier_path = Path('scripts/verify-food-catalog-integrated-restore.mjs')
text = verifier_path.read_text()
old_assert = '    assertion("transient_neutralization", "SEMANTIC", input.transientNeutralizationVerified, "Every declared resumable lease/claim field is NULL on the restored target."),\n'
new_assert = old_assert + '    assertion("restored_ingestion_reactivation_block", "SEMANTIC", input.ingestionReactivationBlocked, "Restored nonterminal Production ingestion runs are target-locally blocked before operation replay can reactivate execution."),\n'
if text.count(old_assert) != 1:
    raise SystemExit('final assertion anchor mismatch')
text = text.replace(old_assert, new_assert)
service_anchor = '''export function evaluateRestoredServiceAuthorityEvidence(observed) {
  const requiredTrue = [
    "sourceServiceIdentityRejected",
    "authenticatedClaimRejected",
    "randomServiceIdentityRejected",
    "principalHistoryPreserved",
    "capabilityHistoryPreserved",
    "outboxPendingUnclaimed",
    "serviceExecutionBindingUnavailable",
  ];
  for (const field of requiredTrue) {
    if (observed?.[field] !== true) throw new Error(`Restored Service execution binding evidence failed: ${field}.`);
  }
  if (observed.automaticDeliveryObserved !== false) throw new Error("Restored Service execution binding evidence observed automatic delivery.");
  return Object.freeze({ verified: true, automaticDeliveryObserved: false });
}
'''
block_helpers = r'''

export function evaluateRestoredIngestionBlockEvidence(observed) {
  const counts = ["nonterminalProductionCount", "blockCount", "exactBlockCount", "unexpectedBlockCount"];
  for (const field of counts) {
    if (!Number.isInteger(Number(observed?.[field])) || Number(observed[field]) < 0) throw new Error(`Restored ingestion block evidence has invalid ${field}.`);
  }
  const nonterminal = Number(observed.nonterminalProductionCount);
  const blocks = Number(observed.blockCount);
  const exact = Number(observed.exactBlockCount);
  const unexpected = Number(observed.unexpectedBlockCount);
  if (blocks !== nonterminal || exact !== nonterminal || unexpected !== 0) throw new Error("Restored ingestion block coverage does not exactly match nonterminal Production runs.");
  for (const field of ["guardExists", "guardBeforeReplay", "tableDirectAccessDenied", "guardDirectExecuteDenied", "publicAcquireAuthorityPreserved"]) {
    if (observed?.[field] !== true) throw new Error(`Restored ingestion block authority failed: ${field}.`);
  }
  if (nonterminal > 0 && observed?.replayRejected !== true) throw new Error("Restored ingestion block did not reject an acquisition replay probe.");
  return Object.freeze({
    verified: true,
    nonterminalProductionCount: nonterminal,
    blockCount: blocks,
    exactBlockCount: exact,
    unexpectedBlockCount: unexpected,
    replayRejected: nonterminal > 0,
  });
}

function queryRestoredIngestionBlockEvidence(databaseUrl) {
  const observed = JSON.parse(runPsql(databaseUrl, `SELECT json_build_object(
    'nonterminalProductionCount',(SELECT count(*) FROM public.food_ingestion_runs WHERE execution_mode='production' AND status IN ('prepared','running')),
    'blockCount',(SELECT count(*) FROM public.food_catalog_ingestion_restore_blocks),
    'exactBlockCount',(SELECT count(*) FROM public.food_catalog_ingestion_restore_blocks b JOIN public.food_ingestion_runs r ON r.id=b.run_id WHERE r.execution_mode='production' AND r.status IN ('prepared','running') AND b.restored_status=r.status AND b.restored_lease_epoch=r.lease_epoch),
    'unexpectedBlockCount',(SELECT count(*) FROM public.food_catalog_ingestion_restore_blocks b LEFT JOIN public.food_ingestion_runs r ON r.id=b.run_id WHERE r.id IS NULL OR r.execution_mode<>'production' OR r.status NOT IN ('prepared','running') OR b.restored_status<>r.status OR b.restored_lease_epoch<>r.lease_epoch),
    'guardExists',to_regprocedure('private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)') IS NOT NULL,
    'guardBeforeReplay',position('food_catalog_ingestion_require_not_restore_blocked_v1' in pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure)) > 0 AND position('food_catalog_ingestion_require_not_restore_blocked_v1' in pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure)) < position('food_catalog_ingestion_replay_operation_v2' in pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure)),
    'tableDirectAccessDenied',NOT has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','SELECT') AND NOT has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','INSERT') AND NOT has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','UPDATE') AND NOT has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','DELETE'),
    'guardDirectExecuteDenied',NOT has_function_privilege('service_role','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE') AND NOT has_function_privilege('service_role','private.food_catalog_ingestion_acquire_lease_unchecked_v2(jsonb)','EXECUTE'),
    'publicAcquireAuthorityPreserved',has_function_privilege('service_role','public.food_catalog_ingestion_acquire_lease_v2(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.food_catalog_ingestion_acquire_lease_v2(jsonb)','EXECUTE') AND NOT has_function_privilege('authenticated','public.food_catalog_ingestion_acquire_lease_v2(jsonb)','EXECUTE')
  )::text;`));
  if (Number(observed.nonterminalProductionCount) > 0) {
    runPsql(databaseUrl, `DO $plan7_integrated_ingestion_block$
DECLARE
  v_run_id uuid := (SELECT run_id FROM public.food_catalog_ingestion_restore_blocks ORDER BY run_id LIMIT 1);
  v_rejected boolean := false;
BEGIN
  IF v_run_id IS NULL THEN RAISE EXCEPTION 'FULL_DR restored ingestion block fixture is missing.'; END IF;
  BEGIN
    PERFORM public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
      'operationId','75000000-0000-4000-8000-000000000001','commandChecksumSha256',repeat('f',64),
      'runId',v_run_id,'leaseOwner','plan7-full-dr-reactivation-probe',
      'leaseToken','75000000-0000-4000-8000-000000000101','leaseSeconds',120
    ));
  EXCEPTION WHEN SQLSTATE '55000' THEN
    IF SQLERRM LIKE 'Restored Food Catalog ingestion run is operationally blocked%' THEN v_rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Restored ingestion acquisition probe was not blocked.'; END IF;
END
$plan7_integrated_ingestion_block$;`);
    observed.replayRejected = true;
  } else {
    observed.replayRejected = false;
  }
  return evaluateRestoredIngestionBlockEvidence(observed);
}
'''
if text.count(service_anchor) != 1:
    raise SystemExit('service evaluator anchor mismatch')
text = text.replace(service_anchor, service_anchor + block_helpers)
marker = '  const transientVerified = areDeclaredTransientRelationsNeutralized(rules, relationResults);\n\n  const assertionEvidence = buildFinalAssertionEvidence({\n'
replacement = '  const transientVerified = areDeclaredTransientRelationsNeutralized(rules, relationResults);\n  const restoredIngestionBlock = queryRestoredIngestionBlockEvidence(options.targetUrl);\n\n  const assertionEvidence = buildFinalAssertionEvidence({\n'
if text.count(marker) != 1:
    raise SystemExit('integrated block query anchor mismatch')
text = text.replace(marker, replacement)
old_input = '    transientNeutralizationVerified: transientVerified,\n  });\n'
new_input = '    transientNeutralizationVerified: transientVerified,\n    ingestionReactivationBlocked: restoredIngestionBlock.verified,\n  });\n'
if text.count(old_input) != 1:
    raise SystemExit('integrated assertion input anchor mismatch')
text = text.replace(old_input, new_input)
result_anchor = '    serviceExecutionBinding,\n    securityRlsAclIdentitySha256: targetSecurity.securityRlsAclIdentitySha256,\n'
result_replacement = '    serviceExecutionBinding,\n    restoredIngestionBlock,\n    securityRlsAclIdentitySha256: targetSecurity.securityRlsAclIdentitySha256,\n'
if text.count(result_anchor) != 1:
    raise SystemExit('integrated result anchor mismatch')
verifier_path.write_text(text.replace(result_anchor, result_replacement))

verifier_test_path = Path('scripts/verify-food-catalog-integrated-restore.test.mjs')
text = verifier_test_path.read_text()
old_import = '  evaluateRestoredServiceAuthorityEvidence,\n} from "./verify-food-catalog-integrated-restore.mjs";'
new_import = '  evaluateRestoredServiceAuthorityEvidence,\n  evaluateRestoredIngestionBlockEvidence,\n} from "./verify-food-catalog-integrated-restore.mjs";'
if text.count(old_import) != 1:
    raise SystemExit('integrated test import anchor mismatch')
text = text.replace(old_import, new_import)
old_bool = '      transientNeutralizationVerified: true,\n    });\n    assert.equal(evidence.length, 17);'
new_bool = '      transientNeutralizationVerified: true,\n      ingestionReactivationBlocked: true,\n    });\n    assert.equal(evidence.length, 18);'
if text.count(old_bool) != 1:
    raise SystemExit('integrated assertion test anchor mismatch')
text = text.replace(old_bool, new_bool)
old_service_assert = '    assert.equal(evidence.find((entry) => entry.id === "service_execution_binding")?.status, "PASS");\n  });\n'
new_service_assert = '    assert.equal(evidence.find((entry) => entry.id === "service_execution_binding")?.status, "PASS");\n    assert.equal(evidence.find((entry) => entry.id === "restored_ingestion_reactivation_block")?.status, "PASS");\n  });\n\n  it("requires exact target-local block coverage and replay rejection for restored nonterminal Production runs", () => {\n    const verified = evaluateRestoredIngestionBlockEvidence({\n      nonterminalProductionCount: 1, blockCount: 1, exactBlockCount: 1, unexpectedBlockCount: 0,\n      guardExists: true, guardBeforeReplay: true, tableDirectAccessDenied: true,\n      guardDirectExecuteDenied: true, publicAcquireAuthorityPreserved: true, replayRejected: true,\n    });\n    assert.equal(verified.verified, true);\n    assert.equal(verified.replayRejected, true);\n    assert.throws(() => evaluateRestoredIngestionBlockEvidence({\n      nonterminalProductionCount: 1, blockCount: 0, exactBlockCount: 0, unexpectedBlockCount: 0,\n      guardExists: true, guardBeforeReplay: true, tableDirectAccessDenied: true,\n      guardDirectExecuteDenied: true, publicAcquireAuthorityPreserved: true, replayRejected: false,\n    }), /coverage|block/i);\n  });\n'
if text.count(old_service_assert) != 1:
    raise SystemExit('integrated service assertion test anchor mismatch')
verifier_test_path.write_text(text.replace(old_service_assert, new_service_assert))

db_path = Path('scripts/run-database-verification.mjs')
text = db_path.read_text()
anchor = '  "supabase/verification/food-catalog-owner-correction-export.sql",\n  "supabase/verification/production-release-migration-preflight.sql",'
replacement = '  "supabase/verification/food-catalog-owner-correction-export.sql",\n  "supabase/verification/food-catalog-plan7-ingestion-restore-reactivation.sql",\n  "supabase/verification/production-release-migration-preflight.sql",'
if text.count(anchor) != 1:
    raise SystemExit('database verification registry anchor mismatch')
db_path.write_text(text.replace(anchor, replacement))

db_test_path = Path('scripts/run-database-verification.test.mjs')
text = db_test_path.read_text()
addition = r'''

test("permanent verification chain proves restored-ingestion reactivation blocking before production preflight", () => {
  const restoredIngestionBlock = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-plan7-ingestion-restore-reactivation.sql",
  );
  const productionPreflight = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/production-release-migration-preflight.sql",
  );
  assert.notEqual(restoredIngestionBlock, -1);
  assert.ok(restoredIngestionBlock < productionPreflight);
});
'''
db_test_path.write_text(text + addition)

ledger_path = Path('supabase/migration-ledger.json')
ledger = json.loads(ledger_path.read_text())
new_file = '20260917100000_food_catalog_ingestion_restore_reactivation_block.sql'
if any(entry.get('localFile') == new_file for entry in ledger['entries']):
    raise SystemExit('new migration already present in starting ledger')
ledger['pendingCount'] = 3
ledger['unresolvedCount'] = 3
ledger['historyRepair']['pendingCount'] = 3
ledger['historyRepair']['unresolvedCount'] = 3
ledger['historyRepair']['note'] = 'Production migration history remains reconciled through the Plan 6 GTIN-lock exactness correction. Three repository-only Plan 7 migrations remain pending and unapplied: the outbox reconciliation gate, the owner correction export authority, and the restored-ingestion reactivation block authority. Do not replay applied migrations.'
ledger['entries'].append({
    'localFile': new_file,
    'state': 'pending',
    'note': 'Repository-only Plan 7 restored-ingestion reactivation block authority; not applied to Production. Do not replay applied migrations.'
})
ledger_path.write_text(json.dumps(ledger, separators=(',', ':')) + '\n')
