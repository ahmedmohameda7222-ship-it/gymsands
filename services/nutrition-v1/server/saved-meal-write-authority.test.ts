import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealItemInput } from "@/services/nutrition-v1/server/saved-meals";

const handoff = vi.hoisted(() => ({ resolveCatalog: vi.fn(), resolveMyFood: vi.fn() }));
const generation = vi.hoisted(() => ({ resolve: vi.fn(), resolveBatch: vi.fn() }));
const personal = vi.hoisted(() => ({ read: vi.fn() }));
const recipe = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("@/services/nutrition-v1/server/food-handoff", async () => {
  const actual = await vi.importActual<typeof import("@/services/nutrition-v1/server/food-handoff")>(
    "@/services/nutrition-v1/server/food-handoff",
  );
  return {
    ...actual,
    resolveFoodHandoffFromResolvedCatalogOwnerAuthority: handoff.resolveCatalog,
    resolveMyFoodHandoffFromResolvedAuthority: handoff.resolveMyFood,
  };
});
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
  return { ...actual, readCurrentPersonalOverride: personal.read };
});
vi.mock("@/services/nutrition-v1/server/recipe-handoff", () => ({
  resolveRecipeHandoff: recipe.resolve,
}));

import { canonicalizeSavedMealItems } from "@/services/nutrition-v1/server/saved-meal-write-authority";

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const ownerSupabase = (owned: boolean) => {
  let requestedIds: string[] = [];
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn((_column: string, ids: string[]) => {
    requestedIds = [...ids];
    return query;
  });
  query.is = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: owned ? { id: foodId } : null, error: null }));
  query.then = (
    resolve: (value: { data: Array<{ id: string }>; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve({
    data: owned ? requestedIds.map((id) => ({
      id,
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
    })) : [],
    error: null,
  }).then(resolve, reject);
  return { from: vi.fn(() => query) } as unknown as SupabaseClient;
};
const catalogSupabase = { authority: "catalog" } as unknown as SupabaseClient;

const frozenFood: SavedMealItemInput = {
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

function resolvedFood(extra: Record<string, unknown> = {}) {
  return {
    savedMealItem: { ...frozenFood, ...extra },
  };
}

function currentView(
  names: Array<{ id: string; languageTag: string; text: string }>,
  servings: Array<{ id: string; label: string }> = [],
  viewFoodId = foodId,
) {
  return {
    requestedFoodId: viewFoodId,
    resolvedFoodId: viewFoodId,
    selections: {
      servingOptionIds: servings.map((serving) => serving.id),
      nameFactIds: names.map((name) => name.id),
      taxonomyAssignmentIds: [],
      marketAssignmentIds: [],
      verification: [],
    },
    names: names.map((name) => ({
      id: name.id,
      foodId: viewFoodId,
      languageTag: name.languageTag,
      role: "preferred_display",
      text: name.text,
    })),
    servingOptions: servings.map((serving) => ({
      id: serving.id,
      foodId: viewFoodId,
      label: serving.label,
    })),
  };
}

function name(idSuffix: string, languageTag: string, text: string) {
  return {
    id: `60000000-0000-4000-8000-${idSuffix.padStart(12, "0")}`,
    languageTag,
    text,
  };
}

function serving(idSuffix: string, label: string) {
  return {
    id: `70000000-0000-4000-8000-${idSuffix.padStart(12, "0")}`,
    label,
  };
}

function noOverride() {
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

function trackingOwnerSupabase(ownedIds: readonly string[] = []) {
  let requestedIds: string[] = [];
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.in = vi.fn((_column: string, ids: string[]) => {
    requestedIds = [...ids];
    return query;
  });
  query.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  query.then = (
    resolve: (value: { data: Array<{ id: string }>; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve({
    data: requestedIds.filter((id) => ownedIds.includes(id)).map((id) => ({ id })),
    error: null,
  }).then(resolve, reject);
  const from = vi.fn(() => query);
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    query,
  };
}

function catalogFoodId(index: number) {
  return `22000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

describe("Saved Meal Catalog Name locale write identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handoff.resolveCatalog.mockImplementation((
      _currentUserId: string,
      view: { resolvedFoodId: string },
    ) => resolvedFood({ food_id: view.resolvedFoodId }));
    handoff.resolveMyFood.mockImplementation((
      _currentUserId: string,
      _authority: unknown,
      input: { foodId: string },
    ) => resolvedFood({ food_id: input.foodId }));
    generation.resolve.mockImplementation(async (_catalog: SupabaseClient, id: string) => (
      currentView([name("90", "en", "Shared name")], [serving("90", "100 g")], id)
    ));
    generation.resolveBatch.mockImplementation(async (catalog: SupabaseClient, ids: readonly string[]) => {
      const views = new Map<string, unknown>();
      for (const id of ids) {
        const view = await generation.resolve(catalog, id);
        if (view) views.set(id, view);
      }
      return views;
    });
    personal.read.mockResolvedValue(noOverride());
  });

  it.each(["en", "de"])("uses exact transient candidate locale %s before the current write locale", async (languageTag) => {
    const owner = ownerSupabase(false);
    const item = { ...frozenFood, languageTag } as SavedMealItemInput & { languageTag: string };

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [item], "ar");

    expect(handoff.resolveCatalog).toHaveBeenCalledWith(userId, expect.anything(), expect.anything(), expect.objectContaining({
      foodId,
      source: "catalog",
      displayName: "Shared name",
      languageTag,
    }));
  });

  it("recovers a unique frozen English Name identity even after the UI switches to German", async () => {
    const owner = ownerSupabase(false);
    generation.resolve.mockResolvedValueOnce(currentView([name("1", "en", "Shared name")], [serving("20", "100 g")]));

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "de");

    expect(generation.resolve).toHaveBeenCalledWith(catalogSupabase, foodId);
    expect(handoff.resolveCatalog).toHaveBeenCalledWith(userId, expect.anything(), expect.anything(), expect.objectContaining({
      foodId,
      source: "catalog",
      displayName: "Shared name",
      languageTag: "en",
    }));
  });

  it("recovers a unique frozen German Name identity even after the UI switches to English", async () => {
    const owner = ownerSupabase(false);
    generation.resolve.mockResolvedValueOnce(currentView([name("2", "de", "Shared name")], [serving("21", "100 g")]));

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "en");

    expect(handoff.resolveCatalog).toHaveBeenCalledWith(userId, expect.anything(), expect.anything(), expect.objectContaining({
      displayName: "Shared name",
      languageTag: "de",
    }));
  });

  it("uses current UI locale only to disambiguate multiple selected Name facts with the same exact frozen text", async () => {
    const owner = ownerSupabase(false);
    generation.resolve.mockResolvedValueOnce(currentView([
      name("3", "en", "Shared name"),
      name("4", "de", "Shared name"),
    ], [serving("22", "100 g")]));

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "de");

    expect(handoff.resolveCatalog).toHaveBeenCalledWith(userId, expect.anything(), expect.anything(), expect.objectContaining({
      displayName: "Shared name",
      languageTag: "de",
    }));
  });

  it("fails closed when same-text same-base regional Names remain ambiguous for the UI locale", async () => {
    const owner = ownerSupabase(false);
    generation.resolve.mockResolvedValueOnce(currentView([
      name("5", "en-US", "Shared name"),
      name("6", "en-GB", "Shared name"),
    ]));

    await expect(canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "en-AU"))
      .rejects.toThrow(/re-select|ambiguous|name/i);
    expect(handoff.resolveCatalog).not.toHaveBeenCalled();
  });

  it("uses the unique exact frozen text regardless of an unrelated UI locale", async () => {
    const owner = ownerSupabase(false);
    generation.resolve.mockResolvedValueOnce(currentView([
      name("7", "ar", "Shared name"),
      name("8", "de", "Andere"),
    ], [serving("23", "100 g")]));

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "fr-FR");

    expect(handoff.resolveCatalog).toHaveBeenCalledWith(userId, expect.anything(), expect.anything(), expect.objectContaining({
      displayName: "Shared name",
      languageTag: "ar",
    }));
  });

  it("fails closed and requires re-selection when no current selected Name matches the frozen text", async () => {
    const owner = ownerSupabase(false);
    generation.resolve.mockResolvedValueOnce(currentView([
      name("9", "en", "Renamed food"),
    ]));

    await expect(canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "en"))
      .rejects.toThrow(/re-select|name/i);
    expect(handoff.resolveCatalog).not.toHaveBeenCalled();
  });

  it("recovers the unique effective current serving identity for a persisted frozen Catalog item", async () => {
    const owner = ownerSupabase(false);
    const exactServing = serving("1", "100 g");
    generation.resolve.mockResolvedValueOnce(currentView(
      [name("10", "en", "Shared name")],
      [exactServing, serving("2", "1 cup")],
    ));

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "de");

    expect(personal.read).toHaveBeenCalledWith(owner, foodId);
    expect(handoff.resolveCatalog).toHaveBeenCalledWith(userId, expect.anything(), expect.anything(), expect.objectContaining({
      foodId,
      source: "catalog",
      serving: "100 g",
      servingOptionId: exactServing.id,
      displayName: "Shared name",
      languageTag: "en",
    }));
  });

  it("requires Saved Meal serving re-selection when a frozen label matches multiple effective selected servings", async () => {
    const owner = ownerSupabase(false);
    generation.resolve.mockResolvedValueOnce(currentView(
      [name("11", "en", "Shared name")],
      [serving("3", "100 g"), serving("4", "100 g")],
    ));

    await expect(canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "en"))
      .rejects.toThrow(/serving.*re-select|re-select.*serving|ambiguous/i);
    expect(handoff.resolveCatalog).not.toHaveBeenCalled();
  });

  it("keeps an effective owner serving override identity null when recovering a persisted frozen Catalog item", async () => {
    const owner = ownerSupabase(false);
    generation.resolve.mockResolvedValueOnce(currentView(
      [name("12", "en", "Shared name")],
      [serving("5", "100 g")],
    ));
    personal.read.mockResolvedValueOnce({
      ...noOverride(),
      hasOverride: true,
      revisionId: "80000000-0000-4000-8000-000000000001",
      pointerRevision: 1,
      servingLabel: "100 g",
    });

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "en");

    expect(handoff.resolveCatalog).toHaveBeenCalledWith(userId, expect.anything(), expect.anything(), expect.objectContaining({
      serving: "100 g",
      servingOptionId: null,
    }));
  });

  it("forwards a newly selected Catalog servingOptionId into exact handoff authority", async () => {
    const owner = ownerSupabase(false);
    const servingOptionId = "70000000-0000-4000-8000-000000000001";
    const item = {
      ...frozenFood,
      languageTag: "en",
      servingOptionId,
    } as SavedMealItemInput & { languageTag: string; servingOptionId: string };

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [item], "de");

    expect(handoff.resolveCatalog).toHaveBeenCalledWith(userId, expect.anything(), expect.anything(), expect.objectContaining({
      foodId,
      source: "catalog",
      serving: "100 g",
      servingOptionId,
      displayName: "Shared name",
      languageTag: "en",
    }));
  });

  it("keeps a transient newly-selected candidate locale as strongest identity without frozen-name recovery", async () => {
    const owner = ownerSupabase(false);
    const item = { ...frozenFood, languageTag: "de" } as SavedMealItemInput & { languageTag: string };

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [item], "en");

    expect(generation.resolveBatch).toHaveBeenCalledWith(catalogSupabase, [foodId]);
    expect(handoff.resolveCatalog).toHaveBeenCalledWith(userId, expect.anything(), expect.anything(), expect.objectContaining({
      displayName: "Shared name",
      languageTag: "de",
    }));
  });

  it("batches and deduplicates Catalog authority for a representative multi-Food Saved Meal", async () => {
    const owner = trackingOwnerSupabase();
    const uniqueFoodIds = Array.from({ length: 20 }, (_, index) => catalogFoodId(index));
    const items = [...uniqueFoodIds, uniqueFoodIds[0]!, uniqueFoodIds[7]!].map((id) => ({
      ...frozenFood,
      food_id: id,
    }));
    const views = new Map(uniqueFoodIds.map((id) => [
      id,
      currentView([name("30", "en", "Shared name")], [serving("30", "100 g")], id),
    ]));

    generation.resolve.mockImplementation(async (_catalog: SupabaseClient, id: string) => views.get(id));
    generation.resolveBatch.mockResolvedValue(views);
    const result = await canonicalizeSavedMealItems(
      owner.client,
      catalogSupabase,
      userId,
      items,
      "en",
    );

    expect(result).toHaveLength(items.length);
    expect(owner.from).toHaveBeenCalledTimes(1);
    expect(owner.from).toHaveBeenCalledWith("user_food_items");
    expect(owner.query.in).toHaveBeenCalledWith("id", uniqueFoodIds);
    expect(generation.resolveBatch).toHaveBeenCalledTimes(1);
    expect(generation.resolveBatch).toHaveBeenCalledWith(catalogSupabase, uniqueFoodIds);
    expect(generation.resolve).not.toHaveBeenCalled();
    expect(handoff.resolveCatalog).toHaveBeenCalledTimes(items.length);

    const hydratedIds = new Set(
      handoff.resolveCatalog.mock.calls.map((call) => call[1]?.resolvedFoodId),
    );
    expect(hydratedIds).toEqual(new Set(uniqueFoodIds));
  });

  it("strips transient locale metadata from the returned canonical frozen snapshot", async () => {
    const owner = ownerSupabase(false);
    handoff.resolveCatalog.mockReturnValueOnce(resolvedFood({ languageTag: "en" }));

    const result = await canonicalizeSavedMealItems(
      owner,
      catalogSupabase,
      userId,
      [{ ...frozenFood, languageTag: "en" } as SavedMealItemInput & { languageTag: string }],
      "de",
    );

    expect(result).toEqual([frozenFood]);
    expect(result[0]).not.toHaveProperty("languageTag");
  });

  it("keeps My Food canonicalization generation- and locale-independent", async () => {
    const owner = ownerSupabase(true);

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "de");

    const input = handoff.resolveMyFood.mock.calls[0]?.[2];
    expect(input).toMatchObject({
      foodId,
      source: "my_food",
      quantity: 1,
      serving: "100 g",
    });
    expect(input).not.toHaveProperty("languageTag");
    expect(input).not.toHaveProperty("displayName");
  });
});
