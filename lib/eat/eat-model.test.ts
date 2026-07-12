import { describe, expect, it } from "vitest";
import {
  buildNutritionMetrics,
  buildWeekAnalytics,
  findCopyDuplicates,
  groupFoodLogs,
  isValidIsoDate,
  parseEatDate,
  parseEatView,
  progressState,
  rankRepeatFoods,
  selectNextPlannedMeal,
  supportedServingOptions
} from "@/lib/eat/eat-model";
import type { DailyNutritionSummary, FoodItem, FoodLog, MealPlanItem } from "@/types";

const log = (patch: Partial<FoodLog> = {}): FoodLog => ({
  id: patch.id ?? "log-1", user_id: "user", food_item_id: null, user_food_item_id: null, log_date: "2026-07-12",
  meal_type: patch.meal_type ?? "Lunch", food_name: patch.food_name ?? "Rice", serving_size: patch.serving_size ?? "1 bowl",
  quantity: patch.quantity ?? 1, calories: patch.calories ?? 500, protein_g: patch.protein_g ?? 20, carbs_g: patch.carbs_g ?? 70,
  fat_g: patch.fat_g ?? 10, notes: patch.notes ?? null
});
const plan = (patch: Partial<MealPlanItem> = {}): MealPlanItem => ({
  id: patch.id ?? "plan-1", user_id: "user", plan_date: patch.plan_date ?? "2026-07-12", meal_type: patch.meal_type ?? "Lunch",
  food_item_id: null, user_food_item_id: null, food_name: patch.food_name ?? "Chicken rice", serving_size: "1 bowl", quantity: 1,
  calories: 600, protein_g: 45, carbs_g: 70, fat_g: 15, status: patch.status ?? "planned", food_log_id: patch.food_log_id ?? null,
  completed_at: patch.completed_at ?? null, notes: null, created_at: patch.created_at ?? "2026-07-12T10:00:00Z", updated_at: "2026-07-12T10:00:00Z"
});
const day = (date: string, logs: FoodLog[] = []): DailyNutritionSummary => ({ date, planned_calories: 0, has_targets: false,
  calories: logs.reduce((sum, item) => sum + item.calories, 0), protein_g: logs.reduce((sum, item) => sum + item.protein_g, 0),
  carbs_g: logs.reduce((sum, item) => sum + item.carbs_g, 0), fat_g: logs.reduce((sum, item) => sum + item.fat_g, 0), water_ml: 0, logs });

describe("Eat URL state", () => {
  it("defaults invalid views to day and validates real ISO dates", () => {
    expect(parseEatView("week")).toBe("week");
    expect(parseEatView("targets")).toBe("day");
    expect(isValidIsoDate("2026-07-12")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(parseEatDate("bad", "2026-07-12")).toBe("2026-07-12");
  });
});

describe("Eat day truthfulness", () => {
  it("keeps unrecognized meal types visible in Other", () => {
    const grouped = groupFoodLogs([log({ id: "a", meal_type: "Brunch" }), log({ id: "b", meal_type: "Snack" })]);
    expect(grouped.Other.map((item) => item.id)).toEqual(["a"]);
    expect(grouped.Snack.map((item) => item.id)).toEqual(["b"]);
  });

  it("does not mark exactly 100 percent as destructive", () => {
    expect(progressState(100, 100)).toBe("near");
    expect(progressState(105, 100)).toBe("near");
    expect(progressState(106, 100)).toBe("over");
  });

  it("uses null rather than zero when logs or targets are unavailable", () => {
    const unknownLogs = buildNutritionMetrics({ consumed: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, targets: { daily_calories: 2000, protein_g: 150, carbs_g: 220, fat_g: 60 }, logsAvailable: false, targetsAvailable: true });
    expect(unknownLogs.every((metric) => metric.consumed === null && metric.remaining === null)).toBe(true);
    const unknownTargets = buildNutritionMetrics({ consumed: { calories: 500, protein_g: 20, carbs_g: 70, fat_g: 10 }, targets: null, logsAvailable: true, targetsAvailable: false });
    expect(unknownTargets[0]).toMatchObject({ consumed: 500, target: null, remaining: null, state: "no-target" });
  });

  it("selects only unfinished planned meals and excludes skipped or done items", () => {
    const next = selectNextPlannedMeal([
      plan({ id: "done", status: "done", meal_type: "Breakfast", food_log_id: "log" }),
      plan({ id: "skipped", status: "skipped", meal_type: "Lunch" }),
      plan({ id: "dinner", meal_type: "Dinner" })
    ], "2026-07-12", "2026-07-12", 13);
    expect(next?.id).toBe("dinner");
  });

  it("deduplicates repeat foods and keeps useful ranking", () => {
    const ranked = rankRepeatFoods([log({ id: "1", food_name: "Oats" }), log({ id: "2", food_name: "Oats" }), log({ id: "3", food_name: "Yogurt" })], [], 6);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({ food_name: "Oats", usageCount: 2 });
  });

  it("shows only the stored serving when conversion metadata is absent", () => {
    const food = { serving_size: "100 g" } as FoodItem;
    expect(supportedServingOptions(food)).toEqual([{ id: "stored", label: "100 g", multiplier: 1, approximate: false }]);
  });

  it("detects likely copy-day duplicates without treating grams as servings", () => {
    const source = [log({ id: "source", food_name: "Rice", serving_size: "100 g", quantity: 1 })];
    const target = [log({ id: "target", food_name: "Rice", serving_size: "100 g", quantity: 1 })];
    expect(findCopyDuplicates(source, target)).toEqual(["source"]);
  });
});

describe("Eat week analytics", () => {
  it("treats an empty week as no data, not a deficit", () => {
    const analytics = buildWeekAnalytics(Array.from({ length: 7 }, (_, index) => day(`2026-07-${String(6 + index).padStart(2, "0")}`)), 2000);
    expect(analytics).toMatchObject({ loggedDays: 0, coverageLabel: "empty", averageCaloriesLoggedDays: null, calendarAverageCalories: null, adherenceDays: null });
  });

  it("uses logged-day averages and calorie contribution for macros", () => {
    const days = [day("2026-07-06", [log({ calories: 1000, protein_g: 100, carbs_g: 100, fat_g: 20 })]), day("2026-07-07", [log({ id: "2", calories: 2000, protein_g: 200, carbs_g: 200, fat_g: 40 })]), ...Array.from({ length: 5 }, (_, index) => day(`2026-07-${String(8 + index).padStart(2, "0")}`))];
    const analytics = buildWeekAnalytics(days, 2000);
    expect(analytics.averageCaloriesLoggedDays).toBe(1500);
    expect(analytics.calendarAverageCalories).toBe(Math.round(3000 / 7));
    expect(analytics.proteinCalories).toBe(1200);
    expect(analytics.carbCalories).toBe(1200);
    expect(analytics.fatCalories).toBe(540);
  });
});
