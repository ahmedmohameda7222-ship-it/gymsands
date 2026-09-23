import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealItemInput } from "@/services/nutrition-v1/server/saved-meals";

const handoff = vi.hoisted(() => ({ resolve: vi.fn() }));
const generation = vi.hoisted(() => ({ resolve: vi.fn() }));
const personal = vi.hoisted(() => ({ read: vi.fn() }));
const recipe = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("@/services/nutrition-v1/server/food-handoff", async () => {
  const actual = await vi.importActual<typeof import("@/services/nutrition-v1/server/food-handoff")>(
    "@/services/nutrition-v1/server/food-handoff",
  );
  return { ...actual, resolveFoodHandoffWithAuthorities: handoff.resolve };
});
vi.mock("@/services/food-catalog/server/current-generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/services/food-catalog/server/current-generation-service")>(
    "@/services/food-catalog/server/current-generation-service",
  );
  return { ...actual, resolveCurrentGenerationFoodForNewUseFromSupabase: generation.resolve };
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
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: owned ? { id: foodId } : null, error: null }));
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
) {
  return {
    requestedFoodId: foodId,
    resolvedFoodId: foodId,
    selections: {
      servingOptionIds: servings.map((serving) => serving.id),
      nameFactIds: names.map((name) => name.id),
      taxonomyAssignmentIds: [],
      marketAssignmentIds: [],
      verification: [],
    },
    names: names.map((name) => ({
      id: name.id,
      foodId,
      languageTag: name.languageTag,
      role: "preferred_display",
      text: name.text,
    })),
    servingOptions: servings.map((serving) => ({
      id: serving.id,
      foodId,
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

describe("Saved Meal Catalog Name locale write identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handoff.resolve.mockResolvedValue(resolvedFood());
    personal.read.mockResolvedValue(noOverride());
  });

  it.each(["en", "de"])("uses exact transient candidate locale %s before the current write locale", async (languageTag) => {
    const owner = ownerSupabase(false);
    const item = { ...frozenFood, languageTag } as SavedMealItemInput & { languageTag: string };

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [item], "ar");

    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
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
    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
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

    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
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

    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
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
    expect(handoff.resolve).not.toHaveBeenCalled();
  });

  it("uses the unique exact frozen text regardless of an unrelated UI locale", async () => {
    const owner = ownerSupabase(false);
    generation.resolve.mockResolvedValueOnce(currentView([
      name("7", "ar", "Shared name"),
      name("8", "de", "Andere"),
    ], [serving("23", "100 g")]));

    await canonicalizeSavedMealItems(owner, catalogSupabase, userId, [frozenFood], "fr-FR");

    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
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
    expect(handoff.resolve).not.toHaveBeenCalled();
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
    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
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
    expect(handoff.resolve).not.toHaveBeenCalled();
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

    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
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

    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
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

    expect(generation.resolve).not.toHaveBeenCalled();
    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
      displayName: "Shared name",
      languageTag: "de",
    }));
  });

  it("strips transient locale metadata from the returned canonical frozen snapshot", async () => {
    const owner = ownerSupabase(false);
    handoff.resolve.mockResolvedValueOnce(resolvedFood({ languageTag: "en" }));

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

    const input = handoff.resolve.mock.calls[0]?.[3];
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
