import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveReleaseCompatibilityContract } from "../lib/release/compatibility-contract.mjs";

const PLAN4_MIGRATION = "20260904100000_food_catalog_ingestion_v2_authority.sql";
const ledger = JSON.parse(
  readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"),
);
const contract = JSON.parse(
  readFileSync(new URL("../config/release-compatibility.json", import.meta.url), "utf8"),
);

test("declared database marker remains distinct from the reconciled Plan 4 physical head", () => {
  const resolved = resolveReleaseCompatibilityContract({ ledger, contract });
  const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
  const plan4 = ledger.entries.find((entry) => entry.localFile === PLAN4_MIGRATION);

  assert.equal(resolved.schemaCompatibilityVersion, "2");
  assert.equal(resolved.expectedDatabaseMigrationVersion, "20260724232734");
  assert.equal(resolved.latestAppliedMigrationVersion, "20260906131808");
  assert.ok(
    resolved.latestAppliedMigrationVersion.localeCompare(resolved.expectedDatabaseMigrationVersion) > 0,
    "fixture must prove that compatible physical migrations may be newer than the release marker",
  );
  assert.equal(pendingEntries.length, 0);
  assert.equal(plan4.state, "applied_version_alias");
  assert.equal(plan4.productionVersion, "20260906131808");
  assert.equal(plan4.productionName, "food_catalog_ingestion_v2_authority");
  assert.equal(resolved.migrationLedgerReconciliationState, "reconciled");
  assert.equal(ledger.pendingCount, 0);
  assert.equal(resolved.pendingMigrationCount, 0);
  assert.equal(resolved.schemaAppliedUntrackedCount, 0);
  assert.equal(resolved.unresolvedMigrationCount, 0);
});

test("Next build metadata preserves the declared marker and exposes reconciled Plan 4 physical authority", async () => {
  const { releaseMetadata } = await import("../next.config.mjs");

  assert.equal(releaseMetadata.schemaCompatibilityVersion, "2");
  assert.equal(releaseMetadata.expectedDatabaseMigrationVersion, "20260724232734");
  assert.equal(releaseMetadata.latestAppliedMigrationVersion, "20260906131808");
  assert.equal(releaseMetadata.migrationLedgerReconciliationState, "reconciled");
  assert.equal(releaseMetadata.pendingMigrationCount, "0");
  assert.equal(releaseMetadata.schemaAppliedUntrackedCount, "0");
  assert.equal(releaseMetadata.unresolvedMigrationCount, "0");
});

test("rejects a marker that is not represented by a resolved Production migration", () => {
  assert.throws(
    () => resolveReleaseCompatibilityContract({
      ledger,
      contract: { ...contract, databaseMigrationMarkerVersion: "20990101000000" },
    }),
    /database marker is not a resolved production migration/,
  );
});

test("rejects unresolved marker entries", () => {
  const markerVersion = contract.databaseMigrationMarkerVersion;
  const entries = ledger.entries.map((entry) => entry.productionVersion === markerVersion
    ? { ...entry, state: "pending" }
    : entry);

  assert.throws(
    () => resolveReleaseCompatibilityContract({ ledger: { ...ledger, entries }, contract }),
    /database marker is not a resolved production migration/,
  );
});
