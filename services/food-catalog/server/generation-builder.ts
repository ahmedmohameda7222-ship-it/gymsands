import "server-only";

import {
  validateControlPlaneActorContext,
  validateGenerationFoodSelection,
  validateGenerationRedirectSelection,
  validateGenerationVerificationSelection,
  type ControlPlaneActorContext,
  type GenerationFoodSelection,
  type GenerationRedirectSelection,
  type GenerationVerificationSelection,
} from "@/lib/food-catalog/domain/generations";
import type { FoodVerificationScope } from "@/lib/food-catalog/domain/verification";
import { sha256Canonical } from "./canonical-hash";
import type { GenerationCommandResult } from "./generation-contracts";
import type { FoodCatalogGenerationCommandStore } from "./generation-store";

export type GenerationServingSelection = {
  foodId: string;
  servingOptionId: string;
};

export type GenerationNameSelection = {
  foodId: string;
  nameFactId: string;
};

export type GenerationAssignmentSelection = {
  foodId: string;
  assignmentId: string;
};

export type GenerationCompositionInput = {
  compositionSchemaVersion: string;
  generationPolicyVersion: string;
  activationPolicyVersion: string;
  trustPolicyVersion: string;
  projectionVersion: string;
  foods: readonly GenerationFoodSelection[];
  servings: readonly GenerationServingSelection[];
  names: readonly GenerationNameSelection[];
  taxonomy: readonly GenerationAssignmentSelection[];
  markets: readonly GenerationAssignmentSelection[];
  verification: readonly GenerationVerificationSelection[];
  redirects: readonly GenerationRedirectSelection[];
};

export type NormalizedGenerationComposition = {
  compositionSchemaVersion: string;
  generationPolicyVersion: string;
  activationPolicyVersion: string;
  trustPolicyVersion: string;
  projectionVersion: string;
  foods: GenerationFoodSelection[];
  servings: GenerationServingSelection[];
  names: GenerationNameSelection[];
  taxonomy: GenerationAssignmentSelection[];
  markets: GenerationAssignmentSelection[];
  verification: GenerationVerificationSelection[];
  redirects: GenerationRedirectSelection[];
};

export type CreateGenerationCandidateInput = GenerationCompositionInput & {
  operationId: string;
  commandChecksumSha256: string;
  generationId: string;
  eventId?: string;
  baseGenerationId: string | null;
  generationOrdinal: number | null;
  changeManifestChecksumSha256: string;
  authorityReference: string;
  actor: ControlPlaneActorContext;
};

const SHA256 = /^[0-9a-f]{64}$/;

function requireNonblank(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be nonblank.`);
  }
  return value;
}

function requireNullableNonblank(value: string | null, label: string): string | null {
  if (value === null) return null;
  return requireNonblank(value, label);
}

function requireChecksum(value: string, label: string): string {
  requireNonblank(value, label);
  if (!SHA256.test(value)) {
    throw new Error(`${label} must be lowercase SHA-256 hex.`);
  }
  return value;
}

function tupleCompare(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const compared = (left[index] ?? "").localeCompare(right[index] ?? "");
    if (compared !== 0) return compared;
  }
  return 0;
}

function requireArray<T>(value: readonly T[], label: string): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function normalizeSimpleSelection<T extends Record<string, string>>(
  values: readonly T[],
  label: string,
  idField: keyof T,
  tuple: (value: T) => readonly string[],
): T[] {
  const normalized = requireArray(values, label).map((value) => {
    requireNonblank(value.foodId, `${label} Food ID`);
    requireNonblank(value[idField], `${label} selected ID`);
    return { ...value };
  }).sort((left, right) => tupleCompare(tuple(left), tuple(right)));

  const seen = new Set<string>();
  for (const value of normalized) {
    const key = tuple(value).join("\u0000");
    if (seen.has(key)) throw new Error(`Generation composition contains duplicate ${label.toLowerCase()} selection.`);
    seen.add(key);
  }
  return normalized;
}

function actorPayload(actor: ControlPlaneActorContext) {
  const value = validateControlPlaneActorContext(actor);
  return {
    principal_id: value.principalId,
    principal_type: value.principalType,
    authority_reference: value.authorityReference,
    reason_code: value.reasonCode,
    policy_version: value.policyVersion,
  };
}

export function normalizeGenerationComposition(
  input: GenerationCompositionInput,
): NormalizedGenerationComposition {
  const compositionSchemaVersion = requireNonblank(input.compositionSchemaVersion, "Generation composition schema version");
  const generationPolicyVersion = requireNonblank(input.generationPolicyVersion, "Generation policy version");
  const activationPolicyVersion = requireNonblank(input.activationPolicyVersion, "Generation activation policy version");
  const trustPolicyVersion = requireNonblank(input.trustPolicyVersion, "Generation trust policy version");
  const projectionVersion = requireNonblank(input.projectionVersion, "Generation projection version");

  const foods = requireArray(input.foods, "Generation Foods")
    .map((food) => ({ ...validateGenerationFoodSelection({ ...food }) }))
    .sort((left, right) => tupleCompare([left.foodId], [right.foodId]));
  const seenFoods = new Set<string>();
  for (const food of foods) {
    if (seenFoods.has(food.foodId)) {
      throw new Error(`Generation composition contains duplicate Food ID ${food.foodId}.`);
    }
    seenFoods.add(food.foodId);
  }

  const servings = normalizeSimpleSelection(
    input.servings,
    "Generation serving",
    "servingOptionId",
    (value) => [value.foodId, value.servingOptionId],
  );
  const names = normalizeSimpleSelection(
    input.names,
    "Generation name",
    "nameFactId",
    (value) => [value.foodId, value.nameFactId],
  );
  const taxonomy = normalizeSimpleSelection(
    input.taxonomy,
    "Generation taxonomy",
    "assignmentId",
    (value) => [value.foodId, value.assignmentId],
  );
  const markets = normalizeSimpleSelection(
    input.markets,
    "Generation market",
    "assignmentId",
    (value) => [value.foodId, value.assignmentId],
  );

  const verification = requireArray(input.verification, "Generation verification")
    .map((selection) => ({ ...validateGenerationVerificationSelection({ ...selection }) }))
    .sort((left, right) => tupleCompare(
      [left.foodId, left.scope, left.assertionId],
      [right.foodId, right.scope, right.assertionId],
    ));
  const seenVerification = new Set<string>();
  for (const selection of verification) {
    const key = `${selection.foodId}\u0000${selection.scope}`;
    if (seenVerification.has(key)) {
      throw new Error(`Generation composition contains duplicate verification selection for Food ${selection.foodId} scope ${selection.scope}.`);
    }
    seenVerification.add(key);
  }

  const redirects = requireArray(input.redirects, "Generation redirects")
    .map((redirect) => ({ ...validateGenerationRedirectSelection({ ...redirect }) }))
    .sort((left, right) => tupleCompare(
      [left.sourceFoodId, left.targetFoodId],
      [right.sourceFoodId, right.targetFoodId],
    ));
  const seenRedirectSources = new Set<string>();
  for (const redirect of redirects) {
    if (seenRedirectSources.has(redirect.sourceFoodId)) {
      throw new Error(`Generation composition contains duplicate redirect source Food ${redirect.sourceFoodId}.`);
    }
    seenRedirectSources.add(redirect.sourceFoodId);
  }

  return {
    compositionSchemaVersion,
    generationPolicyVersion,
    activationPolicyVersion,
    trustPolicyVersion,
    projectionVersion,
    foods,
    servings,
    names,
    taxonomy,
    markets,
    verification,
    redirects,
  };
}

export function computeGenerationCompositionChecksum(input: GenerationCompositionInput): string {
  return sha256Canonical(normalizeGenerationComposition(input));
}

function persistedFood(food: GenerationFoodSelection) {
  return {
    food_id: food.foodId,
    lifecycle: food.lifecycle,
    nutrition_revision_id: food.nutritionRevisionId,
    activation_set_id: food.activationSetId,
    activation_set_member_id: food.activationSetMemberId,
    activation_grant_event_id: food.activationGrantEventId,
  };
}

function persistedVerification(selection: {
  foodId: string;
  scope: FoodVerificationScope;
  assertionId: string;
}) {
  return {
    food_id: selection.foodId,
    assertion_scope: selection.scope,
    assertion_id: selection.assertionId,
  };
}

export async function createGenerationCandidate(
  commandStore: FoodCatalogGenerationCommandStore,
  input: CreateGenerationCandidateInput,
): Promise<GenerationCommandResult> {
  requireNonblank(input.operationId, "Generation operation ID");
  requireChecksum(input.commandChecksumSha256, "Generation command checksum");
  requireNonblank(input.generationId, "Generation ID");
  if (input.eventId !== undefined) requireNonblank(input.eventId, "Generation event ID");
  requireNullableNonblank(input.baseGenerationId, "Generation base ID");
  if (input.baseGenerationId === input.generationId) {
    throw new Error("Generation base ID cannot equal candidate generation ID.");
  }
  if (input.generationOrdinal !== null && (!Number.isInteger(input.generationOrdinal) || input.generationOrdinal <= 0)) {
    throw new Error("Generation ordinal must be a positive integer or null.");
  }
  requireChecksum(input.changeManifestChecksumSha256, "Generation change manifest checksum");
  requireNonblank(input.authorityReference, "Generation authority reference");
  validateControlPlaneActorContext(input.actor);

  const composition = normalizeGenerationComposition(input);
  const compositionChecksumSha256 = sha256Canonical(composition);

  return commandStore.createGeneration({
    operationId: input.operationId,
    commandChecksumSha256: input.commandChecksumSha256,
    payload: {
      generation_id: input.generationId,
      ...(input.eventId === undefined ? {} : { event_id: input.eventId }),
      base_generation_id: input.baseGenerationId,
      generation_ordinal: input.generationOrdinal,
      composition_schema_version: composition.compositionSchemaVersion,
      generation_policy_version: composition.generationPolicyVersion,
      activation_policy_version: composition.activationPolicyVersion,
      trust_policy_version: composition.trustPolicyVersion,
      projection_version: composition.projectionVersion,
      change_manifest_checksum_sha256: input.changeManifestChecksumSha256,
      composition_checksum_sha256: compositionChecksumSha256,
      authority_reference: input.authorityReference,
      actor: actorPayload(input.actor),
      foods: composition.foods.map(persistedFood),
      servings: composition.servings.map((selection) => ({
        food_id: selection.foodId,
        serving_option_id: selection.servingOptionId,
      })),
      names: composition.names.map((selection) => ({
        food_id: selection.foodId,
        name_fact_id: selection.nameFactId,
      })),
      taxonomy: composition.taxonomy.map((selection) => ({
        food_id: selection.foodId,
        taxonomy_assignment_id: selection.assignmentId,
      })),
      markets: composition.markets.map((selection) => ({
        food_id: selection.foodId,
        market_assignment_id: selection.assignmentId,
      })),
      verification: composition.verification.map(persistedVerification),
      redirects: composition.redirects.map((redirect) => ({
        source_food_id: redirect.sourceFoodId,
        target_food_id: redirect.targetFoodId,
      })),
    },
  });
}
