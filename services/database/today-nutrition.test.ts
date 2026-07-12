import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveEatTargetForDate, type ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { FoodLog, UserNutritionTargetProfile, UserWorkoutPlan } from "@/types";

const { getEatTargetForDate } = vi.hoisted(() => ({ getEatTargetForDate: vi.fn() }));
vi.mock("@/services/database/eat-targets", () => ({ getEatTargetForDate }));
vi.mock("@/services/database/nutrition", () => ({ getTodayFoodLogs: vi.fn() }));

const userId = "11111111-1111-4111-8111-111111111111";
const monday = "2026-07-13";
const tuesday = "2026-07-14";

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
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z"
});

const plan: UserWorkoutPlan = {
  id: "plan",
  user_id: userId,
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
const logs: FoodLog[] = [{
  id: "log",
  user_id: userId,
  food_item_id: null,
  user_food_item_id: null,
  log_date: monday,
  food_name: "Meal",
  meal_type: "Lunch",
  serving_size: "1",
  quantity: 1,
  calories: 500,
  protein_g: 30,
  carbs_g: 50,
  fat_g: 15,
  notes: null
}];

function active(date: string, override: "auto" | UserNutritionTargetProfile["target_type"]): ActiveNutritionTarget {
  return resolveEatTargetForDate({ date, profiles, baseTarget, plan, override });
}

beforeEach(() => vi.clearAllMocks());

describe("Today server-backed nutrition target source", () => {
  it.each([
    ["high_activity_day", tuesday, 2400],
    ["rest_day", monday, 1900],
    ["training_day", tuesday, 2200],
    ["default_day", monday, 2000]
  ] as const)("uses explicit %s assignment", async (assignment, date, calories) => {
    const resolved = active(date, assignment);
    getEatTargetForDate.mockResolvedValue(resolved);
    const { getTodayNutritionTargetData } = await import("@/services/database/today-nutrition");
    const result = await getTodayNutritionTargetData(userId, date);
    expect(getEatTargetForDate).toHaveBeenCalledWith(userId, date);
    expect(result.activeTarget?.requestedType).toBe(assignment);
    expect(result.targets?.daily_calories).toBe(calories);
  });

  it("keeps automatic workout-plan resolution when no override exists", async () => {
    getEatTargetForDate.mockResolvedValue(active(monday, "auto"));
    const { getTodayNutritionTargetData } = await import("@/services/database/today-nutrition");
    const result = await getTodayNutritionTargetData(userId, monday);
    expect(result.activeTarget).toMatchObject({ requestedType: "training_day", sourceType: "training_day" });
    expect(result.targets?.daily_calories).toBe(2200);
  });

  it("returns the exact same active target object supplied by the canonical Eat resolver", async () => {
    const eatResolved = active(tuesday, "high_activity_day");
    getEatTargetForDate.mockResolvedValue(eatResolved);
    const { getTodayNutritionTargetData } = await import("@/services/database/today-nutrition");
    const todayResolved = await getTodayNutritionTargetData(userId, tuesday);
    expect(todayResolved.activeTarget).toBe(eatResolved);
    expect(todayResolved.targets).toBe(eatResolved.values);
  });

  it("keeps food logs available and marks targets failed when target loading fails", async () => {
    const { getTodayNutritionData } = await import("@/services/database/today-nutrition");
    const result = await getTodayNutritionData(userId, monday, {
      loadLogs: async () => logs,
      loadTargetData: async () => { throw new Error("target source failed"); }
    });
    expect(result.logsState).toBe("loaded");
    expect(result.logs).toEqual(logs);
    expect(result.targetsState).toBe("failed");
    expect(result.targets).toBeNull();
    expect(result.activeTarget).toBeNull();
    expect(result.targetsError).toContain("target source failed");
  });

  it("distinguishes a loaded unconfigured target from target-source failure", async () => {
    const noTarget: ActiveNutritionTarget = {
      values: { daily_calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, water_ml: 0 },
      profile: null,
      requestedType: "rest_day",
      sourceType: "none",
      label: "Rest day",
      reason: "No target is saved for this date.",
      hasTarget: false
    };
    const { getTodayNutritionData, todayTargetData } = await import("@/services/database/today-nutrition");
    const result = await getTodayNutritionData(userId, tuesday, {
      loadLogs: async () => logs,
      loadTargetData: async () => todayTargetData(noTarget)
    });
    expect(result.targetsState).toBe("loaded");
    expect(result.targets).toBeNull();
    expect(result.targetsError).toBeNull();
  });
});

describe("Today target refresh event", () => {
  class FakeEvents {
    listeners = new Map<string, Set<EventListener>>();
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const fn = typeof listener === "function" ? listener : listener.handleEvent.bind(listener);
      const set = this.listeners.get(type) ?? new Set<EventListener>();
      set.add(fn);
      this.listeners.set(type, set);
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener === "function") this.listeners.get(type)?.delete(listener);
    }
    emit(type: string, date?: string) {
      const event = new Event(type) as Event & { detail?: { date?: string } };
      event.detail = date === undefined ? {} : { date };
      this.listeners.get(type)?.forEach((listener) => listener(event));
    }
  }

  it("refreshes for Today and general events, ignores other dates, and removes the listener", async () => {
    const { ACTIVE_NUTRITION_TARGET_EVENT } = await import("@/services/database/nutrition-target-assignments");
    const { subscribeToTodayNutritionTargetChanges } = await import("@/services/database/today-nutrition");
    const target = new FakeEvents();
    const refresh = vi.fn();
    const cleanup = subscribeToTodayNutritionTargetChanges(target, monday, refresh);
    target.emit(ACTIVE_NUTRITION_TARGET_EVENT, monday);
    target.emit(ACTIVE_NUTRITION_TARGET_EVENT, tuesday);
    target.emit(ACTIVE_NUTRITION_TARGET_EVENT);
    expect(refresh).toHaveBeenCalledTimes(2);
    cleanup();
    target.emit(ACTIVE_NUTRITION_TARGET_EVENT, monday);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
