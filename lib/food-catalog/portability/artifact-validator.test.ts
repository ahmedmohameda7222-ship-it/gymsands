import { describe, expect, it } from "vitest";
import { sha256Hex } from "./canonicalize";
import {
  computeManifestSemanticRoot,
  type PortableExportManifestV1,
} from "./export-contract";
import { validatePortableArtifact } from "./artifact-validator";

const SNAPSHOT = "b".repeat(64);
const BYTES = '["fixture"]\n';

function makeManifest(rowCount = 1): PortableExportManifestV1 {
  const bytes = rowCount === 0 ? "" : BYTES;
  const manifest: PortableExportManifestV1 = {
    format: "plaivra-food-catalog-portable-export",
    formatVersion: 1,
    canonicalizationVersion: 1,
    profile: "CORE_PORTABLE",
    sourceRepositoryCommit: "c".repeat(40),
    sourceSchemaFingerprintSha256: "d".repeat(64),
    capturedAt: "2026-09-10T18:19:20.123456Z",
    snapshotBoundary: {
      environment: "fixture",
      postgresSnapshot: "100:100:",
      capturedAt: "2026-09-10T18:19:20.123456Z",
      migrationCount: "123",
      latestMigration: "20260910071241",
      migrationLedgerIdentity: "e".repeat(64),
      currentGenerationId: null,
      pointerRevision: "0",
      compatibilityVersion: "2",
      compatibilityMarker: "20260724232734",
      sha256: SNAPSHOT,
    },
    segments: [{
      name: "food_items",
      relation: "food_items",
      classification: "PORTABLE_AUTHORITY",
      loadMode: "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY",
      stableKey: ["id"],
      rowCount,
      plaintextSemanticSha256: sha256Hex(bytes),
      snapshotBoundarySha256: SNAPSHOT,
      required: true,
      protected: false,
    }],
    semanticRootSha256: "0".repeat(64),
  };
  manifest.semanticRootSha256 = computeManifestSemanticRoot(manifest);
  return manifest;
}

describe("Plan 7 artifact validator", () => {
  it("validates exact canonical bytes, row count and manifest semantic root", () => {
    const result = validatePortableArtifact({
      manifest: makeManifest(),
      materials: { food_items: BYTES },
      requiredSegments: ["food_items"],
    });
    expect(result).toMatchObject({ valid: true, profile: "CORE_PORTABLE", segmentCount: 1 });
  });

  it("accepts an explicit zero-row segment with the empty-byte digest", () => {
    expect(validatePortableArtifact({
      manifest: makeManifest(0),
      materials: { food_items: "" },
      requiredSegments: ["food_items"],
    }).valid).toBe(true);
  });

  it("fails closed on corruption, missing bytes and row-count mismatch", () => {
    expect(() => validatePortableArtifact({
      manifest: makeManifest(), materials: { food_items: `${BYTES}x` }, requiredSegments: ["food_items"],
    })).toThrow(/digest|hash|corrupt/i);
    expect(() => validatePortableArtifact({
      manifest: makeManifest(), materials: {}, requiredSegments: ["food_items"],
    })).toThrow(/missing/i);
    expect(() => validatePortableArtifact({
      manifest: makeManifest(0), materials: { food_items: BYTES }, requiredSegments: ["food_items"],
    })).toThrow(/row count|digest/i);
  });

  it("does not apply artifact age as structural validity", () => {
    const ancient = makeManifest();
    ancient.capturedAt = "2000-01-01T00:00:00.000000Z";
    expect(validatePortableArtifact({
      manifest: ancient, materials: { food_items: BYTES }, requiredSegments: ["food_items"],
    }).valid).toBe(true);
  });
});
