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

type VerifiedProviderIdentity = {
  slug: string;
  providerActivityId: string;
  providerSlug: string;
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
  workout_id?: string | null;
  source_workout_id?: string | null;
  id?: string | null;
  canonicalSourceId?: string | null;
  providerActivityId?: string | null;
  provider_activity_id?: string | null;
  catalogSlug?: string | null;
  catalog_slug?: string | null;
};

const EXPECTED_REGISTRY_VERSION = "plaivra_advanced_exercise_mappings_v2";
const EXPECTED_STATUS = "approved_for_phase4b_publication";
const EXPECTED_ATLAS_VERSION = "advanced_visible_v1";
const EXPECTED_MAPPING_VERSION = 2;
const EXPECTED_EXERCISE_COUNT = 60;
const EXPECTED_ENTRY_COUNT = 453;

const VERIFIED_PROVIDER_IDENTITIES: readonly VerifiedProviderIdentity[] = [
  { slug: "barbell-back-squat", providerActivityId: "f2fe7153-b6f7-415b-b15c-a23a43a5c7d2", providerSlug: "barbell_back_squat" },
  { slug: "barbell-bench-press", providerActivityId: "cc1f1371-7d26-4bc8-b7df-7d2a6d1830bb", providerSlug: "barbell_bench_press" },
  { slug: "barbell-romanian-deadlift", providerActivityId: "54ab0a17-eca8-4129-80ef-37fca5e5b618", providerSlug: "barbell_romanian_deadlift" },
  { slug: "cable-triceps-pushdown", providerActivityId: "3f310a14-8b2f-4614-8b78-d4ed33181c12", providerSlug: "cable_triceps_pushdown" },
  { slug: "dumbbell-lateral-raise", providerActivityId: "3fa578c9-d2ad-4c48-8f96-2967c490881e", providerSlug: "dumbbell_lateral_raise" },
  { slug: "front-plank", providerActivityId: "dfe154d4-a3bb-40fb-a80c-41a4a484ca75", providerSlug: "front_plank" },
  { slug: "lat-pulldown", providerActivityId: "0ee93d25-ad3a-46a1-b3d8-d94a7d04ecb2", providerSlug: "lat_pulldown" },
  { slug: "seated-cable-row", providerActivityId: "de77ae88-55a4-4d7d-bcb7-379024da97f5", providerSlug: "seated_cable_row" },
  { slug: "standing-barbell-overhead-press", providerActivityId: "6a37a573-0b3e-4ec7-8917-94da410eab4f", providerSlug: "standing_barbell_overhead_press" }
];

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
const bySlug = new Map(REVIEWED_ADVANCED_EXERCISE_MAPPINGS.map((mapping) => [mapping.slug, mapping]));
const byProviderActivityId = new Map<string, ReviewedAdvancedExerciseMapping>();
const byProviderSlug = new Map<string, ReviewedAdvancedExerciseMapping>();

for (const identity of VERIFIED_PROVIDER_IDENTITIES) {
  const mapping = bySlug.get(identity.slug);
  if (!mapping) throw new Error(`Verified provider identity references unknown mapping: ${identity.slug}.`);
  if (byProviderActivityId.has(identity.providerActivityId) || byProviderSlug.has(identity.providerSlug)) {
    throw new Error(`Duplicate verified provider identity: ${identity.slug}.`);
  }
  byProviderActivityId.set(identity.providerActivityId, mapping);
  byProviderSlug.set(identity.providerSlug, mapping);
}

if (
  REVIEWED_ADVANCED_EXERCISE_MAPPINGS.length !== EXPECTED_EXERCISE_COUNT ||
  byExerciseId.size !== EXPECTED_EXERCISE_COUNT ||
  bySourceId.size !== EXPECTED_EXERCISE_COUNT ||
  byProviderActivityId.size !== VERIFIED_PROVIDER_IDENTITIES.length ||
  byProviderSlug.size !== VERIFIED_PROVIDER_IDENTITIES.length ||
  REVIEWED_ADVANCED_EXERCISE_MAPPINGS.reduce((sum, mapping) => sum + mapping.reference.entries.length, 0) !== EXPECTED_ENTRY_COUNT
) {
  throw new Error("Phase 4B reviewed mapping registry integrity check failed.");
}

export const REVIEWED_ADVANCED_MAPPING_REGISTRY_MANIFEST = manifest;
export const REVIEWED_ADVANCED_VERIFIED_PROVIDER_IDENTITIES = VERIFIED_PROVIDER_IDENTITIES;

export function getReviewedAdvancedMappingByExerciseId(exerciseId: string | null | undefined): ReviewedAdvancedExerciseMapping | null {
  return exerciseId ? byExerciseId.get(exerciseId) ?? null : null;
}

export function getReviewedAdvancedMappingBySourceId(sourceId: string | null | undefined): ReviewedAdvancedExerciseMapping | null {
  return sourceId ? bySourceId.get(sourceId as ReviewedAdvancedExerciseMapping["sourceId"]) ?? null : null;
}

export function getReviewedAdvancedMappingByProviderActivityId(providerActivityId: string | null | undefined): ReviewedAdvancedExerciseMapping | null {
  return providerActivityId ? byProviderActivityId.get(providerActivityId) ?? null : null;
}

export function getReviewedAdvancedMappingByProviderSlug(providerSlug: string | null | undefined): ReviewedAdvancedExerciseMapping | null {
  return providerSlug ? byProviderSlug.get(providerSlug) ?? null : null;
}

export function resolveReviewedAdvancedMappingIdentity(
  identity: ReviewedAdvancedMappingIdentity
): ReviewedAdvancedExerciseMapping | null {
  const exactExerciseIds = [
    identity.canonicalExerciseId,
    identity.workoutId,
    identity.sourceWorkoutId,
    identity.workout_id,
    identity.source_workout_id,
    identity.id
  ];
  for (const exerciseId of exactExerciseIds) {
    const mapping = getReviewedAdvancedMappingByExerciseId(exerciseId);
    if (mapping) return mapping;
    const providerMapping = getReviewedAdvancedMappingByProviderActivityId(exerciseId);
    if (providerMapping) return providerMapping;
  }

  const explicitProviderIds = [identity.providerActivityId, identity.provider_activity_id];
  for (const providerActivityId of explicitProviderIds) {
    const mapping = getReviewedAdvancedMappingByProviderActivityId(providerActivityId);
    if (mapping) return mapping;
  }

  const sourceMapping = getReviewedAdvancedMappingBySourceId(identity.canonicalSourceId);
  if (sourceMapping) return sourceMapping;

  const providerSlugs = [identity.catalogSlug, identity.catalog_slug];
  for (const providerSlug of providerSlugs) {
    const mapping = getReviewedAdvancedMappingByProviderSlug(providerSlug);
    if (mapping) return mapping;
  }

  return null;
}

export function toAdvancedMappingEntries(mapping: ReviewedAdvancedExerciseMapping): readonly AdvancedMuscleMappingEntry[] {
  return mapping.reference.entries;
}
