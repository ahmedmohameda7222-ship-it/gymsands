import { describe, expect, it } from "vitest";
import { buildTodayActions, enabledQuickLogs, hasCurrentDayActivity, resolveTodayWorkout, todayWorkoutActionHref } from "@/lib/dashboard/today-model";
import type { WorkoutSession } from "@/types";

const session = { id: "s", user_id: "u", workout_id: null, plan_day_id: "day-1", workout_name: "Day", started_at: "2026-07-12T10:00:00Z", completed_at: "2026-07-12T11:00:00Z", duration_minutes: 60, notes: null, status: "completed" as const } as WorkoutSession;

const noActivity = {
  foodLogCount: 0,
  waterLogCount: 0,
  doneMealCount: 0,
  workoutState: "none" as const,
  completedHabitCount: 0,
  takenSupplementCount: 0,
  sleepLoggedToday: false,
  checkinLoggedToday: false
};

describe("today model", () => {
  it("preserves the matching completed session and ignores unrelated completions", () => {
    expect(resolveTodayWorkout({ today: "2026-07-12", planDayId: "day-1", openSessionId: null, sessions: [session] })).toEqual({ state: "completed", completedSessionId: "s" });
    expect(resolveTodayWorkout({ today: "2026-07-12", planDayId: "day-2", openSessionId: null, sessions: [session] })).toEqual({ state: "scheduled" });
  });

  it("uses execution routes only for scheduled and active workouts", () => {
    expect(todayWorkoutActionHref({ state: "scheduled" }, "day-1")).toBe("/workouts/session/day/day-1");
    expect(todayWorkoutActionHref({ state: "active", activeSessionId: "active-1" }, "day-1")).toBe("/workouts/session/day/day-1");
    const completedHref = todayWorkoutActionHref({ state: "completed", completedSessionId: "done-1" }, "day-1");
    expect(completedHref).toBe("/workout-history?session=done-1");
    expect(completedHref).not.toContain("/workouts/session/day/");
  });

  it("prioritizes one resumable workout and returns at most two secondary actions", () => {
    const actions = buildTodayActions({ workoutState: "active", workoutTitle: "Upper", workoutHref: "/workout", relevantMeal: null, foodLogCount: 0, remainingProtein: 80, waterRemainingMl: 1000, checkinAvailable: true });
    expect(actions[0].id).toBe("resume-workout");
    expect(actions).toHaveLength(3);
  });

  it("does not synthesize a first-meal action when food logs are unknown", () => {
    const actions = buildTodayActions({ workoutState: "none", workoutHref: null, relevantMeal: null, foodLogCount: null, remainingProtein: null, waterRemainingMl: null, checkinAvailable: false });
    expect(actions.some((action) => action.id === "first-meal")).toBe(false);
    expect(actions.some((action) => action.id === "protein")).toBe(false);
  });

  it.each([
    ["scheduled workout", { ...noActivity, workoutState: "scheduled" as const }, false],
    ["planned-only day", noActivity, false],
    ["incomplete habits", { ...noActivity, completedHabitCount: 0 }, false],
    ["untaken supplements", { ...noActivity, takenSupplementCount: 0 }, false],
    ["active workout", { ...noActivity, workoutState: "active" as const }, true],
    ["completed workout", { ...noActivity, workoutState: "completed" as const }, true],
    ["done meal", { ...noActivity, doneMealCount: 1 }, true],
    ["food log", { ...noActivity, foodLogCount: 1 }, true],
    ["water log", { ...noActivity, waterLogCount: 1 }, true],
    ["completed habit", { ...noActivity, completedHabitCount: 1 }, true],
    ["taken supplement", { ...noActivity, takenSupplementCount: 1 }, true],
    ["today sleep", { ...noActivity, sleepLoggedToday: true }, true],
    ["today check-in", { ...noActivity, checkinLoggedToday: true }, true]
  ])("%s produces the correct execution-only activity state", (_label, input, expected) => {
    expect(hasCurrentDayActivity(input)).toBe(expected);
  });

  it("respects configured quick logs and removes the dominant duplicate", () => {
    expect(enabledQuickLogs(["meal", "water", "sleep"], "/calories")).toEqual(["water", "sleep"]);
  });
});
