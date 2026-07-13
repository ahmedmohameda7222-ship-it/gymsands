import { describe, expect, it } from "vitest";
import { resolveTodayWorkout, selectRelevantMeal, todayWorkoutActionHref, workoutSessionLocalDate, type DashboardWorkoutSession } from "@/lib/dashboard/today-model";
import type { MealPlanItem } from "@/types";

const session = {
  id: "s",
  user_id: "u",
  workout_id: null,
  plan_day_id: "day-1",
  workout_name: "Day",
  started_at: "2026-07-12T22:30:00Z",
  completed_at: "2026-07-12T23:30:00Z",
  duration_minutes: 60,
  notes: null,
  status: "completed" as const
} satisfies DashboardWorkoutSession;

function meal(id: string, type: MealPlanItem["meal_type"], status: MealPlanItem["status"] = "planned"): MealPlanItem {
  return { id, user_id: "u", plan_date: "2026-07-12", meal_type: type, food_item_id: null, user_food_item_id: null, food_name: id, serving_size: "1 serving", quantity: 1, calories: 100, protein_g: 10, carbs_g: 10, fat_g: 2, status, food_log_id: null, completed_at: null, notes: null, created_at: "2026-07-12T00:00:00Z", updated_at: "2026-07-12T00:00:00Z" };
}

describe("focused today model", () => {
  it("prefers the canonical scheduled date for completed sessions", () => {
    const scheduled = { ...session, scheduled_date: "2026-07-13" };
    expect(workoutSessionLocalDate(scheduled, () => "2026-07-12")).toBe("2026-07-13");
    expect(resolveTodayWorkout({ today: "2026-07-13", planDayId: "day-1", openSessionId: null, sessions: [scheduled], toLocalIso: () => "2026-07-12" })).toEqual({ state: "completed", completedSessionId: "s" });
  });

  it("uses an explicit local-date converter when UTC and local dates differ", () => {
    expect(resolveTodayWorkout({ today: "2026-07-13", planDayId: "day-1", openSessionId: null, sessions: [session], toLocalIso: () => "2026-07-13" })).toEqual({ state: "completed", completedSessionId: "s" });
  });

  it("does not classify yesterday's completed session as completed today", () => {
    expect(resolveTodayWorkout({ today: "2026-07-13", planDayId: "day-1", openSessionId: null, sessions: [session], toLocalIso: () => "2026-07-12" })).toEqual({ state: "scheduled" });
  });

  it("keeps an active session ahead of completed history", () => {
    expect(resolveTodayWorkout({ today: "2026-07-13", planDayId: "day-1", openSessionId: "active-1", sessions: [{ ...session, scheduled_date: "2026-07-13" }] })).toEqual({ state: "active", activeSessionId: "active-1" });
  });

  it("keeps a scheduled session scheduled when no completion exists", () => {
    expect(resolveTodayWorkout({ today: "2026-07-13", planDayId: "day-1", openSessionId: null, sessions: [] })).toEqual({ state: "scheduled" });
  });

  it("ignores a completion for another plan day", () => {
    expect(resolveTodayWorkout({ today: "2026-07-13", planDayId: "day-2", openSessionId: null, sessions: [{ ...session, scheduled_date: "2026-07-13" }] })).toEqual({ state: "scheduled" });
  });

  it("uses execution routes only for scheduled and active workouts", () => {
    expect(todayWorkoutActionHref({ state: "scheduled" }, "day-1")).toBe("/workouts/session/day/day-1");
    expect(todayWorkoutActionHref({ state: "active", activeSessionId: "active-1" }, "day-1")).toBe("/workouts/session/day/day-1");
    const completedHref = todayWorkoutActionHref({ state: "completed", completedSessionId: "done-1" }, "day-1");
    expect(completedHref).toBe("/workout-history?session=done-1");
    expect(completedHref).not.toContain("/workouts/session/day/");
  });

  it("selects only planned meals and prefers the relevant time slot", () => {
    const items = [meal("done-breakfast", "Breakfast", "done"), meal("lunch", "Lunch"), meal("dinner", "Dinner")];
    expect(selectRelevantMeal(items, 13)?.id).toBe("lunch");
    expect(selectRelevantMeal(items, 20)?.id).toBe("dinner");
    expect(selectRelevantMeal(items.map((item) => ({ ...item, status: "done" as const })), 13)).toBeNull();
  });

  it("does not retain recommendation or quick-log builders", async () => {
    const model = await import("@/lib/dashboard/today-model");
    expect("buildTodayActions" in model).toBe(false);
    expect("enabledQuickLogs" in model).toBe(false);
    expect("quickLogRoutes" in model).toBe(false);
  });
});
