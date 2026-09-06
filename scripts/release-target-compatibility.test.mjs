import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import { deriveQualityLedgerTarget, qualityLedgerEnvironment } from "./quality-ledger-target.mjs";
import { deriveReleaseReadyTarget, deriveReleaseTarget } from "./release-identity-contract.mjs";
import { evaluateReleasePreflight } from "./release-preflight.mjs";

const PLAN5_MIGRATION = "20260906183000_food_catalog_search_projection_v2.sql";
const ledger = JSON.parse(
  readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"),
);

test("release consumers preserve the declared marker after Plan 5 reconciliation", () => {
  const releaseTarget = deriveReleaseTarget(ledger);
  const releaseReadyTarget = deriveReleaseReadyTarget(ledger);
  const qualityTarget = deriveQualityLedgerTarget(ledger);
  const environment = qualityLedgerEnvironment(qualityTarget);
  const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
  const plan5 = ledger.entries.find((entry) => entry.localFile === PLAN5_MIGRATION);

  assert.equal(releaseTarget.expectedMigration, "20260724232734");
  assert.equal(releaseTarget.latestAppliedMigrationVersion, "20260906200129");
  assert.equal(releaseTarget.schemaCompatibilityVersion, "2");
  assert.equal(releaseTarget.reconciliationState, "reconciled");
  assert.deepEqual(pendingEntries, []);
  assert.equal(plan5.state, "applied_version_alias");
  assert.equal(plan5.productionVersion, "20260906200129");
  assert.equal(plan5.productionName, "food_catalog_search_projection_v2");
  assert.equal(ledger.pendingCount, 0);
  assert.equal(releaseTarget.pendingCount, 0);
  assert.equal(releaseTarget.schemaAppliedUntrackedCount, 0);
  assert.equal(releaseTarget.unresolvedCount, 0);
  assert.equal(releaseTarget.releaseReady, true);
  assert.deepEqual(releaseReadyTarget, releaseTarget);
  assert.equal(qualityTarget.expectedMigration, releaseTarget.expectedMigration);
  assert.equal(
    qualityTarget.latestAppliedMigrationVersion,
    releaseTarget.latestAppliedMigrationVersion,
  );
  assert.equal(qualityTarget.reconciliationState, "reconciled");
  assert.equal(qualityTarget.pendingCount, 0);
  assert.equal(qualityTarget.unresolvedCount, 0);
  assert.equal(qualityTarget.releaseReady, true);
  assert.equal(
    environment.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION,
    releaseTarget.expectedMigration,
  );
  assert.equal(environment.PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE, "reconciled");
  assert.equal(environment.PLAIVRA_PENDING_MIGRATION_COUNT, "0");
  assert.equal(environment.PLAIVRA_UNRESOLVED_MIGRATION_COUNT, "0");
  assert.notEqual(releaseTarget.expectedMigration, releaseTarget.latestAppliedMigrationVersion);
});

test("preflight validates the declared marker after Plan 5 reconciliation", () => {
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
  assert.equal(markerResult.failures.includes("migration_ledger_not_reconciled"), false);
  assert.equal(markerResult.releaseBlockers.includes("migration_ledger_not_reconciled"), false);

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
