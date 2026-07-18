import { createHash } from "node:crypto";

import { calculateMuscleMappingChecksum } from "./checksum";
import {
  isMuscleContribution,
  isMuscleRole,
  isMuscleSideScope,
  isValidRoleContribution,
  type MuscleMappingEntry
} from "./contracts";
import { isCanonicalMuscleId } from "./taxonomy";
import { MUSCLE_MAPPING_SCHEMA_VERSION } from "./versions";

const URL_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const REGISTRY_VERSION = "plaivra_curated_exercises_v1";
const REQUIRED_LOCALES = ["en", "de", "ar"] as const;
const RELATIONSHIP_TYPES = new Set(["variation", "alternative", "progression", "regression"]);
const TRANSFER_TYPES = new Set(["full", "partial", "none"]);
const ALIAS_TYPES = new Set(["common_name", "english_gym_term"]);
const GOLDEN_PLAN_FOCI = new Set([
  "full_body",
  "upper",
  "lower",
  "push",
  "pull",
  "legs",
  "bodyweight",
  "machine_cable"
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
  status?: string;
  repository_baseline_sha?: string;
  side_scope_rule: string;
  activity_catalog_snapshot?: Record<string, unknown>;
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
  validation_summary?: Record<string, number>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseUuid(value: string): Buffer {
  const hex = value.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) fail(`Invalid UUID: ${value}.`);
  return Buffer.from(hex, "hex");
}

export function uuidV5(name: string, namespace = URL_NAMESPACE): string {
  const bytes = createHash("sha1")
    .update(Buffer.concat([parseUuid(namespace), Buffer.from(name, "utf8")]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeExerciseAlias(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function mappingEntries(exercise: CuratedRegistryExercise): MuscleMappingEntry[] {
  if (!Array.isArray(exercise.entries) || exercise.entries.length === 0) {
    fail(`Mapping entries are required for ${exercise.slug}.`);
  }

  return exercise.entries.map((entry) => {
    if (!isCanonicalMuscleId(entry.muscle_id)) fail(`Unknown muscle ${entry.muscle_id} for ${exercise.slug}.`);
    if (!isMuscleRole(entry.role)) fail(`Unknown role ${entry.role} for ${exercise.slug}.`);
    if (!isMuscleContribution(entry.contribution)) fail(`Invalid contribution for ${exercise.slug}.`);
    if (!isValidRoleContribution(entry.role, entry.contribution)) fail(`Invalid role/contribution pair for ${exercise.slug}.`);
    if (!isMuscleSideScope(entry.side_scope)) fail(`Invalid side scope for ${exercise.slug}.`);
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
  if (!isRecord(value)) fail("Registry must be an object.");
  const registry = value as unknown as CuratedExerciseRegistry;

  if (registry.registry_version !== REGISTRY_VERSION) fail("Unexpected registry version.");
  if (registry.side_scope_rule !== "Generic canonical definitions are bilateral; performed side is captured later.") {
    fail("Unexpected side-scope rule.");
  }
  if (!Array.isArray(registry.exercises) || registry.exercises.length === 0) fail("Registry must contain exercises.");
  if (!Array.isArray(registry.relationships)) fail("Registry relationships must be an array.");
  if (!isRecord(registry.evidence)) fail("Registry evidence must be an object.");

  const ordinals = new Set<number>();
  const slugs = new Set<string>();
  const sourceIdentities = new Set<string>();
  const exerciseIds = new Set<string>();
  const mappingIds = new Set<string>();
  const aliases = new Set<string>();
  const providerIdentities = new Set<string>();

  for (const exercise of registry.exercises) {
    if (!Number.isSafeInteger(exercise.ordinal) || exercise.ordinal <= 0 || ordinals.has(exercise.ordinal)) {
      fail(`Invalid or duplicate exercise ordinal for ${exercise.slug}.`);
    }
    ordinals.add(exercise.ordinal);

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(exercise.slug)) fail(`Invalid exercise slug: ${exercise.slug}.`);
    if (slugs.has(exercise.slug)) fail(`Duplicate slug: ${exercise.slug}.`);
    slugs.add(exercise.slug);

    const sourceIdentity = `${exercise.source}\u0000${exercise.source_id}`;
    if (sourceIdentities.has(sourceIdentity)) fail(`Duplicate source identity for ${exercise.slug}.`);
    sourceIdentities.add(sourceIdentity);
    if (exercise.source !== "plaivra_curated" || exercise.source_id !== `plaivra_curated:v1:${exercise.slug}`) {
      fail(`Invalid source identity for ${exercise.slug}.`);
    }

    if (exercise.exercise_id !== uuidV5(`https://plaivra.com/exercises/v1/${exercise.slug}`)) {
      fail(`Exercise UUID mismatch for ${exercise.slug}.`);
    }
    if (exercise.mapping_set_id !== uuidV5(`https://plaivra.com/exercises/v1/${exercise.slug}/mapping/${exercise.mapping_version}`)) {
      fail(`Mapping UUID mismatch for ${exercise.slug}.`);
    }
    if (exerciseIds.has(exercise.exercise_id) || mappingIds.has(exercise.mapping_set_id)) {
      fail(`Duplicate deterministic UUID for ${exercise.slug}.`);
    }
    exerciseIds.add(exercise.exercise_id);
    mappingIds.add(exercise.mapping_set_id);

    if (!Number.isSafeInteger(exercise.mapping_version) || exercise.mapping_version <= 0) {
      fail(`Invalid mapping version for ${exercise.slug}.`);
    }
    if (exercise.mapping_schema_version !== MUSCLE_MAPPING_SCHEMA_VERSION) {
      fail(`Invalid mapping schema version for ${exercise.slug}.`);
    }
    if (!exercise.is_global || !exercise.is_approved) fail(`Exercise ${exercise.slug} is not approved global content.`);
    if (!isNonEmptyText(exercise.mapping_status) || !isNonEmptyText(exercise.mapping_source)) {
      fail(`Mapping lifecycle metadata is incomplete for ${exercise.slug}.`);
    }

    if (!isRecord(exercise.localizations)) fail(`Localizations are missing for ${exercise.slug}.`);
    for (const locale of REQUIRED_LOCALES) {
      if (!isNonEmptyText(exercise.localizations[locale]?.name)) fail(`Missing ${locale} localization for ${exercise.slug}.`);
    }
    if (exercise.localizations.en.name !== exercise.name) fail(`English canonical name mismatch for ${exercise.slug}.`);

    if (!Array.isArray(exercise.aliases)) fail(`Aliases must be an array for ${exercise.slug}.`);
    for (const alias of exercise.aliases) {
      if (!isNonEmptyText(alias.locale) || !isNonEmptyText(alias.alias)) fail(`Invalid alias for ${exercise.slug}.`);
      if (!ALIAS_TYPES.has(alias.alias_type)) fail(`Invalid alias type for ${exercise.slug}.`);
      const normalized = normalizeExerciseAlias(alias.alias);
      const aliasKey = `${alias.locale}\u0000${normalized}`;
      if (aliases.has(aliasKey)) fail(`Alias collision for ${alias.locale}:${normalized}.`);
      aliases.add(aliasKey);
    }

    const entries = mappingEntries(exercise);
    if (!entries.some((entry) => entry.role === "primary")) fail(`Mapping lacks primary muscle for ${exercise.slug}.`);
    if (new Set(entries.map((entry) => entry.muscleId)).size !== entries.length) fail(`Duplicate muscle for ${exercise.slug}.`);
    if (new Set(entries.map((entry) => entry.sortOrder)).size !== entries.length) fail(`Duplicate sort order for ${exercise.slug}.`);
    if (calculateMuscleMappingChecksum(entries) !== exercise.mapping_checksum) fail(`Mapping checksum mismatch for ${exercise.slug}.`);

    if (!Array.isArray(exercise.evidence_codes)) fail(`Evidence codes must be an array for ${exercise.slug}.`);
    for (const code of exercise.evidence_codes) {
      if (!registry.evidence[code]) fail(`Unknown evidence code ${code} for ${exercise.slug}.`);
    }

    if (!Array.isArray(exercise.instructions) || exercise.instructions.length === 0) {
      fail(`Instructions are required for ${exercise.slug}.`);
    }
    const instructionOrders = new Set<number>();
    for (const instruction of exercise.instructions) {
      if (!Number.isSafeInteger(instruction.order) || instruction.order <= 0 || instructionOrders.has(instruction.order)) {
        fail(`Invalid instruction order for ${exercise.slug}.`);
      }
      if (!isNonEmptyText(instruction.text)) fail(`Empty instruction for ${exercise.slug}.`);
      instructionOrders.add(instruction.order);
    }

    if (exercise.provider_decision.status === "verified_exact_match") {
      const provider = exercise.provider_decision.provider;
      const activityId = exercise.provider_decision.provider_activity_id;
      const providerSlug = exercise.provider_decision.provider_slug;
      const providerVersion = exercise.provider_decision.provider_version;
      const snapshotDate = exercise.provider_decision.evidence_snapshot_date;
      if (
        provider !== "plaivra_activity_catalog" ||
        !isNonEmptyText(activityId) ||
        !isNonEmptyText(providerSlug) ||
        !isNonEmptyText(providerVersion) ||
        !isNonEmptyText(snapshotDate)
      ) {
        fail(`Incomplete verified provider link for ${exercise.slug}.`);
      }
      const providerIdentity = `${provider}\u0000${activityId}`;
      if (providerIdentities.has(providerIdentity)) fail(`Duplicate verified provider identity for ${exercise.slug}.`);
      providerIdentities.add(providerIdentity);
    } else if (exercise.provider_decision.status !== "no_verified_match_current_catalog") {
      fail(`Invalid provider decision for ${exercise.slug}.`);
    }
  }

  const relationshipIds = new Set<string>();
  const relationshipEdges = new Set<string>();
  const relationshipOrders = new Set<number>();
  for (const relation of registry.relationships) {
    if (!slugs.has(relation.source_slug) || !slugs.has(relation.target_slug)) fail("Relationship references an unknown exercise.");
    if (relation.source_slug === relation.target_slug) fail("Self relationships are forbidden.");
    if (!RELATIONSHIP_TYPES.has(relation.relationship_type) || !TRANSFER_TYPES.has(relation.prescription_transfer)) {
      fail("Invalid relationship type or transfer value.");
    }
    if (!Number.isSafeInteger(relation.sort_order) || relation.sort_order <= 0 || relationshipOrders.has(relation.sort_order)) {
      fail("Invalid or duplicate relationship sort order.");
    }
    relationshipOrders.add(relation.sort_order);
    if (relationshipIds.has(relation.relationship_id)) fail("Duplicate relationship UUID.");
    const expectedRelationshipId = uuidV5(
      `https://plaivra.com/exercise-relationships/v1/${relation.source_slug}/${relation.relationship_type}/${relation.target_slug}`
    );
    if (relation.relationship_id !== expectedRelationshipId) fail("Relationship UUID does not match its deterministic identity.");
    relationshipIds.add(relation.relationship_id);
    const edge = `${relation.source_slug}\u0000${relation.relationship_type}\u0000${relation.target_slug}`;
    if (relationshipEdges.has(edge)) fail("Duplicate relationship edge.");
    relationshipEdges.add(edge);
  }

  assertAcyclicRelationships(registry);
  return registry;
}

export type GoldenPlanSession = {
  id: string;
  focus: "full_body" | "upper" | "lower" | "push" | "pull" | "legs" | "bodyweight" | "machine_cable";
  exerciseSlugs: string[];
};

export type GoldenPlanFixture = { id: string; kind: string; sessions: GoldenPlanSession[] };

export function goldenPlanExerciseSlugs(plan: GoldenPlanFixture): string[] {
  return plan.sessions.flatMap((session) => session.exerciseSlugs);
}

export function validateGoldenPlanFixtures(value: unknown, registry: CuratedExerciseRegistry): GoldenPlanFixture[] {
  if (!Array.isArray(value)) fail("Golden-plan fixtures must be an array.");
  const plans = value as GoldenPlanFixture[];
  const knownSlugs = new Set(registry.exercises.map((exercise) => exercise.slug));
  const planIds = new Set<string>();

  for (const plan of plans) {
    if (!isNonEmptyText(plan.id) || planIds.has(plan.id)) fail("Golden-plan IDs must be unique and non-empty.");
    planIds.add(plan.id);
    if (!isNonEmptyText(plan.kind)) fail(`Golden plan ${plan.id} has no kind.`);
    if (!Array.isArray(plan.sessions) || plan.sessions.length === 0) fail(`Golden plan ${plan.id} has no sessions.`);

    const sessionIds = new Set<string>();
    const planSlugs = new Set<string>();
    for (const session of plan.sessions) {
      if (!isNonEmptyText(session.id) || sessionIds.has(session.id)) fail(`Golden plan ${plan.id} has an invalid session ID.`);
      sessionIds.add(session.id);
      if (!GOLDEN_PLAN_FOCI.has(session.focus)) fail(`Golden plan session ${session.id} has an invalid focus.`);
      if (!Array.isArray(session.exerciseSlugs) || session.exerciseSlugs.length === 0) {
        fail(`Golden plan session ${session.id} is empty.`);
      }
      for (const slug of session.exerciseSlugs) {
        if (!knownSlugs.has(slug)) fail(`Golden plan ${plan.id} references unknown slug ${slug}; identity fallback is forbidden.`);
        if (planSlugs.has(slug)) fail(`Golden plan ${plan.id} repeats exercise slug ${slug}.`);
        planSlugs.add(slug);
      }
    }
  }

  return plans;
}
