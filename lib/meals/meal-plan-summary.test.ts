import { describe, expect, it } from "vitest";
import { summarizeMealPlanDay, summarizeMealSection } from "@/lib/meals/meal-plan-summary";
import type { MealPlanItem } from "@/types";

function item(
  id: string,
  status: MealPlanItem["status"],
  calories: number,
  mealType: MealPlanItem["meal_type"] = "Breakfast",
): MealPlanItem {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000000",
    plan_date: "2026-07-13",
    meal_type: mealType,
    food_item_id: null,
    user_food_item_id: null,
    food_name: id,
    serving_size: "1 serving",
    quantity: 1,
    calories,
    protein_g: calories / 10,
    carbs_g: calories / 20,
    fat_g: calories / 40,
    status,
    food_log_id: status === "done" ? "00000000-0000-4000-8000-000000000001" : null,
    completed_at: status === "done" ? "2026-07-13T10:00:00Z" : null,
    notes: null,
    created_at: "2026-07-13T08:00:00Z",
    updated_at: "2026-07-13T08:00:00Z",
  };
}

describe("meal plan summary", () => {
  const items = [
    item("planned", "planned", 500),
    item("done", "done", 600, "Lunch"),
    item("skipped", "skipped", 700, "Dinner"),
  ];

  it("uses planned plus done for scheduled and excludes skipped", () => {
    expect(summarizeMealPlanDay(items, 2000).scheduled.calories).toBe(1100);
  });

  it("uses done only for consumed", () => {
    expect(summarizeMealPlanDay(items, 2000).consumed.calories).toBe(600);
  });

  it("reports counts and remaining calories", () => {
    const summary = summarizeMealPlanDay(items, 2000);
    expect(summary.counts).toEqual({ planned: 1, done: 1, skipped: 1 });
    expect(summary.remainingCalories).toBe(1400);
    expect(summary.overTargetCalories).toBe(0);
  });

  it("reports an explicit over-target amount", () => {
    const summary = summarizeMealPlanDay([item("done", "done", 2200)], 2000);
    expect(summary.remainingCalories).toBe(-200);
    expect(summary.overTargetCalories).toBe(200);
  });

  it("calculates section totals from active rows only", () => {
    const section = summarizeMealSection(
      [item("planned", "planned", 400), item("skip", "skipped", 900)],
      "Breakfast",
    );
    expect(section.activeCount).toBe(1);
    expect(section.totals.calories).toBe(400);
  });
});
