import manifest from "@/data/muscle-intelligence/v2/registry.json";
import part01 from "@/data/muscle-intelligence/v2/registry.part-01.json";
import part02 from "@/data/muscle-intelligence/v2/registry.part-02.json";
import part03 from "@/data/muscle-intelligence/v2/registry.part-03.json";
import part04 from "@/data/muscle-intelligence/v2/registry.part-04.json";
import part05 from "@/data/muscle-intelligence/v2/registry.part-05.json";
import part06 from "@/data/muscle-intelligence/v2/registry.part-06.json";

import {
  validateAdvancedMuscleMappingEntries,
  type AdvancedMuscleMappingEntry,
  type AdvancedMuscleMappingReference
} from "./advanced-exposure";
import { ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION } from "./versions";

type RegistryTuple = readonly [muscleId: string, role: string, contribution: number];

type RegistryMapping = {
  slug: string;
  exercise_id: string;
  mapping_set_id: string;
  checksum: string;
  entries: RegistryTuple[];
};

type RegistryPart = {
  part: number;
  mappings: RegistryMapping[];
};

export type ReviewedAdvancedExerciseMapping = {
  slug: string;
  sourceId: `plaivra_curated:v1:${string}`;
  reference: AdvancedMuscleMappingReference;
};

export type ReviewedAdvancedMappingIdentity = {
  canonicalExerciseId?: string | null;
  workoutId?: string | null;
  sourceWorkoutId?: string | null;
  id?: string | null;
  canonicalSourceId?: string | null;
};

const EXPECTED_REGISTRY_VERSION = "plaivra_advanced_exercise_mappings_v2";
const EXPECTED_STATUS = "approved_for_phase4b_publication";
const EXPECTED_ATLAS_VERSION = "advanced_visible_v1";
const EXPECTED_MAPPING_VERSION = 2;
const EXPECTED_EXERCISE_COUNT = 60;
const EXPECTED_ENTRY_COUNT = 453;

const parts = [part01, part02, part03, part04, part05, part06] as unknown as RegistryPart[];

function validateRegistryManifest(): void {
  if (manifest.registry_version !== EXPECTED_REGISTRY_VERSION) throw new Error("Unexpected Phase 4B registry version.");
  if (manifest.status !== EXPECTED_STATUS) throw new Error("Phase 4B registry is not approved for publication.");
  if (manifest.atlas_version !== EXPECTED_ATLAS_VERSION) throw new Error("Unexpected advanced atlas version.");
  if (manifest.mapping_schema_version !== ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION) throw new Error("Unexpected advanced mapping schema.");
  if (manifest.mapping_version !== EXPECTED_MAPPING_VERSION) throw new Error("Unexpected advanced mapping version.");
  if (manifest.validation_summary.exercise_count !== EXPECTED_EXERCISE_COUNT) throw new Error("Unexpected Phase 4B exercise count.");
  if (manifest.validation_summary.mapping_set_count !== EXPECTED_EXERCISE_COUNT) throw new Error("Unexpected Phase 4B mapping-set count.");
  if (manifest.validation_summary.entry_count !== EXPECTED_ENTRY_COUNT) throw new Error("Unexpected Phase 4B mapping-entry count.");
  if (parts.length !== manifest.parts.length || parts.some((part, index) => part.part !== index + 1)) {
    throw new Error("Phase 4B registry parts are incomplete or unordered.");
  }
}

function parseMapping(mapping: RegistryMapping): ReviewedAdvancedExerciseMapping {
  if (!mapping.slug || !mapping.exercise_id || !mapping.mapping_set_id || !/^[0-9a-f]{64}$/.test(mapping.checksum)) {
    throw new Error(`Incomplete advanced mapping registry record: ${mapping.slug || "unknown"}.`);
  }
  const rawEntries = mapping.entries.map(([muscleId, role, contribution], index) => ({
    muscleId,
    role,
    contribution,
    sideScope: "bilateral",
    sortOrder: index + 1
  }));
  const entries = validateAdvancedMuscleMappingEntries(rawEntries, { requirePrimary: true });
  return {
    slug: mapping.slug,
    sourceId: `plaivra_curated:v1:${mapping.slug}`,
    reference: {
      mappingSetId: mapping.mapping_set_id,
      targetId: mapping.exercise_id,
      targetType: "global_exercise",
      mappingVersion: EXPECTED_MAPPING_VERSION,
      schemaVersion: ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION,
      checksum: mapping.checksum,
      entries
    }
  };
}

validateRegistryManifest();

export const REVIEWED_ADVANCED_EXERCISE_MAPPINGS = parts
  .flatMap((part) => part.mappings)
  .map(parseMapping)
  .sort((left, right) => left.slug.localeCompare(right.slug));

const byExerciseId = new Map(REVIEWED_ADVANCED_EXERCISE_MAPPINGS.map((mapping) => [mapping.reference.targetId, mapping]));
const bySourceId = new Map(REVIEWED_ADVANCED_EXERCISE_MAPPINGS.map((mapping) => [mapping.sourceId, mapping]));

if (
  REVIEWED_ADVANCED_EXERCISE_MAPPINGS.length !== EXPECTED_EXERCISE_COUNT ||
  byExerciseId.size !== EXPECTED_EXERCISE_COUNT ||
  bySourceId.size !== EXPECTED_EXERCISE_COUNT ||
  REVIEWED_ADVANCED_EXERCISE_MAPPINGS.reduce((sum, mapping) => sum + mapping.reference.entries.length, 0) !== EXPECTED_ENTRY_COUNT
) {
  throw new Error("Phase 4B reviewed mapping registry integrity check failed.");
}

export const REVIEWED_ADVANCED_MAPPING_REGISTRY_MANIFEST = manifest;

export function getReviewedAdvancedMappingByExerciseId(exerciseId: string | null | undefined): ReviewedAdvancedExerciseMapping | null {
  return exerciseId ? byExerciseId.get(exerciseId) ?? null : null;
}

export function getReviewedAdvancedMappingBySourceId(sourceId: string | null | undefined): ReviewedAdvancedExerciseMapping | null {
  return sourceId ? bySourceId.get(sourceId as ReviewedAdvancedExerciseMapping["sourceId"]) ?? null : null;
}

export function resolveReviewedAdvancedMappingIdentity(
  identity: ReviewedAdvancedMappingIdentity
): ReviewedAdvancedExerciseMapping | null {
  const exactIds = [
    identity.canonicalExerciseId,
    identity.workoutId,
    identity.sourceWorkoutId,
    identity.id
  ];
  for (const exerciseId of exactIds) {
    const mapping = getReviewedAdvancedMappingByExerciseId(exerciseId);
    if (mapping) return mapping;
  }
  return getReviewedAdvancedMappingBySourceId(identity.canonicalSourceId);
}

export function toAdvancedMappingEntries(mapping: ReviewedAdvancedExerciseMapping): readonly AdvancedMuscleMappingEntry[] {
  return mapping.reference.entries;
}
