import { describe, expect, it } from "vitest";
import { buildPlannedMealPromptContext, detectMealPromptRelevance, normalizeIngredientText } from "@/lib/ai/planned-meal-context";
import type { MealPlanItem } from "@/types";

const item: MealPlanItem = {
  id: "internal-plan-id",
  user_id: "internal-user-id",
  plan_date: "2026-07-12",
  meal_type: "Lunch",
  food_item_id: "internal-food-id",
  user_food_item_id: null,
  food_name: "Chicken rice",
  serving_size: "1 bowl",
  quantity: 1,
  calories: 600,
  protein_g: 45,
  carbs_g: 70,
  fat_g: 15,
  status: "planned",
  food_log_id: null,
  completed_at: null,
  notes: null,
  created_at: "2026-07-12T00:00:00Z",
  updated_at: "2026-07-12T00:00:00Z"
};

it("uses structured allergen metadata before cautious text matching", () => {
  expect(detectMealPromptRelevance({ ingredients: ["rice"], structuredAllergens: ["dairy"] })).toEqual({ dairy: true, gluten: false });
  expect(detectMealPromptRelevance({ ingredients: ["rice"], structuredAllergens: ["gluten"] })).toEqual({ dairy: false, gluten: true });
});

it("detects known dairy ingredients but not eggs, mayonnaise, or creamy style words", () => {
  expect(detectMealPromptRelevance({ ingredients: ["Greek yogurt", "berries"], structuredAllergens: [] }).dairy).toBe(true);
  expect(detectMealPromptRelevance({ ingredients: ["eggs", "mayonnaise", "creamy sauce style"], structuredAllergens: [] }).dairy).toBe(false);
});

it("detects explicit gluten ingredients but not rice, corn tortillas, or a generic wrap", () => {
  expect(detectMealPromptRelevance({ ingredients: ["whole wheat bread"], structuredAllergens: [] }).gluten).toBe(true);
  expect(detectMealPromptRelevance({ ingredients: ["rice", "corn tortilla", "wrap"], structuredAllergens: [] }).gluten).toBe(false);
});

it("treats ordinary oats as uncertain unless contamination is explicit", () => {
  expect(detectMealPromptRelevance({ ingredients: ["oats"], structuredAllergens: [] }).gluten).toBe(false);
  expect(detectMealPromptRelevance({ ingredients: ["gluten-containing oats"], structuredAllergens: [] }).gluten).toBe(true);
});

it("uses Unicode normalization and word boundaries", () => {
  expect(normalizeIngredientText("Crème fraîche")).toBe("creme fraiche");
  expect(detectMealPromptRelevance({ ingredients: ["butterfly pea"], structuredAllergens: [] }).dairy).toBe(false);
});

it("normalizes planned meal context without exposing internal identifiers", () => {
  const context = buildPlannedMealPromptContext(item, { ingredients: ["chicken", "rice"] });
  expect(context).toMatchObject({ name: "Chicken rice", date: "2026-07-12", ingredients: ["chicken", "rice"] });
  expect(JSON.stringify(context)).not.toContain("internal-plan-id");
  expect(JSON.stringify(context)).not.toContain("internal-user-id");
  expect(JSON.stringify(context)).not.toContain("internal-food-id");
});
