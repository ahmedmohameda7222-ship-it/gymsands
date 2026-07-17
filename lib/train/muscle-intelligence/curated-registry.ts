import { createHash } from "node:crypto";

import { calculateMuscleMappingChecksum } from "./checksum";
import {
  isMuscleContribution,
  isMuscleRole,
  isMuscleSideScope,
  isValidRoleContribution,
  type MuscleMappingEntry
} from "./contracts";
import { CANONICAL_MUSCLE_IDS, isCanonicalMuscleId } from "./taxonomy";
import { MUSCLE_MAPPING_SCHEMA_VERSION } from "./versions";

const URL_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const REGISTRY_VERSION = "plaivra_curated_exercises_v1";
const REGISTRY_STATUS = "approved_planning_input_not_implemented";
const LOCALES = ["en", "de", "ar"] as const;
const RELATIONSHIP_TYPES = new Set(["variation", "alternative", "progression", "regression"]);
const TRANSFER_TYPES = new Set(["full", "partial", "none"]);
const VERIFIED_PROVIDER_LINKS = new Set([
  "barbell-bench-press|cc1f1371-7d26-4bc8-b7df-7d2a6d1830bb|barbell_bench_press|1",
  "standing-barbell-overhead-press|6a37a573-0b3e-4ec7-8917-94da410eab4f|standing_barbell_overhead_press|1",
  "dumbbell-lateral-raise|3fa578c9-d2ad-4c48-8f96-2967c490881e|dumbbell_lateral_raise|1",
  "lat-pulldown|0ee93d25-ad3a-46a1-b3d8-d94a7d04ecb2|lat_pulldown|1",
  "seated-cable-row|de77ae88-55a4-4d7d-bcb7-379024da97f5|seated_cable_row|1",
  "cable-triceps-pushdown|3f310a14-8b2f-4614-8b78-d4ed33181c12|cable_triceps_pushdown|1",
  "barbell-back-squat|f2fe7153-b6f7-415b-b15c-a23a43a5c7d2|barbell_back_squat|1",
  "barbell-romanian-deadlift|54ab0a17-eca8-4129-80ef-37fca5e5b618|barbell_romanian_deadlift|1",
  "front-plank|dfe154d4-a3bb-40fb-a80c-41a4a484ca75|front_plank|1"
]);

export type CuratedRegistryExercise = {
  ordinal: number;
  exercise_id: string;
  mapping_set_id: string;
  mapping_version: number;
  mapping_schema_version: string;
  mapping_checksum: string;
  source: string;
  source_id: string;
  name: string;
  slug: string;
  difficulty: string;
  mechanics: string;
  movement_pattern: string;
  force_type: string;
  equipment: string[];
  primary_muscle: string;
  secondary_muscles: string[];
  is_global: boolean;
  is_approved: boolean;
  mapping_status: string;
  mapping_source: string;
  confidence: string;
  evidence_codes: string[];
  entries: Array<{ muscle_id: string; role: string; contribution: number; side_scope: string; sort_order: number }>;
  localizations: Record<string, { name: string }>;
  aliases: Array<{ locale: string; alias: string; alias_type: string; searchable: boolean }>;
  instructions: Array<{ order: number; text: string }>;
  short_description: string;
  provider_decision: Record<string, unknown> & { status: string };
  research_limitations: string[];
  review_status: string;
  review_rationale: string;
};

export type CuratedExerciseRegistry = {
  registry_version: string;
  status: string;
  repository_baseline_sha: string;
  side_scope_rule: string;
  activity_catalog_snapshot: {
    snapshot_date: string;
    live_activity_count: number;
    verified_exact_matches: number;
    unlinked_canonical_exercises: number;
  };
  evidence: Record<string, { PMID?: string; DOI?: string; type: string; note: string }>;
  relationships: Array<{
    relationship_id: string;
    source_slug: string;
    target_slug: string;
    relationship_type: string;
    rationale: string;
    prescription_transfer: string;
    sort_order: number;
  }>;
  exercises: CuratedRegistryExercise[];
  validation_summary: Record<string, number>;
};

export class CuratedRegistryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CuratedRegistryValidationError";
  }
}

function fail(message: string): never {
  throw new CuratedRegistryValidationError(message);
}

function parseUuid(value: string): Buffer {
  const hex = value.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) fail(`Invalid UUID: ${value}.`);
  return Buffer.from(hex, "hex");
}

export function uuidV5(name: string, namespace = URL_NAMESPACE): string {
  const bytes = createHash("sha1").update(Buffer.concat([parseUuid(namespace), Buffer.from(name, "utf8")])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeExerciseAlias(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function mappingEntries(exercise: CuratedRegistryExercise): MuscleMappingEntry[] {
  return exercise.entries.map((entry) => {
    if (!isCanonicalMuscleId(entry.muscle_id)) fail(`Unknown muscle ${entry.muscle_id} for ${exercise.slug}.`);
    if (!isMuscleRole(entry.role)) fail(`Unknown role ${entry.role} for ${exercise.slug}.`);
    if (!isMuscleContribution(entry.contribution)) fail(`Invalid contribution for ${exercise.slug}.`);
    if (!isValidRoleContribution(entry.role, entry.contribution)) fail(`Invalid role/contribution pair for ${exercise.slug}.`);
    if (!isMuscleSideScope(entry.side_scope) || entry.side_scope !== "bilateral") fail(`Invalid side scope for ${exercise.slug}.`);
    if (!Number.isSafeInteger(entry.sort_order) || entry.sort_order <= 0) fail(`Invalid sort order for ${exercise.slug}.`);
    return {
      muscleId: entry.muscle_id,
      role: entry.role,
      contribution: entry.contribution,
      sideScope: entry.side_scope,
      sortOrder: entry.sort_order
    };
  });
}

function assertAcyclicRelationships(registry: CuratedExerciseRegistry): void {
  const graph = new Map<string, string[]>();
  for (const relation of registry.relationships) {
    if (relation.relationship_type !== "progression" && relation.relationship_type !== "regression") continue;
    const outgoing = graph.get(relation.source_slug) ?? [];
    outgoing.push(relation.target_slug);
    graph.set(relation.source_slug, outgoing);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (slug: string) => {
    if (visiting.has(slug)) fail("Progression/regression relationship cycle detected.");
    if (visited.has(slug)) return;
    visiting.add(slug);
    for (const target of graph.get(slug) ?? []) visit(target);
    visiting.delete(slug);
    visited.add(slug);
  };
  for (const slug of graph.keys()) visit(slug);
}

export function validateCuratedExerciseRegistry(value: unknown): CuratedExerciseRegistry {
  if (!value || typeof value !== "object") fail("Registry must be an object.");
  const registry = value as CuratedExerciseRegistry;
  if (registry.registry_version !== REGISTRY_VERSION) fail("Unexpected registry version.");
  if (registry.status !== REGISTRY_STATUS) fail("Unexpected registry status.");
  if (registry.side_scope_rule !== "Generic canonical definitions are bilateral; performed side is captured later.") fail("Unexpected side-scope rule.");
  if (!Array.isArray(registry.exercises) || registry.exercises.length !== 60) fail("Registry must contain exactly 60 exercises.");
  if (!Array.isArray(registry.relationships) || registry.relationships.length !== 32) fail("Registry must contain exactly 32 relationships.");
  if (!registry.evidence || Object.keys(registry.evidence).length !== 21) fail("Registry must contain exactly 21 research sources.");

  const slugs = new Set<string>();
  const sourceIdentities = new Set<string>();
  const exerciseIds = new Set<string>();
  const mappingIds = new Set<string>();
  const aliases = new Set<string>();
  const anyCoverage = new Set<string>();
  const primaryCoverage = new Set<string>();
  let localizationCount = 0;
  let aliasCount = 0;
  let verifiedProviderLinks = 0;
  const verifiedProviderAllowlist = new Set<string>();

  for (const [index, exercise] of registry.exercises.entries()) {
    if (exercise.ordinal !== index + 1) fail(`Exercise ordinal mismatch at index ${index}.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(exercise.slug)) fail(`Invalid exercise slug: ${exercise.slug}.`);
    if (slugs.has(exercise.slug)) fail(`Duplicate slug: ${exercise.slug}.`);
    slugs.add(exercise.slug);
    const sourceIdentity = `${exercise.source}\u0000${exercise.source_id}`;
    if (sourceIdentities.has(sourceIdentity)) fail(`Duplicate source identity for ${exercise.slug}.`);
    sourceIdentities.add(sourceIdentity);
    if (exercise.source !== "plaivra_curated" || exercise.source_id !== `plaivra_curated:v1:${exercise.slug}`) fail(`Invalid source identity for ${exercise.slug}.`);
    if (exercise.exercise_id !== uuidV5(`https://plaivra.com/exercises/v1/${exercise.slug}`)) fail(`Exercise UUID mismatch for ${exercise.slug}.`);
    if (exercise.mapping_set_id !== uuidV5(`https://plaivra.com/exercises/v1/${exercise.slug}/mapping/1`)) fail(`Mapping UUID mismatch for ${exercise.slug}.`);
    if (exerciseIds.has(exercise.exercise_id) || mappingIds.has(exercise.mapping_set_id)) fail(`Duplicate deterministic UUID for ${exercise.slug}.`);
    exerciseIds.add(exercise.exercise_id);
    mappingIds.add(exercise.mapping_set_id);
    if (exercise.mapping_version !== 1 || exercise.mapping_schema_version !== MUSCLE_MAPPING_SCHEMA_VERSION) fail(`Invalid mapping version for ${exercise.slug}.`);
    if (!exercise.is_global || !exercise.is_approved || exercise.mapping_status !== "approved_proposal") fail(`Invalid approval state for ${exercise.slug}.`);
    if (exercise.mapping_source !== "plaivra_research_registry_v1") fail(`Invalid mapping source for ${exercise.slug}.`);

    const localeKeys = Object.keys(exercise.localizations).sort();
    if (JSON.stringify(localeKeys) !== JSON.stringify([...LOCALES].sort())) fail(`Missing EN/DE/AR localization for ${exercise.slug}.`);
    for (const locale of LOCALES) {
      if (!exercise.localizations[locale]?.name?.trim()) fail(`Empty ${locale} localization for ${exercise.slug}.`);
      localizationCount += 1;
    }
    if (exercise.localizations.en.name !== exercise.name) fail(`English canonical name mismatch for ${exercise.slug}.`);
    if (!Array.isArray(exercise.aliases) || exercise.aliases.length !== 3) fail(`Expected three aliases for ${exercise.slug}.`);
    for (const alias of exercise.aliases) {
      if (!LOCALES.includes(alias.locale as (typeof LOCALES)[number])) fail(`Invalid alias locale for ${exercise.slug}.`);
      if (!alias.searchable || !["common_name", "english_gym_term"].includes(alias.alias_type)) fail(`Invalid alias metadata for ${exercise.slug}.`);
      const normalized = normalizeExerciseAlias(alias.alias);
      if (!normalized) fail(`Empty normalized alias for ${exercise.slug}.`);
      const aliasKey = `${alias.locale}\u0000${normalized}`;
      if (aliases.has(aliasKey)) fail(`Alias collision for ${alias.locale}:${normalized}.`);
      aliases.add(aliasKey);
      aliasCount += 1;
    }

    const entries = mappingEntries(exercise);
    if (!entries.some((entry) => entry.role === "primary")) fail(`Mapping lacks primary muscle for ${exercise.slug}.`);
    if (new Set(entries.map((entry) => entry.muscleId)).size !== entries.length) fail(`Duplicate muscle for ${exercise.slug}.`);
    if (new Set(entries.map((entry) => entry.sortOrder)).size !== entries.length) fail(`Duplicate sort order for ${exercise.slug}.`);
    if (calculateMuscleMappingChecksum(entries) !== exercise.mapping_checksum) fail(`Mapping checksum mismatch for ${exercise.slug}.`);
    for (const entry of entries) {
      anyCoverage.add(entry.muscleId);
      if (entry.role === "primary") primaryCoverage.add(entry.muscleId);
    }
    for (const code of exercise.evidence_codes) if (!registry.evidence[code]) fail(`Unknown evidence code ${code} for ${exercise.slug}.`);

    if (exercise.provider_decision.status === "verified_exact_match") {
      verifiedProviderLinks += 1;
      for (const key of ["provider", "provider_activity_id", "provider_slug", "provider_version", "evidence_snapshot_date"]) {
        if (!exercise.provider_decision[key]) fail(`Incomplete verified provider link for ${exercise.slug}.`);
      }
      if (exercise.provider_decision.provider !== "plaivra_activity_catalog") fail(`Invalid provider for ${exercise.slug}.`);
      verifiedProviderAllowlist.add(`${exercise.slug}|${exercise.provider_decision.provider_activity_id}|${exercise.provider_decision.provider_slug}|${exercise.provider_decision.provider_version}`);
    } else if (exercise.provider_decision.status !== "no_verified_match_current_catalog") {
      fail(`Invalid provider decision for ${exercise.slug}.`);
    }
  }

  if (localizationCount !== 180 || aliasCount !== 180) fail("Registry localization or alias count mismatch.");
  if (verifiedProviderLinks !== 9) fail("Registry must contain exactly nine verified provider links.");
  if (verifiedProviderAllowlist.size !== VERIFIED_PROVIDER_LINKS.size || [...verifiedProviderAllowlist].some((link) => !VERIFIED_PROVIDER_LINKS.has(link))) fail("Verified provider-link allowlist does not match the approved nine identities.");
  if (anyCoverage.size !== CANONICAL_MUSCLE_IDS.length || primaryCoverage.size !== CANONICAL_MUSCLE_IDS.length) fail("Registry must cover all 24 muscles in both any and primary roles.");

  const relationshipIds = new Set<string>();
  const relationshipEdges = new Set<string>();
  for (const [index, relation] of registry.relationships.entries()) {
    if (!slugs.has(relation.source_slug) || !slugs.has(relation.target_slug)) fail("Relationship references an unknown exercise.");
    if (relation.source_slug === relation.target_slug) fail("Self relationships are forbidden.");
    if (!RELATIONSHIP_TYPES.has(relation.relationship_type) || !TRANSFER_TYPES.has(relation.prescription_transfer)) fail("Invalid relationship type or transfer value.");
    if (relation.sort_order !== index + 1) fail("Relationship sort order must be contiguous.");
    if (relationshipIds.has(relation.relationship_id)) fail("Duplicate relationship UUID.");
    const expectedRelationshipId = uuidV5(`https://plaivra.com/exercise-relationships/v1/${relation.source_slug}/${relation.relationship_type}/${relation.target_slug}`);
    if (relation.relationship_id !== expectedRelationshipId) fail("Relationship UUID does not match its deterministic identity.");
    relationshipIds.add(relation.relationship_id);
    const edge = `${relation.source_slug}\u0000${relation.relationship_type}\u0000${relation.target_slug}`;
    if (relationshipEdges.has(edge)) fail("Duplicate relationship edge.");
    relationshipEdges.add(edge);
  }
  assertAcyclicRelationships(registry);

  const summary = registry.validation_summary;
  const expectedSummary: Record<string, number> = {
    exercise_count: 60,
    localization_count: 180,
    alias_count: 180,
    relationship_count: 32,
    verified_provider_link_count: 9,
    no_verified_provider_match_count: 51,
    canonical_muscles_with_any_coverage: 24,
    canonical_muscles_with_primary_coverage: 24,
    invalid_role_contribution_pairs: 0,
    alias_collisions: 0,
    relationship_duplicates: 0
  };
  for (const [key, expected] of Object.entries(expectedSummary)) if (summary[key] !== expected) fail(`Validation summary mismatch for ${key}.`);
  if (registry.activity_catalog_snapshot.live_activity_count !== 12 || registry.activity_catalog_snapshot.verified_exact_matches !== 9 || registry.activity_catalog_snapshot.unlinked_canonical_exercises !== 51) fail("Activity Catalog snapshot counts are invalid.");
  return registry;
}

export type GoldenPlanSession = {
  id: string;
  focus: "full_body" | "upper" | "lower" | "push" | "pull" | "legs" | "bodyweight" | "machine_cable";
  exerciseSlugs: string[];
};

export type GoldenPlanFixture = { id: string; kind: string; sessions: GoldenPlanSession[] };

const GOLDEN_PLAN_SESSION_CONTRACTS: Record<string, Array<Pick<GoldenPlanSession, "id" | "focus">>> = {
  beginner_full_body_week: [
    { id: "full_body_a", focus: "full_body" },
    { id: "full_body_b", focus: "full_body" },
    { id: "full_body_c", focus: "full_body" }
  ],
  upper_lower_split: [
    { id: "upper_a", focus: "upper" },
    { id: "lower_a", focus: "lower" },
    { id: "upper_b", focus: "upper" },
    { id: "lower_b", focus: "lower" }
  ],
  push_pull_legs_split: [
    { id: "push_a", focus: "push" },
    { id: "pull_a", focus: "pull" },
    { id: "legs_a", focus: "legs" },
    { id: "push_b", focus: "push" },
    { id: "pull_b", focus: "pull" },
    { id: "legs_b", focus: "legs" }
  ],
  bodyweight_focused: [{ id: "bodyweight", focus: "bodyweight" }],
  machine_cable_focused: [{ id: "machine_cable", focus: "machine_cable" }]
};

const GOLDEN_PUSH_SLUGS = new Set([
  "barbell-bench-press", "incline-dumbbell-bench-press", "push-up", "parallel-bar-chest-dip",
  "standing-cable-chest-fly", "pec-deck-fly", "standing-barbell-overhead-press",
  "seated-dumbbell-shoulder-press", "dumbbell-lateral-raise", "push-up-plus",
  "cable-triceps-pushdown", "overhead-cable-triceps-extension", "lying-triceps-extension",
  "close-grip-barbell-bench-press"
]);
const GOLDEN_PULL_SLUGS = new Set([
  "reverse-pec-deck-fly", "cable-face-pull", "cable-external-rotation", "pull-up", "chin-up",
  "lat-pulldown", "barbell-bent-over-row", "one-arm-dumbbell-row", "seated-cable-row",
  "chest-supported-dumbbell-row", "straight-arm-cable-pulldown", "barbell-shrug",
  "45-degree-back-extension", "farmers-carry", "barbell-curl", "dumbbell-hammer-curl",
  "preacher-curl", "cable-curl"
]);
const GOLDEN_LEGS_SLUGS = new Set([
  "barbell-back-squat", "barbell-front-squat", "goblet-squat", "leg-press", "bulgarian-split-squat",
  "walking-lunge", "step-up", "leg-extension", "conventional-deadlift", "barbell-romanian-deadlift",
  "good-morning", "barbell-hip-thrust", "glute-bridge", "seated-leg-curl", "lying-leg-curl",
  "hip-abduction-machine", "hip-adduction-machine", "standing-cable-hip-flexion", "standing-calf-raise",
  "seated-calf-raise", "tibialis-raise", "front-plank", "side-plank", "cable-crunch",
  "reverse-crunch", "hanging-knee-raise", "pallof-press", "cable-wood-chop"
]);
const GOLDEN_CORE_SLUGS = new Set([
  "front-plank", "side-plank", "cable-crunch", "reverse-crunch", "hanging-knee-raise", "pallof-press", "cable-wood-chop"
]);
const GOLDEN_BODYWEIGHT_SLUGS = new Set([
  "push-up", "parallel-bar-chest-dip", "push-up-plus", "pull-up", "chin-up", "front-plank",
  "side-plank", "reverse-crunch", "hanging-knee-raise"
]);
const GOLDEN_MACHINE_CABLE_SLUGS = new Set([
  "standing-cable-chest-fly", "pec-deck-fly", "reverse-pec-deck-fly", "cable-face-pull",
  "cable-external-rotation", "lat-pulldown", "seated-cable-row", "straight-arm-cable-pulldown",
  "cable-curl", "cable-triceps-pushdown", "overhead-cable-triceps-extension", "leg-press",
  "leg-extension", "seated-leg-curl", "lying-leg-curl", "hip-abduction-machine",
  "hip-adduction-machine", "standing-cable-hip-flexion", "cable-crunch", "pallof-press", "cable-wood-chop"
]);

export function goldenPlanExerciseSlugs(plan: GoldenPlanFixture): string[] {
  return plan.sessions.flatMap((session) => session.exerciseSlugs);
}

export function validateGoldenPlanFixtures(value: unknown, registry: CuratedExerciseRegistry): GoldenPlanFixture[] {
  if (!Array.isArray(value) || value.length !== 5) fail("Exactly five golden-plan fixtures are required.");
  const plans = value as GoldenPlanFixture[];
  const requiredKinds = new Set(Object.keys(GOLDEN_PLAN_SESSION_CONTRACTS));
  const knownSlugs = new Set(registry.exercises.map((exercise) => exercise.slug));
  const covered = new Set<string>();
  for (const plan of plans) {
    if (!requiredKinds.delete(plan.kind)) fail(`Unexpected or duplicate golden-plan kind: ${plan.kind}.`);
    const sessionContract = GOLDEN_PLAN_SESSION_CONTRACTS[plan.kind];
    if (!Array.isArray(plan.sessions) || plan.sessions.length !== sessionContract.length) fail(`Golden plan ${plan.id} has an invalid session contract.`);
    const planSlugs = new Set<string>();
    for (const [sessionIndex, session] of plan.sessions.entries()) {
      const expectedSession = sessionContract[sessionIndex];
      if (session.id !== expectedSession.id || session.focus !== expectedSession.focus) fail(`Golden plan ${plan.id} has an invalid session contract.`);
      if (!Array.isArray(session.exerciseSlugs) || session.exerciseSlugs.length === 0) fail(`Golden plan session ${session.id} is empty.`);
      for (const slug of session.exerciseSlugs) {
        if (!knownSlugs.has(slug)) fail(`Golden plan ${plan.id} references unknown slug ${slug}; identity fallback is forbidden.`);
        if (planSlugs.has(slug)) fail(`Golden plan ${plan.id} repeats exercise slug ${slug}.`);
        planSlugs.add(slug);
        covered.add(slug);
      }

      const allowed = session.focus === "push" ? GOLDEN_PUSH_SLUGS
        : session.focus === "pull" ? GOLDEN_PULL_SLUGS
          : session.focus === "legs" || session.focus === "lower" ? GOLDEN_LEGS_SLUGS
            : session.focus === "upper" ? new Set([...GOLDEN_PUSH_SLUGS, ...GOLDEN_PULL_SLUGS])
              : session.focus === "bodyweight" ? GOLDEN_BODYWEIGHT_SLUGS
                : session.focus === "machine_cable" ? GOLDEN_MACHINE_CABLE_SLUGS
                  : null;
      if (allowed && session.exerciseSlugs.some((slug) => !allowed.has(slug))) fail(`Golden plan session ${session.id} violates its ${session.focus} focus.`);
      if (session.focus === "full_body") {
        const hasUpper = session.exerciseSlugs.some((slug) => GOLDEN_PUSH_SLUGS.has(slug) || GOLDEN_PULL_SLUGS.has(slug));
        const hasLower = session.exerciseSlugs.some((slug) => GOLDEN_LEGS_SLUGS.has(slug) && !GOLDEN_CORE_SLUGS.has(slug));
        const hasCore = session.exerciseSlugs.some((slug) => GOLDEN_CORE_SLUGS.has(slug));
        if (!hasUpper || !hasLower || !hasCore) fail(`Golden plan session ${session.id} is not full-body.`);
      }
    }
  }
  if (requiredKinds.size !== 0 || covered.size !== 60) fail("Golden plans must cover all 60 curated exercises.");
  return plans;
}
