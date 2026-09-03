import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveReleaseCompatibilityContract } from "../lib/release/compatibility-contract.mjs";

const PLAN3_PENDING_MIGRATION = "20260902150000_food_catalog_generation_authority.sql";
const ledger = JSON.parse(
  readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"),
);
const contract = JSON.parse(
  readFileSync(new URL("../config/release-compatibility.json", import.meta.url), "utf8"),
);

test("declared database marker remains distinct from the applied physical head while Plan 3 is pending", () => {
  const resolved = resolveReleaseCompatibilityContract({ ledger, contract });
  const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");

  assert.equal(resolved.schemaCompatibilityVersion, "2");
  assert.equal(resolved.expectedDatabaseMigrationVersion, "20260724232734");
  assert.equal(resolved.latestAppliedMigrationVersion, "20260901183021");
  assert.ok(
    resolved.latestAppliedMigrationVersion.localeCompare(resolved.expectedDatabaseMigrationVersion) > 0,
    "fixture must prove that compatible physical migrations may be newer than the release marker",
  );
  assert.equal(pendingEntries.length, 1);
  assert.equal(pendingEntries[0].localFile, PLAN3_PENDING_MIGRATION);
  assert.equal(resolved.migrationLedgerReconciliationState, "pending");
  assert.equal(ledger.pendingCount, 1);
  assert.equal(resolved.pendingMigrationCount, 1);
  assert.equal(resolved.schemaAppliedUntrackedCount, 0);
  assert.equal(resolved.unresolvedMigrationCount, 1);
});

test("Next build metadata binds the declared compatibility marker and exposes the pending repository ledger state", async () => {
  const { releaseMetadata } = await import("../next.config.mjs");

  assert.equal(releaseMetadata.schemaCompatibilityVersion, "2");
  assert.equal(releaseMetadata.expectedDatabaseMigrationVersion, "20260724232734");
  assert.equal(releaseMetadata.latestAppliedMigrationVersion, "20260901183021");
  assert.equal(releaseMetadata.migrationLedgerReconciliationState, "pending");
  assert.equal(releaseMetadata.pendingMigrationCount, "1");
  assert.equal(releaseMetadata.schemaAppliedUntrackedCount, "0");
  assert.equal(releaseMetadata.unresolvedMigrationCount, "1");
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
