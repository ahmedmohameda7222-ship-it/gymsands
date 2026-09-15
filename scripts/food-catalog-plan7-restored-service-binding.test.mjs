import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sourcePrincipalId = "71000000-0000-4000-8000-000000000d10";
const sourceIdentity = "plan7-source-service-identity";
const gateMigrationPath = "supabase/migrations/20260915120000_food_catalog_governance_outbox_reconciliation_gate.sql";

describe("Plan 7 restored Service execution binding", () => {
  it("materializes an unreachable restore-local SHA-256 only for Service rows", async () => {
    const restore = await import("./restore-food-catalog-portable.mjs");
    assert.equal(typeof restore.materializeRestoreLocalBindings, "function");

    const serviceRow = JSON.stringify([
      ["id", "uuid", sourcePrincipalId],
      ["principal_type", "text", "service"],
      ["service_identity_sha256", "text", null],
      ["subject_id", "text", "plan7-portability-service"],
    ]);
    const humanRow = JSON.stringify([
      ["id", "uuid", "71000000-0000-4000-8000-000000000002"],
      ["principal_type", "text", "human"],
      ["service_identity_sha256", "text", null],
      ["subject_id", "text", "71000000-0000-4000-8000-000000000001"],
    ]);
    const rule = {
      relation: "food_catalog_governance_principals",
      restoreLocalBindings: [{
        column: "service_identity_sha256",
        discriminatorColumn: "principal_type",
        discriminatorValue: "service",
        strategy: "UNREACHABLE_SHA256",
      }],
    };
    const deterministic = () => "9".repeat(64);
    const materializedService = restore.materializeRestoreLocalBindings(serviceRow, rule, deterministic);
    const materializedHuman = restore.materializeRestoreLocalBindings(humanRow, rule, deterministic);
    const serviceDigest = JSON.parse(materializedService).find(([column]) => column === "service_identity_sha256")[2];
    const humanDigest = JSON.parse(materializedHuman).find(([column]) => column === "service_identity_sha256")[2];
    assert.equal(serviceDigest, "9".repeat(64));
    assert.equal(humanDigest, null);
  });

  it("uses a realistic source Service identity whose digest is portable-neutralized rather than copied", () => {
    const fixture = readFileSync("supabase/verification/food-catalog-plan7-portability-governance-outbox-fixture.sql", "utf8");
    assert.match(fixture, new RegExp(sourceIdentity));
    assert.match(fixture, /extensions\.digest\(convert_to\([^)]*plan7-source-service-identity[^)]*UTF8[^)]*\)[\s\S]*sha256/i);
    assert.doesNotMatch(fixture, /service_identity_sha256[\s\S]{0,240}repeat\('7',64\)/i);
  });

  it("uses the canonical governance operation ledger as the durable rebind/reconciliation gate without schema expansion", () => {
    const migration = readFileSync(gateMigrationPath, "utf8");

    assert.doesNotMatch(migration, /\bcreate\s+table\b/i);
    assert.doesNotMatch(migration, /\balter\s+table\b[\s\S]{0,120}\badd\s+(?:column\s+)?/i);
    assert.match(migration, /create or replace function public\.food_catalog_manage_governance_principal/i);
    assert.match(migration, /'serviceBindingChanged',v_service_binding_changed/);
    assert.match(migration, /'serviceBindingOperationId',p_operation_id/);
    assert.match(migration, /'serviceBindingGeneration',v_service_binding_generation/);
    assert.match(migration, /command_name='food_catalog_manage_governance_principal'/);
    assert.match(migration, /completed_at is not null/);

    assert.match(migration, /create or replace function public\.food_catalog_complete_governance_outbox_reconciliation/i);
    assert.match(migration, /'food\.governance\.manage_principals'/);
    assert.match(migration, /assignment\.capability='food\.outbox\.deliver'/);
    assert.match(migration, /private\.food_catalog_governance_begin_operation/);
    assert.match(migration, /private\.food_catalog_governance_finish_operation/);
    assert.match(migration, /'targetPrincipalId',v_target/);
    assert.match(migration, /'serviceBindingOperationId',v_binding_operation_id/);
    assert.match(migration, /'serviceBindingGeneration',v_binding_generation/);

    assert.match(migration, /create or replace function private\.food_catalog_governance_assert_outbox_reconciliation_ready/i);
    assert.match(migration, /command_name='food_catalog_complete_governance_outbox_reconciliation'/);
    assert.match(migration, /raise exception 'Food governance outbox delivery is unavailable until replay reconciliation completes for the current Service binding\.'/);

    const claimGateCalls = migration.match(/perform private\.food_catalog_governance_assert_outbox_reconciliation_ready\(v_actor\);/g) ?? [];
    assert.equal(claimGateCalls.length, 2, "claim and finish must both enforce current-binding reconciliation readiness");
    assert.match(migration, /grant execute on function public\.food_catalog_complete_governance_outbox_reconciliation\(uuid,uuid,text\) to authenticated/);
    assert.match(migration, /grant execute on function public\.food_catalog_claim_governance_outbox\(uuid,integer\) to service_role/);
    assert.match(migration, /grant execute on function public\.food_catalog_finish_governance_outbox\(uuid,uuid,boolean,text,integer\) to service_role/);
  });

  it("proves the rebound Service stays blocked until reconciliation, then preserves Plan 6 lease fencing without durable test mutation", () => {
    const capture = readFileSync("scripts/capture-food-catalog-restored-service-authority.mjs", "utf8");
    for (const field of [
      "sourceServiceIdentityRejected",
      "authenticatedClaimRejected",
      "randomServiceIdentityRejected",
      "principalHistoryPreserved",
      "capabilityHistoryPreserved",
      "outboxPendingUnclaimed",
      "targetServiceRebound",
      "reboundServiceRejectedBeforeReconciliation",
      "pendingBeforeReconciliation",
      "reconciliationReplayIdempotent",
      "leaseAndFencingSemanticsIntact",
      "historyIntactAfterReconciliation",
      "proofTransactionRolledBack",
      "serviceExecutionBindingUnavailableImmediatelyAfterRestore",
      "automaticDeliveryObservedBeforeReconciliation",
      "deliveryAvailableAfterReconciliation",
    ]) assert.match(capture, new RegExp(field));

    assert.match(capture, /food_catalog_manage_governance_principal/);
    assert.match(capture, /food_catalog_complete_governance_outbox_reconciliation/);
    assert.match(capture, /Plan7 rebound Service unexpectedly claimed before reconciliation/);
    assert.match(capture, /attemptCount'\)::integer<>5/);
    assert.match(capture, /leaseEpoch'\)::bigint<>10/);
    assert.match(capture, /exception when serialization_failure/);
    assert.match(capture, /raise exception 'rollback successful Plan7 lease proof' using errcode='PZ701'/);
    assert.match(capture, /not exists\([\s\S]*operation_id in \('\$\{TARGET_REBIND_OPERATION_ID\}'::uuid,'\$\{RECONCILIATION_OPERATION_ID\}'::uuid\)/);
  });

  it("keeps the integrated FULL_DR chain responsible for dynamic restored-Service authority proof", () => {
    const workflow = readFileSync(".github/workflows/food-catalog-plan7-integrated-full-dr.yml", "utf8");
    const step = workflow.match(/- name: Prove restored source Service execution binding is unavailable[\s\S]*?- name: Capture restored target RLS ACL identity/)?.[0] ?? "";
    assert.match(step, /capture-food-catalog-restored-service-authority\.mjs/);
    assert.match(step, new RegExp(sourceIdentity));
    assert.match(step, /sourceServiceIdentityRejected/);
    assert.match(step, /authenticatedClaimRejected/);
    assert.match(step, /randomServiceIdentityRejected/);
    assert.match(step, /principalHistoryPreserved/);
    assert.match(step, /capabilityHistoryPreserved/);
    assert.match(step, /outboxPendingUnclaimed/);
    assert.match(step, /serviceExecutionBindingUnavailable/);
    assert.match(step, /automaticDeliveryObserved/);
  });
});
