import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import { deriveQualityLedgerTarget, qualityLedgerEnvironment } from "./quality-ledger-target.mjs";
import { deriveReleaseReadyTarget, deriveReleaseTarget } from "./release-identity-contract.mjs";
import { evaluateReleasePreflight } from "./release-preflight.mjs";

const PLAN4_MIGRATION = "20260904100000_food_catalog_ingestion_v2_authority.sql";
const PLAN5_MIGRATION = "20260906183000_food_catalog_search_projection_v2.sql";
const ledger = JSON.parse(
  readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"),
);

test("release consumers preserve the declared marker and fail closed while Plan 5 is pending", () => {
  const releaseTarget = deriveReleaseTarget(ledger);
  const qualityTarget = deriveQualityLedgerTarget(ledger);
  const environment = qualityLedgerEnvironment(qualityTarget);
  const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
  const plan4 = ledger.entries.find((entry) => entry.localFile === PLAN4_MIGRATION);

  assert.equal(releaseTarget.expectedMigration, "20260724232734");
  assert.equal(releaseTarget.latestAppliedMigrationVersion, "20260906131808");
  assert.equal(releaseTarget.schemaCompatibilityVersion, "2");
  assert.equal(releaseTarget.reconciliationState, "pending");
  assert.deepEqual(pendingEntries.map((entry) => entry.localFile), [PLAN5_MIGRATION]);
  assert.equal(plan4.state, "applied_version_alias");
  assert.equal(plan4.productionVersion, "20260906131808");
  assert.equal(plan4.productionName, "food_catalog_ingestion_v2_authority");
  assert.equal(ledger.pendingCount, 1);
  assert.equal(releaseTarget.pendingCount, 1);
  assert.equal(releaseTarget.schemaAppliedUntrackedCount, 0);
  assert.equal(releaseTarget.unresolvedCount, 1);
  assert.equal(releaseTarget.releaseReady, false);
  assert.throws(() => deriveReleaseReadyTarget(ledger), /not release-ready/i);
  assert.equal(qualityTarget.expectedMigration, releaseTarget.expectedMigration);
  assert.equal(
    qualityTarget.latestAppliedMigrationVersion,
    releaseTarget.latestAppliedMigrationVersion,
  );
  assert.equal(qualityTarget.reconciliationState, "pending");
  assert.equal(qualityTarget.pendingCount, 1);
  assert.equal(qualityTarget.unresolvedCount, 1);
  assert.equal(qualityTarget.releaseReady, false);
  assert.equal(
    environment.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION,
    releaseTarget.expectedMigration,
  );
  assert.equal(environment.PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE, "pending");
  assert.equal(environment.PLAIVRA_PENDING_MIGRATION_COUNT, "1");
  assert.equal(environment.PLAIVRA_UNRESOLVED_MIGRATION_COUNT, "1");
  assert.notEqual(releaseTarget.expectedMigration, releaseTarget.latestAppliedMigrationVersion);
});

test("preflight validates the declared marker but blocks release while Plan 5 is pending", () => {
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
