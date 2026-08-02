import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deriveQualityLedgerTarget, qualityLedgerEnvironment } from "./quality-ledger-target.mjs";
import { deriveReleaseReadyTarget, deriveReleaseTarget } from "./release-identity-contract.mjs";

const ledger = JSON.parse(
  readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"),
);

test("all release target consumers use the declared compatibility marker", () => {
  const releaseTarget = deriveReleaseTarget(ledger);
  const readyTarget = deriveReleaseReadyTarget(ledger);
  const qualityTarget = deriveQualityLedgerTarget(ledger);
  const environment = qualityLedgerEnvironment(qualityTarget);

  assert.equal(releaseTarget.expectedMigration, "20260724232734");
  assert.equal(releaseTarget.latestAppliedMigrationVersion, "20260802114733");
  assert.equal(releaseTarget.schemaCompatibilityVersion, "2");
  assert.equal(readyTarget.expectedMigration, releaseTarget.expectedMigration);
  assert.equal(qualityTarget.expectedMigration, releaseTarget.expectedMigration);
  assert.equal(
    qualityTarget.latestAppliedMigrationVersion,
    releaseTarget.latestAppliedMigrationVersion,
  );
  assert.equal(
    environment.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION,
    releaseTarget.expectedMigration,
  );
  assert.notEqual(releaseTarget.expectedMigration, releaseTarget.latestAppliedMigrationVersion);
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
