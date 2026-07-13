import { localDateToIso } from "@/lib/date-utils";
import type { MealPlanItem, WorkoutSession } from "@/types";

export type TodayWorkoutState = "none" | "scheduled" | "active" | "completed";
export type DashboardWorkoutSession = WorkoutSession & { scheduled_date?: string | null };

export type TodayWorkoutResolution = {
  state: TodayWorkoutState;
  activeSessionId?: string;
  completedSessionId?: string;
};

export function workoutSessionLocalDate(
  session: DashboardWorkoutSession,
  toLocalIso: (timestamp: string) => string = (timestamp) => localDateToIso(new Date(timestamp))
) {
  if (session.scheduled_date) return session.scheduled_date;
  const timestamp = session.completed_at || session.started_at;
  return timestamp ? toLocalIso(timestamp) : null;
}

export function resolveTodayWorkout(input: {
  today: string;
  planDayId: string | null;
  openSessionId: string | null;
  sessions: DashboardWorkoutSession[];
  toLocalIso?: (timestamp: string) => string;
}): TodayWorkoutResolution {
  if (!input.planDayId) return { state: "none" };
  if (input.openSessionId) return { state: "active", activeSessionId: input.openSessionId };
  const completed = input.sessions.find((session) => (
    session.plan_day_id === input.planDayId
    && session.status === "completed"
    && workoutSessionLocalDate(session, input.toLocalIso) === input.today
  ));
  return completed ? { state: "completed", completedSessionId: completed.id } : { state: "scheduled" };
}

export function resolveTodayWorkoutState(input: {
  today: string;
  planDayId: string | null;
  openSessionId: string | null;
  sessions: DashboardWorkoutSession[];
  toLocalIso?: (timestamp: string) => string;
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
