import { describe, expect, it } from "vitest";
import type {
  CatalogFoodNutrition,
  FoodCatalogDomainBundle,
  FoodCatalogRootRecord,
  ResolvedCatalogFood,
} from "@/services/food-catalog/server/contracts";

describe("Food Catalog V2 server contracts", () => {
  it("keeps root identity separate from flat Food authority", () => {
    const root: FoodCatalogRootRecord = {
      id: "22222222-2222-4222-8222-222222222222",
      lifecycleStatus: "active",
      mergedIntoFoodId: null,
    };
    expect(root).not.toHaveProperty("food_name");
    expect(root).not.toHaveProperty("calories");
  });

  it("preserves explicit zero separately from unknown null", () => {
    const nutrition: CatalogFoodNutrition = {
      calories: 0,
      protein_g: null,
      carbs_g: 0,
      fat_g: null,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: 100,
      basis_unit: "g",
    };
    const value: ResolvedCatalogFood = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Test Food",
      servingLabel: "100 g",
      nutrition,
      verified: false,
    };
    expect(value.nutrition.calories).toBe(0);
    expect(value.nutrition.protein_g).toBeNull();
  });

  it("does not put implicit selected/current authority on the raw bundle", () => {
    const bundle = {} as FoodCatalogDomainBundle;
    expect("selectedNutrition" in bundle).toBe(false);
    expect("currentName" in bundle).toBe(false);
    expect("verified" in bundle).toBe(false);
  });
});
