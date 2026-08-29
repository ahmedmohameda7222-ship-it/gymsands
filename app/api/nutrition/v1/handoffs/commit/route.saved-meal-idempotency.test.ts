import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const recipeId = "33333333-3333-4333-8333-333333333333";
const recipeVersionId = "44444444-4444-4444-8444-444444444444";
const savedMealId = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  requireNutritionUser: vi.fn(),
  resolveRecipeHandoff: vi.fn(),
  createSavedMeal: vi.fn(),
}));

vi.mock("@/lib/nutrition-v1/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nutrition-v1/http")>("@/lib/nutrition-v1/http");
  return { ...actual, requireNutritionUser: mocks.requireNutritionUser };
});
vi.mock("@/services/nutrition-v1/server/recipe-handoff", () => ({ resolveRecipeHandoff: mocks.resolveRecipeHandoff }));
vi.mock("@/services/nutrition-v1/server/saved-meals", () => ({ createSavedMeal: mocks.createSavedMeal }));

import { POST } from "@/app/api/nutrition/v1/handoffs/commit/route";

describe("Recipe to Saved Meal handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireNutritionUser.mockResolvedValue({ supabase: {}, user: { id: userId }, accessToken: "test" });
    mocks.resolveRecipeHandoff.mockResolvedValue({
      recipeId,
      recipeVersionId,
      quantity: 2,
      servingLabel: "2 servings",
      name: "Chicken bowl",
      frozenSourceSnapshot: { calories: 1000 },
      diaryItem: {},
      shoppingIngredients: [],
      savedMealItem: {
        kind: "recipe",
        recipe: {
          recipe_id: recipeId,
          recipe_version_id: recipeVersionId,
          resolved_serving_quantity: 2,
          resolved_serving_label: "2 servings",
          frozen_recipe_name: "Chicken bowl",
          frozen_nutrition: { calories: 1000 },
        },
      },
    });
    mocks.createSavedMeal.mockResolvedValue({ id: savedMealId, user_id: userId, name: "Cooked dinner", note: null, is_favorite: false });
  });

  it("preserves exact Recipe version, 2-serving resolution, and operation identity", async () => {
    const response = await POST(new Request("http://localhost/api/nutrition/v1/handoffs/commit", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({
        destination: "saved_meal",
        operationId,
        name: "Cooked dinner",
        source: { type: "recipe", id: recipeId, versionId: recipeVersionId, quantity: 2 },
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.resolveRecipeHandoff).toHaveBeenCalledWith(expect.anything(), userId, recipeId, recipeVersionId, 2);
    expect(mocks.createSavedMeal).toHaveBeenCalledWith(expect.anything(), userId, expect.objectContaining({
      operationId,
      items: [expect.objectContaining({
        kind: "recipe",
        recipe: expect.objectContaining({
          recipe_version_id: recipeVersionId,
          resolved_serving_quantity: 2,
        }),
      })],
    }));
  });
});
