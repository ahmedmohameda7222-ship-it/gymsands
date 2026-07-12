import { describe, expect, it } from "vitest";
import { mealPlanUrl, resolveMealPlanTab } from "@/lib/meals/meal-plan-navigation";

describe("meal plan navigation", () => {
  it("accepts day, week and shopping and falls back safely", () => {
    expect(resolveMealPlanTab("shopping")).toBe("shopping");
    expect(resolveMealPlanTab("invalid")).toBe("day");
  });
  it("keeps tab and date in the URL", () => {
    expect(mealPlanUrl("/my-meal-plan", "shopping", "2026-07-12")).toContain("tab=shopping&date=2026-07-12");
  });
});
