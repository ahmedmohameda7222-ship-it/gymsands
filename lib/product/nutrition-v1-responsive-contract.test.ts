import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const diary = readFileSync("components/nutrition/diary/diary-page.tsx", "utf8");
const loggingSession = readFileSync("components/nutrition/diary/logging-session.tsx", "utf8");
const mealPlan = readFileSync("components/nutrition/meal-plan/meal-plan-page.tsx", "utf8");
const weekStrip = readFileSync("components/nutrition/meal-plan/week-strip.tsx", "utf8");
const foodLibrary = readFileSync("components/nutrition/food-library/food-library-page.tsx", "utf8");
const foodRow = readFileSync("components/nutrition/food-library/food-row.tsx", "utf8");
const recipeHome = readFileSync("components/nutrition/recipes/recipe-home.tsx", "utf8");
const recentlyDeleted = readFileSync("components/nutrition/recipes/recently-deleted-recipes.tsx", "utf8");
const cooking = readFileSync("components/nutrition/cooking/cooking-mode.tsx", "utf8");

function doneButtonSource() {
  const marker = 'updateAction("completed")';
  const start = cooking.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  return cooking.slice(start, start + 900);
}

describe("Nutrition V1 responsive, RTL, large-text and interaction contract", () => {
  it("keeps the approved custom-control touch baseline on each Nutrition surface", () => {
    for (const [name, source] of [
      ["Diary", diary],
      ["Food Logging Session", loggingSession],
      ["Meal Plan", mealPlan],
      ["Meal Plan week strip", weekStrip],
      ["Food Library", foodLibrary],
      ["Food Row", foodRow],
      ["My Recipes", recipeHome],
      ["Recently Deleted", recentlyDeleted],
      ["Cooking Mode", cooking],
    ] as const) {
      expect(source, name).toMatch(/\b(?:min-h|h)-(?:11|12|14|\[44px\]|\[48px\]|\[56px\])/);
    }
  });

  it("keeps all seven Meal Plan day selectors at least 44pt wide on compact phones", () => {
    expect(weekStrip).toContain("min-w-11");
    expect(weekStrip).toContain("min-h-14");
  });

  it("keeps Food Library browse controls on the shared 44pt custom-control baseline", () => {
    expect(foodLibrary).toMatch(/Browse by Category[\s\S]*min-h-11/);
    expect(foodLibrary).toMatch(/Browse by Cuisine[\s\S]*min-h-11/);
  });

  it("binds approved Arabic RTL surfaces to the real EN/DE/AR language authority", () => {
    for (const [name, source] of [
      ["Meal Plan", mealPlan],
      ["Food Library", foodLibrary],
      ["Food Row", foodRow],
      ["My Recipes", recipeHome],
      ["Cooking Mode", cooking],
    ] as const) {
      expect(source, name).toContain("useNutritionV1Translation");
    }
    expect(foodRow).toContain("macroProtein");
    expect(foodRow).toContain("macroCarbs");
    expect(foodRow).toContain("macroFat");
    expect(foodRow).not.toMatch(/>\s*P\s*\{/);
    expect(cooking).toContain("cookingNow");
    expect(cooking).toContain("cookingDone");
  });

  it("keeps Cooking Mode direction-aware and long-content safe", () => {
    expect(cooking).toContain('dir={direction}');
    expect(cooking).toContain('document.documentElement.dir === "rtl"');
    expect(cooking).toContain("break-words");
    expect(cooking).toContain("flex-wrap");
  });

  it("keeps the approved approximately 56pt visible primary Done action in Cooking Mode", () => {
    const done = doneButtonSource();
    expect(done).toContain("min-h-[56px]");
    expect(done).toContain("cookingDone");
  });

  it("keeps adaptive layouts instead of adding feature-dense desktop-only Nutrition modes", () => {
    expect(mealPlan).toMatch(/(?:sm|md|lg):/);
    expect(foodLibrary).toContain("lg:grid-cols-2");
    expect(recipeHome).toContain("md:grid-cols-2");
    expect(cooking).toMatch(/max-w-\[720px\]/);
  });

  it("keeps text and semantics available without color-only status meaning", () => {
    expect(diary).toMatch(/role=\"(?:alert|status)\"|aria-live=/);
    expect(mealPlan).toMatch(/Needs attention|Waiting to sync|needsAttention|waitingToSync/);
    expect(foodLibrary).toMatch(/aria-(?:pressed|live|label)/);
    expect(recipeHome).toMatch(/aria-(?:pressed|expanded|label)/);
    expect(cooking).toMatch(/role=\"(?:alert|status)\"|aria-label=/);
  });

  it("keeps the reconciled 30-day Recipe deletion lifecycle and rejects Archive-first wording", () => {
    expect(recentlyDeleted).toContain("Recently Deleted");
    expect(recentlyDeleted).toContain("30 days");
    expect(recentlyDeleted).toContain("Restore");
    expect(recentlyDeleted).toContain("Delete Now");
    expect(recentlyDeleted).not.toMatch(/\bArchive\b|\bArchived\b/);
  });
});
