import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatSavedMealNutrition,
  savedMealSuccessDescription,
} from "@/services/meals/saved-meal-draft";

describe("Saved Meal nullable presentation", () => {
  it("formats known calories for the Saved Meal list", () => {
    expect(formatSavedMealNutrition(520, " kcal")).toBe("520 kcal");
  });

  it("keeps known zero calories visible in the Saved Meal list", () => {
    expect(formatSavedMealNutrition(0, " kcal")).toBe("0 kcal");
  });

  it("formats unknown calories without an empty kcal value", () => {
    const formatted = formatSavedMealNutrition(null, " kcal");
    expect(formatted).toBe("—");
    expect(formatted).not.toContain("null");
    expect(formatted).not.toMatch(/^\s*kcal$/);
  });

  it("keeps the existing numeric save-success message for known calories", () => {
    expect(savedMealSuccessDescription("Chicken bowl", 520)).toBe("Chicken bowl totals 520 kcal.");
  });

  it("uses explicit unknown-calorie save-success copy for null calories", () => {
    const description = savedMealSuccessDescription("Chicken bowl", null);
    expect(description).toBe("Chicken bowl was saved. Total calories are unknown.");
    expect(description).not.toContain("null kcal");
  });

  it("keeps the Saved Meal component wired to nullable-safe presentation helpers", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/meals/custom-nutrition-manager.tsx"),
      "utf8",
    );

    expect(source).toContain('{formatSavedMealNutrition(meal.totals.calories, " kcal")} | {meal.items.length} foods');
    expect(source).toContain("savedMealSuccessDescription(saved.meal_name, saved.totals.calories)");
    expect(source).not.toContain("{meal.totals.calories} kcal | {meal.items.length} foods");
    expect(source).not.toContain("`${saved.meal_name} totals ${saved.totals.calories} kcal.`");
  });
});
