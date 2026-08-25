import { describe, expect, it } from "vitest";

import {
  recipeConsumerSnapshot,
  type FrozenNutritionSnapshot,
  type SavedMealBundleSnapshot,
} from "./contracts";

describe("Nutrition V1 canonical contracts", () => {
  const nutrition: FrozenNutritionSnapshot = {
    calories: 520,
    protein_g: 42,
    carbs_g: 55,
    fat_g: 16,
    fiber_g: null,
  };

  it("requires Recipe version lineage for committed consumers", () => {
    expect(() =>
      recipeConsumerSnapshot({
        recipeId: "recipe-1",
        recipeVersionId: "",
        servingQuantity: 1,
        servingLabel: "1 serving",
        recipeName: "Chicken Alfredo",
        nutrition,
      }),
    ).toThrow(/version/i);
  });

  it("rejects non-positive serving quantities", () => {
    expect(() =>
      recipeConsumerSnapshot({
        recipeId: "recipe-1",
        recipeVersionId: "version-3",
        servingQuantity: 0,
        servingLabel: "1 serving",
        recipeName: "Chicken Alfredo",
        nutrition,
      }),
    ).toThrow(/serving/i);
  });

  it("creates a frozen Recipe consumer snapshot without rewriting unknown nutrition", () => {
    expect(
      recipeConsumerSnapshot({
        recipeId: "recipe-1",
        recipeVersionId: "version-3",
        servingQuantity: 1.5,
        servingLabel: "1 serving",
        recipeName: "Chicken Alfredo",
        nutrition,
      }),
    ).toEqual({
      recipe_id: "recipe-1",
      recipe_version_id: "version-3",
      resolved_serving_quantity: 1.5,
      resolved_serving_label: "1 serving",
      frozen_recipe_name: "Chicken Alfredo",
      frozen_nutrition: nutrition,
    });
  });

  it("models Saved Meal bundles as frozen Food/Recipe child snapshots", () => {
    const bundle: SavedMealBundleSnapshot = {
      saved_meal_id: "saved-meal-1",
      frozen_name: "Lunch Combo",
      items: [
        {
          kind: "food",
          food_id: "food-1",
          frozen_name: "Greek Yogurt",
          resolved_quantity: 1,
          resolved_serving_label: "1 cup",
          frozen_nutrition: {
            calories: 120,
            protein_g: 15,
            carbs_g: 8,
            fat_g: 2,
            fiber_g: null,
          },
        },
        {
          kind: "recipe",
          recipe: recipeConsumerSnapshot({
            recipeId: "recipe-1",
            recipeVersionId: "version-3",
            servingQuantity: 1,
            servingLabel: "1 serving",
            recipeName: "Chicken Alfredo",
            nutrition,
          }),
        },
      ],
    };

    expect(bundle.items[1]).toMatchObject({
      kind: "recipe",
      recipe: { recipe_id: "recipe-1", recipe_version_id: "version-3" },
    });
  });
});
