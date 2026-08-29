import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const eatLocalized = [
  "components/nutrition/diary/diary-page.tsx",
  "components/nutrition/diary/logging-session.tsx",
  "components/nutrition/diary/plate-dock.tsx",
] as const;

const nutritionLocalized = [
  "components/nutrition/food-library/food-detail.tsx",
  "components/nutrition/food-library/food-filters.tsx",
  "components/nutrition/meal-plan/add-to-plan-workspace.tsx",
  "components/nutrition/meal-plan/pending-change-review.tsx",
  "components/nutrition/meal-plan/shopping-list.tsx",
  "components/nutrition/recipes/recipe-detail.tsx",
  "components/nutrition/recipes/recipe-editor.tsx",
  "components/nutrition/saved-meals/recently-deleted-saved-meals.tsx",
  "components/nutrition/saved-meals/saved-meal-editor.tsx",
  "components/nutrition/saved-meals/saved-meal-picker.tsx",
] as const;

describe("Nutrition V1 EN/DE/AR localization authority", () => {
  it("keeps Diary and unified logging on the existing Eat translation authority", () => {
    for (const path of eatLocalized) {
      expect(source(path), path).toContain("useEatTranslation");
    }
  });

  it("binds every remaining V1 product surface to the Nutrition translation authority", () => {
    for (const path of nutritionLocalized) {
      expect(source(path), path).toContain("useNutritionV1Translation");
    }
  });

  it("keeps explicit English, German, and Arabic Nutrition dictionaries", () => {
    const dictionary = source("lib/i18n/nutrition-v1.ts");
    expect(dictionary).toContain("const en = {");
    expect(dictionary).toContain("const de: NutritionV1Dictionary = {");
    expect(dictionary).toContain("const ar: NutritionV1Dictionary = {");
    expect(dictionary).toContain('macroProtein: "Protein"');
    expect(dictionary).toContain('macroProtein: "بروتين"');
  });

  it("keeps the general app-shell offline banner domain-neutral while workout sessions retain workout-specific recovery copy", () => {
    const shell = source("components/layout/app-shell.tsx");
    expect(shell).toContain("offlineAppMessage");
    expect(shell).toContain('language === "ar"');
    expect(shell).toContain('language === "de"');
    expect(shell.match(/activeWorkoutT\("offline\.banner"\)/g)?.length).toBe(1);
    expect(shell).toContain("offlineAppMessage");
  });
});
