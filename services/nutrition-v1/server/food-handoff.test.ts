import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveFoodHandoff } from "@/services/nutrition-v1/server/food-handoff";

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const survivorId = "33333333-3333-4333-8333-333333333333";

function query(result: { data: unknown; error: null | { message: string } }) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is"]) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  return q;
}

function clientFor(results: Record<string, Array<{ data: unknown; error: null | { message: string } }>>) {
  const queues = Object.fromEntries(Object.entries(results).map(([key, values]) => [key, [...values]]));
  const seen: Record<string, Array<Record<string, unknown>>> = {};
  const from = vi.fn((table: string) => {
    const result = (queues[table] as Array<any> | undefined)?.shift();
    if (!result) throw new Error(`Unexpected table query: ${table}`);
    const q = query(result);
    (seen[table] ??= []).push(q);
    return q;
  });
  return { client: { from } as unknown as SupabaseClient, from, seen };
}

describe("Nutrition V1 Food handoff authority", () => {
  it("re-resolves catalog truth, applies owner correction, and preserves unknown nutrients", async () => {
    const db = clientFor({
      food_items: [{ data: { id: foodId, food_name: "Yogurt", serving_size: "170 g", calories: 100, protein_g: 10, carbs_g: 8, fat_g: 2, saturated_fat_g: null, fiber_g: null, sugars_g: 7, sodium_mg: 60, nutrition_basis_amount: 170, nutrition_basis_unit: "g", lifecycle_status: "active", merged_into_food_id: null, is_verified: true }, error: null }],
      food_personal_corrections: [{ data: { calories: null, protein_g: 12, carbs_g: null, fat_g: null, saturated_fat_g: null, fiber_g: null, sugars_g: null, sodium_mg: null, basis_amount: null, basis_unit: null }, error: null }],
    });

    const handoff = await resolveFoodHandoff(db.client, userId, { foodId, source: "catalog", quantity: 2, serving: "170 g" });

    expect(handoff.frozenNutrition).toMatchObject({ calories: 200, protein_g: 24, carbs_g: 16, fat_g: 4, fiber_g: null });
    expect(handoff.diaryItem).toMatchObject({ foodName: "Yogurt", quantity: 2, foodItemId: foodId, userFoodItemId: null });
    expect(handoff.savedMealItem).toMatchObject({ kind: "food", food_id: foodId, resolved_quantity: 2, frozen_nutrition: expect.objectContaining({ fiber_g: null }) });
  });

  it("resolves a merged catalog Food to the survivor before creating frozen handoff snapshots", async () => {
    const db = clientFor({
      food_items: [
        { data: { id: foodId, lifecycle_status: "merged", merged_into_food_id: survivorId }, error: null },
        { data: { id: survivorId, food_name: "Canonical yogurt", serving_size: "170 g", calories: 90, protein_g: 11, carbs_g: null, fat_g: 1, saturated_fat_g: null, fiber_g: null, sugars_g: null, sodium_mg: null, nutrition_basis_amount: 170, nutrition_basis_unit: "g", lifecycle_status: "active", merged_into_food_id: null, is_verified: true }, error: null },
      ],
      food_personal_corrections: [{ data: null, error: null }],
    });

    const handoff = await resolveFoodHandoff(db.client, userId, { foodId, source: "catalog", quantity: 1.5, serving: "170 g" });

    expect(handoff.foodId).toBe(survivorId);
    expect(handoff.frozenSourceSnapshot).toMatchObject({ food_id: survivorId, frozen_name: "Canonical yogurt" });
    expect(handoff.savedMealItem.food_id).toBe(survivorId);
    expect(handoff.recipeIngredient.food_id).toBe(survivorId);
    expect(handoff.frozenNutrition.carbs_g).toBeNull();
    expect(db.seen.food_personal_corrections[0].eq).toHaveBeenCalledWith("food_id", survivorId);
  });

  it("rejects inactive catalog Foods before reading personal corrections", async () => {
    const db = clientFor({
      food_items: [{ data: { id: foodId, lifecycle_status: "deprecated", merged_into_food_id: null }, error: null }],
    });

    await expect(resolveFoodHandoff(db.client, userId, { foodId, source: "catalog", quantity: 1, serving: "170 g" })).rejects.toThrow(/unavailable for new Nutrition writes/i);
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("keeps My Food resolution owner-scoped and rejects stale serving labels", async () => {
    const db = clientFor({
      user_food_items: [{ data: { id: foodId, user_id: userId, food_name: "My oats", serving_size: "40 g", calories: 150, protein_g: null, carbs_g: 25, fat_g: 3, nutrition_basis_amount: 40, nutrition_basis_unit: "g", deleted_at: null }, error: null }],
    });
    await expect(resolveFoodHandoff(db.client, userId, { foodId, source: "my_food", quantity: 1, serving: "100 g" })).rejects.toThrow(/serving/i);
    expect(db.seen.user_food_items[0].eq).toHaveBeenCalledWith("user_id", userId);
    expect(db.seen.user_food_items[0].is).toHaveBeenCalledWith("deleted_at", null);
  });
});
