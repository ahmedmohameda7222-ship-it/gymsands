import { describe, expect, it } from "vitest";
import { auditPromptCatalog, buildRuntimePrompt, getEatRuntimeHome, getMealAdjustmentRuntimePrompts, getRuntimeContextChips } from "@/lib/ai/prompt-runtime";
import { RUNTIME_QUICK_PROMPTS } from "@/lib/ai/prompt-runtime";
import type { QuickPromptContext } from "@/lib/ai/quick-prompts";

const meal = {
  name: "Chicken pasta",
  mealType: "Dinner",
  date: "2026-07-12",
  servingSize: "1 bowl",
  quantity: 1,
  ingredients: ["chicken", "wheat pasta", "cream"],
  calories: 650,
  proteinG: 48,
  carbsG: 72,
  fatG: 18,
  preparationTimeMinutes: 30,
  structuredAllergens: []
};

const context = (patch: Partial<QuickPromptContext> = {}): QuickPromptContext => ({
  route: "/calories",
  today: "2026-07-12",
  units: { energy: "kcal", liquid: "ml", weight: "kg" },
  nutrition: {
    hasTargets: true,
    targetsState: "loaded",
    foodLogsState: "loaded",
    remainingCalories: 800,
    remainingProtein: 60,
    remainingCarbs: 90,
    remainingFat: 25,
    foodLogCount: 3,
    mealPlanCount: 2,
    plannedMealCount: 2
  },
  hydration: { state: "loaded", hasTarget: true, remainingMl: 1200, logCount: 2 },
  profile: { state: "loaded", hasNutritionPreferences: true, hasConstraints: true },
  selection: { meal: meal.name, plannedMeal: meal },
  ...patch
});

it("orders selected-date recommendations before the complete Nutrition category", () => {
  const home = getEatRuntimeHome(context());
  expect(home.recommended.map((prompt) => prompt.id).slice(0, 3)).toEqual(["finish-macros", "plan-rest-meals", "review-day-nutrition"]);
  expect(home.nutrition.length).toBe(RUNTIME_QUICK_PROMPTS.filter((prompt) => prompt.category === "nutrition").length);
  expect(home.nutrition.every((prompt) => prompt.category === "nutrition")).toBe(true);
});

it("does not recommend macro completion when targets or remaining values are unknown", () => {
  const home = getEatRuntimeHome(context({ nutrition: { hasTargets: false, targetsState: "failed", foodLogsState: "loaded", remainingCalories: null, remainingProtein: null, remainingCarbs: null, remainingFat: null, foodLogCount: 3, mealPlanCount: 2 } }));
  expect(home.recommended.map((prompt) => prompt.id)).not.toContain("finish-macros");
});

it("does not recommend hydration review when hydration is unavailable", () => {
  const home = getEatRuntimeHome(context({ hydration: { state: "failed", hasTarget: false, remainingMl: null, logCount: null } }));
  expect(home.recommended.map((prompt) => prompt.id)).not.toContain("review-hydration");
});

it("shows professional meal actions first and conditionally adds dairy and gluten actions", () => {
  expect(getMealAdjustmentRuntimePrompts(context()).map((prompt) => prompt.id)).toEqual([
    "replace-meal",
    "make-meal-cheaper",
    "make-meal-faster",
    "make-meal-higher-protein",
    "swap-meal-ingredients",
    "make-meal-dairy-free",
    "make-meal-gluten-free"
  ]);
  const safeMeal = { ...meal, name: "Chicken rice", ingredients: ["chicken", "rice"], structuredAllergens: [] };
  const ids = getMealAdjustmentRuntimePrompts(context({ selection: { meal: safeMeal.name, plannedMeal: safeMeal } })).map((prompt) => prompt.id);
  expect(ids).not.toContain("make-meal-dairy-free");
  expect(ids).not.toContain("make-meal-gluten-free");
});

it("uses the same normalized selected-meal context for prompt body and chips without unrelated data", () => {
  const definition = RUNTIME_QUICK_PROMPTS.find((prompt) => prompt.id === "make-meal-faster")!;
  const prompt = buildRuntimePrompt(definition, context({ workout: { hasPlan: true, historyCount: 99 }, grocery: { state: "loaded", itemCount: 40 } }), "en");
  const chips = getRuntimeContextChips(definition, context(), "en");
  expect(prompt).toContain("Selected meal: Chicken pasta");
  expect(chips.some((chip) => chip.includes("Chicken pasta"))).toBe(true);
  expect(prompt).not.toContain("Completed workouts");
  expect(prompt).not.toContain("Saved grocery items");
  expect(prompt).not.toMatch(/internal[-_ ]id/i);
});

it("keeps every runtime prompt permission-compatible and truthfully backed", () => {
  const findings = auditPromptCatalog().filter((entry) => !entry.contextPermissionContractValid || !entry.backingActionsValid || !entry.writeBackingValid || !entry.taskContractExists);
  expect(findings).toEqual([]);
});
