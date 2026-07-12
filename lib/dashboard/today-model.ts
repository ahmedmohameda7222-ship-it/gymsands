import type { MealPlanItem, WorkoutSession } from "@/types";
import type { QuickLogSection } from "@/services/database/user-settings";

export type TodayWorkoutState = "none" | "scheduled" | "active" | "completed";

export type TodayAction = {
  id: "resume-workout" | "start-workout" | "meal" | "first-meal" | "water" | "protein" | "checkin";
  href?: string;
  waterAmountMl?: number;
  priority: number;
  workoutTitle?: string | null;
  workoutExerciseCount?: number;
  workoutDurationMinutes?: number | null;
  mealType?: string;
  foodName?: string;
  remainingProtein?: number;
  waterRemainingMl?: number;
};

export function resolveTodayWorkoutState(input: {
  today: string;
  planDayId: string | null;
  openSessionId: string | null;
  sessions: WorkoutSession[];
}): TodayWorkoutState {
  if (!input.planDayId) return "none";
  if (input.openSessionId) return "active";
  const completed = input.sessions.some((session) => {
    const date = (session.completed_at || session.started_at || "").slice(0, 10);
    return session.plan_day_id === input.planDayId && session.status === "completed" && date === input.today;
  });
  return completed ? "completed" : "scheduled";
}

export function selectRelevantMeal(items: MealPlanItem[], hour = new Date().getHours()) {
  const open = items.filter((item) => item.status === "planned");
  if (!open.length) return null;
  const preferred = hour < 11 ? "Breakfast" : hour < 15 ? "Lunch" : hour < 18 ? "Snack" : "Dinner";
  return open.find((item) => item.meal_type === preferred) ?? open[0];
}

export function buildTodayActions(input: {
  workoutState: TodayWorkoutState;
  workoutTitle?: string | null;
  workoutHref?: string | null;
  workoutExerciseCount?: number;
  workoutDurationMinutes?: number | null;
  relevantMeal: MealPlanItem | null;
  foodLogCount: number;
  remainingProtein: number | null;
  waterRemainingMl: number | null;
  checkinAvailable: boolean;
}): TodayAction[] {
  const actions: TodayAction[] = [];
  if (input.workoutState === "active" && input.workoutHref) {
    actions.push({
      id: "resume-workout",
      href: input.workoutHref,
      priority: 120,
      workoutTitle: input.workoutTitle,
      workoutExerciseCount: input.workoutExerciseCount,
      workoutDurationMinutes: input.workoutDurationMinutes
    });
  } else if (input.workoutState === "scheduled" && input.workoutHref) {
    actions.push({
      id: "start-workout",
      href: input.workoutHref,
      priority: 110,
      workoutTitle: input.workoutTitle,
      workoutExerciseCount: input.workoutExerciseCount,
      workoutDurationMinutes: input.workoutDurationMinutes
    });
  }
  if (input.relevantMeal) {
    actions.push({
      id: "meal",
      href: "/my-meal-plan",
      priority: 90,
      mealType: input.relevantMeal.meal_type,
      foodName: input.relevantMeal.food_name
    });
  } else if (input.foodLogCount === 0) {
    actions.push({ id: "first-meal", href: "/calories", priority: 84 });
  }
  if (input.waterRemainingMl && input.waterRemainingMl > 0) {
    const amount = Math.min(500, Math.max(250, Math.ceil(input.waterRemainingMl / 4 / 50) * 50));
    actions.push({ id: "water", waterAmountMl: amount, waterRemainingMl: input.waterRemainingMl, priority: 72 });
  }
  if (input.remainingProtein && input.remainingProtein > 20) {
    actions.push({ id: "protein", href: "/calories", remainingProtein: input.remainingProtein, priority: 68 });
  }
  if (input.checkinAvailable) {
    actions.push({ id: "checkin", href: "/wellness", priority: 40 });
  }
  return actions.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

export function hasCurrentDayActivity(input: {
  foodLogCount: number;
  waterLogCount: number;
  mealItems: MealPlanItem[];
  workoutState: TodayWorkoutState;
  habitsCount: number;
  supplementsCount: number;
  sleepLoggedToday: boolean;
}) {
  return input.foodLogCount > 0 || input.waterLogCount > 0 || input.mealItems.length > 0 || input.workoutState !== "none" || input.habitsCount > 0 || input.supplementsCount > 0 || input.sleepLoggedToday;
}

export const quickLogRoutes: Record<QuickLogSection, string> = {
  water: "/hydration",
  meal: "/calories",
  weight: "/progress",
  workout: "/today-workout",
  progress: "/progress",
  sleep: "/sleep-recovery",
  supplements: "/supplements",
  wellness: "/wellness"
};

export function enabledQuickLogs(sections: QuickLogSection[], dominantHref?: string | null) {
  return sections.filter((section) => quickLogRoutes[section] !== dominantHref);
}
