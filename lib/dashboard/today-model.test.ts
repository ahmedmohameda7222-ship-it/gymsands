import { describe, expect, it } from "vitest";
import { buildTodayActions, enabledQuickLogs, hasCurrentDayActivity, resolveTodayWorkoutState } from "@/lib/dashboard/today-model";

const session = { id: "s", user_id: "u", workout_id: null, plan_day_id: "day-1", workout_name: "Day", started_at: "2026-07-12T10:00:00Z", completed_at: "2026-07-12T11:00:00Z", duration_minutes: 60, notes: null, status: "completed" as const };

describe("today model", () => {
  it("matches completion to the scheduled plan day", () => {
    expect(resolveTodayWorkoutState({ today: "2026-07-12", planDayId: "day-1", openSessionId: null, sessions: [session] })).toBe("completed");
    expect(resolveTodayWorkoutState({ today: "2026-07-12", planDayId: "day-2", openSessionId: null, sessions: [session] })).toBe("scheduled");
  });

  it("prioritizes one resumable workout and keeps display copy outside the data model", () => {
    const actions = buildTodayActions({ workoutState: "active", workoutTitle: "Upper", workoutHref: "/workout", relevantMeal: null, foodLogCount: 0, remainingProtein: 80, waterRemainingMl: 1000, checkinAvailable: true });
    expect(actions[0]).toMatchObject({ id: "resume-workout", workoutTitle: "Upper", href: "/workout" });
    expect("title" in actions[0]).toBe(false);
    expect(actions).toHaveLength(3);
  });

  it("uses only current-day inputs for activity", () => {
    expect(hasCurrentDayActivity({ foodLogCount: 0, waterLogCount: 0, mealItems: [], workoutState: "none", habitsCount: 0, supplementsCount: 0, sleepLoggedToday: false })).toBe(false);
  });

  it("respects configured quick logs and removes the dominant duplicate", () => {
    expect(enabledQuickLogs(["meal", "water", "sleep"], "/calories")).toEqual(["water", "sleep"]);
  });
});
