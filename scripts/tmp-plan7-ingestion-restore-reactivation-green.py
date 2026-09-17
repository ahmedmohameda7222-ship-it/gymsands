from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


migration = r'''begin;

create table public.food_catalog_ingestion_restore_blocks (
  run_id uuid primary key references public.food_ingestion_runs(id),
  restored_status text not null check (restored_status in ('prepared','running')),
  restored_lease_epoch bigint not null check (restored_lease_epoch >= 0),
  blocked_at timestamptz not null default clock_timestamp()
);

comment on table public.food_catalog_ingestion_restore_blocks is
  'Target-local Plan 7 restore safety state. Restored historically-active Production ingestion runs remain blocked until a separate explicit reactivation operation.';

alter table public.food_catalog_ingestion_restore_blocks enable row level security;
revoke all on table public.food_catalog_ingestion_restore_blocks from public, anon, authenticated, service_role;

create or replace function private.food_catalog_ingestion_require_not_restore_blocked_v1(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
begin
  if p_run_id is not null and exists (
    select 1
    from public.food_catalog_ingestion_restore_blocks block
    where block.run_id = p_run_id
  ) then
    raise exception 'Restored Food Catalog ingestion run is operationally blocked pending explicit target-local reactivation: %', p_run_id
      using errcode = '55000';
  end if;
end
$$;

revoke all on function private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)
  from public, anon, authenticated, service_role;

alter function public.food_catalog_ingestion_acquire_lease_v2(jsonb)
  rename to food_catalog_ingestion_acquire_lease_v2_impl_v1;
alter function public.food_catalog_ingestion_acquire_lease_v2_impl_v1(jsonb)
  set schema private;
revoke all on function private.food_catalog_ingestion_acquire_lease_v2_impl_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.food_catalog_ingestion_acquire_lease_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_operation uuid;
  v_checksum text;
  v_run_id uuid;
  v_replay jsonb;
begin
  v_operation := nullif(p_command ->> 'operationId','')::uuid;
  v_checksum := lower(coalesce(p_command ->> 'commandChecksumSha256',''));
  v_run_id := nullif(p_command ->> 'runId','')::uuid;

  perform private.food_catalog_ingestion_require_not_restore_blocked_v1(v_run_id);

  v_replay := private.food_catalog_ingestion_replay_operation_v2(
    'acquire_lease',
    v_operation,
    v_checksum,
    p_command
  );
  if v_replay is not null then
    return v_replay;
  end if;

  return private.food_catalog_ingestion_acquire_lease_v2_impl_v1(p_command);
end
$$;

revoke all on function public.food_catalog_ingestion_acquire_lease_v2(jsonb)
  from public, anon, authenticated;
grant execute on function public.food_catalog_ingestion_acquire_lease_v2(jsonb)
  to service_role;

commit;
'''
Path('supabase/migrations/20260917170013_food_catalog_ingestion_restore_reactivation_gate.sql').write_text(migration)

verification = r'''\set ON_ERROR_STOP on
begin;

do $verify_structure$
declare
  v_definition text;
begin
  if to_regclass('public.food_catalog_ingestion_restore_blocks') is null then
    raise exception 'restore-block relation missing';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='food_catalog_ingestion_restore_blocks' and c.relrowsecurity
  ) then
    raise exception 'restore-block relation must enforce RLS';
  end if;
  if has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','SELECT')
     or has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','INSERT')
     or has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','UPDATE')
     or has_table_privilege('service_role','public.food_catalog_ingestion_restore_blocks','DELETE') then
    raise exception 'service_role must not receive direct restore-block table authority';
  end if;
  if to_regprocedure('private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)') is null then
    raise exception 'restore-block guard missing';
  end if;
  if has_function_privilege('service_role','private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid)','EXECUTE') then
    raise exception 'restore-block guard must remain internal';
  end if;
  if to_regprocedure('private.food_catalog_ingestion_acquire_lease_v2_impl_v1(jsonb)') is null then
    raise exception 'private delegated acquire implementation missing';
  end if;
  if has_function_privilege('service_role','private.food_catalog_ingestion_acquire_lease_v2_impl_v1(jsonb)','EXECUTE') then
    raise exception 'service_role must not bypass the public guarded acquire boundary';
  end if;
  if not has_function_privilege('service_role','public.food_catalog_ingestion_acquire_lease_v2(jsonb)','EXECUTE') then
    raise exception 'service_role guarded acquire authority missing';
  end if;
  v_definition := pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure);
  if position('food_catalog_ingestion_require_not_restore_blocked_v1' in v_definition) = 0
     or position('food_catalog_ingestion_replay_operation_v2' in v_definition) = 0
     or position('food_catalog_ingestion_require_not_restore_blocked_v1' in v_definition)
        >= position('food_catalog_ingestion_replay_operation_v2' in v_definition) then
    raise exception 'restore block guard must execute before operation replay';
  end if;
end
$verify_structure$;

insert into public.food_ingestion_batches(
  id,provider,dataset_name,source_version,license_name,source_checksum_sha256,importer_version,
  config_checksum_sha256,manifest_content_checksum_sha256,semantic_identity_checksum_sha256,review_state,created_at,updated_at
) values(
  '73000000-0000-4000-8000-000000000001','plan7-restore-verifier','restore-gate','v1','Fixture License',repeat('8',64),'plan7-restore-verifier',
  repeat('9',64),repeat('a',64),repeat('b',64),'prepared',clock_timestamp(),clock_timestamp()
);
insert into public.food_ingestion_runs(
  id,batch_id,execution_mode,attempt_number,status,started_at,completed_at,manifest_content_checksum_sha256,
  observed_input_count,observed_accepted_count,observed_rejected_count,observed_created_count,observed_matched_count,
  observed_possible_duplicate_count,observed_quarantine_count,created_at,updated_at
) values(
  '73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','dry_run',1,'completed',clock_timestamp(),clock_timestamp(),repeat('a',64),
  0,0,0,0,0,0,0,clock_timestamp(),clock_timestamp()
);
insert into public.food_ingestion_reconciliations(
  id,run_id,batch_id,manifest_content_checksum_sha256,semantic_identity_checksum_sha256,
  expected_counts,observed_counts,mismatch_codes,reconciled,created_at
) values(
  '73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),
  '{"input":0,"accepted":0,"rejected":0,"matched":0,"created":0,"possibleDuplicate":0,"quarantine":0}'::jsonb,
  '{"input":0,"accepted":0,"rejected":0,"matched":0,"created":0,"possibleDuplicate":0,"quarantine":0}'::jsonb,
  '{}'::text[],true,clock_timestamp()
);
update public.food_ingestion_batches
set review_state='reviewed',reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
where id='73000000-0000-4000-8000-000000000001';
update public.food_ingestion_batches
set review_state='approved',approved_at=clock_timestamp(),approval_reference='plan7-restore-verifier',updated_at=clock_timestamp()
where id='73000000-0000-4000-8000-000000000001';
insert into public.food_ingestion_runs(
  id,batch_id,execution_mode,attempt_number,status,started_at,manifest_content_checksum_sha256,created_at,updated_at
) values(
  '73000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000001','production',1,'prepared',clock_timestamp(),repeat('a',64),clock_timestamp(),clock_timestamp()
);

set local role service_role;
select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
  'operationId','73000000-0000-4000-8000-000000000005',
  'commandChecksumSha256',repeat('5',64),
  'runId','73000000-0000-4000-8000-000000000004',
  'leaseOwner','plan7-restore-verifier-worker',
  'leaseToken','73000000-0000-4000-8000-000000000006',
  'leaseSeconds',120
));
reset role;

insert into public.food_catalog_ingestion_restore_blocks(run_id,restored_status,restored_lease_epoch)
select id,status,lease_epoch
from public.food_ingestion_runs
where id='73000000-0000-4000-8000-000000000004';

set local role service_role;
do $verify_replay_block$
begin
  begin
    perform public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
      'operationId','73000000-0000-4000-8000-000000000005',
      'commandChecksumSha256',repeat('5',64),
      'runId','73000000-0000-4000-8000-000000000004',
      'leaseOwner','plan7-restore-verifier-worker',
      'leaseToken','73000000-0000-4000-8000-000000000006',
      'leaseSeconds',120
    ));
  exception when sqlstate '55000' then
    if sqlerrm like 'Restored Food Catalog ingestion run is operationally blocked%' then
      return;
    end if;
    raise;
  end;
  raise exception 'same acquire command replay bypassed restored-run block';
end
$verify_replay_block$;
reset role;

rollback;
'''
Path('supabase/verification/food-catalog-ingestion-restore-reactivation-gate.sql').write_text(verification)

restore_helper = r'''export function buildRestoredIngestionRunBlockSql(canonicalRow) {
  const row = decodeCanonicalSegmentRow(canonicalRow);
  const runId = row.id?.text;
  const executionMode = row.execution_mode?.text;
  const status = row.status?.text;
  const leaseEpoch = row.lease_epoch?.text;
  if (executionMode !== "production" || !new Set(["prepared", "running"]).has(status)) return null;
  if (typeof runId !== "string" || !UUID.test(runId)) throw new Error("Restored ingestion block requires a valid run UUID.");
  if (typeof leaseEpoch !== "string" || !/^\d+$/u.test(leaseEpoch)) throw new Error("Restored ingestion block requires a non-negative lease epoch.");
  return `DO $plan7_restore_ingestion_block$\nBEGIN\n  INSERT INTO public.food_catalog_ingestion_restore_blocks(run_id, restored_status, restored_lease_epoch)\n  VALUES ('${runId}'::uuid, '${status}', ${leaseEpoch}::bigint)\n  ON CONFLICT (run_id) DO NOTHING;\n  IF NOT EXISTS (\n    SELECT 1 FROM public.food_catalog_ingestion_restore_blocks\n    WHERE run_id='${runId}'::uuid AND restored_status='${status}' AND restored_lease_epoch=${leaseEpoch}::bigint\n  ) THEN\n    RAISE EXCEPTION 'Plan7 conflicting restored ingestion block for run ${runId}';\n  END IF;\nEND\n$plan7_restore_ingestion_block$;`;
}

'''
replace_once(
    'scripts/restore-food-catalog-portable.mjs',
    'export function materializeRestoreLocalBindings(canonicalRow, rule, unreachableSha256 = () => randomBytes(32).toString("hex")) {',
    restore_helper + 'export function materializeRestoreLocalBindings(canonicalRow, rule, unreachableSha256 = () => randomBytes(32).toString("hex")) {'
)
restore_block_rebuild = r'''  const ingestionRunRule = rulesByRelation.get("food_ingestion_runs");
  const ingestionRunDescriptor = ingestionRunRule ? segmentsByName.get(ingestionRunRule.segment) : undefined;
  let restoredIngestionRunBlockCount = 0;
  if (ingestionRunRule && ingestionRunDescriptor) {
    for (const canonicalRow of segmentRows(materials[ingestionRunDescriptor.name] ?? "")) {
      const blockSql = buildRestoredIngestionRunBlockSql(canonicalRow);
      if (!blockSql) continue;
      runPsql(targetUrl, blockSql);
      restoredIngestionRunBlockCount += 1;
    }
  }
  evidence.restoredIngestionRunBlockCount = restoredIngestionRunBlockCount;
'''
replace_once(
    'scripts/restore-food-catalog-portable.mjs',
    '  evidence.replayLocalReferenceMappings = { foodKitchens: referenceMaps.foodKitchens.size, foodSubcategories: referenceMaps.foodSubcategories.size };',
    restore_block_rebuild + '  evidence.replayLocalReferenceMappings = { foodKitchens: referenceMaps.foodKitchens.size, foodSubcategories: referenceMaps.foodSubcategories.size };'
)

replace_once(
    'scripts/restore-food-catalog-portable.test.mjs',
    '  buildPreseedValidationSql,\n',
    '  buildPreseedValidationSql,\n  buildRestoredIngestionRunBlockSql,\n'
)
test_helper = r'''function canonicalIngestionRun({ id, executionMode, status, leaseEpoch }) {
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

'''
replace_once(
    'scripts/restore-food-catalog-portable.test.mjs',
    'describe("Plan 7 disposable restore CLI primitives", () => {',
    test_helper + 'describe("Plan 7 disposable restore CLI primitives", () => {'
)
block_tests = r'''  it("rebuilds target-local blocks only for restored active Production ingestion runs", () => {
    for (const [status, leaseEpoch, id] of [
      ["running", 9, "71000000-0000-4000-8000-000000000001"],
      ["prepared", 4, "71000000-0000-4000-8000-000000000002"],
    ]) {
      const sql = buildRestoredIngestionRunBlockSql(canonicalIngestionRun({ id, executionMode: "production", status, leaseEpoch }));
      assert.equal(typeof sql, "string");
      assert.match(sql, /food_catalog_ingestion_restore_blocks/);
      assert.match(sql, new RegExp(id));
      assert.match(sql, new RegExp(status));
      assert.match(sql, new RegExp(String(leaseEpoch)));
    }
  });

  it("does not create restore blocks for terminal or non-Production ingestion runs", () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      assert.equal(buildRestoredIngestionRunBlockSql(canonicalIngestionRun({
        id: "71000000-0000-4000-8000-000000000010",
        executionMode: "production",
        status,
        leaseEpoch: 3,
      })), null);
    }
    assert.equal(buildRestoredIngestionRunBlockSql(canonicalIngestionRun({
      id: "71000000-0000-4000-8000-000000000011",
      executionMode: "dry_run",
      status: "running",
      leaseEpoch: 3,
    })), null);
  });

'''
replace_once(
    'scripts/restore-food-catalog-portable.test.mjs',
    '  it("requires explicit acknowledgement while authorizing only loopback certification targets", () => {',
    block_tests + '  it("requires explicit acknowledgement while authorizing only loopback certification targets", () => {'
)

replace_once(
    'scripts/run-database-verification.mjs',
    '  "supabase/verification/food-catalog-owner-correction-export.sql",\n  "supabase/verification/production-release-migration-preflight.sql",',
    '  "supabase/verification/food-catalog-owner-correction-export.sql",\n  "supabase/verification/food-catalog-ingestion-restore-reactivation-gate.sql",\n  "supabase/verification/production-release-migration-preflight.sql",'
)
db_test = r'''

test("permanent verification chain covers the Plan 7 restored-ingestion reactivation gate before production preflight", () => {
  const restoreGate = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-ingestion-restore-reactivation-gate.sql",
  );
  const productionPreflight = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/production-release-migration-preflight.sql",
  );
  assert.notEqual(restoreGate, -1, "Plan 7 restored-ingestion reactivation gate must be part of canonical database verification.");
  assert.ok(restoreGate < productionPreflight, "Plan 7 restored-ingestion reactivation gate must execute before production preflight.");
});
'''
Path('scripts/run-database-verification.test.mjs').write_text(Path('scripts/run-database-verification.test.mjs').read_text() + db_test)

workflow_path = Path('.github/workflows/food-catalog-plan7-integrated-full-dr.yml')
workflow = workflow_path.read_text()
workflow_anchor = '''          psql "$PLAN7_RESTORE_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 \\
            -c "select lease_owner is null and lease_token is null and lease_expires_at is null from public.food_ingestion_runs where id='71000000-0000-4000-8000-000000000a11'::uuid" \\
            | grep '^t$'\n'''
workflow_addition = workflow_anchor + '''          psql "$PLAN7_RESTORE_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 \\
            -c "select exists(select 1 from public.food_catalog_ingestion_restore_blocks where run_id='71000000-0000-4000-8000-000000000a11'::uuid and restored_status='running' and restored_lease_epoch=3)" \\
            | grep '^t$'\n          set +e\n          psql "$PLAN7_RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 > "$RUNNER_TEMP/plan7-restored-ingestion-block.log" 2>&1 <<'SQL'\n          set role service_role;\n          select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(\n            'operationId','71000000-0000-4000-8000-000000000af1',\n            'commandChecksumSha256',repeat('f',64),\n            'runId','71000000-0000-4000-8000-000000000a11',\n            'leaseOwner','plan7-restored-worker',\n            'leaseToken','71000000-0000-4000-8000-000000000af2',\n            'leaseSeconds',120\n          ));\n          SQL\n          block_status=$?\n          set -e\n          cat "$RUNNER_TEMP/plan7-restored-ingestion-block.log"\n          test "$block_status" -ne 0\n          grep -q 'Restored Food Catalog ingestion run is operationally blocked' "$RUNNER_TEMP/plan7-restored-ingestion-block.log"\n'''
if workflow.count(workflow_anchor) != 1:
    raise SystemExit(f'integrated workflow restore anchor count={workflow.count(workflow_anchor)}')
workflow_path.write_text(workflow.replace(workflow_anchor, workflow_addition, 1))

ledger_path = Path('supabase/migration-ledger.json')
ledger = ledger_path.read_text()
ledger = ledger.replace('"pendingCount":2', '"pendingCount":3')
ledger = ledger.replace('"unresolvedCount":2', '"unresolvedCount":3')
ledger = ledger.replace(
    'Two repository-only Plan 7 migrations remain pending and unapplied: the outbox reconciliation gate and the owner correction export authority.',
    'Three repository-only Plan 7 migrations remain pending and unapplied: the outbox reconciliation gate, the owner correction export authority, and the restored-ingestion reactivation gate.'
)
owner_entry = '{"localFile":"20260915170012_food_catalog_owner_correction_export.sql","state":"pending","note":"Repository-only Plan 7 owner correction export authority migration; not applied to Production. Do not replay applied migrations."}'
new_entry = '{"localFile":"20260917170013_food_catalog_ingestion_restore_reactivation_gate.sql","state":"pending","note":"Repository-only Plan 7 restored-ingestion reactivation gate migration; not applied to Production. Do not replay applied migrations."}'
if ledger.count(owner_entry) != 1:
    raise SystemExit('migration ledger owner pending entry anchor missing')
ledger = ledger.replace(owner_entry, owner_entry + ',' + new_entry, 1)
ledger_path.write_text(ledger)

doc_path = Path('docs/architecture/migration-ledger-reconciliation.md')
doc = doc_path.read_text()
doc = doc.replace('two repository-only Plan 7 migrations are pending and unapplied', 'three repository-only Plan 7 migrations are pending and unapplied')
owner_bullet = '- `20260915170012_food_catalog_owner_correction_export.sql`: `pending` (repository-only; not applied to Production; no Production version/name)'
doc = doc.replace(owner_bullet, owner_bullet + '\n- `20260917170013_food_catalog_ingestion_restore_reactivation_gate.sql`: `pending` (repository-only; not applied to Production; no Production version/name)')
doc = doc.replace('- `pendingCount = 2`', '- `pendingCount = 3`')
doc = doc.replace('- `unresolvedCount = 2`', '- `unresolvedCount = 3`')
doc = doc.replace('Both pending Plan 7 migrations have no Production version or name because neither has been applied.', 'All three pending Plan 7 migrations have no Production version or name because none has been applied.')
doc = doc.replace('`historyRepair` remains `pending` with `pendingCount = 2`, `unresolvedCount = 2`', '`historyRepair` remains `pending` with `pendingCount = 3`, `unresolvedCount = 3`')
doc_path.write_text(doc)
