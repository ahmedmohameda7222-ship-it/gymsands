import { describe, expect, it } from "vitest";
import {
  buildFoodCatalogRestoreVerificationReportV1,
  assertFoodCatalogRestoreVerificationReady,
} from "./verify-food-catalog-restore.mjs";

const hash = (ch) => ch.repeat(64);

function baseInput(profile = "FULL_DR") {
  return {
    profile,
    artifact: {
      valid: true,
      semanticRootSha256: hash("a"),
      snapshotBoundarySha256: hash("b"),
      capturedAt: "2026-09-10T18:00:00.000Z",
    },
    target: {
      postgresVersion: "17.11",
      postgresMajor: 17,
      extensions: ["pgcrypto", "pg_trgm", "uuid-ossp"],
      migrationLedgerIdentity: hash("c"),
      schemaFingerprintSha256: hash("d"),
      authRlsCompatibilityVerified: true,
      disposableTargetVerified: true,
    },
    assertions: {
      trusted: true,
      restoreVerified: true,
      drReady: profile === "FULL_DR",
      failures: [],
      unknown: [],
      comparisonClasses: ["BYTE_HASH", "EXACT_IDENTITY_VALUE", "SEMANTIC"],
    },
    recoveryEligibility: {
      artifactValid: true,
      eligible: true,
      agePolicyApplied: true,
      ageMs: 60_000,
      reason: "ELIGIBLE",
    },
  };
}

describe("Plan 7 restore verification report", () => {
  it("keeps recovery eligibility separate from structural restore verification evidence", () => {
    const report = buildFoodCatalogRestoreVerificationReportV1(baseInput());
    expect(report).toMatchObject({
      reportVersion: 1,
      profile: "FULL_DR",
      restoreVerified: true,
      drReady: true,
      recoveryEligible: true,
    });
    expect(report.artifact.snapshotBoundarySha256).toBe(hash("b"));
    expect(report.target.postgresVersion).toBe("17.11");
    expect(report.recoveryEligibility.reason).toBe("ELIGIBLE");
  });

  it("does not erase a verified restore when an explicit RPO policy rejects artifact age", () => {
    const input = baseInput();
    input.recoveryEligibility = {
      artifactValid: true,
      eligible: false,
      agePolicyApplied: true,
      ageMs: 86_400_000,
      reason: "ARTIFACT_TOO_OLD",
    };
    const report = buildFoodCatalogRestoreVerificationReportV1(input);
    expect(report.restoreVerified).toBe(true);
    expect(report.recoveryEligible).toBe(false);
    expect(report.readyForRecovery).toBe(false);
  });

  it("never declares CORE_PORTABLE final DR-ready even with all core assertions passing", () => {
    const report = buildFoodCatalogRestoreVerificationReportV1(baseInput("CORE_PORTABLE"));
    expect(report.restoreVerified).toBe(true);
    expect(report.drReady).toBe(false);
  });

  it("fails closed when artifact, target, or assertion evidence is untrusted", () => {
    const input = baseInput();
    input.target.disposableTargetVerified = false;
    expect(() => buildFoodCatalogRestoreVerificationReportV1(input)).toThrow(/disposable|target/i);

    const untrusted = baseInput();
    untrusted.assertions = { ...untrusted.assertions, trusted: false, restoreVerified: false, failures: ["current_pointer"] };
    const report = buildFoodCatalogRestoreVerificationReportV1(untrusted);
    expect(report.restoreVerified).toBe(false);
    expect(report.drReady).toBe(false);
    expect(() => assertFoodCatalogRestoreVerificationReady(report)).toThrow(/verification|ready/i);
  });
});
