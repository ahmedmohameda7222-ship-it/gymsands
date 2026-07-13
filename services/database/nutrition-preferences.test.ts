import { describe, expect, it } from "vitest";
import { mapNutritionPreferenceRowToInput } from "@/services/database/execution-layer";
import type { UserNutritionPreferenceProfile } from "@/types";

describe("nutrition preference persistence mapping", () => {
  it("strips database metadata and copies only editable fields", () => {
    const row: UserNutritionPreferenceProfile = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      weekly_food_budget: 90,
      budget_currency: " EUR ",
      max_cooking_time_minutes: 35,
      meal_prep_days: [" Sunday ", ""],
      cooking_skill: " comfortable ",
      kitchen_equipment: [" Oven "],
      preferred_cuisines: [" Egyptian "],
      disliked_foods: [" Olives "],
      allergies: " peanuts ",
      repeat_tolerance: " lunch twice ",
      meals_per_day: 4,
      ingredient_reuse_preference: " high ",
      grocery_style_preference: " weekly ",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-02T00:00:00Z"
    };

    const input = mapNutritionPreferenceRowToInput(row);
    expect(input).toEqual({
      weekly_food_budget: 90,
      budget_currency: "EUR",
      max_cooking_time_minutes: 35,
      meal_prep_days: ["Sunday"],
      cooking_skill: "comfortable",
      kitchen_equipment: ["Oven"],
      preferred_cuisines: ["Egyptian"],
      disliked_foods: ["Olives"],
      allergies: "peanuts",
      repeat_tolerance: "lunch twice",
      meals_per_day: 4,
      ingredient_reuse_preference: "high",
      grocery_style_preference: "weekly"
    });
    expect(input).not.toHaveProperty("id");
    expect(input).not.toHaveProperty("user_id");
    expect(input).not.toHaveProperty("created_at");
    expect(input).not.toHaveProperty("updated_at");
  });

  it("preserves a missing profile as null", () => {
    expect(mapNutritionPreferenceRowToInput(null)).toBeNull();
  });
});
