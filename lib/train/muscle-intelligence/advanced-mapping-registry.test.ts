import { describe, expect, it } from "vitest";

import { calculateAdvancedMuscleMappingChecksum } from "./advanced-mapping-checksum";
import {
  REVIEWED_ADVANCED_EXERCISE_MAPPINGS,
  REVIEWED_ADVANCED_MAPPING_REGISTRY_MANIFEST,
  REVIEWED_ADVANCED_VERIFIED_PROVIDER_IDENTITIES,
  getReviewedAdvancedMappingByExerciseId,
  resolveReviewedAdvancedMappingIdentity
} from "./advanced-mapping-registry";
import { uuidV5 } from "./curated-registry";
import { ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION } from "./versions";

describe("Phase 4B reviewed advanced mapping registry", () => {
  it("loads the complete approved 60-exercise registry without duplicate authority", () => {
    expect(REVIEWED_ADVANCED_MAPPING_REGISTRY_MANIFEST.status).toBe("approved_for_phase4b_publication");
    expect(REVIEWED_ADVANCED_EXERCISE_MAPPINGS).toHaveLength(60);
    expect(new Set(REVIEWED_ADVANCED_EXERCISE_MAPPINGS.map((mapping) => mapping.slug)).size).toBe(60);
    expect(new Set(REVIEWED_ADVANCED_EXERCISE_MAPPINGS.map((mapping) => mapping.reference.targetId)).size).toBe(60);
    expect(new Set(REVIEWED_ADVANCED_EXERCISE_MAPPINGS.map((mapping) => mapping.reference.mappingSetId)).size).toBe(60);
    expect(REVIEWED_ADVANCED_EXERCISE_MAPPINGS.reduce((sum, mapping) => sum + mapping.reference.entries.length, 0)).toBe(453);
    expect(REVIEWED_ADVANCED_VERIFIED_PROVIDER_IDENTITIES).toHaveLength(9);
  });

  it("uses deterministic V2 identities and byte-stable canonical checksums", () => {
    for (const mapping of REVIEWED_ADVANCED_EXERCISE_MAPPINGS) {
      expect(mapping.reference.mappingVersion).toBe(2);
      expect(mapping.reference.schemaVersion).toBe(ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION);
      expect(mapping.reference.mappingSetId).toBe(
        uuidV5(`https://plaivra.com/exercises/v1/${mapping.slug}/mapping/2`)
      );
      expect(calculateAdvancedMuscleMappingChecksum(mapping.reference.entries)).toBe(mapping.reference.checksum);
      expect(mapping.reference.entries.some((entry) => entry.role === "primary")).toBe(true);
      expect(new Set(mapping.reference.entries.map((entry) => entry.muscleId)).size).toBe(mapping.reference.entries.length);
      expect(new Set(mapping.reference.entries.map((entry) => entry.sortOrder)).size).toBe(mapping.reference.entries.length);
      expect(mapping.reference.entries.every((entry) => entry.sideScope === "bilateral")).toBe(true);
    }
  });

  it("resolves only explicit canonical or verified provider identities and never display names", () => {
    const bench = REVIEWED_ADVANCED_EXERCISE_MAPPINGS.find((mapping) => mapping.slug === "barbell-bench-press")!;
    const provider = REVIEWED_ADVANCED_VERIFIED_PROVIDER_IDENTITIES.find((identity) => identity.slug === "barbell-bench-press")!;
    expect(getReviewedAdvancedMappingByExerciseId(bench.reference.targetId)?.slug).toBe("barbell-bench-press");
    expect(resolveReviewedAdvancedMappingIdentity({ sourceWorkoutId: bench.reference.targetId })?.slug).toBe("barbell-bench-press");
    expect(resolveReviewedAdvancedMappingIdentity({ canonicalSourceId: bench.sourceId })?.slug).toBe("barbell-bench-press");
    expect(resolveReviewedAdvancedMappingIdentity({ id: provider.providerActivityId })?.slug).toBe("barbell-bench-press");
    expect(resolveReviewedAdvancedMappingIdentity({ provider_activity_id: provider.providerActivityId })?.slug).toBe("barbell-bench-press");
    expect(resolveReviewedAdvancedMappingIdentity({ catalog_slug: provider.providerSlug })?.slug).toBe("barbell-bench-press");
    expect(resolveReviewedAdvancedMappingIdentity({ id: "Barbell Bench Press" })).toBeNull();
    expect(resolveReviewedAdvancedMappingIdentity({ canonicalSourceId: "barbell-bench-press" })).toBeNull();
    expect(resolveReviewedAdvancedMappingIdentity({ catalog_slug: "barbell-bench-press" })).toBeNull();
    expect(resolveReviewedAdvancedMappingIdentity({})).toBeNull();
  });
});
