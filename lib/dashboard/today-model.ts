import type { MealPlanItem, WorkoutSession } from "@/types";

export type TodayWorkoutState = "none" | "scheduled" | "active" | "completed";

export type TodayWorkoutResolution = {
  state: TodayWorkoutState;
  activeSessionId?: string;
  completedSessionId?: string;
};

export function resolveTodayWorkout(input: {
  today: string;
  planDayId: string | null;
  openSessionId: string | null;
  sessions: WorkoutSession[];
}): TodayWorkoutResolution {
  if (!input.planDayId) return { state: "none" };
  if (input.openSessionId) return { state: "active", activeSessionId: input.openSessionId };
  const completed = input.sessions.find((session) => {
    const date = (session.completed_at || session.started_at || "").slice(0, 10);
    return session.plan_day_id === input.planDayId && session.status === "completed" && date === input.today;
  });
  return completed ? { state: "completed", completedSessionId: completed.id } : { state: "scheduled" };
}

export function resolveTodayWorkoutState(input: {
  today: string;
  planDayId: string | null;
  openSessionId: string | null;
  sessions: WorkoutSession[];
}): TodayWorkoutState {
  return resolveTodayWorkout(input).state;
}

export function todayWorkoutActionHref(resolution: TodayWorkoutResolution, planDayId: string | null) {
  if ((resolution.state === "scheduled" || resolution.state === "active") && planDayId) {
    return `/workouts/session/day/${planDayId}`;
  }
  if (resolution.state === "completed") {
    return resolution.completedSessionId
      ? `/workout-history?session=${encodeURIComponent(resolution.completedSessionId)}`
      : "/workout-history";
  }
  return null;
}

export function selectRelevantMeal(items: MealPlanItem[], hour = new Date().getHours()) {
  const open = items.filter((item) => item.status === "planned");
  if (!open.length) return null;
  const preferred = hour < 11 ? "Breakfast" : hour < 15 ? "Lunch" : hour < 18 ? "Snack" : "Dinner";
  return open.find((item) => item.meal_type === preferred) ?? open[0];
}
