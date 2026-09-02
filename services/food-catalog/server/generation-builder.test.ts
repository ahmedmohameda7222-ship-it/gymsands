import { describe, expect, it, vi } from "vitest";

import type { ControlPlaneActorContext } from "@/lib/food-catalog/domain/generations";
import type { FoodCatalogGenerationCommandStore } from "./generation-store";
import {
  computeGenerationCompositionChecksum,
  createGenerationCandidate,
  normalizeGenerationComposition,
} from "./generation-builder";

const FOOD_A = "51000000-0000-4000-8000-000000000001";
const FOOD_B = "51000000-0000-4000-8000-000000000002";
const FOOD_C = "51000000-0000-4000-8000-000000000003";
const GENERATION_ID = "52000000-0000-4000-8000-000000000001";
const BASE_GENERATION_ID = "52000000-0000-4000-8000-000000000002";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const actor: ControlPlaneActorContext = {
  principalId: "planner-service",
  principalType: "service",
  authorityReference: "plan3-task6",
  reasonCode: "CREATE_CANDIDATE",
  policyVersion: "control-v1",
};

function composition() {
  return {
    compositionSchemaVersion: "composition-v1",
    generationPolicyVersion: "generation-v1",
    activationPolicyVersion: "activation-v1",
    trustPolicyVersion: "trust-v1",
    projectionVersion: "projection-v1",
    foods: [
      {
        foodId: FOOD_B,
        lifecycle: "active" as const,
        nutritionRevisionId: "53000000-0000-4000-8000-000000000002",
        activationSetId: "54000000-0000-4000-8000-000000000002",
        activationSetMemberId: "55000000-0000-4000-8000-000000000002",
        activationGrantEventId: "56000000-0000-4000-8000-000000000002",
      },
      {
        foodId: FOOD_A,
        lifecycle: "deprecated" as const,
        nutritionRevisionId: "53000000-0000-4000-8000-000000000001",
        activationSetId: null,
        activationSetMemberId: null,
        activationGrantEventId: null,
      },
    ],
    servings: [
      { foodId: FOOD_B, servingOptionId: "57000000-0000-4000-8000-000000000002" },
      { foodId: FOOD_A, servingOptionId: "57000000-0000-4000-8000-000000000001" },
    ],
    names: [
      { foodId: FOOD_B, nameFactId: "58000000-0000-4000-8000-000000000002" },
      { foodId: FOOD_A, nameFactId: "58000000-0000-4000-8000-000000000001" },
    ],
    taxonomy: [
      { foodId: FOOD_B, assignmentId: "59000000-0000-4000-8000-000000000002" },
      { foodId: FOOD_A, assignmentId: "59000000-0000-4000-8000-000000000001" },
    ],
    markets: [
      { foodId: FOOD_B, assignmentId: "5a000000-0000-4000-8000-000000000002" },
      { foodId: FOOD_A, assignmentId: "5a000000-0000-4000-8000-000000000001" },
    ],
    verification: [
      { foodId: FOOD_B, scope: "nutrition" as const, assertionId: "5b000000-0000-4000-8000-000000000002" },
      { foodId: FOOD_A, scope: "identity" as const, assertionId: "5b000000-0000-4000-8000-000000000001" },
    ],
    redirects: [
      { sourceFoodId: FOOD_C, targetFoodId: FOOD_B },
    ],
  };
}

function reversedComposition() {
  const value = composition();
  return {
    ...value,
    foods: [...value.foods].reverse(),
    servings: [...value.servings].reverse(),
    names: [...value.names].reverse(),
    taxonomy: [...value.taxonomy].reverse(),
    markets: [...value.markets].reverse(),
    verification: [...value.verification].reverse(),
    redirects: [...value.redirects].reverse(),
  };
}

function commandStore() {
  const createGeneration = vi.fn().mockResolvedValue({
    operationId: "task6-op",
    eventId: "5c000000-0000-4000-8000-000000000001",
    generationId: GENERATION_ID,
    validationReportId: null,
    pointerRevision: null,
  });
  return {
    store: { createGeneration } as unknown as FoodCatalogGenerationCommandStore,
    createGeneration,
  };
}

describe("Food Catalog Plan 3 immutable generation builder", () => {
  it("normalizes every semantic selection with the approved stable tuples", () => {
    const normalized = normalizeGenerationComposition(reversedComposition());

    expect(normalized.foods.map((item: { foodId: string }) => item.foodId)).toEqual([FOOD_A, FOOD_B]);
    expect(normalized.servings.map((item: { foodId: string; servingOptionId: string }) => [item.foodId, item.servingOptionId])).toEqual([
      [FOOD_A, "57000000-0000-4000-8000-000000000001"],
      [FOOD_B, "57000000-0000-4000-8000-000000000002"],
    ]);
    expect(normalized.verification.map((item: { foodId: string; scope: string; assertionId: string }) => [item.foodId, item.scope, item.assertionId])).toEqual([
      [FOOD_A, "identity", "5b000000-0000-4000-8000-000000000001"],
      [FOOD_B, "nutrition", "5b000000-0000-4000-8000-000000000002"],
    ]);
  });

  it("keeps composition checksum invariant to semantic array order", () => {
    expect(computeGenerationCompositionChecksum(composition())).toBe(
      computeGenerationCompositionChecksum(reversedComposition()),
    );
  });

  it("changes composition checksum when a selected fact, lifecycle, or policy changes", () => {
    const original = composition();
    const checksum = computeGenerationCompositionChecksum(original);

    expect(computeGenerationCompositionChecksum({
      ...original,
      servings: original.servings.map((item, index) => index === 0
        ? { ...item, servingOptionId: "57000000-0000-4000-8000-000000000099" }
        : item),
    })).not.toBe(checksum);

    expect(computeGenerationCompositionChecksum({
      ...original,
      foods: original.foods.map((item) => item.foodId === FOOD_A
        ? { ...item, lifecycle: "withdrawn" as const }
        : item),
    })).not.toBe(checksum);

    expect(computeGenerationCompositionChecksum({
      ...original,
      trustPolicyVersion: "trust-v2",
    })).not.toBe(checksum);
  });

  it("rejects duplicate Foods and duplicate selected facts", () => {
    const value = composition();
    expect(() => normalizeGenerationComposition({
      ...value,
      foods: [value.foods[0], { ...value.foods[0] }],
    })).toThrow(/duplicate.*Food/i);

    expect(() => normalizeGenerationComposition({
      ...value,
      servings: [value.servings[0], { ...value.servings[0] }],
    })).toThrow(/duplicate.*serving/i);
  });

  it("rejects duplicate verification scope per Food and duplicate redirect sources", () => {
    const value = composition();
    expect(() => normalizeGenerationComposition({
      ...value,
      verification: [
        value.verification[0],
        { ...value.verification[0], assertionId: "5b000000-0000-4000-8000-000000000099" },
      ],
    })).toThrow(/duplicate.*verification/i);

    expect(() => normalizeGenerationComposition({
      ...value,
      redirects: [
        { sourceFoodId: FOOD_C, targetFoodId: FOOD_B },
        { sourceFoodId: FOOD_C, targetFoodId: FOOD_A },
      ],
    })).toThrow(/duplicate.*redirect/i);
  });

  it("rejects active Foods without activation authority, invalid lifecycle states, and self redirects", () => {
    const value = composition();
    expect(() => normalizeGenerationComposition({
      ...value,
      foods: value.foods.map((item) => item.foodId === FOOD_B
        ? { ...item, activationGrantEventId: null }
        : item),
    })).toThrow(/activation/i);

    for (const lifecycle of ["draft", "merged"] as const) {
      expect(() => normalizeGenerationComposition({
        ...value,
        foods: value.foods.map((item) => item.foodId === FOOD_A
          ? { ...item, lifecycle: lifecycle as never }
          : item),
      })).toThrow(/lifecycle/i);
    }

    expect(() => normalizeGenerationComposition({
      ...value,
      redirects: [{ sourceFoodId: FOOD_B, targetFoodId: FOOD_B }],
    })).toThrow(/self redirect/i);
  });

  it("creates the sealed candidate through the command store with the full normalized snapshot", async () => {
    const { store, createGeneration } = commandStore();
    const value = reversedComposition();

    await createGenerationCandidate(store, {
      ...value,
      operationId: "task6-op",
      commandChecksumSha256: SHA_A,
      generationId: GENERATION_ID,
      eventId: "5c000000-0000-4000-8000-000000000001",
      baseGenerationId: BASE_GENERATION_ID,
      generationOrdinal: 7,
      changeManifestChecksumSha256: SHA_B,
      authorityReference: "plan3-task6-candidate",
      actor,
    });

    expect(createGeneration).toHaveBeenCalledTimes(1);
    const command = createGeneration.mock.calls[0][0];
    expect(command.operationId).toBe("task6-op");
    expect(command.commandChecksumSha256).toBe(SHA_A);
    expect(command.payload).toEqual(expect.objectContaining({
      generation_id: GENERATION_ID,
      base_generation_id: BASE_GENERATION_ID,
      generation_ordinal: 7,
      composition_schema_version: "composition-v1",
      generation_policy_version: "generation-v1",
      activation_policy_version: "activation-v1",
      trust_policy_version: "trust-v1",
      projection_version: "projection-v1",
      change_manifest_checksum_sha256: SHA_B,
      composition_checksum_sha256: computeGenerationCompositionChecksum(value),
      authority_reference: "plan3-task6-candidate",
      actor: {
        principal_id: actor.principalId,
        principal_type: actor.principalType,
        authority_reference: actor.authorityReference,
        reason_code: actor.reasonCode,
        policy_version: actor.policyVersion,
      },
    }));
    expect(command.payload.foods.map((item: { food_id: string }) => item.food_id)).toEqual([FOOD_A, FOOD_B]);
    expect(command.payload.servings.map((item: { food_id: string }) => item.food_id)).toEqual([FOOD_A, FOOD_B]);
  });

  it("excludes generation identity, base, ordinal, operation, actor, and event metadata from composition checksum", async () => {
    const first = commandStore();
    const second = commandStore();
    const value = composition();

    await createGenerationCandidate(first.store, {
      ...value,
      operationId: "operation-one",
      commandChecksumSha256: SHA_A,
      generationId: GENERATION_ID,
      eventId: "5c000000-0000-4000-8000-000000000001",
      baseGenerationId: BASE_GENERATION_ID,
      generationOrdinal: 7,
      changeManifestChecksumSha256: SHA_B,
      authorityReference: "authority-one",
      actor,
    });
    await createGenerationCandidate(second.store, {
      ...value,
      operationId: "operation-two",
      commandChecksumSha256: SHA_B,
      generationId: "52000000-0000-4000-8000-000000000099",
      eventId: "5c000000-0000-4000-8000-000000000099",
      baseGenerationId: null,
      generationOrdinal: 99,
      changeManifestChecksumSha256: SHA_A,
      authorityReference: "authority-two",
      actor: { ...actor, principalId: "another-service", reasonCode: "ANOTHER_REASON" },
    });

    expect(first.createGeneration.mock.calls[0][0].payload.composition_checksum_sha256).toBe(
      second.createGeneration.mock.calls[0][0].payload.composition_checksum_sha256,
    );
  });
});
