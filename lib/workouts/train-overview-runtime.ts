import type { QuickPromptContext, PromptSourceState } from "@/lib/ai/quick-prompts";
import type { TodayWorkoutResolution } from "@/lib/dashboard/today-model";
import type { UserWorkoutPlan, UserWorkoutPlanDay, WorkoutSession } from "@/types";

export const TRAIN_ROUTE = "/my-workout/plans";

export type TrainRequestIdentity = {
  userId: string | null;
  date: string;
  generation: number;
};

export type TrainProfileCapabilities = {
  state: PromptSourceState;
  hasGoals: boolean;
  hasTrainingPreferences: boolean;
  hasNutritionPreferences: boolean;
  hasConstraints: boolean;
};

export const emptyTrainProfileCapabilities: TrainProfileCapabilities = {
  state: "loading",
  hasGoals: false,
  hasTrainingPreferences: false,
  hasNutritionPreferences: false,
  hasConstraints: false
};

export function trainRequestKey(userId: string | null | undefined, date: string) {
  return `${userId ?? "anonymous"}:${date}`;
}

export function isTrainRequestCurrent(captured: TrainRequestIdentity, current: TrainRequestIdentity) {
  return captured.userId === current.userId && captured.date === current.date && captured.generation === current.generation;
}

export function findOpenSessionPlanContext(plans: UserWorkoutPlan[], session: WorkoutSession | null) {
  if (!session?.plan_day_id) return { plan: null, day: null };
  for (const plan of plans) {
    const day = plan.days.find((candidate) => candidate.id === session.plan_day_id) ?? null;
    if (day) return { plan, day };
  }
  return { plan: null, day: null };
}

export function activeSessionTitle(session: WorkoutSession | null) {
  return session?.workout_day_name?.trim() || session?.workout_name?.trim() || null;
}

export function buildTrainQuickPromptContext(input: {
  date: string;
  plan: UserWorkoutPlan | null;
  day: UserWorkoutPlanDay | null;
  resolution: TodayWorkoutResolution;
  openSession: WorkoutSession | null;
  historyCount: number | null;
  profile: TrainProfileCapabilities;
}): QuickPromptContext {
  const title = input.day?.day_name?.trim() || activeSessionTitle(input.openSession);
  return {
    route: TRAIN_ROUTE,
    today: input.date,
    workout: {
      hasPlan: Boolean(input.plan),
      scheduled: input.resolution.state === "scheduled",
      active: input.resolution.state === "active",
      completed: input.resolution.state === "completed",
      skipped: input.resolution.state === "skipped",
      title,
      exerciseCount: input.day ? input.day.exercises.length : null,
      durationMinutes: input.plan?.session_duration_minutes ?? null,
      historyCount: input.historyCount
    },
    profile: {
      state: input.profile.state,
      hasGoals: input.profile.hasGoals,
      hasTrainingPreferences: input.profile.hasTrainingPreferences,
      hasNutritionPreferences: input.profile.hasNutritionPreferences,
      hasConstraints: input.profile.hasConstraints
    },
    selection: { exercise: null, meal: null, plannedMeal: null }
  };
}

export function clearedTrainQuickPromptContext(): QuickPromptContext {
  return {
    workout: {
      hasPlan: false,
      scheduled: false,
      active: false,
      completed: false,
      skipped: false,
      title: null,
      exerciseCount: null,
      durationMinutes: null,
      historyCount: null
    },
    profile: { ...emptyTrainProfileCapabilities },
    selection: { exercise: null, meal: null, plannedMeal: null }
  };
}

export type WorkoutPlanDetailAction = "edit" | "start" | "resume" | "adjust" | "duplicate" | "activate" | "archive" | "delete" | "back";

export function workoutPlanDetailActions(plan: Pick<UserWorkoutPlan, "archived_at" | "is_active">): WorkoutPlanDetailAction[] {
  if (plan.archived_at) return ["duplicate", "activate", "delete", "back"];
  return ["edit", "start", "resume", "adjust", "duplicate", ...(plan.is_active ? [] : ["activate" as const]), "archive", "delete", "back"];
}

export function canEditWorkoutPlan(plan: Pick<UserWorkoutPlan, "archived_at">) {
  return !plan.archived_at;
}

export function archivedPlanEditorRedirect(plan: Pick<UserWorkoutPlan, "id" | "archived_at">) {
  return plan.archived_at ? `/my-workout/plans/${plan.id}` : null;
}
