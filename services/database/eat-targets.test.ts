import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserNutritionTargetDateOverride, UserNutritionTargetProfile, UserWorkoutPlan } from "@/types";

const userId = "11111111-1111-4111-8111-111111111111";
const weekStart = "2026-07-13";

const {
  getCalorieTargets,
  getNutritionTargetProfiles,
  getDefaultUserWorkoutPlan,
  migrateLegacyNutritionTargetOverridesForDates
} = vi.hoisted(() => ({
  getCalorieTargets: vi.fn(),
  getNutritionTargetProfiles: vi.fn(),
  getDefaultUserWorkoutPlan: vi.fn(),
  migrateLegacyNutritionTargetOverridesForDates: vi.fn()
}));

vi.mock("@/services/database/nutrition", () => ({ getCalorieTargets }));
vi.mock("@/services/database/execution-layer", () => ({ getNutritionTargetProfiles }));
vi.mock("@/services/database/workout-plans", () => ({ getDefaultUserWorkoutPlan }));
vi.mock("@/services/database/nutrition-target-assignments", () => ({ migrateLegacyNutritionTargetOverridesForDates }));

const profile = (target_type: UserNutritionTargetProfile["target_type"], calories: number): UserNutritionTargetProfile => ({
  id: target_type,
  user_id: userId,
  target_type,
  calories,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 60,
  water_ml: 3000,
  notes: null,
  created_at: "",
  updated_at: ""
});

const plan: UserWorkoutPlan = {
  id: "plan",
  user_id: userId,
  name: "Plan",
  is_active: true,
  created_at: "",
  updated_at: "",
  days: [{
    id: "monday",
    plan_id: "plan",
    day_number: 1,
    day_name: "Monday",
    weekday: "Monday",
    notes: null,
    exercises: [{ id: "exercise", plan_day_id: "monday", workout_id: null, source_workout_id: null, exercise_name: "Squat", category: null, target_muscle: null, equipment: null, sets: 3, reps: "8", rest_seconds: 90, sort_order: 1, notes: null }]
  }]
};

function row(date: string, target_type: UserNutritionTargetDateOverride["target_type"]): UserNutritionTargetDateOverride {
  return { id: `row-${date}`, user_id: userId, target_date: date, target_type, created_at: "", updated_at: "" };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCalorieTargets.mockResolvedValue({ daily_calories: 1800, protein_g: 140, carbs_g: 180, fat_g: 55, water_ml: 2800 });
  getNutritionTargetProfiles.mockResolvedValue([
    profile("default_day", 2000),
    profile("training_day", 2200),
    profile("rest_day", 1900),
    profile("high_activity_day", 2400)
  ]);
  getDefaultUserWorkoutPlan.mockResolvedValue(plan);
  migrateLegacyNutritionTargetOverridesForDates.mockResolvedValue([]);
});

describe("Eat target loading from verified assignments", () => {
  it("uses migrated Week overrides immediately on the correct dates", async () => {
    migrateLegacyNutritionTargetOverridesForDates.mockResolvedValue([
      row("2026-07-15", "high_activity_day"),
      row("2026-07-17", "rest_day")
    ]);
    const { getEatWeekTargets } = await import("@/services/database/eat-targets");
    const result = await getEatWeekTargets(userId, weekStart);
    expect(migrateLegacyNutritionTargetOverridesForDates).toHaveBeenCalledWith(userId, [
      "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19"
    ]);
    expect(result.find((day) => day.date === "2026-07-13")?.planned_calories).toBe(2200);
    expect(result.find((day) => day.date === "2026-07-15")?.planned_calories).toBe(2400);
    expect(result.find((day) => day.date === "2026-07-17")?.planned_calories).toBe(1900);
  });

  it("loads base targets, profiles, plan, and overrides once for all seven dates", async () => {
    const { getEatTargetsForDates } = await import("@/services/database/eat-targets");
    const dates = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19"];
    const result = await getEatTargetsForDates(userId, dates);
    expect(Object.keys(result)).toEqual(dates);
    expect(getCalorieTargets).toHaveBeenCalledTimes(1);
    expect(getNutritionTargetProfiles).toHaveBeenCalledTimes(1);
    expect(getDefaultUserWorkoutPlan).toHaveBeenCalledTimes(1);
    expect(migrateLegacyNutritionTargetOverridesForDates).toHaveBeenCalledTimes(1);
    expect(migrateLegacyNutritionTargetOverridesForDates).toHaveBeenCalledWith(userId, dates);
  });

  it("fails the Week target source when valid legacy migration fails", async () => {
    migrateLegacyNutritionTargetOverridesForDates.mockRejectedValue(new Error("migration failed"));
    const { getEatWeekTargets } = await import("@/services/database/eat-targets");
    await expect(getEatWeekTargets(userId, weekStart)).rejects.toThrow("migration failed");
  });

  it("uses the same verified assignment path for single-date resolution", async () => {
    migrateLegacyNutritionTargetOverridesForDates.mockResolvedValue([row("2026-07-14", "training_day")]);
    const { getEatTargetForDate, getEatTargetAssignmentForDate } = await import("@/services/database/eat-targets");
    const target = await getEatTargetForDate(userId, "2026-07-14");
    const assignment = await getEatTargetAssignmentForDate(userId, "2026-07-14");
    expect(target.requestedType).toBe("training_day");
    expect(target.values.daily_calories).toBe(2200);
    expect(assignment).toBe("training_day");
  });

  it("keeps Automatic workout-plan resolution when no explicit row exists", async () => {
    const { getEatTargetForDate } = await import("@/services/database/eat-targets");
    const training = await getEatTargetForDate(userId, "2026-07-13");
    const rest = await getEatTargetForDate(userId, "2026-07-14");
    expect(training.requestedType).toBe("training_day");
    expect(rest.requestedType).toBe("rest_day");
  });
});
