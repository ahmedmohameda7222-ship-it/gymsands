import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";

const { listFoodLibrary, resolveFoodHandoff, createSavedMeal } = vi.hoisted(() => ({
  listFoodLibrary: vi.fn(),
  resolveFoodHandoff: vi.fn(),
  createSavedMeal: vi.fn(),
}));

vi.mock("@/services/nutrition-v1/server/food-library", async () => {
  const actual = await vi.importActual<typeof import("@/services/nutrition-v1/server/food-library")>("@/services/nutrition-v1/server/food-library");
  return { ...actual, listFoodLibrary };
});
vi.mock("@/services/nutrition-v1/server/food-handoff", () => ({ resolveFoodHandoff }));
vi.mock("@/services/nutrition-v1/server/saved-meals", () => ({ createSavedMeal }));

import { createCanonicalSavedMealFromMcp } from "@/lib/mcp/nutrition-v1-saved-meal";

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const savedMealId = "33333333-3333-4333-8333-333333333333";
const ctx = { userId, supabase: {} } as unknown as McpContext;

beforeEach(() => {
  vi.clearAllMocks();
  listFoodLibrary.mockResolvedValue({
    items: [{ id: foodId, source: "catalog", name: "Greek yogurt", servingLabel: "170 g" }],
    nextCursor: null,
  });
  resolveFoodHandoff.mockResolvedValue({
    savedMealItem: {
      kind: "food",
      food_id: foodId,
      frozen_name: "Greek yogurt",
      resolved_quantity: 2,
      resolved_serving_label: "170 g",
      frozen_nutrition: { calories: 180, protein_g: 30, carbs_g: null, fat_g: 0, fiber_g: null },
    },
  });
  createSavedMeal.mockResolvedValue({ id: savedMealId, user_id: userId, name: "Breakfast" });
});

describe("Nutrition V1 MCP Saved Meal convergence", () => {
  it("resolves Food through Plaivra authority and writes only the canonical Saved Meal domain", async () => {
    const result = await createCanonicalSavedMealFromMcp(ctx, {
      meal_name: "Breakfast",
      items: [{ food_name: "Greek yogurt", serving_hint: "170 g", quantity: 2 }],
    });

    expect(listFoodLibrary).toHaveBeenCalledWith(ctx.supabase, userId, expect.objectContaining({ query: "Greek yogurt" }));
    expect(resolveFoodHandoff).toHaveBeenCalledWith(ctx.supabase, userId, {
      foodId,
      source: "catalog",
      quantity: 2,
      serving: "170 g",
    });
    expect(createSavedMeal).toHaveBeenCalledWith(ctx.supabase, userId, expect.objectContaining({
      name: "Breakfast",
      items: [expect.objectContaining({ food_id: foodId, frozen_nutrition: expect.objectContaining({ carbs_g: null }) })],
    }));
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ ok: true, saved_meal_id: savedMealId, authority: "nutrition_saved_meals" });
  });

  it("fails closed for ambiguous Food identity instead of manufacturing nutrition truth", async () => {
    listFoodLibrary.mockResolvedValue({
      items: [
        { id: foodId, source: "catalog", name: "Yogurt", servingLabel: "100 g" },
        { id: "44444444-4444-4444-8444-444444444444", source: "catalog", name: "Yogurt", servingLabel: "100 g" },
      ],
      nextCursor: null,
    });

    const result = await createCanonicalSavedMealFromMcp(ctx, {
      meal_name: "Ambiguous",
      items: [{ food_name: "Yogurt", quantity: 1 }],
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ ok: false, code: "canonical_food_required" });
    expect(createSavedMeal).not.toHaveBeenCalled();
    expect(resolveFoodHandoff).not.toHaveBeenCalled();
  });
});
