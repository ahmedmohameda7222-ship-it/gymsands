import { describe, expect, it } from "vitest";
import { evaluateReleaseReadiness } from "./readiness";
import type { ReleaseVersion } from "./version";

const release: ReleaseVersion = {
  commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
  buildTimestamp: "2026-07-10T12:30:00.000Z",
  environment: "production",
  schemaCompatibilityVersion: "2",
  expectedDatabaseMigrationVersion: "20260711014500",
  migrationLedgerReconciliationState: "reconciled",
  schemaAppliedUntrackedCount: 0
};

const database = {
  available: true,
  version: "2",
  migrationVersion: "20260711014500"
};

describe("release readiness", () => {
  it("is ready only when artifact, schema marker, migration marker, and ledger agree", () => {
    expect(evaluateReleaseReadiness(release, database)).toEqual({
      artifactIdentityValid: true,
      schemaMarkerCompatible: true,
      migrationVersionCompatible: true,
      migrationLedgerReconciled: true,
      releaseReady: true
    });
  });

  it("fails closed while migration history reconciliation is pending", () => {
    const result = evaluateReleaseReadiness({
      ...release,
      migrationLedgerReconciliationState: "pending",
      schemaAppliedUntrackedCount: 6
    }, database);
    expect(result.migrationLedgerReconciled).toBe(false);
    expect(result.releaseReady).toBe(false);
  });

  it("fails closed on stale or unavailable database migration markers", () => {
    expect(evaluateReleaseReadiness(release, { ...database, migrationVersion: "20260711013000" }).releaseReady).toBe(false);
    expect(evaluateReleaseReadiness(release, { available: false, version: "unavailable", migrationVersion: null }).releaseReady).toBe(false);
  });

  it("fails closed on malformed artifact metadata", () => {
    expect(evaluateReleaseReadiness({ ...release, commitSha: "abcdef1" }, database).releaseReady).toBe(false);
    expect(evaluateReleaseReadiness({ ...release, buildTimestamp: "unknown" }, database).releaseReady).toBe(false);
  });
});
