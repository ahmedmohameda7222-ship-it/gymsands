import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrentGenerationFoodView } from "@/services/food-catalog/server/current-generation-service";
import { resolveFoodHandoff } from "@/services/nutrition-v1/server/food-handoff";

const generation = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock("@/services/food-catalog/server/current-generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/services/food-catalog/server/current-generation-service")>(
    "@/services/food-catalog/server/current-generation-service",
  );
  return {
    ...actual,
    resolveCurrentGenerationFoodForNewUseFromSupabase: generation.resolve,
  };
});

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const survivorId = "33333333-3333-4333-8333-333333333333";
const generationId = "44444444-4444-4444-8444-444444444444";
const nutritionId = "55555555-5555-4555-8555-555555555555";
const nameId = "66666666-6666-4666-8666-666666666666";
const servingId = "77777777-7777-4777-8777-777777777777";
const revisionId = "88888888-8888-4888-8888-888888888888";

type Result = { data: unknown; error: null | { message?: string; code?: string } };

function query(result: Result) {
  const q: Record<string, any> = {};
  for (const method of ["select", "eq", "is"]) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  return q;
}

function clientFor(options: {
  tables?: Record<string, Result[]>;
  rpc?: Result[];
} = {}) {
  const tableQueues = Object.fromEntries(
    Object.entries(options.tables ?? {}).map(([key, values]) => [key, [...values]]),
  ) as Record<string, Result[]>;
  const rpcQueue = [...(options.rpc ?? [])];
  const seen: Record<string, Array<ReturnType<typeof query>>> = {};
  const from = vi.fn((table: string) => {
    const result = tableQueues[table]?.shift();
    if (!result) throw new Error(`Unexpected table query: ${table}`);
    const q = query(result);
    (seen[table] ??= []).push(q);
    return q;
  });
  const rpc = vi.fn(async () => {
    const result = rpcQueue.shift();
    if (!result) throw new Error("Unexpected RPC call.");
    return result;
  });
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, seen };
}

function selectedName(id = nameId, text = "Selected yogurt", languageTag = "en", food = foodId) {
  return {
    id,
    createdAt: "2026-09-19T00:00:00.000Z",
    foodId: food,
    languageTag,
    role: "preferred_display" as const,
    text,
    normalizedText: text.toLowerCase(),
    scriptCode: "Latn",
    origin: "curated" as const,
    sourceRecordId: null,
    policyVersion: "name-v1",
  };
}

function selectedServing(id = servingId, label = "170 g", amount = 170, food = foodId) {
  return {
    id,
    createdAt: "2026-09-19T00:00:00.000Z",
    foodId: food,
    label,
    amount,
    unitCode: "g",
    gramWeight: null,
    sourceRecordId: null,
    sourcePortionCode: null,
    evidenceClass: "exact_source" as const,
    sourcePrimary: true,
  };
}

function view(overrides: Partial<CurrentGenerationFoodView> = {}): CurrentGenerationFoodView {
  const resolvedFoodId = overrides.resolvedFoodId ?? foodId;
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
      authorityReference: "task9-test",
      createdAt: "2026-09-19T00:00:00.000Z",
      sealedAt: "2026-09-19T00:00:01.000Z",
    },
    currentEvent: {} as CurrentGenerationFoodView["currentEvent"],
    validationReport: {} as CurrentGenerationFoodView["validationReport"],
    validationFindings: [],
    requestedFoodId: overrides.requestedFoodId ?? foodId,
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
    redirect: null,
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
      revisionNumber: 4,
      calories: 100,
      protein_g: 10,
      carbs_g: null,
      fat_g: 2,
      saturated_fat_g: null,
      fiber_g: 0,
      sugars_g: null,
      sodium_mg: 50,
      basisAmount: 100,
      basisUnit: "g",
      nutrientMappingVersion: "nutrition-v1",
      sourceRecordId: null,
    },
    servingOptions: [selectedServing(servingId, "170 g", 170, resolvedFoodId)],
    names: [selectedName(nameId, "Selected yogurt", "en", resolvedFoodId)],
    taxonomyAssignments: [],
    marketAssignments: [],
    verificationAssertions: [],
    activationAuthority: null,
    trust: { verified: true } as CurrentGenerationFoodView["trust"],
    ...overrides,
  };
}

function noOverride(food = foodId): Result {
  return {
    data: {
      foodId: food,
      hasOverride: false,
      revisionId: null,
      pointerRevision: 0,
      isDeleted: false,
      nutritionOverride: null,
      servingLabel: null,
      note: null,
    },
    error: null,
  };
}

function catalogInput(overrides: Record<string, unknown> = {}) {
  return {
    foodId,
    source: "catalog" as const,
    quantity: 1,
    serving: "170 g",
    displayName: "Selected yogurt",
    languageTag: "en",
    ...overrides,
  };
}

describe("Nutrition V1 Task 9 current-generation Food handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when there is no current generation and never falls back to flat food_items", async () => {
    generation.resolve.mockRejectedValueOnce(new Error("Food Catalog has no current promoted generation."));
    const db = clientFor();

    await expect(resolveFoodHandoff(db.client, userId, catalogInput())).rejects.toThrow(/no current promoted generation/i);

    expect(generation.resolve).toHaveBeenCalledWith(db.client, foodId);
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("resolves an active direct Food only from exact generation-selected name, serving and nutrition", async () => {
    generation.resolve.mockResolvedValueOnce(view());
    const db = clientFor({ rpc: [noOverride()] });

    const handoff = await resolveFoodHandoff(db.client, userId, catalogInput());

    expect(handoff.foodId).toBe(foodId);
    expect(handoff.name).toBe("Selected yogurt");
    expect(handoff.serving).toBe("170 g");
    expect(handoff.frozenNutrition).toEqual({
      calories: 170,
      protein_g: 17,
      carbs_g: null,
      fat_g: 3.4,
      fiber_g: 0,
    });
    expect(db.from).not.toHaveBeenCalledWith("food_items");
    expect(db.from).not.toHaveBeenCalledWith("food_personal_corrections");
    expect(db.rpc).toHaveBeenCalledWith("food_catalog_get_current_personal_override_v1", { p_food_id: foodId });
  });

  it("uses a flattened generation redirect survivor and reads the owner override for the survivor only", async () => {
    generation.resolve.mockResolvedValueOnce(view({
      requestedFoodId: foodId,
      resolvedFoodId: survivorId,
      food: {
        generationId,
        foodId: survivorId,
        lifecycle: "active",
        nutritionRevisionId: nutritionId,
        activationSetId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        activationSetMemberId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        activationGrantEventId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
      nutritionRevision: {
        ...view().nutritionRevision!,
        foodId: survivorId,
      },
      servingOptions: [selectedServing(servingId, "170 g", 170, survivorId)],
      names: [selectedName(nameId, "Selected yogurt", "en", survivorId)],
      redirect: { generationId, sourceFoodId: foodId, targetFoodId: survivorId },
    }));
    const db = clientFor({ rpc: [noOverride(survivorId)] });

    const handoff = await resolveFoodHandoff(db.client, userId, catalogInput());

    expect(handoff.foodId).toBe(survivorId);
    expect(handoff.savedMealItem.food_id).toBe(survivorId);
    expect(handoff.recipeIngredient.food_id).toBe(survivorId);
    expect(db.rpc).toHaveBeenCalledWith("food_catalog_get_current_personal_override_v1", { p_food_id: survivorId });
  });

  it.each(["deprecated", "withdrawn"] as const)(
    "propagates current-generation %s rejection before owner overlay reads",
    async (lifecycle) => {
      generation.resolve.mockRejectedValueOnce(new Error(`Only active current-generation Foods may be selected for new use: ${lifecycle}`));
      const db = clientFor();

      await expect(resolveFoodHandoff(db.client, userId, catalogInput())).rejects.toThrow(/only active current-generation/i);
      expect(db.rpc).not.toHaveBeenCalled();
      expect(db.from).not.toHaveBeenCalled();
    },
  );

  it("does not let an unselected injected nutrition revision or flat Food mutation change the handoff", async () => {
    generation.resolve.mockResolvedValueOnce(view());
    const db = clientFor({
      tables: {
        food_items: [{
          data: {
            id: foodId,
            food_name: "Flat mutation",
            serving_size: "999 g",
            calories: 9999,
          },
          error: null,
        }],
      },
      rpc: [noOverride()],
    });

    const handoff = await resolveFoodHandoff(db.client, userId, catalogInput());

    expect(handoff.name).toBe("Selected yogurt");
    expect(handoff.frozenNutrition.calories).toBe(170);
    expect(db.from).not.toHaveBeenCalledWith("food_items");
  });

  it("matches the selected display name only against exact selected Name IDs and language context", async () => {
    const unselectedId = "99999999-9999-4999-8999-999999999999";
    generation.resolve.mockResolvedValueOnce(view({
      names: [
        selectedName(unselectedId, "Injected newer name", "en"),
        selectedName(nameId, "Selected yogurt", "en"),
      ],
    }));
    const db = clientFor({ rpc: [noOverride()] });

    const handoff = await resolveFoodHandoff(db.client, userId, catalogInput());
    expect(handoff.name).toBe("Selected yogurt");

    generation.resolve.mockResolvedValueOnce(view({
      names: [selectedName(nameId, "Selected yogurt", "de")],
    }));
    const dbWrongLanguage = clientFor();
    await expect(resolveFoodHandoff(
      dbWrongLanguage.client,
      userId,
      catalogInput({ languageTag: "en" }),
    )).rejects.toThrow(/name/i);
  });

  it("rejects missing and ambiguous selected Name matches instead of choosing array order", async () => {
    generation.resolve.mockResolvedValueOnce(view({
      names: [selectedName(nameId, "Different selected name")],
    }));
    const missing = clientFor();
    await expect(resolveFoodHandoff(missing.client, userId, catalogInput())).rejects.toThrow(/name/i);

    const secondNameId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
    generation.resolve.mockResolvedValueOnce(view({
      selections: { ...view().selections, nameFactIds: [nameId, secondNameId] },
      names: [
        selectedName(nameId, "Selected yogurt"),
        selectedName(secondNameId, "Selected yogurt"),
      ],
    }));
    const ambiguous = clientFor();
    await expect(resolveFoodHandoff(ambiguous.client, userId, catalogInput())).rejects.toThrow(/name/i);
  });

  it("requires exactly one selected serving and never treats the nutrition basis as a serving", async () => {
    generation.resolve.mockResolvedValueOnce(view({
      selections: { ...view().selections, servingOptionIds: [] },
      servingOptions: [],
    }));
    const noServing = clientFor({ rpc: [noOverride()] });
    await expect(resolveFoodHandoff(
      noServing.client,
      userId,
      catalogInput({ serving: "100 g" }),
    )).rejects.toThrow(/serving/i);

    const secondServingId = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
    generation.resolve.mockResolvedValueOnce(view({
      selections: { ...view().selections, servingOptionIds: [servingId, secondServingId] },
      servingOptions: [
        selectedServing(servingId, "170 g"),
        selectedServing(secondServingId, "170 g"),
      ],
    }));
    const ambiguous = clientFor({ rpc: [noOverride()] });
    await expect(resolveFoodHandoff(ambiguous.client, userId, catalogInput())).rejects.toThrow(/serving/i);

    generation.resolve.mockResolvedValueOnce(view());
    const unselected = clientFor({ rpc: [noOverride()] });
    await expect(resolveFoodHandoff(
      unselected.client,
      userId,
      catalogInput({ serving: "200 g" }),
    )).rejects.toThrow(/serving/i);
  });

  it("preserves canonical NULL and explicit zero through exact generation projection", async () => {
    generation.resolve.mockResolvedValueOnce(view({
      nutritionRevision: {
        ...view().nutritionRevision!,
        calories: 0,
        protein_g: null,
        fiber_g: 0,
      },
    }));
    const db = clientFor({ rpc: [noOverride()] });

    const handoff = await resolveFoodHandoff(db.client, userId, catalogInput());

    expect(handoff.frozenNutrition.calories).toBe(0);
    expect(handoff.frozenNutrition.protein_g).toBeNull();
    expect(handoff.frozenNutrition.fiber_g).toBe(0);
  });

  it("merges only supported active Personal Override nutrient keys with zero/null semantics and keeps generation basis", async () => {
    generation.resolve.mockResolvedValueOnce(view());
    const db = clientFor({
      rpc: [{
        data: {
          foodId,
          hasOverride: true,
          revisionId,
          pointerRevision: 3,
          isDeleted: false,
          nutritionOverride: {
            calories: 0,
            protein_g: null,
            carbs_g: 12,
          },
          servingLabel: null,
          note: "owner note",
        },
        error: null,
      }],
    });

    const handoff = await resolveFoodHandoff(db.client, userId, catalogInput());

    expect(handoff.frozenNutrition).toMatchObject({
      calories: 0,
      protein_g: 17,
      carbs_g: 20.4,
    });
    expect(db.from).not.toHaveBeenCalledWith("food_personal_corrections");
  });

  it("treats a Personal Override tombstone as no active overlay", async () => {
    generation.resolve.mockResolvedValueOnce(view());
    const db = clientFor({
      rpc: [{
        data: {
          foodId,
          hasOverride: true,
          revisionId,
          pointerRevision: 4,
          isDeleted: true,
          nutritionOverride: { calories: 0 },
          servingLabel: "Deleted owner label",
          note: null,
        },
        error: null,
      }],
    });

    const handoff = await resolveFoodHandoff(db.client, userId, catalogInput());

    expect(handoff.serving).toBe("170 g");
    expect(handoff.frozenNutrition.calories).toBe(170);
  });

  it("allows an active Personal Override serving label without fabricating a generation serving identity or conversion", async () => {
    generation.resolve.mockResolvedValueOnce(view());
    const db = clientFor({
      rpc: [{
        data: {
          foodId,
          hasOverride: true,
          revisionId,
          pointerRevision: 2,
          isDeleted: false,
          nutritionOverride: { protein_g: 12 },
          servingLabel: "My exact bowl",
          note: null,
        },
        error: null,
      }],
    });

    const handoff = await resolveFoodHandoff(
      db.client,
      userId,
      catalogInput({ serving: "My exact bowl" }),
    );

    expect(handoff.serving).toBe("My exact bowl");
    expect(handoff.frozenNutrition).toEqual({
      calories: 100,
      protein_g: 12,
      carbs_g: null,
      fat_g: 2,
      fiber_g: 0,
    });

    generation.resolve.mockResolvedValueOnce(view());
    const stale = clientFor({
      rpc: [{
        data: {
          foodId,
          hasOverride: true,
          revisionId,
          pointerRevision: 2,
          isDeleted: false,
          nutritionOverride: null,
          servingLabel: "My exact bowl",
          note: null,
        },
        error: null,
      }],
    });
    await expect(resolveFoodHandoff(stale.client, userId, catalogInput())).rejects.toThrow(/serving/i);
  });

  it("keeps My Foods owner-scoped and independent from Catalog Generation and Personal Overrides", async () => {
    const db = clientFor({
      tables: {
        user_food_items: [{
          data: {
            id: foodId,
            user_id: userId,
            food_name: "My oats",
            serving_size: "40 g",
            calories: 150,
            protein_g: null,
            carbs_g: 25,
            fat_g: 3,
            nutrition_basis_amount: 40,
            nutrition_basis_unit: "g",
            deleted_at: null,
          },
          error: null,
        }],
      },
    });

    const handoff = await resolveFoodHandoff(db.client, userId, {
      foodId,
      source: "my_food",
      quantity: 2,
      serving: "40 g",
    });

    expect(handoff.name).toBe("My oats");
    expect(handoff.frozenNutrition).toMatchObject({
      calories: 300,
      protein_g: null,
      carbs_g: 50,
      fat_g: 6,
    });
    expect(generation.resolve).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.seen.user_food_items[0].eq).toHaveBeenCalledWith("user_id", userId);
    expect(db.seen.user_food_items[0].is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("preserves the frozen consumer snapshot output contracts while changing only new resolution authority", async () => {
    generation.resolve.mockResolvedValueOnce(view());
    const db = clientFor({ rpc: [noOverride()] });

    const handoff = await resolveFoodHandoff(db.client, userId, catalogInput({ quantity: 2 }));

    expect(handoff.frozenSourceSnapshot).toEqual({
      food_id: foodId,
      source: "catalog",
      frozen_name: "Selected yogurt",
      resolved_quantity: 2,
      resolved_serving_label: "170 g",
      frozen_nutrition: handoff.frozenNutrition,
    });
    expect(handoff.diaryItem).toEqual({
      foodName: "Selected yogurt",
      servingLabel: "170 g",
      quantity: 2,
      nutrition: {
        caloriesKcal: handoff.frozenNutrition.calories,
        proteinG: handoff.frozenNutrition.protein_g,
        carbsG: handoff.frozenNutrition.carbs_g,
        fatG: handoff.frozenNutrition.fat_g,
      },
      foodItemId: foodId,
      userFoodItemId: null,
    });
    expect(handoff.savedMealItem).toEqual({
      kind: "food",
      food_id: foodId,
      frozen_name: "Selected yogurt",
      resolved_quantity: 2,
      resolved_serving_label: "170 g",
      frozen_nutrition: handoff.frozenNutrition,
    });
    expect(handoff.recipeIngredient).toEqual({
      food_id: foodId,
      ingredient_name: "Selected yogurt",
      quantity: 2,
      unit: "170 g",
      frozen_nutrition: handoff.frozenNutrition,
    });
  });
});
