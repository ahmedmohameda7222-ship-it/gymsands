import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTIVITY_CATALOG_PROJECT_REF,
  APPLY_CONFIRMATION,
  EXPECTED_CURRENT_MARKER,
  PLAIVRA_PROJECT_REF,
  TARGET_MARKER,
  executeCompatibilityPromotion,
  validatePromotionRequest,
} from "./promote-release-schema-compatibility.mjs";

const reviewedCommit = "1111111111111111111111111111111111111111";
const currentLedger = JSON.parse(readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"));
const ledger = structuredClone(currentLedger);
const laterProductionVersions = new Set(["20260721224813", "20260722093115"]);
ledger.entries = ledger.entries.filter((entry) => !laterProductionVersions.has(entry.productionVersion));
ledger.historyRepair.note = "AW-2A release-promotion fixture reconciled through 20260721012814. Do not replay any applied migration.";

function successfulPreflight(overrides = {}) {
  return {
    checkedAt: "2026-07-21T16:00:00.000Z",
    ready: true,
    releaseReady: true,
    qualityArtifactValid: true,
    expectedCommit: reviewedCommit,
    expectedDatabaseMigrationVersion: TARGET_MARKER,
    migrationLedgerReconciliationState: "reconciled",
    pendingMigrationCount: 0,
    schemaAppliedUntrackedCount: 0,
    unresolvedMigrationCount: 0,
    qualityRunId: "12345",
    failures: [],
    artifactFailures: [],
    validationContext: "stage1-infrastructure-validation",
    productionPromotionAuthorized: false,
    deploymentPerformed: false,
    productionMutationPerformed: false,
    ...overrides,
  };
}

function adapter(initial = {
  singleton: true,
  version: "2",
  migration_version: EXPECTED_CURRENT_MARKER,
  applied_at: "2026-07-21T00:00:00.000Z",
}) {
  let row = { ...initial };
  const writes = [];
  return {
    writes,
    async readCompatibility() { return { ...row }; },
    async compareAndSet(request) {
      writes.push({ ...request });
      row = {
        ...row,
        migration_version: request.targetMarker,
        applied_at: "2026-07-21T16:30:00.000Z",
      };
      return { updatedRows: 1, row: { ...row } };
    },
  };
}

function validRequest(overrides = {}) {
  return {
    mode: "dry-run",
    projectRef: PLAIVRA_PROJECT_REF,
    reviewedCommit,
    expectedCurrentMarker: EXPECTED_CURRENT_MARKER,
    targetMarker: TARGET_MARKER,
    ledger,
    preflightEvidence: successfulPreflight(),
    confirmation: undefined,
    adapter: adapter(),
    now: () => new Date("2026-07-21T16:45:00.000Z"),
    ...overrides,
  };
}

test("dry-run performs all checks and no write", async () => {
  const fake = adapter();
  const evidence = await executeCompatibilityPromotion(validRequest({ adapter: fake }));
  assert.equal(fake.writes.length, 0);
  assert.equal(evidence.mode, "dry-run");
  assert.equal(evidence.updatedRows, 0);
  assert.equal(evidence.productionWritePerformed, false);
  assert.equal(evidence.before.migration_version, EXPECTED_CURRENT_MARKER);
  assert.deepEqual(evidence.after, evidence.before);
});

test("rejects wrong and Activity Catalog project refs", () => {
  assert.throws(() => validatePromotionRequest({
    ...validRequest(),
    projectRef: "unexpected-project-ref",
  }), /Unexpected Supabase project ref/);
  assert.throws(() => validatePromotionRequest({
    ...validRequest(),
    projectRef: ACTIVITY_CATALOG_PROJECT_REF,
  }), /Activity Catalog promotion is forbidden/);
});

test("rejects wrong current and target markers", () => {
  assert.throws(() => validatePromotionRequest({
    ...validRequest(),
    expectedCurrentMarker: "20260717051012",
  }), new RegExp(EXPECTED_CURRENT_MARKER));
  assert.throws(() => validatePromotionRequest({
    ...validRequest(),
    targetMarker: "20260721012815",
  }), new RegExp(TARGET_MARKER));
});

test("rejects a target that is not the reconciled ledger head", () => {
  const driftedLedger = structuredClone(ledger);
  driftedLedger.entries = driftedLedger.entries.filter((entry) => entry.productionVersion !== TARGET_MARKER);
  driftedLedger.productionMigrationCount -= 1;
  assert.throws(() => validatePromotionRequest({
    ...validRequest(),
    ledger: driftedLedger,
  }), /Target marker does not equal the latest reconciled applied migration/);
});

test("rejects unsuccessful or mismatched preflight evidence", () => {
  for (const preflightEvidence of [
    successfulPreflight({ ready: false }),
    successfulPreflight({ expectedCommit: "2222222222222222222222222222222222222222" }),
    successfulPreflight({ expectedDatabaseMigrationVersion: "20260721012813" }),
    successfulPreflight({ artifactFailures: ["tampered"] }),
  ]) {
    assert.throws(() => validatePromotionRequest({ ...validRequest(), preflightEvidence }));
  }
});

test("rejects an unexpected current database marker", async () => {
  await assert.rejects(
    () => executeCompatibilityPromotion(validRequest({
      adapter: adapter({
        singleton: true,
        version: "2",
        migration_version: "20260717051010",
        applied_at: "2026-07-21T00:00:00.000Z",
      }),
    })),
    /Current compatibility marker mismatch/,
  );
});

test("apply requires explicit confirmation", async () => {
  await assert.rejects(
    () => executeCompatibilityPromotion(validRequest({
      mode: "apply",
      preflightEvidence: successfulPreflight({
        validationContext: "production-marker-promotion-authorization",
        productionPromotionAuthorized: true,
      }),
    })),
    new RegExp(APPLY_CONFIRMATION),
  );
});

test("apply rejects Stage-1-only preflight evidence", async () => {
  await assert.rejects(
    () => executeCompatibilityPromotion(validRequest({
      mode: "apply",
      confirmation: APPLY_CONFIRMATION,
    })),
    /Production marker-promotion authorization evidence/,
  );
});

test("compare-and-set zero and multiple row results fail closed", async () => {
  for (const updatedRows of [0, 2]) {
    const fake = adapter();
    fake.compareAndSet = async () => ({ updatedRows, row: null });
    await assert.rejects(
      () => executeCompatibilityPromotion(validRequest({
        mode: "apply",
        confirmation: APPLY_CONFIRMATION,
        preflightEvidence: successfulPreflight({
          validationContext: "production-marker-promotion-authorization",
          productionPromotionAuthorized: true,
        }),
        adapter: fake,
      })),
      /expected exactly 1/,
    );
  }
});

test("apply changes only marker and applied timestamp", async () => {
  const fake = adapter();
  const evidence = await executeCompatibilityPromotion(validRequest({
    mode: "apply",
    confirmation: APPLY_CONFIRMATION,
    preflightEvidence: successfulPreflight({
      validationContext: "production-marker-promotion-authorization",
      productionPromotionAuthorized: true,
    }),
    adapter: fake,
  }));
  assert.equal(fake.writes.length, 1);
  assert.deepEqual(Object.keys(fake.writes[0]).sort(), ["expectedCurrentMarker", "schemaVersion", "targetMarker"]);
  assert.equal(evidence.before.singleton, evidence.after.singleton);
  assert.equal(evidence.before.version, evidence.after.version);
  assert.equal(evidence.after.migration_version, TARGET_MARKER);
  assert.notEqual(evidence.before.applied_at, evidence.after.applied_at);
  assert.equal(evidence.updatedRows, 1);
  assert.equal(evidence.productionWritePerformed, true);
});

test("redacted evidence contains no credentials or secret values", async () => {
  const evidence = await executeCompatibilityPromotion(validRequest());
  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes("postgresql://"), false);
  assert.equal(serialized.toLowerCase().includes("password"), false);
  assert.equal(serialized.toLowerCase().includes("service_role"), false);
  assert.equal(evidence.credentialsRedacted, true);
});
