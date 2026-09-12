import { describe, expect, it } from "vitest";
import {
  canonicalRulesForProfile,
  validateCanonicalProfileManifest,
} from "./profile-certification";
import {
  certifyFoodCatalogRestore,
  type FinalRestoreCertificationInput,
} from "./final-certification";
import { FOOD_CATALOG_PORTABLE_RELATIONS_V1 } from "./relation-registry";

const SHA = "a".repeat(64);
const HEAD = "b".repeat(40);

function manifestFor(profile: "CORE_PORTABLE" | "FULL_DR", rules = canonicalRulesForProfile(profile)) {
  const segments = rules.map((rule) => ({
    name: rule.segment,
    relation: rule.relation,
    classification: rule.classification,
    loadMode: rule.loadMode,
    stableKey: [...rule.stableKey],
    rowCount: 0,
    plaintextSemanticSha256: SHA,
    snapshotBoundarySha256: SHA,
    required: true,
    protected: rule.protected,
  }));
  return {
    format: "plaivra-food-catalog-portable-export",
    formatVersion: 1,
    canonicalizationVersion: 1,
    profile,
    registryAuthority: "CANONICAL_REGISTRY_V1",
    sourceRepositoryCommit: HEAD,
    sourceSchemaFingerprintSha256: SHA,
    capturedAt: "2026-09-10T20:00:00.000000Z",
    snapshotBoundary: {
      environment: "source",
      postgresSnapshot: "1:1:",
      capturedAt: "2026-09-10T20:00:00.000000Z",
      migrationCount: "123",
      latestMigration: "20260910071241",
      migrationLedgerIdentity: SHA,
      currentGenerationId: null,
      pointerRevision: "0",
      compatibilityVersion: "2",
      compatibilityMarker: "20260724232734",
      sha256: SHA,
    },
    segments,
    semanticRootSha256: SHA,
  } as const;
}

describe("Plan 7 trusted profile authority", () => {
  it("FULL_DR requires every canonical CORE plus FULL_DR relation", () => {
    const full = canonicalRulesForProfile("FULL_DR");
    const core = canonicalRulesForProfile("CORE_PORTABLE");
    expect(full.length).toBe(FOOD_CATALOG_PORTABLE_RELATIONS_V1.length);
    expect(core.length).toBeGreaterThan(0);
    for (const rule of core) expect(full.some((candidate) => candidate.segment === rule.segment)).toBe(true);
  });

  it("rejects a one-relation FULL_DR artifact for trusted certification", () => {
    const one = FOOD_CATALOG_PORTABLE_RELATIONS_V1.filter((rule) => rule.relation === "food_personal_overrides");
    expect(() => validateCanonicalProfileManifest(manifestFor("FULL_DR", one))).toThrow(/missing.*required|complete/i);
  });

  it("rejects descriptor drift even when the relation name matches", () => {
    const manifest = manifestFor("FULL_DR") as any;
    manifest.segments = manifest.segments.map((segment: any, index: number) => index === 0
      ? { ...segment, loadMode: "RESTORE_EXACT" }
      : segment);
    expect(() => validateCanonicalProfileManifest(manifest)).toThrow(/descriptor|load.?mode|canonical/i);
  });

  it("marks relations-json diagnostic artifacts permanently non-certifiable", () => {
    const manifest = { ...manifestFor("FULL_DR"), registryAuthority: "DIAGNOSTIC_SUBSET" } as any;
    expect(() => validateCanonicalProfileManifest(manifest)).toThrow(/diagnostic|canonical registry/i);
  });
});

describe("Plan 7 sole final DR-ready authority", () => {
  function linkedInput(profile: "CORE_PORTABLE" | "FULL_DR" = "FULL_DR"): FinalRestoreCertificationInput {
    return {
      profile,
      headSha: HEAD,
      artifactSemanticRootSha256: SHA,
      snapshotBoundarySha256: "c".repeat(64),
      restoredTargetIdentitySha256: "d".repeat(64),
      canonicalProfileVerified: true,
      recoveryEvaluation: {
        capturedAt: "2026-09-10T20:00:00.000Z",
        evaluationTime: "2026-09-10T20:01:00.000Z",
        maxArtifactAgeMs: 60_000,
      },
      restore: {
        headSha: HEAD,
        profile,
        artifactSemanticRootSha256: SHA,
        snapshotBoundarySha256: "c".repeat(64),
        restoredTargetIdentitySha256: "d".repeat(64),
        artifactValid: true,
        restoreVerified: true,
        trusted: true,
        failures: [],
        unknown: [],
      },
      protected: {
        artifactSemanticRootSha256: SHA,
        restoredTargetIdentitySha256: "d".repeat(64),
        verified: profile === "FULL_DR",
      },
      search: {
        headSha: HEAD,
        artifactSemanticRootSha256: SHA,
        snapshotBoundarySha256: "c".repeat(64),
        restoredTargetIdentitySha256: "d".repeat(64),
        sameRestoredTargetVerified: true,
        rebuildVerified: true,
        goldenSearchVerified: true,
        staleGenerationIsolationVerified: true,
      },
    };
  }

  it("allows DR readiness only when all linked restore/search/protected and canonical recovery evidence agrees", () => {
    const result = certifyFoodCatalogRestore(linkedInput());
    expect(result.recoveryEligibility?.reason).toBe("ELIGIBLE");
    expect(result.recoveryEligible).toBe(true);
    expect(result.drReady).toBe(true);
  });

  it("fails closed when the search evidence belongs to another artifact", () => {
    const input = linkedInput();
    input.search.artifactSemanticRootSha256 = "e".repeat(64);
    expect(() => certifyFoodCatalogRestore(input)).toThrow(/semantic root|linked/i);
  });

  it("fails closed when FULL_DR recovery evaluation is missing or one millisecond over", () => {
    const missing = linkedInput();
    delete missing.recoveryEvaluation;
    expect(() => certifyFoodCatalogRestore(missing)).toThrow(/recovery|eligib|RPO/i);

    const ineligible = linkedInput();
    ineligible.recoveryEvaluation = {
      capturedAt: "2026-09-10T20:00:00.000Z",
      evaluationTime: "2026-09-10T20:01:00.001Z",
      maxArtifactAgeMs: 60_000,
    };
    expect(() => certifyFoodCatalogRestore(ineligible)).toThrow(/recovery|eligib|RPO/i);
  });

  it("does not let CORE_PORTABLE become DR-ready", () => {
    const input = linkedInput("CORE_PORTABLE");
    input.recoveryEvaluation = {
      capturedAt: "2026-09-10T20:00:00.000Z",
      evaluationTime: "2026-09-10T20:01:00.001Z",
      maxArtifactAgeMs: 60_000,
    };
    const result = certifyFoodCatalogRestore(input);
    expect(result.trusted).toBe(true);
    expect(result.recoveryEligible).toBe(false);
    expect(result.drReady).toBe(false);
  });
});
