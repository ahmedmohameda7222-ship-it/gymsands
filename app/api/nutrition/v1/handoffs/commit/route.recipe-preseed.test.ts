import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const recipeId = "33333333-3333-4333-8333-333333333333";
const draftId = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  requireNutritionUser: vi.fn(),
  resolveFoodHandoff: vi.fn(),
  createRecipeDraft: vi.fn(),
  autosaveRecipeDraft: vi.fn(),
  createPreseededRecipeDraft: vi.fn(),
}));

vi.mock("@/lib/nutrition-v1/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nutrition-v1/http")>("@/lib/nutrition-v1/http");
  return { ...actual, requireNutritionUser: mocks.requireNutritionUser };
});
vi.mock("@/services/nutrition-v1/server/food-handoff", () => ({ resolveFoodHandoff: mocks.resolveFoodHandoff }));
vi.mock("@/services/nutrition-v1/server/recipes", async () => {
  const actual = await vi.importActual<typeof import("@/services/nutrition-v1/server/recipes")>("@/services/nutrition-v1/server/recipes");
  return {
    ...actual,
    createRecipeDraft: mocks.createRecipeDraft,
    autosaveRecipeDraft: mocks.autosaveRecipeDraft,
    createPreseededRecipeDraft: mocks.createPreseededRecipeDraft,
  };
});

import { POST } from "@/app/api/nutrition/v1/handoffs/commit/route";

function request() {
  return new Request("http://localhost/api/nutrition/v1/handoffs/commit", {
    method: "POST",
    headers: { authorization: "Bearer test", "content-type": "application/json" },
    body: JSON.stringify({
      destination: "recipe",
      operationId,
      source: { type: "food", id: "55555555-5555-4555-8555-555555555555", source: "catalog", quantity: 2, serving: "100 g" },
      targetRecipeId: null,
    }),
  });
}

describe("Food to new Recipe handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireNutritionUser.mockResolvedValue({ supabase: {}, user: { id: userId }, accessToken: "test" });
    mocks.resolveFoodHandoff.mockResolvedValue({
      foodId: "55555555-5555-4555-8555-555555555555",
      name: "Atomic chicken",
      source: "catalog",
      quantity: 2,
      serving: "100 g",
      frozenSourceSnapshot: { name: "Atomic chicken" },
      recipeIngredient: {
        food_id: "55555555-5555-4555-8555-555555555555",
        ingredient_name: "Atomic chicken",
        quantity: 2,
        unit: "100 g",
        frozen_nutrition: { calories: 220 },
      },
    });
    mocks.createRecipeDraft.mockResolvedValue({
      recipeId,
      draftId,
      recipe: { id: recipeId },
      draft: { id: draftId, recipe_id: recipeId, revision: 0, name: null, servings: null, total_cooked_weight_g: null, total_time_minutes: null, notes: null, draft_metadata: {} },
    });
    mocks.autosaveRecipeDraft.mockResolvedValue({ id: draftId, recipe_id: recipeId, revision: 1 });
    mocks.createPreseededRecipeDraft.mockResolvedValue({ recipeId, draftId, reused: false });
  });

  it("uses one atomic command carrying the caller operation identity instead of create-then-autosave orchestration", async () => {
    const response = await POST(request());

    expect(response.ok).toBe(true);
    expect(mocks.createPreseededRecipeDraft).toHaveBeenCalledTimes(1);
    expect(mocks.createPreseededRecipeDraft).toHaveBeenCalledWith(
      expect.anything(),
      userId,
      expect.objectContaining({
        operationId,
        ingredient: expect.objectContaining({
          food_id: "55555555-5555-4555-8555-555555555555",
          ingredient_name: "Atomic chicken",
          quantity: 2,
          unit: "100 g",
        }),
      }),
    );
    expect(mocks.createRecipeDraft).not.toHaveBeenCalled();
    expect(mocks.autosaveRecipeDraft).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ destination: "recipe", recipeId, draftId });
  });

  it("forwards the same operation identity on a retry so database authority can converge on the same Recipe", async () => {
    await POST(request());
    await POST(request());

    expect(mocks.createPreseededRecipeDraft).toHaveBeenCalledTimes(2);
    expect(mocks.createPreseededRecipeDraft.mock.calls.map((call) => call[2].operationId)).toEqual([operationId, operationId]);
  });
});
