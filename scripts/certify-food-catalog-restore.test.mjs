import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFinalCertificationInput } from "./certify-food-catalog-restore.mjs";
import { certifyFoodCatalogRestore } from "../lib/food-catalog/portability/final-certification.ts";
import { computeManifestSemanticRoot, computeSnapshotBoundarySha256 } from "../lib/food-catalog/portability/export-contract.ts";

const head = "a".repeat(40);
const root = "b".repeat(64);
const target = "c".repeat(64);

function manifest() {
  const boundaryBase = {
    environment: "CI",
    postgresSnapshot: "00000001-1",
    capturedAt: "2026-09-10T18:00:00.000Z",
    migrationCount: "123",
    latestMigration: "20260910071241",
    migrationLedgerIdentity: "d".repeat(64),
    currentGenerationId: null,
    pointerRevision: "0",
    compatibilityVersion: "2",
    compatibilityMarker: "20260724232734",
  };
  const snapshotBoundary = { ...boundaryBase, sha256: computeSnapshotBoundarySha256(boundaryBase) };
  const value = {
    format: "plaivra-food-catalog-portable-export",
    formatVersion: 1,
    canonicalizationVersion: 1,
    profile: "FULL_DR",
    registryAuthority: "CANONICAL_REGISTRY_V1",
    sourceRepositoryCommit: head,
    sourceSchemaFingerprintSha256: "e".repeat(64),
    capturedAt: boundaryBase.capturedAt,
    snapshotBoundary,
    segments: [],
    semanticRootSha256: "",
    certification: { artifactValid: false, restoreVerified: false, drReady: false },
  };
  value.semanticRootSha256 = computeManifestSemanticRoot(value);
  return value;
}

function linkedInput() {
  return {
    profile: "FULL_DR",
    headSha: head,
    artifactSemanticRootSha256: root,
    snapshotBoundarySha256: "f".repeat(64),
    restoredTargetIdentitySha256: target,
    canonicalProfileVerified: true,
    recoveryEvaluation: {
      capturedAt: "2026-09-10T18:00:00.000Z",
      evaluationTime: "2026-09-10T18:01:00.000Z",
      maxArtifactAgeMs: 60_000,
      eligible: true,
    },
    restore: {
      headSha: head,
      profile: "FULL_DR",
      artifactSemanticRootSha256: root,
      snapshotBoundarySha256: "f".repeat(64),
      restoredTargetIdentitySha256: target,
      artifactValid: true,
      restoreVerified: true,
      trusted: true,
      failures: [],
      unknown: [],
    },
    protected: { artifactSemanticRootSha256: root, restoredTargetIdentitySha256: target, verified: true },
    search: {
      headSha: head,
      artifactSemanticRootSha256: root,
      snapshotBoundarySha256: "f".repeat(64),
      restoredTargetIdentitySha256: target,
      sameRestoredTargetVerified: true,
      rebuildVerified: true,
      goldenSearchVerified: true,
      staleGenerationIsolationVerified: true,
    },
  };
}

describe("Plan 7 sole final restore certifier", () => {
  it("is the only authority allowed to produce FULL_DR drReady after all linked evidence and canonical recovery policy pass", () => {
    const certification = certifyFoodCatalogRestore(linkedInput());
    assert.equal(certification.restoreVerified, true);
    assert.equal(certification.trusted, true);
    assert.equal(certification.protectedSegmentsVerified, true);
    assert.equal(certification.searchVerified, true);
    assert.equal(certification.recoveryEligibility.reason, "ELIGIBLE");
    assert.equal(certification.recoveryEligible, true);
    assert.equal(certification.drReady, true);
  });

  it("fails closed on artifact-root, target-identity, or same-target search mismatch", () => {
    const rootMismatch = linkedInput();
    rootMismatch.search.artifactSemanticRootSha256 = "0".repeat(64);
    assert.throws(() => certifyFoodCatalogRestore(rootMismatch), /linked|root|mismatch/i);

    const targetMismatch = linkedInput();
    targetMismatch.protected.restoredTargetIdentitySha256 = "1".repeat(64);
    assert.throws(() => certifyFoodCatalogRestore(targetMismatch), /linked|target|mismatch/i);

    const searchMismatch = linkedInput();
    searchMismatch.search.sameRestoredTargetVerified = false;
    assert.throws(() => certifyFoodCatalogRestore(searchMismatch), /search|restored target/i);
  });

  it("does not let a caller-supplied eligible=true override the canonical age policy", () => {
    const forged = linkedInput();
    forged.recoveryEvaluation = {
      capturedAt: "2026-09-10T18:00:00.000Z",
      evaluationTime: "2026-09-10T18:01:00.001Z",
      maxArtifactAgeMs: 60_000,
      eligible: true,
    };
    assert.throws(() => certifyFoodCatalogRestore(forged), /recovery|eligib|old|RPO/i);
  });

  it("requires explicit recovery evaluation context before FULL_DR can become DR-ready", () => {
    const ineligible = linkedInput();
    ineligible.recoveryEvaluation.evaluationTime = "2026-09-10T18:01:00.001Z";
    assert.throws(() => certifyFoodCatalogRestore(ineligible), /recovery|eligib|RPO/i);

    const missing = linkedInput();
    delete missing.recoveryEvaluation;
    assert.throws(() => certifyFoodCatalogRestore(missing), /recovery|eligib|RPO/i);
  });

  it("never marks CORE_PORTABLE as DR-ready", () => {
    const input = linkedInput();
    input.profile = "CORE_PORTABLE";
    input.restore.profile = "CORE_PORTABLE";
    input.recoveryEvaluation.evaluationTime = "2026-09-10T18:01:00.001Z";
    const certification = certifyFoodCatalogRestore(input);
    assert.equal(certification.restoreVerified, true);
    assert.equal(certification.recoveryEligible, false);
    assert.equal(certification.drReady, false);
  });

  it("binds final recovery evaluation to manifest capturedAt rather than report decisions", () => {
    const incomplete = manifest();
    const restoreReport = {
      headSha: head,
      profile: "FULL_DR",
      artifact: { valid: true, semanticRootSha256: incomplete.semanticRootSha256, snapshotBoundarySha256: incomplete.snapshotBoundary.sha256 },
      target: { restoredTargetIdentitySha256: target },
      restoreVerified: true,
      trusted: true,
      recoveryEligibility: {
        artifactValid: true,
        eligible: true,
        capturedAt: "1999-01-01T00:00:00.000Z",
        evaluationTime: incomplete.capturedAt,
        maxArtifactAgeMs: null,
        agePolicyApplied: false,
        ageMs: 0,
        reason: "ELIGIBLE",
      },
      assertions: { failures: [], unknown: [] },
    };
    const integratedEvidence = {
      headSha: head,
      profile: "FULL_DR",
      artifactSemanticRootSha256: incomplete.semanticRootSha256,
      snapshotBoundarySha256: incomplete.snapshotBoundary.sha256,
      restoredTargetIdentitySha256: target,
      protectedSegmentsVerified: true,
      search: { sameRestoredTargetVerified: true, rebuildVerified: true, goldenSearchVerified: true, staleGenerationIsolationVerified: true },
    };
    assert.throws(() => buildFinalCertificationInput({ manifest: incomplete, restoreReport, integratedEvidence, expectedHead: head }), /mandatory|segment|profile|canonical/i);
  });
});
