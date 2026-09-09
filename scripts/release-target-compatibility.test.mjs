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
const ledger = JSON.parse(
  readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"),
);

test("release consumers preserve the declared marker and block release during Plan 6 drift review and pending exactness correction", () => {
  const releaseTarget = deriveReleaseTarget(ledger);
  const qualityTarget = deriveQualityLedgerTarget(ledger);
  const environment = qualityLedgerEnvironment(qualityTarget);
  const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
  const plan5 = ledger.entries.find((entry) => entry.localFile === PLAN5_MIGRATION);
  const correction = ledger.entries.find((entry) => entry.localFile === PLAN5_SERVING_CORRECTION);
  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION);
  const plan6Correction = ledger.entries.find((entry) => entry.localFile === PLAN6_EXACTNESS_CORRECTION);

  assert.equal(releaseTarget.expectedMigration, "20260724232734");
  assert.equal(releaseTarget.latestAppliedMigrationVersion, "20260907215257");
  assert.equal(releaseTarget.schemaCompatibilityVersion, "2");
  assert.equal(releaseTarget.reconciliationState, "pending");
  assert.equal(pendingEntries.length, 1);
  assert.equal(plan5.state, "applied_version_alias");
  assert.equal(plan5.productionVersion, "20260906200129");
  assert.equal(plan5.productionName, "food_catalog_search_projection_v2");
  assert.equal(correction.state, "applied_version_alias");
  assert.equal(correction.productionVersion, "20260907215257");
  assert.equal(correction.productionName, "food_catalog_search_serving_semantics_correction");
  assert.equal(plan6.state, "ledger_drift_review");
  assert.equal(plan6.productionVersion, "20260909081402");
  assert.equal(plan6.productionName, "food_catalog_governance_control_plane");
  assert.equal(plan6Correction.state, "pending");
  assert.equal(plan6Correction.productionVersion, undefined);
  assert.equal(pendingEntries[0].localFile, PLAN6_EXACTNESS_CORRECTION);
  assert.equal(ledger.pendingCount, 1);
  assert.equal(releaseTarget.pendingCount, 1);
  assert.equal(releaseTarget.schemaAppliedUntrackedCount, 0);
  assert.equal(releaseTarget.unresolvedCount, 2);
  assert.equal(releaseTarget.releaseReady, false);
  assert.throws(() => deriveReleaseReadyTarget(ledger), /not release-ready/);
  assert.equal(qualityTarget.expectedMigration, releaseTarget.expectedMigration);
  assert.equal(
    qualityTarget.latestAppliedMigrationVersion,
    releaseTarget.latestAppliedMigrationVersion,
  );
  assert.equal(qualityTarget.reconciliationState, "pending");
  assert.equal(qualityTarget.pendingCount, 1);
  assert.equal(qualityTarget.unresolvedCount, 2);
  assert.equal(qualityTarget.releaseReady, false);
  assert.equal(
    environment.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION,
    releaseTarget.expectedMigration,
  );
  assert.equal(environment.PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE, "pending");
  assert.equal(environment.PLAIVRA_PENDING_MIGRATION_COUNT, "1");
  assert.equal(environment.PLAIVRA_UNRESOLVED_MIGRATION_COUNT, "2");
  assert.notEqual(releaseTarget.expectedMigration, releaseTarget.latestAppliedMigrationVersion);
});

test("preflight preserves the declared marker but blocks release while Plan 6 reconciliation remains unresolved", () => {
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
  assert.equal(markerResult.failures.includes("migration_ledger_not_reconciled"), true);
  assert.equal(markerResult.releaseBlockers.includes("migration_ledger_not_reconciled"), true);

  const physicalHeadResult = evaluateReleasePreflight({
    ...baseInput,
    manifest: {
      ...manifest,
      release: {
        ...manifest.release,
        expectedDatabaseMigrationVersion: releaseTarget.latestAppliedMigrationVersion,
      },
    },
  });
  assert.equal(physicalHeadResult.failures.includes("release_manifest_migration_mismatch"), true);
  assert.equal(physicalHeadResult.failures.includes("migration_ledger_not_reconciled"), true);
  assert.equal(physicalHeadResult.releaseBlockers.includes("migration_ledger_not_reconciled"), true);
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
