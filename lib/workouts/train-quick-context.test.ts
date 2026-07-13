import { describe, expect, it } from "vitest";
import { buildTrainQuickPromptContext, clearedTrainQuickPromptContext, emptyTrainProfileCapabilities } from "@/lib/workouts/train-overview-runtime";
import type { TodayWorkoutResolution } from "@/lib/dashboard/today-model";
import type { UserWorkoutPlan, UserWorkoutPlanDay, WorkoutSession } from "@/types";

const day = {
  id: "day-1",
  plan_id: "plan-1",
  day_number: 1,
  day_name: "Push",
  weekday: "Monday",
  notes: null,
  exercises: [{ id: "exercise-1" }, { id: "exercise-2" }]
} as unknown as UserWorkoutPlanDay;

const plan = {
  id: "plan-1",
  name: "Strength",
  session_duration_minutes: 50,
  days: [day]
} as unknown as UserWorkoutPlan;

const openSession = {
  id: "open-1",
  user_id: "user-1",
  workout_id: null,
  plan_day_id: "day-1",
  workout_day_name: "Push",
  workout_name: "Push",
  started_at: "2026-07-13T10:00:00.000Z",
  completed_at: null,
  duration_minutes: 10,
  notes: null,
  status: "started"
} as WorkoutSession;

const profile = {
  state: "loaded" as const,
  hasGoals: true,
  hasTrainingPreferences: true,
  hasNutritionPreferences: false,
  hasConstraints: true
};

function context(resolution: TodayWorkoutResolution, overrides: Partial<Parameters<typeof buildTrainQuickPromptContext>[0]> = {}) {
  return buildTrainQuickPromptContext({
    date: "2026-07-13",
    plan,
    day,
    resolution,
    openSession: null,
    historyCount: 4,
    profile,
    ...overrides
  });
}

describe("Train Quick ChatGPT context", () => {
  it("uses the current Train route and scheduled Today context", () => {
    expect(context({ state: "scheduled" })).toMatchObject({
      route: "/my-workout/plans",
      today: "2026-07-13",
      workout: { hasPlan: true, scheduled: true, active: false, completed: false, skipped: false, title: "Push", exerciseCount: 2, durationMinutes: 50, historyCount: 4 }
    });
  });

  it("represents a rest day without inventing a scheduled workout", () => {
    expect(context({ state: "none" }, { day: null }).workout).toMatchObject({ scheduled: false, active: false, completed: false, title: null, exerciseCount: null });
  });

  it("represents an active session and its current title", () => {
    expect(context({ state: "active", activeSessionId: "open-1" }, { openSession, day: null }).workout).toMatchObject({ active: true, scheduled: false, title: "Push" });
  });

  it("represents completed and skipped states explicitly", () => {
    expect(context({ state: "completed", completedSessionId: "done-1" }).workout).toMatchObject({ completed: true, skipped: false });
    expect(context({ state: "skipped" }).workout).toMatchObject({ completed: false, skipped: true });
  });

  it("represents the absence of an active plan honestly", () => {
    expect(context({ state: "none" }, { plan: null, day: null, historyCount: null }).workout).toMatchObject({ hasPlan: false, historyCount: null });
  });

  it("updates after plan activation and session-state changes", () => {
    const beforeActivation = context({ state: "none" }, { plan: null, day: null });
    const afterActivation = context({ state: "scheduled" });
    const afterStart = context({ state: "active", activeSessionId: "open-1" }, { openSession });
    expect(beforeActivation.workout?.hasPlan).toBe(false);
    expect(afterActivation.workout?.hasPlan).toBe(true);
    expect(afterActivation.workout?.scheduled).toBe(true);
    expect(afterStart.workout?.active).toBe(true);
  });

  it("clears stale Eat and Dashboard selections", () => {
    expect(context({ state: "scheduled" }).selection).toEqual({ exercise: null, meal: null, plannedMeal: null });
  });

  it("removes route-specific Train context when leaving", () => {
    const cleared = clearedTrainQuickPromptContext();
    expect(cleared.route).toBeUndefined();
    expect(cleared.workout).toMatchObject({ hasPlan: false, active: false, scheduled: false, completed: false, skipped: false });
    expect(cleared.selection).toEqual({ exercise: null, meal: null, plannedMeal: null });
  });

  it("contains only the minimum authorized Train fields", () => {
    const value = context({ state: "scheduled" });
    expect(value).not.toHaveProperty("nutrition");
    expect(value).not.toHaveProperty("grocery");
    expect(value).not.toHaveProperty("hydration");
    expect(value).not.toHaveProperty("wellness");
    expect(value).not.toHaveProperty("progress");
    expect(JSON.stringify(value)).not.toContain("workout_plan");
    expect(JSON.stringify(value)).not.toContain("raw");
  });

  it("keeps profile capability flags explicit without exposing raw profile data", () => {
    expect(context({ state: "scheduled" }).profile).toEqual(profile);
    expect(context({ state: "scheduled" }, { profile: emptyTrainProfileCapabilities }).profile?.state).toBe("loading");
  });
});
