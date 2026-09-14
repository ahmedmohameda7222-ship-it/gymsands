import "server-only";

import {
  validateControlPlaneActorContext,
  type ControlPlaneActorContext,
  type GenerationFoodSelection,
} from "@/lib/food-catalog/domain/generations";
import type { FoodVerificationScope } from "@/lib/food-catalog/domain/verification";
import {
  computeGenerationCompositionChecksum,
  normalizeGenerationComposition,
  type GenerationCompositionInput,
} from "@/lib/food-catalog/generation-composition";
import type { GenerationCommandResult } from "./generation-contracts";
import type { FoodCatalogGenerationCommandStore } from "./generation-store";

export {
  computeGenerationCompositionChecksum,
  normalizeGenerationComposition,
} from "@/lib/food-catalog/generation-composition";
export type {
  GenerationAssignmentSelection,
  GenerationCompositionInput,
  GenerationNameSelection,
  GenerationServingSelection,
  NormalizedGenerationComposition,
} from "@/lib/food-catalog/generation-composition";

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
  const compositionChecksumSha256 = computeGenerationCompositionChecksum(input);

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
