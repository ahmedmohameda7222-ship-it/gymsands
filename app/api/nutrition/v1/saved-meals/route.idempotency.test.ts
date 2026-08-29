import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const savedMealId = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  requireNutritionUser: vi.fn(),
  canonicalizeSavedMealItems: vi.fn(),
  createSavedMeal: vi.fn(),
}));

vi.mock("@/lib/nutrition-v1/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nutrition-v1/http")>("@/lib/nutrition-v1/http");
  return { ...actual, requireNutritionUser: mocks.requireNutritionUser };
});
vi.mock("@/services/nutrition-v1/server/saved-meal-write-authority", () => ({ canonicalizeSavedMealItems: mocks.canonicalizeSavedMealItems }));
vi.mock("@/services/nutrition-v1/server/saved-meals", () => ({ createSavedMeal: mocks.createSavedMeal }));

import { POST } from "@/app/api/nutrition/v1/saved-meals/route";

describe("Saved Meal POST retry identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireNutritionUser.mockResolvedValue({ supabase: {}, user: { id: userId }, accessToken: "test" });
    mocks.canonicalizeSavedMealItems.mockResolvedValue([{ kind: "food", food_id: "44444444-4444-4444-8444-444444444444" }]);
    mocks.createSavedMeal.mockResolvedValue({ id: savedMealId, user_id: userId, name: "Breakfast", note: null, is_favorite: false });
  });

  it("requires and forwards the caller operation ID into canonical creation", async () => {
    const response = await POST(new Request("http://localhost/api/nutrition/v1/saved-meals", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ operationId, name: "Breakfast", items: [{ kind: "food" }] }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createSavedMeal).toHaveBeenCalledWith(expect.anything(), userId, expect.objectContaining({
      operationId,
      name: "Breakfast",
    }));
  });
});
