import { describe, expect, it } from "vitest";
import { getReleaseVersion, isReleaseArtifactIdentityValid } from "./version";

const fullSha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";

function validEnvironment() {
  return {
    PLAIVRA_COMMIT_SHA: fullSha,
    PLAIVRA_BUILD_TIMESTAMP: "2026-07-10T12:30:00.000Z",
    PLAIVRA_RELEASE_ENVIRONMENT: "production",
    PLAIVRA_SCHEMA_COMPATIBILITY_VERSION: "2",
    PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION: "20260711014500",
    PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE: "pending",
    PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT: "6"
  };
}

describe("release version metadata", () => {
  it("returns normalized public build identifiers", () => {
    expect(getReleaseVersion(validEnvironment())).toEqual({
      commitSha: fullSha,
      buildTimestamp: "2026-07-10T12:30:00.000Z",
      environment: "production",
      schemaCompatibilityVersion: "2",
      expectedDatabaseMigrationVersion: "20260711014500",
      migrationLedgerReconciliationState: "pending",
      schemaAppliedUntrackedCount: 6
    });
  });

  it("rejects abbreviated and malformed commit identities", () => {
    expect(getReleaseVersion({ ...validEnvironment(), PLAIVRA_COMMIT_SHA: "abcdef1" }).commitSha).toBe("unknown");
    expect(getReleaseVersion({ ...validEnvironment(), PLAIVRA_COMMIT_SHA: "secret value" }).commitSha).toBe("unknown");
  });

  it("rejects malformed values instead of reflecting them", () => {
    expect(
      getReleaseVersion({
        PLAIVRA_COMMIT_SHA: "secret value",
        PLAIVRA_BUILD_TIMESTAMP: "not-a-date",
        PLAIVRA_RELEASE_ENVIRONMENT: "production;token=secret",
        PLAIVRA_SCHEMA_COMPATIBILITY_VERSION: "2 secret",
        PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION: "bad value",
        PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE: "complete",
        PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT: "six"
      })
    ).toEqual({
      commitSha: "unknown",
      buildTimestamp: "unknown",
      environment: "unknown",
      schemaCompatibilityVersion: "2",
      expectedDatabaseMigrationVersion: "unknown",
      migrationLedgerReconciliationState: "unknown",
      schemaAppliedUntrackedCount: -1
    });
  });

  it("accepts provider fallbacks only when the SHA is full length", () => {
    const release = getReleaseVersion({
      ...validEnvironment(),
      PLAIVRA_COMMIT_SHA: undefined,
      VERCEL_GIT_COMMIT_SHA: fullSha,
      VERCEL_ENV: "preview",
      PLAIVRA_RELEASE_ENVIRONMENT: undefined
    });
    expect(release.commitSha).toBe(fullSha);
    expect(release.environment).toBe("preview");
  });

  it("fails artifact identity when required build metadata is absent", () => {
    expect(isReleaseArtifactIdentityValid(getReleaseVersion(validEnvironment()))).toBe(true);
    expect(isReleaseArtifactIdentityValid(getReleaseVersion({ ...validEnvironment(), PLAIVRA_BUILD_TIMESTAMP: "" }))).toBe(false);
    expect(isReleaseArtifactIdentityValid(getReleaseVersion({ ...validEnvironment(), PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION: "" }))).toBe(false);
  });
});
