import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSavedMeal, type SavedMealItemInput } from "@/services/nutrition-v1/server/saved-meals";

const userId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const savedMealId = "33333333-3333-4333-8333-333333333333";
const foodId = "44444444-4444-4444-8444-444444444444";

const item: SavedMealItemInput = {
  kind: "food",
  food_id: foodId,
  frozen_name: "Greek yogurt",
  resolved_quantity: 1,
  resolved_serving_label: "170 g",
  frozen_nutrition: { calories: 130, protein_g: 18, carbs_g: 8, fat_g: 2, fiber_g: null },
};

describe("Saved Meal create replay authority", () => {
  it("sends the caller operation ID into the idempotent database command", async () => {
    const rpc = vi.fn(async () => ({
      data: { id: savedMealId, user_id: userId, name: "Breakfast", note: null, is_favorite: false },
      error: null,
    }));
    const client = { rpc } as unknown as SupabaseClient;

    const result = await createSavedMeal(client, userId, {
      operationId,
      name: "Breakfast",
      items: [item],
    } as Parameters<typeof createSavedMeal>[2] & { operationId: string });

    expect(result.id).toBe(savedMealId);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("create_nutrition_saved_meal_idempotent", {
      p_operation_id: operationId,
      p_name: "Breakfast",
      p_note: null,
      p_is_favorite: false,
      p_items: [item],
    });
  });
});
