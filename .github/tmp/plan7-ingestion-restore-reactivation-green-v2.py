from pathlib import Path
import json

BASE = "796a48dc23bb3e11efed702c63133cfac396e7f1"


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected exactly one replacement target, found {text.count(old)}")
    p.write_text(text.replace(old, new, 1))


def insert_before(path, marker, block):
    replace_once(path, marker, block + marker)

# 1) Migration hardening: target-local relation participates in Food security posture,
# and durable fencing epoch can never be negative.
replace_once(
    "supabase/migrations/20260917023000_food_catalog_ingestion_restore_reactivation_gate.sql",
    "  restored_lease_epoch bigint not null,\n",
    "  restored_lease_epoch bigint not null check (restored_lease_epoch >= 0),\n",
)
replace_once(
    "supabase/migrations/20260917023000_food_catalog_ingestion_restore_reactivation_gate.sql",
    ");\n\nrevoke all privileges on table public.food_catalog_ingestion_restore_blocks from public;",
    ");\n\nalter table public.food_catalog_ingestion_restore_blocks enable row level security;\n\nrevoke all privileges on table public.food_catalog_ingestion_restore_blocks from public;",
)

# 2) Restore reconstructs target-local blocks from canonical durable run history.
helper = r'''export function buildRestoredIngestionRunBlockSql(canonicalRows) {
  if (!Array.isArray(canonicalRows)) throw new Error("Restored ingestion block reconstruction requires canonical rows.");
  const blocks = [];
  for (const canonicalRow of canonicalRows) {
    const row = decodeCanonicalSegmentRow(canonicalRow);
    const executionMode = row.execution_mode?.text;
    const status = row.status?.text;
    if (executionMode !== "production" || (status !== "prepared" && status !== "running")) continue;
    const runId = row.id?.text;
    const leaseEpoch = row.lease_epoch?.text;
    if (typeof runId !== "string" || !UUID.test(runId)) throw new Error("Restored nonterminal Production ingestion run has an invalid run_id.");
    if (typeof leaseEpoch !== "string" || !/^[0-9]+$/u.test(leaseEpoch)) throw new Error(`Restored ingestion run ${runId} has an invalid lease_epoch.`);
    blocks.push(Object.freeze({ runId, status, leaseEpoch }));
  }
  if (blocks.length === 0) return "";
  const statements = blocks.map(({ runId, status, leaseEpoch }) => `  INSERT INTO public.food_catalog_ingestion_restore_blocks(run_id, restored_status, restored_lease_epoch)\n  VALUES ('${runId}'::uuid, '${status}', ${leaseEpoch}::bigint)\n  ON CONFLICT (run_id) DO NOTHING;\n  IF NOT EXISTS (\n    SELECT 1\n    FROM public.food_catalog_ingestion_restore_blocks restore_block\n    WHERE restore_block.run_id='${runId}'::uuid\n      AND restore_block.restored_status='${status}'\n      AND restore_block.restored_lease_epoch=${leaseEpoch}::bigint\n  ) THEN\n    RAISE EXCEPTION 'Plan7 restored ingestion block conflict for %', '${runId}'::uuid USING ERRCODE = '55000';\n  END IF;`).join("\n");
  return `DO $plan7_restore_ingestion_block$\nBEGIN\n${statements}\nEND\n$plan7_restore_ingestion_block$;`;
}

'''
insert_before(
    "scripts/restore-food-catalog-portable.mjs",
    "export function materializeRestoreLocalBindings",
    helper,
)
replace_once(
    "scripts/restore-food-catalog-portable.mjs",
    '''    } else if (action.kind === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, forceNullColumns: [...(rule.transientNeutralize ?? [])], comparisonOmitColumns: [...(rule.transientNeutralize ?? [])] }));
    } else if (action.kind === "RESTORE_TRANSITIONAL_WITH_CYCLE_NULL") {''',
    '''    } else if (action.kind === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, forceNullColumns: [...(rule.transientNeutralize ?? [])], comparisonOmitColumns: [...(rule.transientNeutralize ?? [])] }));
      if (rule.relation === "food_ingestion_runs") {
        const blockSql = buildRestoredIngestionRunBlockSql(rows);
        if (blockSql) runPsql(targetUrl, blockSql);
      }
    } else if (action.kind === "RESTORE_TRANSITIONAL_WITH_CYCLE_NULL") {''',
)

# 3) Fix the RED unit harness so it tests the actual $function$ body and strengthen reconstruction coverage.
replace_once(
    "scripts/food-catalog-ingestion-restore-reactivation-gate.test.mjs",
    '''  const end = tail.indexOf("\\n$$;");
  assert.notEqual(end, -1, "acquire-lease authority definition must terminate with $$;");
  return tail.slice(0, end + 4);''',
    '''  const endMarker = "\\n$function$;";
  const end = tail.indexOf(endMarker);
  assert.notEqual(end, -1, "acquire-lease authority definition must terminate with $function$;");
  return tail.slice(0, end + endMarker.length);''',
)
replace_once(
    "scripts/food-catalog-ingestion-restore-reactivation-gate.test.mjs",
    '''  assert.match(sql, /restored_lease_epoch/u);
  assert.match(sql, /55000/u);''',
    '''  assert.match(sql, /restored_lease_epoch/u);
  assert.match(sql, /ON CONFLICT \\(run_id\\) DO NOTHING/u);
  assert.match(sql, /IF NOT EXISTS/u);
  assert.match(sql, /55000/u);''',
)
insert_before(
    "scripts/food-catalog-ingestion-restore-reactivation-gate.test.mjs",
    'test("forward migration supplies the target-local guard before replay", () => {',
    '''test("restore block reconstruction is empty without nonterminal Production history", () => {
  assert.equal(restore.buildRestoredIngestionRunBlockSql([
    ingestionRow({ id: "71000000-0000-4000-8000-000000000010", status: "completed", leaseEpoch: 1 }),
    ingestionRow({ id: "71000000-0000-4000-8000-000000000011", status: "running", leaseEpoch: 2, executionMode: "dry_run" }),
  ]), "");
});

''',
)
replace_once(
    "scripts/food-catalog-ingestion-restore-reactivation-gate.test.mjs",
    '''  assert.match(sql, /create table public\\.food_catalog_ingestion_restore_blocks/iu);
  assert.match(sql, /food_catalog_ingestion_require_not_restore_blocked_v1/iu);''',
    '''  assert.match(sql, /create table public\\.food_catalog_ingestion_restore_blocks/iu);
  assert.match(sql, /alter table public\\.food_catalog_ingestion_restore_blocks enable row level security/iu);
  assert.match(sql, /references public\\.food_ingestion_runs\\(id\\) on delete restrict/iu);
  assert.match(sql, /restored_lease_epoch bigint not null check \\(restored_lease_epoch >= 0\\)/iu);
  assert.match(sql, /food_catalog_ingestion_require_not_restore_blocked_v1/iu);''',
)

# 4) Repair PUBLIC ACL assertions in rollback-only DB proof and assert exact ordering/FK delete action/RLS.
p = Path("supabase/verification/food-catalog-plan7-ingestion-restore-reactivation-gate.sql")
text = p.read_text()
text = text.replace(
    "select pg_temp.plan7_restore_gate_assert(not has_table_privilege('PUBLIC','public.food_catalog_ingestion_restore_blocks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'PUBLIC has no direct restore-block privileges');",
    '''select pg_temp.plan7_restore_gate_assert(not exists(
  select 1
  from pg_class relation_acl
  cross join lateral aclexplode(coalesce(relation_acl.relacl, acldefault('r', relation_acl.relowner))) grant_acl
  where relation_acl.oid='public.food_catalog_ingestion_restore_blocks'::regclass
    and grant_acl.grantee=0
), 'PUBLIC has no direct restore-block privileges');''',
)
text = text.replace(
    "select pg_temp.plan7_restore_gate_assert(not has_function_privilege('PUBLIC','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE'), 'PUBLIC cannot execute private restore guard');",
    '''select pg_temp.plan7_restore_gate_assert(not exists(
  select 1
  from pg_proc function_acl
  cross join lateral aclexplode(coalesce(function_acl.proacl, acldefault('f', function_acl.proowner))) grant_acl
  where function_acl.oid='private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)'::regprocedure
    and grant_acl.grantee=0
), 'PUBLIC cannot execute private restore guard');''',
)
text = text.replace(
    "    and confrelid='public.food_ingestion_runs'::regclass\n), 'restore-block run_id FK prevents orphan blocks');",
    "    and confrelid='public.food_ingestion_runs'::regclass\n    and confdeltype='r'\n), 'restore-block run_id FK prevents orphan blocks with ON DELETE RESTRICT');",
)
text = text.replace(
    "select pg_temp.plan7_restore_gate_assert(to_regprocedure('private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)') is not null, 'private restore guard exists');",
    "select pg_temp.plan7_restore_gate_assert(to_regprocedure('private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)') is not null, 'private restore guard exists');\nselect pg_temp.plan7_restore_gate_assert((select relrowsecurity from pg_class where oid='public.food_catalog_ingestion_restore_blocks'::regclass), 'restore-block table has RLS enabled');",
)
ordering = '''select pg_temp.plan7_restore_gate_assert((
  select position('food_catalog_ingestion_require_not_restore_blocked_v1' in definition) > 0
     and position('food_catalog_ingestion_require_not_restore_blocked_v1' in definition)
       < position('food_catalog_ingestion_replay_operation_v2' in definition)
  from (select pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure) as definition) function_definition
), 'restore guard executes before acquire operation replay');
'''
marker = "\n-- Terminal history has no restore-block row and cannot be reacquired through normal authority."
if marker not in text:
    raise SystemExit("DB verifier ordering marker missing")
text = text.replace(marker, "\n" + ordering + marker, 1)
p.write_text(text)

# 5) FULL_DR final assertion: independently inspect restored durable history, exact local blocks,
# guard ordering, and a fresh acquire rejection on the restored target.
verifier_helper = r'''export function evaluateRestoredIngestionExecutionEvidence(observed) {
  for (const field of ["durableHistoryPreserved","transientLeaseStateNeutralized","restoreBlocksExact","guardPrecedesReplay","freshAcquireRejected"]) {
    if (observed?.[field] !== true) throw new Error(`Restored ingestion execution isolation failed: ${field}.`);
  }
  const expectedBlockedRunCount = Number(observed.expectedBlockedRunCount);
  if (!Number.isInteger(expectedBlockedRunCount) || expectedBlockedRunCount < 0) throw new Error("Restored ingestion expected block count is invalid.");
  if (Number(observed.observedBlockedRunCount) !== expectedBlockedRunCount) throw new Error("Restored ingestion block count mismatch.");
  return Object.freeze({ verified: true, expectedBlockedRunCount, observedBlockedRunCount: expectedBlockedRunCount });
}

function verifyRestoredIngestionExecutionIsolation(databaseUrl, sourceRows) {
  const expected = [];
  for (const sourceRow of sourceRows) {
    const { map } = parseCanonicalRow(sourceRow);
    const id = map.get("id")?.text;
    const executionMode = map.get("execution_mode")?.text;
    const status = map.get("status")?.text;
    const leaseEpoch = map.get("lease_epoch")?.text;
    if (executionMode !== "production" || (status !== "prepared" && status !== "running")) continue;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/iu.test(id) || typeof leaseEpoch !== "string" || !/^[0-9]+$/u.test(leaseEpoch)) {
      throw new Error("Canonical nonterminal Production ingestion history is malformed.");
    }
    expected.push(Object.freeze({ runId: id, status, leaseEpoch: Number(leaseEpoch) }));
  }
  expected.sort((a, b) => a.runId.localeCompare(b.runId));
  const targetRows = JSON.parse(runPsql(databaseUrl, `select coalesce(json_agg(json_build_object(
    'runId',run.id::text,'status',run.status,'leaseEpoch',run.lease_epoch,
    'leaseOwnerNull',run.lease_owner is null,'leaseTokenNull',run.lease_token is null,
    'leaseAcquiredAtNull',run.lease_acquired_at is null,'leaseHeartbeatAtNull',run.lease_heartbeat_at is null,
    'leaseExpiresAtNull',run.lease_expires_at is null
  ) order by run.id),'[]'::json)::text from public.food_ingestion_runs run where run.execution_mode='production' and run.status in ('prepared','running');`) || "[]");
  const blockRows = JSON.parse(runPsql(databaseUrl, `select coalesce(json_agg(json_build_object(
    'runId',restore_block.run_id::text,'status',restore_block.restored_status,'leaseEpoch',restore_block.restored_lease_epoch
  ) order by restore_block.run_id),'[]'::json)::text from public.food_catalog_ingestion_restore_blocks restore_block;`) || "[]");
  const normalizedTarget = targetRows.map((row) => ({ runId: row.runId, status: row.status, leaseEpoch: Number(row.leaseEpoch) })).sort((a,b) => a.runId.localeCompare(b.runId));
  const normalizedBlocks = blockRows.map((row) => ({ runId: row.runId, status: row.status, leaseEpoch: Number(row.leaseEpoch) })).sort((a,b) => a.runId.localeCompare(b.runId));
  const durableHistoryPreserved = stableStringify(normalizedTarget) === stableStringify(expected);
  const transientLeaseStateNeutralized = targetRows.every((row) => row.leaseOwnerNull && row.leaseTokenNull && row.leaseAcquiredAtNull && row.leaseHeartbeatAtNull && row.leaseExpiresAtNull);
  const restoreBlocksExact = stableStringify(normalizedBlocks) === stableStringify(expected);
  const functionDefinition = runPsql(databaseUrl, "select pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure);");
  const guardIndex = functionDefinition.indexOf("food_catalog_ingestion_require_not_restore_blocked_v1");
  const replayIndex = functionDefinition.indexOf("food_catalog_ingestion_replay_operation_v2");
  const guardPrecedesReplay = guardIndex >= 0 && replayIndex > guardIndex;
  let freshAcquireRejected = expected.length === 0;
  if (expected.length > 0) {
    const runId = expected[0].runId;
    const probe = runPsql(databaseUrl, `begin;
do $plan7_integrated_ingestion_gate$
begin
  begin
    perform public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
      'operationId','7b000000-0000-4000-8000-000000000001','commandChecksumSha256',repeat('b',64),
      'runId','${runId}'::uuid,'leaseOwner','plan7-integrated-restore-probe',
      'leaseToken','7b000000-0000-4000-8000-000000000101','leaseSeconds',120
    ));
    perform set_config('plan7.ingestion_restore_blocked','false',true);
  exception when sqlstate '55000' then
    perform set_config('plan7.ingestion_restore_blocked','true',true);
  end;
end
$plan7_integrated_ingestion_gate$;
select current_setting('plan7.ingestion_restore_blocked',true);
rollback;`);
    freshAcquireRejected = probe.split(/\r?\n/u).some((line) => line.trim() === "true" || line.trim() === "t");
  }
  return evaluateRestoredIngestionExecutionEvidence({
    durableHistoryPreserved,
    transientLeaseStateNeutralized,
    restoreBlocksExact,
    guardPrecedesReplay,
    freshAcquireRejected,
    expectedBlockedRunCount: expected.length,
    observedBlockedRunCount: blockRows.length,
  });
}

'''
insert_before(
    "scripts/verify-food-catalog-integrated-restore.mjs",
    "export function areProtectedOwnerStateRelationsVerified",
    verifier_helper,
)
replace_once(
    "scripts/verify-food-catalog-integrated-restore.mjs",
    'assertion("transient_neutralization", "SEMANTIC", input.transientNeutralizationVerified, "Every declared resumable lease/claim field is NULL on the restored target."),',
    'assertion("transient_neutralization", "SEMANTIC", input.transientNeutralizationVerified, "Every declared resumable lease/claim field is NULL and restored nonterminal Production ingestion history remains blocked from lease reacquisition."),',
)
replace_once(
    "scripts/verify-food-catalog-integrated-restore.mjs",
    '''  const transientVerified = areDeclaredTransientRelationsNeutralized(rules, relationResults);

  const assertionEvidence = buildFinalAssertionEvidence({''',
    '''  const transientVerified = areDeclaredTransientRelationsNeutralized(rules, relationResults);
  const restoredIngestionExecution = verifyRestoredIngestionExecutionIsolation(options.targetUrl, sourceRowsFor("food_ingestion_runs"));

  const assertionEvidence = buildFinalAssertionEvidence({''',
)
replace_once(
    "scripts/verify-food-catalog-integrated-restore.mjs",
    "    transientNeutralizationVerified: transientVerified,",
    "    transientNeutralizationVerified: transientVerified && restoredIngestionExecution.verified,",
)
replace_once(
    "scripts/verify-food-catalog-integrated-restore.mjs",
    '''    consumerReference,
    serviceExecutionBinding,
    securityRlsAclIdentitySha256:''',
    '''    consumerReference,
    serviceExecutionBinding,
    restoredIngestionExecution,
    securityRlsAclIdentitySha256:''',
)

# Pure contract test for the final assertion evaluator.
replace_once(
    "scripts/verify-food-catalog-integrated-restore.test.mjs",
    '''  evaluateRestoredServiceAuthorityEvidence,
} from "./verify-food-catalog-integrated-restore.mjs";''',
    '''  evaluateRestoredServiceAuthorityEvidence,
  evaluateRestoredIngestionExecutionEvidence,
} from "./verify-food-catalog-integrated-restore.mjs";''',
)
insert_before(
    "scripts/verify-food-catalog-integrated-restore.test.mjs",
    '  it("builds all mandatory assertions from runtime proof classes without caller trust booleans", () => {',
    '''  it("requires restored nonterminal ingestion history to stay execution-blocked", () => {
    const good = {
      durableHistoryPreserved: true,
      transientLeaseStateNeutralized: true,
      restoreBlocksExact: true,
      guardPrecedesReplay: true,
      freshAcquireRejected: true,
      expectedBlockedRunCount: 1,
      observedBlockedRunCount: 1,
    };
    assert.deepEqual(evaluateRestoredIngestionExecutionEvidence(good), {
      verified: true,
      expectedBlockedRunCount: 1,
      observedBlockedRunCount: 1,
    });
    for (const field of ["durableHistoryPreserved","transientLeaseStateNeutralized","restoreBlocksExact","guardPrecedesReplay","freshAcquireRejected"]) {
      assert.throws(() => evaluateRestoredIngestionExecutionEvidence({ ...good, [field]: false }), /ingestion|isolation|failed/i);
    }
    assert.throws(() => evaluateRestoredIngestionExecutionEvidence({ ...good, observedBlockedRunCount: 2 }), /count|mismatch/i);
  });

''',
)

# 6) Integrated workflow is triggered by this migration/verifier and proves exact target block state immediately after restore.
replace_once(
    ".github/workflows/food-catalog-plan7-integrated-full-dr.yml",
    '''      - "supabase/verification/food-catalog-plan7-portability-*.sql"
      - "test/fixtures/food-catalog/**"''',
    '''      - "supabase/migrations/*food_catalog*"
      - "supabase/verification/food-catalog-plan7-portability-*.sql"
      - "supabase/verification/food-catalog-plan7-ingestion-restore-reactivation-gate.sql"
      - "test/fixtures/food-catalog/**"''',
)
replace_once(
    ".github/workflows/food-catalog-plan7-integrated-full-dr.yml",
    '''          psql "$PLAN7_RESTORE_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 \\
            -c "select lease_owner is null and lease_token is null and lease_expires_at is null from public.food_ingestion_runs where id='71000000-0000-4000-8000-000000000a11'::uuid" \\
            | grep '^t$' ''',
    '''          psql "$PLAN7_RESTORE_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 \\
            -c "select status='running' and lease_epoch=3 and lease_owner is null and lease_token is null and lease_acquired_at is null and lease_heartbeat_at is null and lease_expires_at is null from public.food_ingestion_runs where id='71000000-0000-4000-8000-000000000a11'::uuid" \\
            | grep '^t$'
          psql "$PLAN7_RESTORE_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 \\
            -c "select count(*)=1 and bool_and(run_id='71000000-0000-4000-8000-000000000a11'::uuid and restored_status='running' and restored_lease_epoch=3) from public.food_catalog_ingestion_restore_blocks" \\
            | grep '^t$' ''',
)

# 7) Canonical DB chain contract explicitly covers and orders the new proof.
append_test = '''

test("permanent verification chain covers restored ingestion reactivation gate before production preflight", () => {
  const ingestionV2 = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-ingestion-v2-authority.sql",
  );
  const gate = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-plan7-ingestion-restore-reactivation-gate.sql",
  );
  const productionPreflight = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/production-release-migration-preflight.sql",
  );
  assert.notEqual(gate, -1);
  assert.ok(ingestionV2 >= 0 && ingestionV2 < gate);
  assert.ok(gate < productionPreflight);
});
'''
Path("scripts/run-database-verification.test.mjs").write_text(Path("scripts/run-database-verification.test.mjs").read_text() + append_test)

# 8) Machine ledger truth: new migration is repository-only and pending; no Production identity fabricated.
ledger_path = Path("supabase/migration-ledger.json")
ledger = json.loads(ledger_path.read_text())
new_file = "20260917023000_food_catalog_ingestion_restore_reactivation_gate.sql"
if any(entry.get("localFile") == new_file for entry in ledger["entries"]):
    raise SystemExit("new migration already present in ledger")
ledger["entries"].append({
    "localFile": new_file,
    "state": "pending",
    "note": "Repository-only Plan 7 restored-ingestion reactivation gate; not applied to Production. Do not replay applied migrations."
})
ledger["pendingCount"] = 3
ledger["unresolvedCount"] = 3
ledger["historyRepair"]["pendingCount"] = 3
ledger["historyRepair"]["unresolvedCount"] = 3
ledger["historyRepair"]["note"] = "Production migration history remains reconciled through the Plan 6 GTIN-lock exactness correction. Three repository-only Plan 7 migrations remain pending and unapplied: the outbox reconciliation gate, the owner correction export authority, and the restored-ingestion reactivation gate. Do not replay applied migrations."
ledger_path.write_text(json.dumps(ledger, separators=(",", ":")) + "\n")

# 9) Human ledger mirrors machine truth; Production inspection date remains unchanged.
doc = Path("docs/architecture/migration-ledger-reconciliation.md")
d = doc.read_text()
d = d.replace("two repository-only Plan 7 migrations are pending and unapplied", "three repository-only Plan 7 migrations are pending and unapplied")
d = d.replace(
    "- `20260915170012_food_catalog_owner_correction_export.sql`: `pending` (repository-only; not applied to Production; no Production version/name)\n- `pendingCount = 2`",
    "- `20260915170012_food_catalog_owner_correction_export.sql`: `pending` (repository-only; not applied to Production; no Production version/name)\n- `20260917023000_food_catalog_ingestion_restore_reactivation_gate.sql`: `pending` (repository-only; not applied to Production; no Production version/name)\n- `pendingCount = 3`",
)
d = d.replace("- `unresolvedCount = 2`", "- `unresolvedCount = 3`", 1)
d = d.replace("Both pending Plan 7 migrations have no Production version or name because neither has been applied.", "All three pending Plan 7 migrations have no Production version or name because none has been applied.")
d = d.replace("`historyRepair` remains `pending` with `pendingCount = 2`, `unresolvedCount = 2`", "`historyRepair` remains `pending` with `pendingCount = 3`, `unresolvedCount = 3`")
doc.write_text(d)

# Fail closed if the source exact head was not the intended baseline.
Path(".plan7-green-v2-base").write_text(BASE + "\n")
