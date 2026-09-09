import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveReleaseCompatibilityContract } from "../lib/release/compatibility-contract.mjs";

const PLAN4_MIGRATION = "20260904100000_food_catalog_ingestion_v2_authority.sql";
const PLAN5_MIGRATION = "20260906183000_food_catalog_search_projection_v2.sql";
const PLAN5_SERVING_CORRECTION = "20260907165500_food_catalog_search_serving_semantics_correction.sql";
const PLAN6_MIGRATION = "20260908100000_food_catalog_governance_control_plane.sql";
const PLAN6_EXACTNESS_CORRECTION = "20260909083000_food_catalog_governance_gtin_lock_exactness.sql";
const ledger = JSON.parse(
  readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"),
);
const contract = JSON.parse(
  readFileSync(new URL("../config/release-compatibility.json", import.meta.url), "utf8"),
);

test("declared database marker remains distinct from the resolved release-ledger head while Plan 6 reconciliation stays unresolved", () => {
  const resolved = resolveReleaseCompatibilityContract({ ledger, contract });
  const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
  const plan4 = ledger.entries.find((entry) => entry.localFile === PLAN4_MIGRATION);
  const plan5 = ledger.entries.find((entry) => entry.localFile === PLAN5_MIGRATION);
  const correction = ledger.entries.find((entry) => entry.localFile === PLAN5_SERVING_CORRECTION);
  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION);
  const plan6Correction = ledger.entries.find((entry) => entry.localFile === PLAN6_EXACTNESS_CORRECTION);

  assert.equal(resolved.schemaCompatibilityVersion, "2");
  assert.equal(resolved.expectedDatabaseMigrationVersion, "20260724232734");
  assert.equal(resolved.latestAppliedMigrationVersion, "20260907215257");
  assert.ok(
    resolved.latestAppliedMigrationVersion.localeCompare(resolved.expectedDatabaseMigrationVersion) > 0,
    "fixture must prove that compatible physical migrations may be newer than the release marker",
  );
  assert.equal(pendingEntries.length, 1);
  assert.equal(plan4.state, "applied_version_alias");
  assert.equal(plan4.productionVersion, "20260906131808");
  assert.equal(plan4.productionName, "food_catalog_ingestion_v2_authority");
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
  assert.equal(resolved.migrationLedgerReconciliationState, "pending");
  assert.equal(ledger.pendingCount, 1);
  assert.equal(resolved.pendingMigrationCount, 1);
  assert.equal(resolved.schemaAppliedUntrackedCount, 0);
  assert.equal(resolved.unresolvedMigrationCount, 2);
});

test("Next build metadata preserves the declared marker and exposes Plan 6 drift review plus pending exactness correction", async () => {
  const { releaseMetadata } = await import("../next.config.mjs");

  assert.equal(releaseMetadata.schemaCompatibilityVersion, "2");
  assert.equal(releaseMetadata.expectedDatabaseMigrationVersion, "20260724232734");
  assert.equal(releaseMetadata.latestAppliedMigrationVersion, "20260907215257");
  assert.equal(releaseMetadata.migrationLedgerReconciliationState, "pending");
  assert.equal(releaseMetadata.pendingMigrationCount, "1");
  assert.equal(releaseMetadata.schemaAppliedUntrackedCount, "0");
  assert.equal(releaseMetadata.unresolvedMigrationCount, "2");
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
