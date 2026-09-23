import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrentGenerationFoodView } from "@/services/food-catalog/server/current-generation-service";
import type { SavedMealItemInput } from "@/services/nutrition-v1/server/saved-meals";

const generation = vi.hoisted(() => ({ resolve: vi.fn(), resolveBatch: vi.fn() }));
const personal = vi.hoisted(() => ({ read: vi.fn() }));
const recipe = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("@/services/food-catalog/server/current-generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/services/food-catalog/server/current-generation-service")>(
    "@/services/food-catalog/server/current-generation-service",
  );
  return {
    ...actual,
    resolveCurrentGenerationFoodForNewUseFromSupabase: generation.resolve,
    resolveCurrentGenerationFoodsForNewUseBatchFromSupabase: generation.resolveBatch,
  };
});

vi.mock("@/services/nutrition-v1/server/personal-overrides", async () => {
  const actual = await vi.importActual<typeof import("@/services/nutrition-v1/server/personal-overrides")>(
    "@/services/nutrition-v1/server/personal-overrides",
  );
  return {
    ...actual,
    readCurrentPersonalOverride: personal.read,
  };
});

vi.mock("@/services/nutrition-v1/server/recipe-handoff", () => ({
  resolveRecipeHandoff: recipe.resolve,
}));

import { canonicalizeSavedMealItems } from "@/services/nutrition-v1/server/saved-meal-write-authority";

const userId = "11111111-1111-4111-8111-111111111111";
const generationId = "44444444-4444-4444-8444-444444444444";
const catalogSupabase = { authority: "catalog" } as unknown as SupabaseClient;

type MyFoodRow = {
  id: string;
  user_id: string;
  food_name: string;
  serving_size: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  nutrition_basis_amount: number | null;
  nutrition_basis_unit: string | null;
  deleted_at: string | null;
};

function id(prefix: string, index: number) {
  return `${prefix}0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function catalogFoodId(index: number) {
  return id("2", index);
}

function myFoodId(index: number) {
  return id("3", index);
}

function myFoodRow(foodId: string): MyFoodRow {
  return {
    id: foodId,
    user_id: userId,
    food_name: "Shared name",
    serving_size: "100 g",
    calories: 100,
    protein_g: 10,
    carbs_g: 5,
    fat_g: 2,
    nutrition_basis_amount: 100,
    nutrition_basis_unit: "g",
    deleted_at: null,
  };
}

const MY_FOOD_SELECT = "id,user_id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,nutrition_basis_amount,nutrition_basis_unit,deleted_at";

function makeOwnerClient(rows: readonly MyFoodRow[]) {
  const queries: Array<Record<string, any>> = [];
  const from = vi.fn((table: string) => {
    if (table !== "user_food_items") throw new Error(`Unexpected table ${table}`);
    let selectedColumns = "";
    let exactId: string | null = null;
    let exactUserId: string | null = null;
    let ids: readonly string[] | null = null;
    let deletedMustBeNull = false;
    const query: Record<string, any> = {};
    query.select = vi.fn((columns: string) => {
      selectedColumns = columns;
      return query;
    });
    query.eq = vi.fn((column: string, value: string) => {
      if (column === "id") exactId = value;
      if (column === "user_id") exactUserId = value;
      return query;
    });
    query.in = vi.fn((column: string, values: readonly string[]) => {
      if (column === "id") ids = [...values];
      return query;
    });
    query.is = vi.fn((column: string, value: null) => {
      if (column === "deleted_at" && value === null) deletedMustBeNull = true;
      return query;
    });
    const matchingRows = () => rows.filter((row) => (
      (exactId === null || row.id === exactId)
      && (exactUserId === null || row.user_id === exactUserId)
      && (ids === null || ids.includes(row.id))
      && (!deletedMustBeNull || row.deleted_at === null)
    ));
    query.maybeSingle = vi.fn(async () => ({
      data: matchingRows()[0] ?? null,
      error: null,
    }));
    query.then = (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      const data = matchingRows().map((row) => (
        selectedColumns.trim() === "id" ? { id: row.id } : { ...row }
      ));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    queries.push(query);
    return query;
  });

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    queries,
  };
}

function selectedName(nameId: string, foodId: string) {
  return {
    id: nameId,
    createdAt: "2026-09-19T00:00:00.000Z",
    foodId,
    languageTag: "en",
    role: "preferred_display" as const,
    text: "Shared name",
    normalizedText: "shared name",
    scriptCode: "Latn",
    origin: "curated" as const,
    sourceRecordId: null,
    policyVersion: "name-v1",
  };
}

function selectedServing(servingId: string, foodId: string) {
  return {
    id: servingId,
    createdAt: "2026-09-19T00:00:00.000Z",
    foodId,
    label: "100 g",
    amount: 100,
    unitCode: "g",
    gramWeight: null,
    sourceRecordId: null,
    sourcePortionCode: null,
    evidenceClass: "exact_source" as const,
    sourcePrimary: true,
  };
}

function currentView(
  requestedFoodId: string,
  resolvedFoodId = requestedFoodId,
  index = 0,
): CurrentGenerationFoodView {
  const nutritionId = id("5", index);
  const nameId = id("6", index);
  const servingId = id("7", index);
  return {
    pointer: {
      currentGenerationId: generationId,
      currentEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      currentValidationReportId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      pointerRevision: 1,
    },
    generation: {
      id: generationId,
      baseGenerationId: null,
      generationOrdinal: 1,
      compositionSchemaVersion: "composition-v1",
      generationPolicyVersion: "generation-v1",
      activationPolicyVersion: "activation-v1",
      trustPolicyVersion: "trust-v1",
      projectionVersion: "projection-v1",
      changeManifestChecksumSha256: "a".repeat(64),
      compositionChecksumSha256: "b".repeat(64),
      authorityReference: "saved-meal-batch-test",
      createdAt: "2026-09-19T00:00:00.000Z",
      sealedAt: "2026-09-19T00:00:01.000Z",
    },
    currentEvent: {} as CurrentGenerationFoodView["currentEvent"],
    validationReport: {} as CurrentGenerationFoodView["validationReport"],
    requestedFoodId,
    resolvedFoodId,
    food: {
      generationId,
      foodId: resolvedFoodId,
      lifecycle: "active",
      nutritionRevisionId: nutritionId,
      activationSetId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      activationSetMemberId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      activationGrantEventId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    },
    redirect: requestedFoodId === resolvedFoodId
      ? null
      : { generationId, sourceFoodId: requestedFoodId, targetFoodId: resolvedFoodId },
    selections: {
      servingOptionIds: [servingId],
      nameFactIds: [nameId],
      taxonomyAssignmentIds: [],
      marketAssignmentIds: [],
      verification: [],
    },
    nutritionRevision: {
      id: nutritionId,
      createdAt: "2026-09-19T00:00:00.000Z",
      foodId: resolvedFoodId,
      revisionNumber: 1,
      calories: 100,
      protein_g: 10,
      carbs_g: 5,
      fat_g: 2,
      saturated_fat_g: null,
      fiber_g: 1,
      sugars_g: null,
      sodium_mg: null,
      basisAmount: 100,
      basisUnit: "g",
      nutrientMappingVersion: "nutrition-v1",
      sourceRecordId: null,
    },
    servingOptions: [selectedServing(servingId, resolvedFoodId)],
    names: [selectedName(nameId, resolvedFoodId)],
    taxonomyAssignments: [],
    marketAssignments: [],
    verificationAssertions: [],
    activationAuthority: null,
    trust: { verified: true } as CurrentGenerationFoodView["trust"],
  };
}

function noOverride(foodId: string) {
  return {
    foodId,
    hasOverride: false,
    revisionId: null,
    pointerRevision: 0,
    isDeleted: false,
    nutritionOverride: null,
    servingLabel: null,
    note: null,
  };
}

function frozenFood(foodId: string): SavedMealItemInput {
  return {
    kind: "food",
    food_id: foodId,
    frozen_name: "Shared name",
    resolved_quantity: 1,
    resolved_serving_label: "100 g",
    frozen_nutrition: {
      calories: 100,
      protein_g: 10,
      carbs_g: 5,
      fat_g: 2,
      fiber_g: 1,
    },
  };
}

describe("Saved Meal reusable owner authority hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generation.resolve.mockRejectedValue(new Error("single-Food current-generation resolver must not run"));
    personal.read.mockImplementation(async (_client: SupabaseClient, foodId: string) => noOverride(foodId));
  });

  it("reads Personal Override once per unique resolved Catalog survivor and reuses it through final handoff", async () => {
    const owner = makeOwnerClient([]);
    const requestedFoodIds = Array.from({ length: 20 }, (_, index) => catalogFoodId(index));
    const sharedSurvivor = catalogFoodId(90);
    const views = new Map<string, CurrentGenerationFoodView>(
      requestedFoodIds.map((foodId, index) => [
        foodId,
        index >= 18
          ? currentView(foodId, sharedSurvivor, index)
          : currentView(foodId, foodId, index),
      ]),
    );
    generation.resolveBatch.mockResolvedValue(views);

    const items = [
      ...requestedFoodIds,
      requestedFoodIds[0]!,
      requestedFoodIds[7]!,
    ].map(frozenFood);

    const result = await canonicalizeSavedMealItems(
      owner.client,
      catalogSupabase,
      userId,
      items,
      "en",
    );

    const expectedSurvivors = Array.from(new Set(
      requestedFoodIds.map((foodId) => views.get(foodId)!.resolvedFoodId),
    )).sort();
    const overrideReads = personal.read.mock.calls.map((call) => String(call[1])).sort();

    expect(result).toHaveLength(items.length);
    expect(generation.resolveBatch).toHaveBeenCalledTimes(1);
    expect(generation.resolveBatch).toHaveBeenCalledWith(catalogSupabase, requestedFoodIds);
    expect(generation.resolve).not.toHaveBeenCalled();
    expect(owner.from).toHaveBeenCalledTimes(1);
    expect(personal.read).toHaveBeenCalledTimes(expectedSurvivors.length);
    expect(overrideReads).toEqual(expectedSurvivors);
  });

  it("hydrates unique My Foods once and reuses owner rows for duplicate Saved Meal items", async () => {
    const uniqueFoodIds = Array.from({ length: 20 }, (_, index) => myFoodId(index));
    const owner = makeOwnerClient(uniqueFoodIds.map(myFoodRow));
    generation.resolveBatch.mockResolvedValue(new Map());

    const items = [
      ...uniqueFoodIds,
      uniqueFoodIds[0]!,
      uniqueFoodIds[7]!,
    ].map(frozenFood);

    const result = await canonicalizeSavedMealItems(
      owner.client,
      catalogSupabase,
      userId,
      items,
      "en",
    );

    expect(result).toHaveLength(items.length);
    expect(result.map((item) => item.kind === "food" ? item.food_id : null))
      .toEqual(items.map((item) => item.food_id));
    expect(result[0]).toEqual({
      kind: "food",
      food_id: uniqueFoodIds[0],
      frozen_name: "Shared name",
      resolved_quantity: 1,
      resolved_serving_label: "100 g",
      frozen_nutrition: {
        calories: 100,
        protein_g: 10,
        carbs_g: 5,
        fat_g: 2,
        fiber_g: null,
      },
    });

    expect(owner.from).toHaveBeenCalledTimes(1);
    expect(owner.from).toHaveBeenCalledWith("user_food_items");
    expect(owner.queries).toHaveLength(1);
    expect(owner.queries[0]!.select).toHaveBeenCalledWith(MY_FOOD_SELECT);
    expect(owner.queries[0]!.eq).toHaveBeenCalledWith("user_id", userId);
    expect(owner.queries[0]!.in).toHaveBeenCalledWith("id", uniqueFoodIds);
    expect(owner.queries[0]!.is).toHaveBeenCalledWith("deleted_at", null);
    expect(generation.resolveBatch).toHaveBeenCalledTimes(1);
    expect(generation.resolveBatch).toHaveBeenCalledWith(catalogSupabase, []);
    expect(generation.resolve).not.toHaveBeenCalled();
    expect(personal.read).not.toHaveBeenCalled();
  });

  it("keeps mixed Catalog and My Food authority domains separate while reusing both hydrated states", async () => {
    const catalogIds = [catalogFoodId(30), catalogFoodId(31), catalogFoodId(32)];
    const myIds = [myFoodId(30), myFoodId(31), myFoodId(32)];
    const owner = makeOwnerClient(myIds.map(myFoodRow));
    const views = new Map<string, CurrentGenerationFoodView>(
      catalogIds.map((foodId, index) => [foodId, currentView(foodId, foodId, 40 + index)]),
    );
    generation.resolveBatch.mockResolvedValue(views);

    const itemIds = [
      catalogIds[0]!,
      myIds[0]!,
      catalogIds[1]!,
      myIds[1]!,
      catalogIds[2]!,
      myIds[2]!,
      catalogIds[0]!,
      myIds[0]!,
    ];
    const result = await canonicalizeSavedMealItems(
      owner.client,
      catalogSupabase,
      userId,
      itemIds.map(frozenFood),
      "en",
    );

    expect(result.map((item) => item.kind === "food" ? item.food_id : null)).toEqual(itemIds);
    expect(owner.from).toHaveBeenCalledTimes(1);
    expect(owner.queries[0]!.select).toHaveBeenCalledWith(MY_FOOD_SELECT);
    expect(owner.queries[0]!.eq).toHaveBeenCalledWith("user_id", userId);
    expect(owner.queries[0]!.in).toHaveBeenCalledWith("id", itemIds.filter((id, index) => itemIds.indexOf(id) === index));
    expect(generation.resolveBatch).toHaveBeenCalledTimes(1);
    expect(generation.resolveBatch).toHaveBeenCalledWith(catalogSupabase, catalogIds);
    expect(generation.resolve).not.toHaveBeenCalled();
    expect(personal.read).toHaveBeenCalledTimes(catalogIds.length);
    expect(personal.read.mock.calls.map((call) => String(call[1])).sort()).toEqual([...catalogIds].sort());
  });
});
