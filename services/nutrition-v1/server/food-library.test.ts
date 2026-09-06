import { describe, expect, it } from "vitest";

import {
  normalizeFoodSearchText,
  paginateFoodLibraryResults,
  qualifiesFoodNutrition,
  rankFoodLibraryCandidates,
  resolveEffectiveFoodNutrition,
  type FoodLibraryCandidate,
  type FoodLibraryNutritionLabelPolicy,
} from "@/services/nutrition-v1/server/food-library";

function candidate(overrides: Partial<FoodLibraryCandidate> = {}): FoodLibraryCandidate {
  return {
    id: "food-base",
    source: "catalog",
    name: "Chicken Breast",
    brand: null,
    category: "Protein",
    cuisine: null,
    servingLabel: "100 g",
    verified: false,
    favorite: false,
    recentAt: null,
    frequency: 0,
    locale: "en",
    aliases: [],
    nutrition: {
      calories: 165,
      protein_g: 31,
      carbs_g: 0,
      fat_g: 3.6,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: 100,
      basis_unit: "g",
    },
    ...overrides,
  };
}

const fixturePolicy: FoodLibraryNutritionLabelPolicy = {
  policyVersion: "test-only-policy-v1",
  highProteinMinGPer100: 30,
  lowCarbMaxGPer100: 5,
};

describe("Nutrition V1 Food Library search authority", () => {
  it("ranks exact personal identity first, then exact catalog intent, then exact alias, with personal relevance only inside relevant matches", () => {
    const ranked = rankFoodLibraryCandidates([
      candidate({ id: "neutral-prefix", name: "Chicken Breast Fillet", frequency: 0 }),
      candidate({ id: "favorite-prefix", name: "Chicken Breast Cooked", favorite: true, recentAt: "2026-08-26T07:00:00.000Z", frequency: 7 }),
      candidate({ id: "alias-exact", name: "Hähnchenbrust", aliases: [{ locale: "en", value: "Chicken Breast" }], favorite: true }),
      candidate({ id: "catalog-exact", name: "Chicken Breast", verified: true }),
      candidate({ id: "personal-exact", source: "my_food", name: "Chicken Breast", frequency: 1 }),
    ], { query: "Chicken Breast", locale: "en" });

    expect(ranked.map((item) => item.id)).toEqual([
      "personal-exact",
      "catalog-exact",
      "alias-exact",
      "favorite-prefix",
      "neutral-prefix",
    ]);
  });

  it("matches German and Arabic aliases without creating a second Food identity", () => {
    const shared = candidate({
      id: "chicken-one-id",
      name: "Chicken Breast",
      aliases: [
        { locale: "de", value: "Hähnchenbrust" },
        { locale: "ar", value: "صدر دجاج" },
      ],
    });

    expect(rankFoodLibraryCandidates([shared], { query: "Hähnchenbrust", locale: "de" }).map((item) => item.id)).toEqual(["chicken-one-id"]);
    expect(rankFoodLibraryCandidates([shared], { query: "صدر دجاج", locale: "ar" }).map((item) => item.id)).toEqual(["chicken-one-id"]);
    expect(normalizeFoodSearchText("  صَدْر دجاج  ")).toBe(normalizeFoodSearchText("صدر دجاج"));
  });

  it("caps every cursor page at 20 results and continues deterministically", () => {
    const rows = Array.from({ length: 27 }, (_, index) => candidate({ id: `food-${String(index).padStart(2, "0")}`, name: `Food ${index}` }));
    const first = paginateFoodLibraryResults(rows, { limit: 99 });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();

    const second = paginateFoodLibraryResults(rows, { limit: 99, cursor: first.nextCursor });
    expect(second.items).toHaveLength(7);
    expect(second.items[0].id).toBe("food-20");
    expect(second.nextCursor).toBeNull();
  });

  it("uses active personal correction values without mutating canonical verification or fabricating missing nutrients", () => {
    const effective = resolveEffectiveFoodNutrition(
      {
        calories: 165,
        protein_g: 31,
        carbs_g: null,
        fat_g: 3.6,
        saturated_fat_g: null,
        fiber_g: null,
        sugars_g: null,
        sodium_mg: null,
        basis_amount: 100,
        basis_unit: "g",
      },
      {
        calories: 150,
        protein_g: null,
        carbs_g: null,
        fat_g: 3,
        basis_amount: 100,
        basis_unit: "g",
      },
    );

    expect(effective).toMatchObject({ calories: 150, protein_g: 31, carbs_g: null, fat_g: 3, basis_amount: 100, basis_unit: "g" });
  });

  it("requires explicit versioned policy for convenience labels and never qualifies unknown nutrition", () => {
    const known = candidate().nutrition;
    expect(qualifiesFoodNutrition(known, { presets: ["high-protein"] })).toBe(false);
    expect(qualifiesFoodNutrition(known, { presets: ["high-protein", "low-carb"] }, fixturePolicy)).toBe(true);
    expect(qualifiesFoodNutrition({ ...known, protein_g: null }, { presets: ["high-protein"] }, fixturePolicy)).toBe(false);
    expect(qualifiesFoodNutrition({ ...known, carbs_g: null }, { presets: ["low-carb"] }, fixturePolicy)).toBe(false);
    expect(qualifiesFoodNutrition({ ...known, basis_amount: null, basis_unit: null }, { protein: { operator: "gt", value: 20 } })).toBe(false);
  });

  it("supports strict greater-than, less-than and equality numeric predicates independently per nutrient", () => {
    const known = candidate().nutrition;
    expect(qualifiesFoodNutrition(known, { protein: { operator: "gt", value: 30 } })).toBe(true);
    expect(qualifiesFoodNutrition(known, { protein: { operator: "lt", value: 31 } })).toBe(false);
    expect(qualifiesFoodNutrition(known, { protein: { operator: "eq", value: 31 }, carbs: { operator: "eq", value: 0 }, fat: { operator: "lt", value: 4 } })).toBe(true);
  });
});
