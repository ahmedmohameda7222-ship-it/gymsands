import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MANDATORY_RESTORE_ASSERTION_IDS } from "../lib/food-catalog/portability/restore-assertions.ts";
import {
  buildFoodCatalogRestoreVerificationReportV1,
  assertFoodCatalogRestoreVerificationReady,
} from "./verify-food-catalog-restore.mjs";

const hash = (ch) => ch.repeat(64);

function passingAssertions() {
  const classes = ["BYTE_HASH", "EXACT_IDENTITY_VALUE", "SEMANTIC"];
  return MANDATORY_RESTORE_ASSERTION_IDS.map((id, index) => ({
    id,
    comparisonClass: classes[index % classes.length],
    mandatory: true,
    status: "PASS",
    detail: `runtime-derived ${id}`,
  }));
}

function baseInput(profile = "FULL_DR") {
  return {
    profile,
    headSha: "a".repeat(40),
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
      securityRlsAclIdentitySha256: hash("e"),
      restoredTargetIdentitySha256: hash("f"),
      authRlsCompatibilityVerified: true,
      disposableTargetVerified: true,
    },
    assertions: {
      evidence: passingAssertions(),
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
  it("derives trusted restore verification from the complete mandatory assertion set", () => {
    const report = buildFoodCatalogRestoreVerificationReportV1(baseInput());
    assert.equal(report.reportVersion, 2);
    assert.equal(report.profile, "FULL_DR");
    assert.equal(report.restoreVerified, true);
    assert.equal(report.trusted, true);
    assert.equal(report.recoveryEligible, true);
    assert.equal(report.artifact.snapshotBoundarySha256, hash("b"));
    assert.equal(report.target.postgresVersion, "17.11");
    assert.equal(report.assertions.unknown.length, 0);
    assert.equal(Object.hasOwn(report, "drReady"), false);
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
    assert.equal(report.restoreVerified, true);
    assert.equal(report.recoveryEligible, false);
    assert.equal(report.readyForRecovery, false);
  });

  it("does not accept caller trusted/restoreVerified/drReady booleans as evidence", () => {
    const input = baseInput();
    input.assertions = {
      trusted: true,
      restoreVerified: true,
      drReady: true,
      evidence: input.assertions.evidence.filter((entry) => entry.id !== "current_pointer"),
    };
    const report = buildFoodCatalogRestoreVerificationReportV1(input);
    assert.equal(report.restoreVerified, false);
    assert.equal(report.trusted, false);
    assert.ok(report.assertions.unknown.includes("current_pointer"));
    assert.equal(Object.hasOwn(report, "drReady"), false);
  });

  it("fails closed when target or mandatory runtime assertion evidence is untrusted", () => {
    const input = baseInput();
    input.target.disposableTargetVerified = false;
    assert.throws(() => buildFoodCatalogRestoreVerificationReportV1(input), /disposable|target/i);

    const untrusted = baseInput();
    untrusted.assertions.evidence = untrusted.assertions.evidence.map((entry) => entry.id === "current_pointer"
      ? { ...entry, status: "FAIL", detail: "pointer mismatch" }
      : entry);
    const report = buildFoodCatalogRestoreVerificationReportV1(untrusted);
    assert.equal(report.restoreVerified, false);
    assert.equal(report.trusted, false);
    assert.ok(report.assertions.failures.includes("current_pointer"));
    assert.throws(() => assertFoodCatalogRestoreVerificationReady(report), /verification|ready|trusted/i);
  });
});
