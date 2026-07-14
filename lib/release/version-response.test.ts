import { describe, expect, it } from "vitest";
import { buildVersionResponse } from "./version-response";
import type { ReleaseVersion } from "./version";

const release: ReleaseVersion = {
  commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
  buildTimestamp: "2026-07-14T01:00:00.000Z",
  environment: "production",
  schemaCompatibilityVersion: "2",
  expectedDatabaseMigrationVersion: "20260713170000",
  migrationLedgerReconciliationState: "reconciled",
  pendingMigrationCount: 0,
  schemaAppliedUntrackedCount: 0,
  unresolvedMigrationCount: 0
};

const database = { available: true, version: "2", migrationVersion: "20260713170000" };

describe("version response contract", () => {
  it("returns 200 only for a fully release-ready identity", () => {
    const response = buildVersionResponse(release, database);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      artifactIdentityValid: true,
      schemaMarkerCompatible: true,
      migrationVersionCompatible: true,
      migrationLedgerReconciled: true,
      releaseReady: true,
      schemaCompatible: true,
      databaseMigrationVersion: "20260713170000"
    });
  });

  it("returns 503 while ledger reconciliation is pending even if schema markers match", () => {
    const response = buildVersionResponse({
      ...release,
      migrationLedgerReconciliationState: "pending",
      pendingMigrationCount: 1,
      schemaAppliedUntrackedCount: 7,
      unresolvedMigrationCount: 8
    }, database);
    expect(response.status).toBe(503);
    expect(response.body.schemaCompatible).toBe(true);
    expect(response.body.migrationLedgerReconciled).toBe(false);
    expect(response.body.releaseReady).toBe(false);
  });

  it("returns 503 when expected and database migration versions differ", () => {
    const response = buildVersionResponse(release, { ...database, migrationVersion: "20260711014500" });
    expect(response.status).toBe(503);
    expect(response.body.migrationVersionCompatible).toBe(false);
    expect(response.body.releaseReady).toBe(false);
  });
});
