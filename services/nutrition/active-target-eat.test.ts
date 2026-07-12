import { describe, expect, it } from "vitest";
import { detectNutritionTargetTypeForDate, resolveEatTargetForDate } from "@/services/nutrition/active-target";
import type { UserNutritionTargetProfile, UserWorkoutPlan } from "@/types";

const profile = (target_type: UserNutritionTargetProfile["target_type"], calories: number): UserNutritionTargetProfile => ({
  id: target_type,
  user_id: "11111111-1111-4111-8111-111111111111",
  target_type,
  calories,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 60,
  water_ml: 3000,
  notes: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z"
});

const plan: UserWorkoutPlan = {
  id: "plan",
  user_id: "11111111-1111-4111-8111-111111111111",
  name: "Plan",
  is_active: true,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  days: [{
    id: "monday",
    plan_id: "plan",
    day_number: 1,
    day_name: "Monday workout",
    weekday: "Monday",
    notes: null,
    exercises: [{
      id: "exercise",
      plan_day_id: "monday",
      workout_id: null,
      source_workout_id: null,
      exercise_name: "Squat",
      category: null,
      target_muscle: null,
      equipment: null,
      sets: 3,
      reps: "8",
      rest_seconds: 90,
      sort_order: 1,
      notes: null
    }]
  }]
};

const profiles = [
  profile("default_day", 2000),
  profile("training_day", 2200),
  profile("rest_day", 1900),
  profile("high_activity_day", 2400)
];

const baseTarget = { daily_calories: 1800, protein_g: 140, carbs_g: 180, fat_g: 55, water_ml: 2800 };

describe("Eat target resolution for a date", () => {
  it("detects training and rest dates from the saved plan", () => {
    expect(detectNutritionTargetTypeForDate(plan, "2026-07-13")).toBe("training_day");
    expect(detectNutritionTargetTypeForDate(plan, "2026-07-14")).toBe("rest_day");
  });

  it("resolves mixed training and rest targets independently", () => {
    const monday = resolveEatTargetForDate({ userId: "user", date: "2026-07-13", profiles, baseTarget, plan, override: "auto" });
    const tuesday = resolveEatTargetForDate({ userId: "user", date: "2026-07-14", profiles, baseTarget, plan, override: "auto" });
    expect(monday).toMatchObject({ requestedType: "training_day", sourceType: "training_day", values: { daily_calories: 2200 } });
    expect(tuesday).toMatchObject({ requestedType: "rest_day", sourceType: "rest_day", values: { daily_calories: 1900 } });
  });

  it("honors high-activity and rest overrides", () => {
    const high = resolveEatTargetForDate({ userId: "user", date: "2026-07-14", profiles, baseTarget, plan, override: "high_activity_day" });
    const forcedRest = resolveEatTargetForDate({ userId: "user", date: "2026-07-13", profiles, baseTarget, plan, override: "rest_day" });
    expect(high.values.daily_calories).toBe(2400);
    expect(forcedRest.values.daily_calories).toBe(1900);
  });

  it("falls back without reusing another date's selected target", () => {
    const fallbackOnly = [profile("default_day", 2050)];
    const monday = resolveEatTargetForDate({ userId: "user", date: "2026-07-13", profiles: fallbackOnly, baseTarget, plan, override: "auto" });
    const tuesday = resolveEatTargetForDate({ userId: "user", date: "2026-07-14", profiles: fallbackOnly, baseTarget, plan, override: "auto" });
    expect(monday.requestedType).toBe("training_day");
    expect(tuesday.requestedType).toBe("rest_day");
    expect(monday.values.daily_calories).toBe(2050);
    expect(tuesday.values.daily_calories).toBe(2050);
  });
});
