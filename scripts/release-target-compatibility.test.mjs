import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import { deriveQualityLedgerTarget, qualityLedgerEnvironment } from "./quality-ledger-target.mjs";
import { deriveReleaseReadyTarget, deriveReleaseTarget } from "./release-identity-contract.mjs";
import { evaluateReleasePreflight } from "./release-preflight.mjs";

const PLAN5_MIGRATION = "20260906183000_food_catalog_search_projection_v2.sql";
const PLAN5_SERVING_CORRECTION = "20260907165500_food_catalog_search_serving_semantics_correction.sql";
const PLAN6_MIGRATION = "20260908100000_food_catalog_governance_control_plane.sql";
const PLAN6_EXACTNESS_CORRECTION = "20260909083000_food_catalog_governance_gtin_lock_exactness.sql";
const PLAN7_PENDING_MIGRATION = "20260915170011_food_catalog_governance_outbox_reconciliation_gate.sql";
const PLAN7_OWNER_EXPORT_MIGRATION = "20260915170012_food_catalog_owner_correction_export.sql";
const PLAN7_RESTORE_REACTIVATION_MIGRATION = "20260917023000_food_catalog_ingestion_restore_reactivation_gate.sql";
const PLAN7_OWNER_OVERRIDE_READ_AUTHORITY_MIGRATION = "20260919034630_food_catalog_owner_override_read_authority.sql";
const ledger = JSON.parse(
  readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"),
);

function reconciledLedgerFixture(source) {
  return {
    ...structuredClone(source),
    pendingCount: 0,
    unresolvedCount: 0,
    historyRepair: {
      ...structuredClone(source.historyRepair),
      state: "reconciled",
      pendingCount: 0,
      unresolvedCount: 0,
    },
    entries: source.entries.filter((entry) => entry.state !== "pending").map((entry) => structuredClone(entry)),
  };
}

test("release consumers preserve the declared marker while the Plan 7 repository migration blocks release readiness", () => {
  const releaseTarget = deriveReleaseTarget(ledger);
  const qualityTarget = deriveQualityLedgerTarget(ledger);
  const environment = qualityLedgerEnvironment(qualityTarget);
  const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
  const plan5 = ledger.entries.find((entry) => entry.localFile === PLAN5_MIGRATION);
  const correction = ledger.entries.find((entry) => entry.localFile === PLAN5_SERVING_CORRECTION);
  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION);
  const plan6Correction = ledger.entries.find((entry) => entry.localFile === PLAN6_EXACTNESS_CORRECTION);

  assert.equal(releaseTarget.expectedMigration, "20260724232734");
  assert.equal(releaseTarget.latestAppliedMigrationVersion, "20260910071241");
  assert.equal(releaseTarget.schemaCompatibilityVersion, "2");
  assert.equal(releaseTarget.reconciliationState, "pending");
  assert.deepEqual(pendingEntries.map((entry) => entry.localFile), [PLAN7_PENDING_MIGRATION, PLAN7_OWNER_EXPORT_MIGRATION, PLAN7_RESTORE_REACTIVATION_MIGRATION, PLAN7_OWNER_OVERRIDE_READ_AUTHORITY_MIGRATION]);
  for (const pendingEntry of pendingEntries) {
    assert.equal(pendingEntry.productionVersion, undefined);
    assert.equal(pendingEntry.productionName, undefined);
  }
  assert.equal(plan5.state, "applied_version_alias");
  assert.equal(correction.state, "applied_version_alias");
  assert.equal(plan6.state, "applied_version_alias");
  assert.equal(plan6.productionVersion, "20260909081402");
  assert.equal(plan6.productionName, "food_catalog_governance_control_plane");
  assert.equal(plan6Correction.state, "applied_version_alias");
  assert.equal(plan6Correction.productionVersion, "20260910071241");
  assert.equal(plan6Correction.productionName, "food_catalog_governance_gtin_lock_exactness");
  assert.equal(ledger.pendingCount, 4);
  assert.equal(releaseTarget.pendingCount, 4);
  assert.equal(releaseTarget.schemaAppliedUntrackedCount, 0);
  assert.equal(releaseTarget.unresolvedCount, 4);
  assert.equal(releaseTarget.releaseReady, false);
  assert.throws(() => deriveReleaseReadyTarget(ledger), /Migration ledger is not release-ready/);
  assert.equal(qualityTarget.expectedMigration, releaseTarget.expectedMigration);
  assert.equal(qualityTarget.latestAppliedMigrationVersion, releaseTarget.latestAppliedMigrationVersion);
  assert.equal(qualityTarget.reconciliationState, "pending");
  assert.equal(qualityTarget.pendingCount, 4);
  assert.equal(qualityTarget.unresolvedCount, 4);
  assert.equal(qualityTarget.releaseReady, false);
  assert.equal(environment.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION, releaseTarget.expectedMigration);
  assert.equal(environment.PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE, "pending");
  assert.equal(environment.PLAIVRA_PENDING_MIGRATION_COUNT, "4");
  assert.equal(environment.PLAIVRA_UNRESOLVED_MIGRATION_COUNT, "4");
  assert.notEqual(releaseTarget.expectedMigration, releaseTarget.latestAppliedMigrationVersion);
});

test("preflight preserves the declared compatibility marker and fails closed on the pending migration ledger", () => {
  const expectedCommit = "a".repeat(40);
  const releaseTarget = deriveReleaseTarget(ledger);
  const migrationState = deriveMigrationLedgerState(ledger);
  const manifest = {
    release: {
      commitSha: expectedCommit,
      buildTimestamp: new Date().toISOString(),
      expectedDatabaseMigrationVersion: releaseTarget.expectedMigration,
      migrationLedgerReconciliationState: migrationState.reconciliationState,
      pendingMigrationCount: migrationState.pendingCount,
      schemaAppliedUntrackedCount: migrationState.schemaAppliedUntrackedCount,
      unresolvedMigrationCount: migrationState.unresolvedCount,
    },
    runtime: { nextVersion: "16.2.11" },
    qualityGates: {},
  };
  const input = {
    mode: "release",
    expectedCommit,
    checkedOutCommit: expectedCommit,
    expectedRepository: "ahmedmohameda7222-ship-it/gymsands",
    remoteUrl: "https://github.com/ahmedmohameda7222-ship-it/gymsands.git",
    packageJson: { engines: { node: "24.x" } },
    nodeVersion: "v24.18.0",
    nvmVersion: "24",
    nodeFileVersion: "24",
    installedNextVersion: "16.2.11",
    migrationState,
    releaseTarget,
    artifactFailures: [],
    manifest,
  };

  const result = evaluateReleasePreflight(input);
  assert.equal(result.failures.includes("release_manifest_migration_mismatch"), false);
  assert.equal(result.failures.includes("migration_ledger_not_reconciled"), true);
  assert.equal(result.releaseBlockers.includes("migration_ledger_not_reconciled"), true);
});

test("reconciled fixtures still prove marker-versus-physical-head semantics", () => {
  const reconciledLedger = reconciledLedgerFixture(ledger);
  const expectedCommit = "a".repeat(40);
  const releaseTarget = deriveReleaseReadyTarget(reconciledLedger);
  const migrationState = deriveMigrationLedgerState(reconciledLedger);
  const manifest = {
    release: {
      commitSha: expectedCommit,
      buildTimestamp: new Date().toISOString(),
      expectedDatabaseMigrationVersion: releaseTarget.expectedMigration,
      migrationLedgerReconciliationState: migrationState.reconciliationState,
      pendingMigrationCount: migrationState.pendingCount,
      schemaAppliedUntrackedCount: migrationState.schemaAppliedUntrackedCount,
      unresolvedMigrationCount: migrationState.unresolvedCount,
    },
    runtime: { nextVersion: "16.2.11" },
    qualityGates: {},
  };
  const baseInput = {
    mode: "release",
    expectedCommit,
    checkedOutCommit: expectedCommit,
    expectedRepository: "ahmedmohameda7222-ship-it/gymsands",
    remoteUrl: "https://github.com/ahmedmohameda7222-ship-it/gymsands.git",
    packageJson: { engines: { node: "24.x" } },
    nodeVersion: "v24.18.0",
    nvmVersion: "24",
    nodeFileVersion: "24",
    installedNextVersion: "16.2.11",
    migrationState,
    releaseTarget,
    artifactFailures: [],
  };

  const markerResult = evaluateReleasePreflight({ ...baseInput, manifest });
  assert.equal(markerResult.failures.includes("release_manifest_migration_mismatch"), false);
  assert.equal(markerResult.failures.includes("migration_ledger_not_reconciled"), false);
  assert.equal(markerResult.releaseBlockers.includes("migration_ledger_not_reconciled"), false);

  const physicalHeadResult = evaluateReleasePreflight({
    ...baseInput,
    manifest: {
      ...manifest,
      release: { ...manifest.release, expectedDatabaseMigrationVersion: releaseTarget.latestAppliedMigrationVersion },
    },
  });
  assert.equal(physicalHeadResult.failures.includes("release_manifest_migration_mismatch"), true);
  assert.equal(physicalHeadResult.failures.includes("migration_ledger_not_reconciled"), false);
  assert.equal(physicalHeadResult.releaseBlockers.includes("migration_ledger_not_reconciled"), false);
});

test("release authority fails closed when the declared marker is absent", () => {
  const entries = ledger.entries.filter(
    (entry) => entry.productionVersion !== "20260724232734",
  );

  assert.throws(
    () => deriveReleaseTarget({ ...ledger, entries }),
    /database marker is not a resolved production migration/,
  );
});
