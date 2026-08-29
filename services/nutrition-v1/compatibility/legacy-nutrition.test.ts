import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyLegacySavedRecipe,
  mapLegacyCustomMeal,
  mapLegacyFoodLog,
  mapLegacyMealPlanItem,
  mapLegacySavedRecipe,
} from "@/services/nutrition-v1/compatibility/legacy-nutrition";

const adapterPath = "services/nutrition-v1/compatibility/legacy-nutrition.ts";
const reconciliationPath = "supabase/verification/nutrition-v1-legacy-reconciliation.sql";
const loggingSpeedPath = "services/meals/food-logging-speed.ts";
const convergencePath = "lib/architecture/canonical-convergence.test.ts";

describe("Nutrition V1 legacy compatibility authority", () => {
  it("provides one explicit conservative compatibility adapter", () => {
    expect(existsSync(adapterPath)).toBe(true);
    const adapter = readFileSync(adapterPath, "utf8");
    expect(adapter).toContain("saved_item_type");
    expect(adapter).toContain("custom_meals");
    expect(adapter).toContain("user_meal_plan_items");
    expect(adapter).toContain("food_logs");
    expect(adapter).toContain("unresolved");
    expect(adapter).not.toMatch(/\.delete\(|\.remove\(|drop\s+table|truncate\s+/i);
  });

  it("classifies only explicit saved-content evidence and never guesses conflicts", () => {
    expect(classifyLegacySavedRecipe({ saved_item_type: "recipe", source_custom_meal_id: null })).toEqual({
      classification: "recipe",
      unresolved_reason: null,
    });
    expect(classifyLegacySavedRecipe({ saved_item_type: "meal" })).toEqual({
      classification: "saved_meal",
      unresolved_reason: null,
    });
    expect(classifyLegacySavedRecipe({ saved_item_type: "template" })).toEqual({
      classification: "template",
      unresolved_reason: null,
    });
    expect(classifyLegacySavedRecipe({ saved_item_type: null }).classification).toBe("unresolved");
    expect(classifyLegacySavedRecipe({ saved_item_type: "recipe", source_custom_meal_id: "legacy-meal" }).classification).toBe("unresolved");
  });

  it("preserves legacy saved-content identity, provenance and unknown nutrition", () => {
    expect(mapLegacySavedRecipe(
      {
        id: "recipe-1",
        user_id: "owner-1",
        name: "Legacy recipe",
        saved_item_type: "recipe",
        portions: 2,
      },
      [{ id: "ingredient-1", food_name: "Ingredient", quantity: 1, serving_unit: "serving", calories: null }],
    )).toMatchObject({
      source_table: "saved_recipes",
      source_id: "recipe-1",
      owner_id: "owner-1",
      classification: "recipe",
      ingredients: [{ source_id: "ingredient-1", nutrition: { calories: null, protein_g: null, carbs_g: null, fat_g: null } }],
    });

    expect(mapLegacyCustomMeal({ id: "meal-1", user_id: "owner-1", meal_name: "Legacy meal" })).toMatchObject({
      source_table: "custom_meals",
      source_id: "meal-1",
      classification: "saved_meal",
      source_custom_meal_id: "meal-1",
    });
  });

  it("keeps legacy plan intent and actual food logs as distinct compatibility facts", () => {
    expect(mapLegacyMealPlanItem({
      id: "plan-1",
      user_id: "owner-1",
      plan_date: "2026-08-26",
      meal_type: "Lunch",
      food_name: "Planned food",
      calories: null,
    })).toMatchObject({
      source_table: "user_meal_plan_items",
      canonical_kind: "planned_occurrence",
      nutrition: { calories: null },
    });

    expect(mapLegacyFoodLog({
      id: "log-1",
      user_id: "owner-1",
      log_date: "2026-08-26",
      meal_type: "Lunch",
      food_name: "Eaten food",
      calories: null,
    })).toMatchObject({
      source_table: "food_logs",
      canonical_kind: "diary_actual",
      nutrition: { calories: null },
    });
  });

  it("delegates legacy recipe/custom-meal reads instead of defining their semantics locally", () => {
    const loggingSpeed = readFileSync(loggingSpeedPath, "utf8");
    expect(loggingSpeed).toContain("@/services/nutrition-v1/compatibility/legacy-nutrition");
    expect(loggingSpeed).toContain("readLegacySavedContent");
  });

  it("extends canonical convergence proof and adds read-only reconciliation SQL", () => {
    expect(existsSync(reconciliationPath)).toBe(true);
    const reconciliation = readFileSync(reconciliationPath, "utf8");
    const convergence = readFileSync(convergencePath, "utf8");
    expect(reconciliation).toContain("saved_recipes");
    expect(reconciliation).toContain("custom_meals");
    expect(reconciliation).toContain("user_meal_plan_items");
    expect(reconciliation).toContain("food_logs");
    expect(reconciliation).toContain("unresolved");
    expect(reconciliation).not.toMatch(/\b(delete|update|insert|drop|truncate|alter)\b/i);
    expect(convergence).toContain("nutrition-v1-legacy-reconciliation.sql");
    expect(convergence).toContain("legacy-nutrition.ts");
  });
});
