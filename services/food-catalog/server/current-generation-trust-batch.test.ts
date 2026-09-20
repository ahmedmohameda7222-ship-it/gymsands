import { describe, expect, it, vi } from "vitest";

import type { FoodTrustProfile } from "@/lib/food-catalog/domain/trust";
import type {
  StoredFoodMarketAssignment,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";
import type {
  StoredActivationAuthority,
  StoredCatalogGeneration,
  StoredGenerationFood,
  StoredGenerationRedirect,
  StoredGenerationSelections,
} from "./generation-contracts";
import * as currentGenerationService from "./current-generation-service";

type TrustResult = {
  requestedFoodId: string;
  resolvedFoodId: string | null;
  trust: FoodTrustProfile | null;
};

type BatchHydration = {
  selectionsByFoodId: Record<string, StoredGenerationSelections>;
  nutritionRevisions: StoredFoodNutritionRevision[];
  servingOptions: StoredFoodServingOption[];
  names: StoredFoodNameFact[];
  taxonomyAssignments: StoredFoodTaxonomyAssignment[];
  marketAssignments: StoredFoodMarketAssignment[];
  verificationAssertions: StoredFoodVerificationAssertion[];
  activationAuthorities: StoredActivationAuthority[];
};

type BatchStore = {
  readCurrentPointer: ReturnType<typeof vi.fn>;
  readGeneration: ReturnType<typeof vi.fn>;
  readGenerationEvent: ReturnType<typeof vi.fn>;
  readValidationReport: ReturnType<typeof vi.fn>;
  readGenerationFoodsByIds: ReturnType<typeof vi.fn>;
  readGenerationRedirectsBySourceIds: ReturnType<typeof vi.fn>;
  readGenerationTrustHydration: ReturnType<typeof vi.fn>;
};

const resolveBatch = (currentGenerationService as unknown as {
  resolveCurrentGenerationTrustForNewUseBatch?: (
    store: BatchStore,
    requestedFoodIds: readonly string[],
  ) => Promise<Map<string, TrustResult>>;
}).resolveCurrentGenerationTrustForNewUseBatch;

const GENERATION_ID = "81000000-0000-4000-8000-000000000001";
const EVENT_ID = "82000000-0000-4000-8000-000000000001";
const REPORT_ID = "83000000-0000-4000-8000-000000000001";
const SHA = "a".repeat(64);

const generation: StoredCatalogGeneration = {
  id: GENERATION_ID,
  baseGenerationId: null,
  generationOrdinal: 1,
  compositionSchemaVersion: "composition-v1",
  generationPolicyVersion: "generation-v1",
  activationPolicyVersion: "activation-v1",
  trustPolicyVersion: "trust-v1",
  projectionVersion: "projection-v1",
  changeManifestChecksumSha256: "b".repeat(64),
  compositionChecksumSha256: SHA,
  authorityReference: "fixture",
  createdAt: "2026-09-02T09:00:00.000Z",
  sealedAt: "2026-09-02T10:00:00.000Z",
};

function uuid(prefix: string, index: number) {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function foodId(index: number) { return uuid("9", index); }
function nutritionId(index: number) { return uuid("a", index); }
function servingId(index: number) { return uuid("b", index); }
function nameId(index: number) { return uuid("c", index); }
function identityAssertionId(index: number) { return uuid("d", index * 2); }
function nutritionAssertionId(index: number) { return uuid("d", index * 2 + 1); }
function activationSetId(index: number) { return uuid("e", index * 3); }
function activationMemberId(index: number) { return uuid("e", index * 3 + 1); }
function activationGrantId(index: number) { return uuid("e", index * 3 + 2); }

function activeFood(id: string, index: number): StoredGenerationFood {
  return {
    generationId: GENERATION_ID,
    foodId: id,
    lifecycle: "active",
    nutritionRevisionId: nutritionId(index),
    activationSetId: activationSetId(index),
    activationSetMemberId: activationMemberId(index),
    activationGrantEventId: activationGrantId(index),
  };
}

function inactiveFood(id: string, lifecycle: "deprecated" | "withdrawn"): StoredGenerationFood {
  return {
    generationId: GENERATION_ID,
    foodId: id,
    lifecycle,
    nutritionRevisionId: null,
    activationSetId: null,
    activationSetMemberId: null,
    activationGrantEventId: null,
  };
}

function hydrationFor(foods: readonly StoredGenerationFood[]): BatchHydration {
  const selectionsByFoodId: Record<string, StoredGenerationSelections> = {};
  const nutritionRevisions: StoredFoodNutritionRevision[] = [];
  const servingOptions: StoredFoodServingOption[] = [];
  const names: StoredFoodNameFact[] = [];
  const verificationAssertions: StoredFoodVerificationAssertion[] = [];
  const activationAuthorities: StoredActivationAuthority[] = [];

  foods.forEach((food, offset) => {
    const index = Number(food.foodId.slice(-12)) || offset + 1;
    const selection: StoredGenerationSelections = {
      servingOptionIds: [servingId(index)],
      nameFactIds: [nameId(index)],
      taxonomyAssignmentIds: [],
      marketAssignmentIds: [],
      verification: [
        { foodId: food.foodId, scope: "identity", assertionId: identityAssertionId(index) },
        { foodId: food.foodId, scope: "nutrition", assertionId: nutritionAssertionId(index) },
      ],
    };
    selectionsByFoodId[food.foodId] = selection;
    nutritionRevisions.push({
      id: nutritionId(index),
      createdAt: "2026-09-02T09:00:00.000Z",
      foodId: food.foodId,
      revisionNumber: 1,
      calories: 100,
      protein_g: 10,
      carbs_g: 12,
      fat_g: 2,
      saturated_fat_g: null,
      fiber_g: 3,
      sugars_g: null,
      sodium_mg: null,
      basisAmount: 100,
      basisUnit: "g",
      nutrientMappingVersion: "map-v1",
      sourceRecordId: null,
    });
    servingOptions.push({
      id: servingId(index),
      createdAt: "2026-09-02T09:00:00.000Z",
      foodId: food.foodId,
      label: "1 bowl",
      amount: 1,
      unitCode: "bowl",
      gramWeight: 100,
      sourceRecordId: null,
      sourcePortionCode: null,
      evidenceClass: "exact_source",
      sourcePrimary: true,
    });
    names.push({
      id: nameId(index),
      createdAt: "2026-09-02T09:00:00.000Z",
      foodId: food.foodId,
      languageTag: "en",
      role: "preferred_display",
      text: `Food ${index}`,
      normalizedText: `food ${index}`,
      scriptCode: "Latn",
      origin: "curated",
      sourceRecordId: null,
      policyVersion: "name-v1",
    });
    verificationAssertions.push(
      {
        id: identityAssertionId(index),
        createdAt: "2026-09-02T09:00:00.000Z",
        foodId: food.foodId,
        scope: "identity",
        state: "verified",
        policyVersion: "verification-v1",
        sourceRecordId: null,
        supersedesAssertionId: null,
        reasonCode: "selected",
        authorityReference: "fixture",
      },
      {
        id: nutritionAssertionId(index),
        createdAt: "2026-09-02T09:00:00.000Z",
        foodId: food.foodId,
        scope: "nutrition",
        state: "verified",
        policyVersion: "verification-v1",
        sourceRecordId: null,
        supersedesAssertionId: null,
        reasonCode: "selected",
        authorityReference: "fixture",
      },
    );
    activationAuthorities.push({
      activationSetId: activationSetId(index),
      activationSetMemberId: activationMemberId(index),
      foodId: food.foodId,
      activationPolicyVersion: "activation-v1",
      eligibility: "eligible",
      sourceLegalAccepted: true,
      grantEventId: activationGrantId(index),
      grantCreatedAt: "2026-09-02T09:30:00.000Z",
      invalidatedAt: null,
    });
  });

  return {
    selectionsByFoodId,
    nutritionRevisions,
    servingOptions,
    names,
    taxonomyAssignments: [],
    marketAssignments: [],
    verificationAssertions,
    activationAuthorities,
  };
}

function makeStore({
  foods,
  redirects = [],
  reportBlockers = 0,
  pointerValid = true,
  hydrate,
}: {
  foods: StoredGenerationFood[];
  redirects?: StoredGenerationRedirect[];
  reportBlockers?: number;
  pointerValid?: boolean;
  hydrate?: (foods: readonly StoredGenerationFood[]) => BatchHydration;
}): BatchStore {
  return {
    readCurrentPointer: vi.fn(async () => pointerValid ? {
      currentGenerationId: GENERATION_ID,
      currentEventId: EVENT_ID,
      currentValidationReportId: REPORT_ID,
      pointerRevision: 1,
    } : {
      currentGenerationId: null,
      currentEventId: null,
      currentValidationReportId: null,
      pointerRevision: 0,
    }),
    readGeneration: vi.fn(async () => generation),
    readGenerationEvent: vi.fn(async () => ({
      id: EVENT_ID,
      operationId: uuid("f", 1),
      eventType: "promote",
      fromGenerationId: null,
      toGenerationId: GENERATION_ID,
      revokedGenerationId: null,
      generationChecksumSha256: SHA,
      validationReportId: REPORT_ID,
      actor: {
        principalId: "service",
        principalType: "service",
        authorityReference: "fixture",
        reasonCode: "promote",
        policyVersion: "control-v1",
      },
      reasonCode: "promote",
      authorityReference: "fixture",
      policyVersion: "control-v1",
      createdAt: "2026-09-02T10:01:00.000Z",
    })),
    readValidationReport: vi.fn(async () => ({
      id: REPORT_ID,
      generationId: GENERATION_ID,
      generationChecksumSha256: SHA,
      validatorSetVersion: "validator-v1",
      policyVersion: "validation-v1",
      reportChecksumSha256: "c".repeat(64),
      blockerCount: reportBlockers,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      createdAt: "2026-09-02T10:00:30.000Z",
    })),
    readGenerationFoodsByIds: vi.fn(async (_generationId: string, ids: readonly string[]) => foods.filter((food) => ids.includes(food.foodId))),
    readGenerationRedirectsBySourceIds: vi.fn(async (_generationId: string, ids: readonly string[]) => redirects.filter((redirect) => ids.includes(redirect.sourceFoodId))),
    readGenerationTrustHydration: vi.fn(async (_generationId: string, selectedFoods: readonly StoredGenerationFood[]) => (hydrate ?? hydrationFor)(selectedFoods)),
  };
}

async function runBatch(store: BatchStore, ids: readonly string[]) {
  if (!resolveBatch) throw new Error("Batch current-generation trust resolver is not implemented.");
  return resolveBatch(store, ids);
}

describe("Plan 7 current-generation Recipe trust batch authority", () => {
  it("reads shared current authority once and batches 20 unique direct Foods", async () => {
    const ids = Array.from({ length: 20 }, (_, index) => foodId(index + 1));
    const store = makeStore({ foods: ids.map((id, index) => activeFood(id, index + 1)) });

    const result = await runBatch(store, [...ids, ids[0]!, ids[1]!]);

    expect(result.size).toBe(20);
    expect(Array.from(result.values()).every((value) => value.trust?.verified === true)).toBe(true);
    expect(store.readCurrentPointer).toHaveBeenCalledTimes(1);
    expect(store.readGeneration).toHaveBeenCalledTimes(1);
    expect(store.readGenerationEvent).toHaveBeenCalledTimes(1);
    expect(store.readValidationReport).toHaveBeenCalledTimes(1);
    expect(store.readGenerationFoodsByIds).toHaveBeenCalledTimes(1);
    expect(store.readGenerationFoodsByIds).toHaveBeenCalledWith(GENERATION_ID, ids);
    expect(store.readGenerationRedirectsBySourceIds).not.toHaveBeenCalled();
    expect(store.readGenerationTrustHydration).toHaveBeenCalledTimes(1);
    expect((store.readGenerationTrustHydration.mock.calls[0]?.[1] as StoredGenerationFood[]).map((food) => food.foodId)).toEqual(ids);
  });

  it("batch resolves two flattened redirects plus one direct Food without traversing redirect chains", async () => {
    const oldA = uuid("7", 1);
    const oldB = uuid("7", 2);
    const survivorA = foodId(31);
    const survivorB = foodId(32);
    const directC = foodId(33);
    const redirects: StoredGenerationRedirect[] = [
      { generationId: GENERATION_ID, sourceFoodId: oldA, targetFoodId: survivorA },
      { generationId: GENERATION_ID, sourceFoodId: oldB, targetFoodId: survivorB },
    ];
    const foods = [activeFood(survivorA, 31), activeFood(survivorB, 32), activeFood(directC, 33)];
    const store = makeStore({ foods, redirects });

    const result = await runBatch(store, [oldA, oldB, directC]);

    expect(result.get(oldA)?.resolvedFoodId).toBe(survivorA);
    expect(result.get(oldB)?.resolvedFoodId).toBe(survivorB);
    expect(result.get(directC)?.resolvedFoodId).toBe(directC);
    expect(result.get(oldA)?.trust?.verified).toBe(true);
    expect(result.get(oldB)?.trust?.verified).toBe(true);
    expect(result.get(directC)?.trust?.verified).toBe(true);
    expect(store.readGenerationFoodsByIds).toHaveBeenCalledTimes(2);
    expect(store.readGenerationRedirectsBySourceIds).toHaveBeenCalledTimes(2);
    expect(store.readGenerationRedirectsBySourceIds).toHaveBeenNthCalledWith(1, GENERATION_ID, [oldA, oldB]);
    expect(store.readGenerationRedirectsBySourceIds).toHaveBeenNthCalledWith(2, GENERATION_ID, [survivorA, survivorB]);
  });

  it("isolates per-Food trust failures while preserving valid Foods", async () => {
    const ids = [foodId(41), foodId(42), foodId(43), foodId(44), foodId(45), foodId(46)];
    const foods = ids.map((id, index) => activeFood(id, 41 + index));
    const store = makeStore({
      foods,
      hydrate: (selectedFoods) => {
        const hydration = hydrationFor(selectedFoods);
        hydration.verificationAssertions.find((item) => item.foodId === ids[1] && item.scope === "identity")!.state = "revoked";
        hydration.verificationAssertions.find((item) => item.foodId === ids[2] && item.scope === "nutrition")!.state = "revoked";
        hydration.verificationAssertions = hydration.verificationAssertions.filter((item) => !(item.foodId === ids[3] && item.scope === "identity"));
        hydration.activationAuthorities.find((item) => item.foodId === ids[4])!.eligibility = "rejected";
        hydration.activationAuthorities.find((item) => item.foodId === ids[5])!.invalidatedAt = generation.sealedAt;
        return hydration;
      },
    });

    const result = await runBatch(store, ids);

    expect(result.get(ids[0]!)?.trust?.verified).toBe(true);
    for (const id of ids.slice(1)) expect(result.get(id)?.trust?.verified).not.toBe(true);
  });

  it("fails closed for inactive, missing, malformed redirect, and cross-Food selected authority without poisoning a valid Food", async () => {
    const valid = foodId(51);
    const deprecated = foodId(52);
    const withdrawn = foodId(53);
    const missing = foodId(54);
    const invalidRedirectSource = uuid("6", 1);
    const chainTarget = foodId(55);
    const crossFood = foodId(56);
    const wrongFood = foodId(57);
    const foods = [
      activeFood(valid, 51),
      inactiveFood(deprecated, "deprecated"),
      inactiveFood(withdrawn, "withdrawn"),
      activeFood(chainTarget, 55),
      activeFood(crossFood, 56),
    ];
    const redirects: StoredGenerationRedirect[] = [
      { generationId: GENERATION_ID, sourceFoodId: invalidRedirectSource, targetFoodId: chainTarget },
      { generationId: GENERATION_ID, sourceFoodId: chainTarget, targetFoodId: wrongFood },
    ];
    const store = makeStore({
      foods,
      redirects,
      hydrate: (selectedFoods) => {
        const hydration = hydrationFor(selectedFoods);
        const cross = hydration.verificationAssertions.find((item) => item.foodId === crossFood && item.scope === "identity");
        if (cross) cross.foodId = wrongFood;
        return hydration;
      },
    });

    const result = await runBatch(store, [valid, deprecated, withdrawn, missing, invalidRedirectSource, crossFood]);

    expect(result.get(valid)?.trust?.verified).toBe(true);
    expect(result.get(deprecated)?.trust?.verified).not.toBe(true);
    expect(result.get(withdrawn)?.trust?.verified).not.toBe(true);
    expect(result.get(missing)?.trust?.verified).not.toBe(true);
    expect(result.get(invalidRedirectSource)?.trust?.verified).not.toBe(true);
    expect(result.get(crossFood)?.trust?.verified).not.toBe(true);
  });

  it("fails all requested Foods closed when shared current-generation authority is unavailable and honors report blockers", async () => {
    const ids = [foodId(61), foodId(62)];
    const unavailable = makeStore({ foods: ids.map((id, index) => activeFood(id, 61 + index)), pointerValid: false });
    const noCurrent = await runBatch(unavailable, ids);
    expect(Array.from(noCurrent.values()).every((value) => value.trust?.verified !== true)).toBe(true);
    expect(unavailable.readGenerationFoodsByIds).not.toHaveBeenCalled();

    const blocked = makeStore({ foods: ids.map((id, index) => activeFood(id, 61 + index)), reportBlockers: 1 });
    const blockedResult = await runBatch(blocked, ids);
    expect(Array.from(blockedResult.values()).every((value) => value.trust?.verified === false)).toBe(true);
  });
});
