import { describe, expect, it } from "vitest";
import { resolveTodayWorkout, todayWorkoutActionHref } from "@/lib/dashboard/today-model";
import { activeSessionTitle, findOpenSessionPlanContext } from "@/lib/workouts/train-overview-runtime";
import type { UserWorkoutPlan, WorkoutSession } from "@/types";

function plan(id: string, dayId: string, options: { active?: boolean; archived?: boolean } = {}) {
  return {
    id,
    user_id: "user-a",
    name: id,
    description: null,
    goal: null,
    source: "manual",
    is_default: Boolean(options.active),
    is_active: Boolean(options.active),
    archived_at: options.archived ? "2026-07-01T00:00:00.000Z" : null,
    program_duration_weeks: 8,
    session_duration_minutes: 45,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    days: [{
      id: dayId,
      plan_id: id,
      day_number: 1,
      day_name: `${id} day`,
      weekday: "Monday",
      notes: null,
      exercises: []
    }]
  } as unknown as UserWorkoutPlan;
}

function openSession(overrides: Partial<WorkoutSession> = {}) {
  return {
    id: "open-1",
    user_id: "user-a",
    workout_id: null,
    plan_id: "plan-old",
    plan_day_id: "day-old",
    workout_day_name: "Yesterday pull",
    workout_name: "Yesterday pull",
    started_at: "2026-07-12T20:00:00.000Z",
    completed_at: null,
    duration_minutes: 25,
    notes: null,
    status: "started",
    ...overrides
  } as WorkoutSession;
}

function activeResolution(session: WorkoutSession, scheduledDayId: string | null) {
  return resolveTodayWorkout({
    today: "2026-07-13",
    planDayId: session.plan_day_id ?? scheduledDayId,
    openSessionId: session.id,
    sessions: []
  });
}

describe("Train overview active-session priority", () => {
  it("keeps yesterday's open workout active on a rest day", () => {
    const session = openSession();
    expect(activeResolution(session, null)).toEqual({ state: "active", activeSessionId: "open-1" });
    expect(todayWorkoutActionHref(activeResolution(session, null), session.plan_day_id ?? null, session)).toBe("/workouts/session/day/day-old");
  });

  it("keeps yesterday's open workout ahead of another scheduled workout", () => {
    const session = openSession();
    const resolution = activeResolution(session, "day-today");
    expect(resolution.state).toBe("active");
    expect(todayWorkoutActionHref(resolution, "day-today", session)).toBe("/workouts/session/day/day-old");
  });

  it("resolves an open workout from an inactive plan", () => {
    const active = plan("active-plan", "day-today", { active: true });
    const inactive = plan("inactive-plan", "day-old");
    const context = findOpenSessionPlanContext([active, inactive], openSession({ plan_id: inactive.id }));
    expect(context.plan?.id).toBe("inactive-plan");
    expect(context.day?.id).toBe("day-old");
  });

  it("resolves an open workout from an archived historical plan", () => {
    const archived = plan("archived-plan", "day-old", { archived: true });
    const context = findOpenSessionPlanContext([archived], openSession({ plan_id: archived.id }));
    expect(context.plan?.archived_at).toBeTruthy();
    expect(context.day?.day_name).toBe("archived-plan day");
  });

  it("uses a safe generic active state for a legacy session without a plan day", () => {
    const session = openSession({ plan_day_id: null, workout_id: "exercise-7", workout_name: "Direct workout" });
    const resolution = activeResolution(session, null);
    expect(resolution.state).toBe("active");
    expect(activeSessionTitle(session)).toBe("Yesterday pull");
    expect(todayWorkoutActionHref(resolution, null, session)).toBe("/workouts/session/exercise-7");
  });

  it("uses workout history as the safe destination when no day or workout relation exists", () => {
    const session = openSession({ plan_day_id: null, workout_id: null, workout_day_name: null, workout_name: "Legacy session" });
    const resolution = activeResolution(session, null);
    expect(todayWorkoutActionHref(resolution, null, session)).toBe("/workout-history?session=open-1");
  });

  it("produces only the Resume state and never a competing Start state", () => {
    const session = openSession();
    const resolution = activeResolution(session, "day-today");
    const visibleActions = resolution.state === "active" ? ["Resume workout"] : ["Start workout"];
    expect(visibleActions).toEqual(["Resume workout"]);
    expect(visibleActions).not.toContain("Start workout");
  });
});
