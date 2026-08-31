import { describe, expect, it } from "vitest";
import { summarizeMealPlanDay, summarizeMealSection } from "@/lib/meals/meal-plan-summary";
import type { MealPlanItem } from "@/types";

type NutritionPatch = Partial<Pick<MealPlanItem, "calories" | "protein_g" | "carbs_g" | "fat_g">>;

function item(
  id: string,
  status: MealPlanItem["status"],
  calories: number | null,
  mealType: MealPlanItem["meal_type"] = "Breakfast",
  patch: NutritionPatch = {},
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
    protein_g: calories === null ? null : calories / 10,
    carbs_g: calories === null ? null : calories / 20,
    fat_g: calories === null ? null : calories / 40,
    status,
    food_log_id: status === "done" ? "00000000-0000-4000-8000-000000000001" : null,
    completed_at: status === "done" ? "2026-07-13T10:00:00Z" : null,
    notes: null,
    created_at: "2026-07-13T08:00:00Z",
    updated_at: "2026-07-13T08:00:00Z",
    ...patch,
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

  it("propagates an unknown scheduled protein contributor", () => {
    const summary = summarizeMealPlanDay([
      item("known", "planned", 500, "Breakfast", { protein_g: 40 }),
      item("unknown", "planned", 300, "Lunch", { protein_g: null }),
    ], 2000);
    expect(summary.scheduled.protein_g).toBeNull();
    expect(summary.scheduled.calories).toBe(800);
  });

  it("makes remaining and over-target unavailable when consumed calories are unknown", () => {
    const summary = summarizeMealPlanDay([item("unknown", "done", null)], 2000);
    expect(summary.remainingCalories).toBeNull();
    expect(summary.overTargetCalories).toBeNull();
  });

  it("makes alignment unavailable when scheduled calories are unknown", () => {
    const summary = summarizeMealPlanDay([item("unknown", "planned", null)], 2000);
    expect(summary.alignmentPercent).toBeNull();
  });

  it("preserves established empty zero totals", () => {
    const summary = summarizeMealPlanDay([], 2000);
    expect(summary.scheduled).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(summary.consumed).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });

  it("preserves known zero nutrition", () => {
    const summary = summarizeMealPlanDay([item("zero", "planned", 0, "Breakfast", { protein_g: 0, carbs_g: 0, fat_g: 0 })], 2000);
    expect(summary.scheduled).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(summary.alignmentPercent).toBe(0);
  });
});
