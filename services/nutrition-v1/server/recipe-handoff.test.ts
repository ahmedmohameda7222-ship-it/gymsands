import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveRecipeHandoff } from "@/services/nutrition-v1/server/recipe-handoff";

const userId = "11111111-1111-4111-8111-111111111111";
const recipeId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";

function chain(result: { data: unknown; error: null | { message: string } }) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order"]) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

function client() {
  const queues: Record<string, any[]> = {
    nutrition_recipes: [{ data: { id: recipeId, user_id: userId, name: "Root", deleted_at: null }, error: null }],
    nutrition_recipe_versions: [{ data: { id: versionId, recipe_id: recipeId, user_id: userId, name: "Published V2", servings: 4, metadata: { nutrition_per_serving: { calories: 450, protein_g: 35, carbs_g: null, fat_g: 12, fiber_g: 7 } } }, error: null }],
    nutrition_recipe_ingredients: [{ data: [{ food_id: "44444444-4444-4444-8444-444444444444", ingredient_name: "Rice", quantity: 400, unit: "g", position: 0 }], error: null }],
  };
  return { from: vi.fn((table: string) => chain(queues[table].shift())) } as unknown as SupabaseClient;
}

describe("Nutrition V1 Recipe handoff authority", () => {
  it("freezes the exact requested published Recipe version rather than silently switching versions", async () => {
    const handoff = await resolveRecipeHandoff(client(), userId, recipeId, versionId, 1);

    expect(handoff.recipeVersionId).toBe(versionId);
    expect(handoff.quantity).toBe(1);
    expect(handoff.frozenNutrition).toEqual({ calories: 450, protein_g: 35, carbs_g: null, fat_g: 12, fiber_g: 7 });
    expect(handoff.savedMealItem.recipe.recipe_version_id).toBe(versionId);
    expect(handoff.diaryItem.nutrition.carbsG).toBeNull();
  });

  it("scales resolved Recipe nutrition, shopping and frozen consumer snapshots by serving quantity without converting null to zero", async () => {
    const handoff = await resolveRecipeHandoff(client(), userId, recipeId, versionId, 2);

    expect(handoff.quantity).toBe(2);
    expect(handoff.servingLabel).toBe("2 servings");
    expect(handoff.frozenNutrition).toEqual({ calories: 900, protein_g: 70, carbs_g: null, fat_g: 24, fiber_g: 14 });
    expect(handoff.diaryItem).toEqual(expect.objectContaining({
      servingLabel: "2 servings",
      quantity: 2,
      nutrition: { caloriesKcal: 900, proteinG: 70, carbsG: null, fatG: 24 },
    }));
    expect(handoff.savedMealItem.recipe).toEqual(expect.objectContaining({
      recipe_id: recipeId,
      recipe_version_id: versionId,
      resolved_serving_quantity: 2,
      resolved_serving_label: "2 servings",
      frozen_nutrition: { calories: 900, protein_g: 70, carbs_g: null, fat_g: 24, fiber_g: 14 },
    }));
    expect(handoff.shoppingIngredients).toEqual([{ foodId: "44444444-4444-4444-8444-444444444444", name: "Rice", quantity: 200, unit: "g", qualifier: null }]);
  });

  it("rejects non-positive or non-finite serving quantities", async () => {
    await expect(resolveRecipeHandoff(client(), userId, recipeId, versionId, 0)).rejects.toThrow(/quantity/i);
    await expect(resolveRecipeHandoff(client(), userId, recipeId, versionId, Number.NaN)).rejects.toThrow(/quantity/i);
  });
});