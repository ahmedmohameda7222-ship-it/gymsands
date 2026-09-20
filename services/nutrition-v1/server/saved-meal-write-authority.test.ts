import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealItemInput } from "@/services/nutrition-v1/server/saved-meals";

const handoff = vi.hoisted(() => ({ resolve: vi.fn() }));
const recipe = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("@/services/nutrition-v1/server/food-handoff", () => ({
  resolveFoodHandoffWithAuthorities: handoff.resolve,
}));
vi.mock("@/services/nutrition-v1/server/recipe-handoff", () => ({
  resolveRecipeHandoff: recipe.resolve,
}));

import { canonicalizeSavedMealItems } from "@/services/nutrition-v1/server/saved-meal-write-authority";

const canonicalizeWithWriteLocale = canonicalizeSavedMealItems as unknown as (
  ownerSupabase: SupabaseClient,
  catalogSupabase: SupabaseClient,
  userId: string,
  items: SavedMealItemInput[],
  writeLanguageTag: string | null,
) => ReturnType<typeof canonicalizeSavedMealItems>;

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

describe("Saved Meal Catalog Name locale write identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handoff.resolve.mockResolvedValue(resolvedFood());
  });

  it.each(["en", "de"])("uses exact transient candidate locale %s before the current write locale", async (languageTag) => {
    const owner = ownerSupabase(false);
    const item = { ...frozenFood, languageTag } as SavedMealItemInput & { languageTag: string };

    await canonicalizeWithWriteLocale(owner, catalogSupabase, userId, [item], "ar");

    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
      foodId,
      source: "catalog",
      displayName: "Shared name",
      languageTag,
    }));
  });

  it.each(["en", "de"])("uses current write locale %s for a legacy frozen Catalog snapshot without transient locale", async (writeLanguageTag) => {
    const owner = ownerSupabase(false);

    await canonicalizeWithWriteLocale(owner, catalogSupabase, userId, [frozenFood], writeLanguageTag);

    expect(handoff.resolve).toHaveBeenCalledWith(owner, catalogSupabase, userId, expect.objectContaining({
      foodId,
      source: "catalog",
      displayName: "Shared name",
      languageTag: writeLanguageTag,
    }));
  });

  it("fails closed when duplicate exact text remains ambiguous without item or write locale", async () => {
    const owner = ownerSupabase(false);
    handoff.resolve.mockRejectedValueOnce(new Error("The selected Food name does not resolve to exactly one current-generation Name fact."));

    await expect(canonicalizeWithWriteLocale(owner, catalogSupabase, userId, [frozenFood], null)).rejects.toThrow(/name.*exactly one/i);
  });

  it("strips transient locale metadata from the returned canonical frozen snapshot", async () => {
    const owner = ownerSupabase(false);
    handoff.resolve.mockResolvedValueOnce(resolvedFood({ languageTag: "en" }));

    const result = await canonicalizeWithWriteLocale(
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

    await canonicalizeWithWriteLocale(owner, catalogSupabase, userId, [frozenFood], "de");

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
