import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Eat meal-log redesign contracts", () => {
  it("uses a focused Eat route with URL-backed day and week state", () => {
    const route = source("components/meals/eat-page.tsx");
    expect(source("app/(private)/calories/page.tsx")).toContain("<EatPage />");
    expect(route).toContain('parseEatView(rawView)');
    expect(route).toContain('parseEatDate(rawDate, today)');
    expect(route).toContain('view === "day"');
    expect(route).toContain('view === "week"');
    expect(route).not.toContain('"targets"');
    expect(route).not.toContain('"tools"');
  });

  it("keeps Add Food permanent and ChatGPT on the existing shared surface", () => {
    const route = source("components/meals/eat-page.tsx");
    expect(route).toContain('openPrompts()');
    expect(route).toContain('openPrompts("replace-meal")');
    expect(route).toContain('openPrompts("estimate-meal-photo")');
    expect(route).toContain('<EatAddFoodSurface');
    expect(source("components/meals/eat-add-food-surface.tsx").match(/<Dialog /g)?.length).toBe(1);
    expect(source("components/meals/eat-add-food-surface.tsx")).toContain('layout="responsive-drawer"');
  });

  it("renders grouped editable food logs with an Other fallback", () => {
    const log = source("components/meals/eat-food-log.tsx");
    const model = source("lib/eat/eat-model.ts");
    expect(log).toContain("EAT_MEAL_GROUPS.map");
    expect(log).toContain("updateEatFoodLog");
    expect(log).toContain("deleteEatFoodLog");
    expect(model).toContain('return "Other"');
    expect(model).toContain('["Breakfast", "Lunch", "Dinner", "Snack", "Other"]');
  });

  it("keeps progress truthful and water separate", () => {
    const day = source("components/meals/eat-day-sections.tsx");
    const model = source("lib/eat/eat-model.ts");
    expect(day).toContain("EatNutritionProgress");
    expect(day).toContain("CompactHydration");
    expect(model).toContain('if (consumed === null) return "unavailable"');
    expect(model).toContain('if (target === null || target <= 0) return "no-target"');
    expect(model).toContain('if (ratio <= 1 + tolerance) return "near"');
  });

  it("uses stored servings only when no conversion metadata exists", () => {
    const model = source("lib/eat/eat-model.ts");
    const addFood = source("components/meals/eat-add-food-surface.tsx");
    expect(model).toContain('id: "stored"');
    expect(addFood).toContain("supportedServingOptions(food)");
    expect(addFood).not.toContain('serving_size: `${food.serving_size}');
  });

  it("moves target administration to settings and removes DOM cleanup", () => {
    expect(existsSync("app/(private)/settings/nutrition-targets/page.tsx")).toBe(true);
    expect(source("components/meals/eat-day-sections.tsx")).toContain("/settings/nutrition-targets");
    expect(existsSync("components/meals/nutrition-copy-cleanup.tsx")).toBe(false);
    expect(source("app/(private)/calories/layout.tsx")).not.toContain("MutationObserver");
    expect(source("app/(private)/calories/layout.tsx")).not.toContain("NutritionCopyCleanup");
  });

  it("removes obsolete Eat administration and analytics components", () => {
    [
      "components/meals/food-log-list.tsx",
      "components/meals/recent-food-strip.tsx",
      "components/meals/nutrition-target-profiles.tsx",
      "components/meals/calories-page-sections.tsx",
      "components/meals/api-food-tools.tsx"
    ].forEach((path) => expect(existsSync(path)).toBe(false));
  });

  it("uses ownership-scoped mutations and duplicate protection", () => {
    const service = source("services/database/eat.ts");
    expect(service).toContain('.eq("user_id", userId)');
    expect(service).toContain("foodLogDuplicateKey");
    expect(service).toContain("Copied from ${sourceDate}:${log.id}");
    expect(service).toContain('.eq("status", "planned")');
    expect(service).toContain('status: "planned", food_log_id: null, completed_at: null');
  });

  it("keeps Week concise and avoids empty deficit language", () => {
    const week = source("components/meals/eat-week-view.tsx");
    expect(week).toContain("buildWeekAnalytics");
    expect(week).toContain('analytics.coverageLabel === "empty"');
    expect(week).not.toContain("Large deficit");
    expect(week).not.toContain("-14000");
    expect(week).toContain("Macro calorie contribution");
  });

  it("keeps mobile navigation order and prioritizes food on Eat", () => {
    const nav = source("components/layout/mobile-floating-nav.tsx");
    expect(nav.indexOf('label={tt("today")}')).toBeLessThan(nav.indexOf('label={tt("train")}'));
    expect(nav.indexOf('label={tt("train")}')).toBeLessThan(nav.indexOf('label={tt("eat")}'));
    expect(nav).toContain('section === "meal" ? 0');
    expect(nav).toContain('section === "water" ? 1');
  });

  it("does not add an Eat migration", () => {
    expect(source("supabase/migration-ledger.json")).not.toContain("eat_meal_log_redesign");
  });
});
