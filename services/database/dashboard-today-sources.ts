"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { weekDays } from "@/services/database/workout-plans";
import type { DashboardWorkoutSession } from "@/lib/dashboard/today-model";
import type {
  FitnessHabit,
  SleepRecoveryLog,
  SupplementLog,
  UserWorkoutPlan,
  UserWorkoutPlanDay,
  UserWorkoutPlanExercise,
  WaterLog,
  WorkoutSession
} from "@/types";

function canLoad(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function requireDashboardUser(userId: string) {
  if (!canLoad(userId)) throw new Error("Dashboard data could not load because the user session is invalid.");
}

export async function getDashboardWaterLogs(userId: string, date: string): Promise<WaterLog[]> {
  requireDashboardUser(userId);
  const { data, error } = await supabase!
    .from("water_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WaterLog[];
}

export async function getDashboardSleepRecoveryLogs(userId: string, limit = 7): Promise<SleepRecoveryLog[]> {
  requireDashboardUser(userId);
  const { data, error } = await supabase!
    .from("sleep_recovery_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SleepRecoveryLog[];
}

type RawPlan = Omit<UserWorkoutPlan, "days">;
type RawDay = Omit<UserWorkoutPlanDay, "exercises">;
type RawExercise = UserWorkoutPlanExercise;

async function loadStrictActivePlan(userId: string): Promise<UserWorkoutPlan | null> {
  requireDashboardUser(userId);
  const planResult = await supabase!
    .from("user_workout_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planResult.error) throw planResult.error;
  if (!planResult.data) return null;

  const plan = planResult.data as RawPlan;
  const dayResult = await supabase!
    .from("user_workout_plan_days")
    .select("*")
    .eq("plan_id", plan.id)
    .order("day_number", { ascending: true });
  if (dayResult.error) throw dayResult.error;
  const rawDays = (dayResult.data ?? []) as RawDay[];
  const dayIds = rawDays.map((day) => day.id);
  const exerciseResult = dayIds.length
    ? await supabase!
        .from("user_workout_plan_exercises")
        .select("*")
        .in("plan_day_id", dayIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (exerciseResult.error) throw exerciseResult.error;
  const exercises = (exerciseResult.data ?? []) as RawExercise[];

  return {
    ...plan,
    days: rawDays.map((day) => ({
      ...day,
      exercises: exercises.filter((exercise) => exercise.plan_day_id === day.id)
    }))
  };
}

function mapScheduledHistory(row: Record<string, unknown>): DashboardWorkoutSession {
  const scheduledDate = String(row.scheduled_date ?? "");
  const startedAt = typeof row.started_at === "string" && row.started_at
    ? row.started_at
    : `${scheduledDate}T00:00:00.000Z`;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    workout_id: null,
    plan_id: typeof row.user_workout_plan_id === "string" ? row.user_workout_plan_id : null,
    plan_day_id: typeof row.plan_day_id === "string" ? row.plan_day_id : null,
    workout_day_name: typeof row.day_title === "string" ? row.day_title : null,
    workout_name: typeof row.day_title === "string" ? row.day_title : "Workout",
    started_at: startedAt,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    skipped_at: typeof row.skipped_at === "string" ? row.skipped_at : null,
    duration_minutes: typeof row.duration_minutes === "number" ? row.duration_minutes : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    status: row.status === "skipped" ? "skipped" : "completed",
    scheduled_date: scheduledDate || null
  };
}

async function loadStrictWorkoutHistory(userId: string): Promise<DashboardWorkoutSession[]> {
  requireDashboardUser(userId);
  const [legacy, scheduled] = await Promise.all([
    supabase!
      .from("workout_sessions")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["completed", "skipped"])
      .order("started_at", { ascending: false })
      .limit(20),
    supabase!
      .from("user_workout_sessions")
      .select("id,user_id,user_workout_plan_id,plan_day_id,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes")
      .eq("user_id", userId)
      .in("status", ["completed", "skipped"])
      .order("scheduled_date", { ascending: false })
      .limit(20)
  ]);
  if (legacy.error) throw legacy.error;
  if (scheduled.error) throw scheduled.error;
  return [
    ...((legacy.data ?? []) as WorkoutSession[]),
    ...((scheduled.data ?? []) as Array<Record<string, unknown>>).map(mapScheduledHistory)
  ];
}

async function loadStrictOpenSession(userId: string, planDayId: string): Promise<WorkoutSession | null> {
  requireDashboardUser(userId);
  const { data, error } = await supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_day_id", planDayId)
    .eq("status", "started")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkoutSession | null) ?? null;
}

export type DashboardWorkoutData = {
  plan: UserWorkoutPlan | null;
  day: UserWorkoutPlanDay | null;
  sessions: DashboardWorkoutSession[];
  openSessionId: string | null;
};

export type DashboardWorkoutDependencies = {
  loadPlan: (userId: string) => Promise<UserWorkoutPlan | null>;
  loadHistory: (userId: string) => Promise<DashboardWorkoutSession[]>;
  loadOpenSession: (userId: string, planDayId: string) => Promise<WorkoutSession | null>;
};

const workoutDependencies: DashboardWorkoutDependencies = {
  loadPlan: loadStrictActivePlan,
  loadHistory: loadStrictWorkoutHistory,
  loadOpenSession: loadStrictOpenSession
};

export async function getDashboardWorkoutData(
  userId: string,
  date: string,
  dependencies: DashboardWorkoutDependencies = workoutDependencies
): Promise<DashboardWorkoutData> {
  const [plan, sessions] = await Promise.all([
    dependencies.loadPlan(userId),
    dependencies.loadHistory(userId)
  ]);
  const weekday = weekDays[new Date(`${date}T12:00:00`).getDay()];
  const day = plan?.days.find((item) => item.weekday === weekday && item.exercises.length > 0) ?? null;
  const open = day ? await dependencies.loadOpenSession(userId, day.id) : null;
  return { plan, day, sessions, openSessionId: open?.id ?? null };
}

function meaningful(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some(meaningful);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(meaningful);
  return false;
}

export type DashboardProfileContext = {
  state: "loading" | "loaded" | "failed";
  hasGoals: boolean;
  hasTrainingPreferences: boolean;
  hasNutritionPreferences: boolean;
  hasConstraints: boolean;
};

export const initialDashboardProfileContext: DashboardProfileContext = {
  state: "loading",
  hasGoals: false,
  hasTrainingPreferences: false,
  hasNutritionPreferences: false,
  hasConstraints: false
};

export function deriveDashboardProfileContext(input: {
  onboarding: Record<string, unknown> | null;
  nutritionPreferences: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
}): DashboardProfileContext {
  const onboarding = input.onboarding ?? {};
  const trainingFields = [
    onboarding.training_level,
    onboarding.training_place,
    onboarding.activity_level,
    onboarding.training_days_per_week,
    onboarding.available_days,
    onboarding.workout_duration_minutes,
    onboarding.preferred_workout_time,
    onboarding.available_equipment
  ];
  return {
    state: "loaded",
    hasGoals: meaningful(onboarding.goals) || meaningful(onboarding.primary_goal) || meaningful(onboarding.goal),
    hasTrainingPreferences: trainingFields.some(meaningful),
    hasNutritionPreferences: meaningful(onboarding.nutrition_preferences) || meaningful(input.nutritionPreferences),
    hasConstraints: meaningful(input.constraints)
  };
}

export async function getDashboardProfileContext(userId: string): Promise<DashboardProfileContext> {
  requireDashboardUser(userId);
  const [onboarding, nutritionPreferences, constraints] = await Promise.all([
    supabase!
      .from("onboarding_answers")
      .select("goal,goals,primary_goal,training_level,training_place,activity_level,training_days_per_week,available_days,workout_duration_minutes,preferred_workout_time,available_equipment,nutrition_preferences")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase!
      .from("user_nutrition_preference_profiles")
      .select("nutrition_goal,weekly_food_budget,max_cooking_time_minutes,meal_prep_days,meal_prep_preference,cooking_skill,kitchen_equipment,preferred_cuisines,liked_foods,disliked_foods,allergy_items,dietary_restrictions,allergies,repeat_tolerance,meals_per_day,ingredient_reuse_preference,grocery_style_preference,eating_schedule,supplements,tracks_calories_or_macros")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase!
      .from("user_fitness_constraints")
      .select("injury_or_limitation_labels,areas_to_protect,pain_sensitive_areas,movement_restrictions,movements_to_avoid,discomfort_exercises,mobility_limitations,professional_restrictions,legacy_context_notes,nutrition_restrictions")
      .eq("user_id", userId)
      .maybeSingle()
  ]);
  if (onboarding.error) throw onboarding.error;
  if (nutritionPreferences.error) throw nutritionPreferences.error;
  if (constraints.error) throw constraints.error;
  return deriveDashboardProfileContext({
    onboarding: (onboarding.data as Record<string, unknown> | null) ?? null,
    nutritionPreferences: (nutritionPreferences.data as Record<string, unknown> | null) ?? null,
    constraints: (constraints.data as Record<string, unknown> | null) ?? null
  });
}

export type DashboardProgressContext = {
  state: "loading" | "loaded" | "failed";
  entryCount: number | null;
};

export const initialDashboardProgressContext: DashboardProgressContext = { state: "loading", entryCount: null };

export async function getDashboardProgressContext(userId: string): Promise<DashboardProgressContext> {
  requireDashboardUser(userId);
  const { count, error } = await supabase!
    .from("progress_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return { state: "loaded", entryCount: count ?? 0 };
}

export type DashboardWellnessData = {
  habits: FitnessHabit[];
  supplements: SupplementLog[];
  sleepLogs: SleepRecoveryLog[];
  errors: { habits?: string; supplements?: string; sleep?: string };
};

export function resolveDashboardWellnessResults(input: {
  habits: PromiseSettledResult<FitnessHabit[]>;
  supplements: PromiseSettledResult<SupplementLog[]>;
  sleep: PromiseSettledResult<SleepRecoveryLog[]>;
  unavailableMessage: string;
}): DashboardWellnessData {
  return {
    habits: input.habits.status === "fulfilled" ? input.habits.value : [],
    supplements: input.supplements.status === "fulfilled" ? input.supplements.value : [],
    sleepLogs: input.sleep.status === "fulfilled" ? input.sleep.value : [],
    errors: {
      habits: input.habits.status === "rejected" ? input.unavailableMessage : undefined,
      supplements: input.supplements.status === "rejected" ? input.unavailableMessage : undefined,
      sleep: input.sleep.status === "rejected" ? input.unavailableMessage : undefined
    }
  };
}
