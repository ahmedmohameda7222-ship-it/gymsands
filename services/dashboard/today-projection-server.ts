import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TODAY_PROJECTION_CONTRACT_VERSION,
  type TodayHabitProjection,
  type TodayHydrationProjection,
  type TodayMealPlanItemProjection,
  type TodayMealsProjection,
  type TodayNutritionLogProjection,
  type TodayNutritionTargetProjection,
  type TodayProfileContextProjection,
  type TodayProgressContextProjection,
  type TodayProjectionEnvelope,
  type TodayProjectionErrorCode,
  type TodayProjectionResponseV1,
  type TodayPromptContextProjection,
  type TodayShoppingProjection,
  type TodaySleepProjection,
  type TodaySupplementProjection,
  type TodayWorkoutProjection,
} from "@/lib/dashboard/today-projection-contract";
import { getEffectiveNutritionTarget } from "@/services/nutrition-v1/server/targets";
import { readTodayV1ShoppingProjection } from "@/services/nutrition-v1/server/today-shopping";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MAX_MATCHING_WORKOUT_DAYS = 14;
const MAX_MATCHING_WORKOUT_EXERCISES = 500;

const DOMAIN_NAMES = [
  "workout",
  "meals",
  "nutrition_logs",
  "nutrition_targets",
  "hydration",
  "shopping",
  "habits",
  "supplements",
  "sleep",
  "profile_context",
  "progress_context",
] as const;

export type TodayProjectionDomainName = (typeof DOMAIN_NAMES)[number];
export type TodayProjectionTimings = Record<TodayProjectionDomainName, number>;

export type TodayProjectionReadResult = {
  response: TodayProjectionResponseV1;
  timings: TodayProjectionTimings;
};

type ProjectionInput = {
  supabase: SupabaseClient;
  userId: string;
  date: string;
  timezone: string;
  now: Date;
};

type WorkoutPlanRow = {
  id: string;
  session_duration_minutes: number | null;
};

type WorkoutDayRow = {
  id: string;
  day_name: string;
};

type WorkoutExerciseRow = {
  id: string;
  plan_day_id: string;
  exercise_name: string;
  sets: number | null;
  reps: string | number | null;
  sort_order: number;
};

type WorkoutSessionRow = {
  id: string;
  plan_day_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
};

type ScheduledSessionRow = {
  id: string;
  plan_day_id: string | null;
  scheduled_date: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
};

type MealRow = {
  id: string;
  meal_slot_key: string;
  frozen_name: string;
  frozen_snapshot: Record<string, unknown>;
  status: TodayMealPlanItemProjection["status"];
};

type NutritionGroupRow = { id: string };
type NutritionGroupItemRow = {
  group_id: string;
  frozen_item_snapshot: Record<string, unknown>;
};

type NullableNutrition = {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

type HabitRow = { name: string; completed: boolean };
type SupplementRow = { name: string; taken_today: boolean };
type SleepRow = {
  hours_slept: number | null;
  recovery_level: string | null;
  fatigue_level: string | null;
};

function finite(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nonNegative(value: unknown): number {
  return Math.max(0, finite(value));
}

function nullableNonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNutritionValue(
  source: Record<string, unknown>,
  keys: readonly string[],
) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return nullableNonNegative(source[key]);
    }
  }
  return null;
}

function directNutrition(source: Record<string, unknown>): NullableNutrition {
  return {
    calories: firstNutritionValue(source, ["caloriesKcal", "calories", "calories_kcal"]),
    proteinG: firstNutritionValue(source, ["proteinG", "protein_g"]),
    carbsG: firstNutritionValue(source, ["carbsG", "carbs_g"]),
    fatG: firstNutritionValue(source, ["fatG", "fat_g"]),
  };
}

function sumNutrition(values: NullableNutrition[]): NullableNutrition {
  if (!values.length) {
    return { calories: null, proteinG: null, carbsG: null, fatG: null };
  }
  const keys = ["calories", "proteinG", "carbsG", "fatG"] as const;
  const result = {} as NullableNutrition;
  for (const key of keys) {
    result[key] = values.some((value) => value[key] === null)
      ? null
      : values.reduce((total, value) => total + (value[key] as number), 0);
  }
  return result;
}

function snapshotNutrition(value: unknown): NullableNutrition {
  const snapshot = record(value);
  const frozen = record(snapshot.frozen_nutrition);
  if (Object.keys(frozen).length) return directNutrition(frozen);
  const nutrition = record(snapshot.nutrition);
  if (Object.keys(nutrition).length) return directNutrition(nutrition);
  if (Array.isArray(snapshot.items) && snapshot.items.length) {
    return sumNutrition(snapshot.items.map((item) => snapshotNutrition(item)));
  }
  return directNutrition(snapshot);
}

function assertQuery<T>(
  result: { data: T | null; error: unknown },
): T | null {
  if (result.error) throw result.error;
  return result.data;
}

function loaded<T>(value: T): TodayProjectionEnvelope<T> {
  return { state: "loaded", value, errorCode: null };
}

function failed<T>(errorCode: TodayProjectionErrorCode): TodayProjectionEnvelope<T> {
  return { state: "failed", value: null, errorCode };
}

function localDateInTimezone(timestamp: string | null, timezone: string) {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function weekdayForDate(date: string) {
  return WEEKDAYS[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
}

function isMeaningful(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some(isMeaningful);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(isMeaningful);
  }
  return false;
}

function classifyCandidateWorkoutActivity<
  TDay extends { id: string },
  TExercise extends { plan_day_id: string },
>(candidateDays: TDay[], candidateExercises: TExercise[]) {
  const candidateDayIds = new Set(candidateDays.map((day) => day.id));
  const populatedDayIds = new Set(
    candidateExercises
      .map((exercise) => exercise.plan_day_id)
      .filter((dayId) => candidateDayIds.has(dayId)),
  );
  const firstPopulatedDay =
    candidateDays.find((day) => populatedDayIds.has(day.id)) ?? null;
  return {
    firstPopulatedDay,
    trainingDay: firstPopulatedDay !== null,
  };
}

function actionHref(
  state: TodayWorkoutProjection["state"],
  dayId: string | null,
  completedSessionId: string | null,
) {
  if ((state === "active" || state === "scheduled") && dayId) {
    return `/workouts/session/day/${dayId}`;
  }
  if (state === "completed") {
    return completedSessionId
      ? `/workout-history?session=${encodeURIComponent(completedSessionId)}`
      : "/workout-history";
  }
  return null;
}

function workoutTimestampDate(
  row: WorkoutSessionRow,
  timezone: string,
) {
  return localDateInTimezone(
    row.completed_at ?? row.skipped_at ?? row.started_at,
    timezone,
  );
}

export async function readTodayWorkoutProjection(
  input: ProjectionInput,
): Promise<TodayWorkoutProjection> {
  const [planResult, legacyResult, scheduledResult] = await Promise.all([
    input.supabase
      .from("user_workout_plans")
      .select("id,session_duration_minutes")
      .eq("user_id", input.userId)
      .eq("is_active", true)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    input.supabase
      .from("workout_sessions")
      .select("id,plan_day_id,status,started_at,completed_at,skipped_at")
      .eq("user_id", input.userId)
      .is("deleted_at", null)
      .in("status", ["completed", "skipped"])
      .order("started_at", { ascending: false })
      .limit(20),
    input.supabase
      .from("user_workout_sessions")
      .select("id,plan_day_id,scheduled_date,status,started_at,completed_at,skipped_at")
      .eq("user_id", input.userId)
      .in("status", ["completed", "skipped"])
      .order("scheduled_date", { ascending: false })
      .limit(20),
  ]);

  const plan = assertQuery(planResult) as WorkoutPlanRow | null;
  const legacy = (assertQuery(legacyResult) ?? []) as WorkoutSessionRow[];
  const scheduled = (assertQuery(scheduledResult) ?? []) as ScheduledSessionRow[];
  const recentCompletedCount =
    legacy.filter((row) => row.status === "completed").length +
    scheduled.filter((row) => row.status === "completed").length;

  if (!plan) {
    return {
      hasPlan: false,
      planId: null,
      sessionDurationMinutes: null,
      dayId: null,
      dayName: null,
      exerciseCount: null,
      previewExercises: [],
      state: "none",
      actionHref: null,
      activeSessionId: null,
      completedSessionId: null,
      recentCompletedCount,
    };
  }

  const dayResult = await input.supabase
    .from("user_workout_plan_days")
    .select("id,day_name")
    .eq("plan_id", plan.id)
    .eq("weekday", weekdayForDate(input.date))
    .order("day_number", { ascending: true })
    .limit(MAX_MATCHING_WORKOUT_DAYS);
  const candidateDays = (assertQuery(dayResult) ?? []) as WorkoutDayRow[];

  let day: WorkoutDayRow | null = null;
  let exercises: WorkoutExerciseRow[] = [];
  if (candidateDays.length) {
    const exerciseResult = await input.supabase
      .from("user_workout_plan_exercises")
      .select("id,plan_day_id,exercise_name,sets,reps,sort_order")
      .in(
        "plan_day_id",
        candidateDays.map((candidate) => candidate.id),
      )
      .order("sort_order", { ascending: true })
      .limit(MAX_MATCHING_WORKOUT_EXERCISES);
    const candidateExercises = (assertQuery(exerciseResult) ?? []) as WorkoutExerciseRow[];
    day = classifyCandidateWorkoutActivity(
      candidateDays,
      candidateExercises,
    ).firstPopulatedDay;
    exercises = day
      ? candidateExercises.filter((exercise) => exercise.plan_day_id === day!.id)
      : [];
  }

  if (!day) {
    return {
      hasPlan: true,
      planId: plan.id,
      sessionDurationMinutes: plan.session_duration_minutes,
      dayId: null,
      dayName: null,
      exerciseCount: 0,
      previewExercises: [],
      state: "none",
      actionHref: null,
      activeSessionId: null,
      completedSessionId: null,
      recentCompletedCount,
    };
  }

  const activeResult = await input.supabase
    .from("workout_sessions")
    .select("id,plan_day_id,status,started_at,completed_at,skipped_at")
    .eq("user_id", input.userId)
    .eq("plan_day_id", day.id)
    .eq("status", "started")
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const active = assertQuery(activeResult) as WorkoutSessionRow | null;
  const legacyToday = legacy.filter(
    (row) =>
      row.plan_day_id === day!.id &&
      workoutTimestampDate(row, input.timezone) === input.date,
  );
  const scheduledToday = scheduled.filter(
    (row) => row.plan_day_id === day!.id && row.scheduled_date === input.date,
  );
  const terminal = [...scheduledToday, ...legacyToday];
  const skipped = terminal.find((row) => row.status === "skipped") ?? null;
  const completed = terminal.find((row) => row.status === "completed") ?? null;
  const state: TodayWorkoutProjection["state"] = active
    ? "active"
    : skipped
      ? "skipped"
      : completed
        ? "completed"
        : "scheduled";
  const completedSessionId = completed?.id ?? null;

  return {
    hasPlan: true,
    planId: plan.id,
    sessionDurationMinutes: plan.session_duration_minutes,
    dayId: day.id,
    dayName: day.day_name,
    exerciseCount: exercises.length,
    previewExercises: exercises.slice(0, 3).map((exercise) => ({
      id: exercise.id,
      name: exercise.exercise_name,
      sets: exercise.sets,
      reps: exercise.reps,
    })),
    state,
    actionHref: actionHref(state, day.id, completedSessionId),
    activeSessionId: active?.id ?? null,
    completedSessionId,
    recentCompletedCount,
  };
}

export async function readTodayMealsProjection(
  input: ProjectionInput,
): Promise<TodayMealsProjection> {
  const result = await input.supabase
    .from("nutrition_planned_occurrences")
    .select("id,meal_slot_key,frozen_name,frozen_snapshot,status")
    .eq("user_id", input.userId)
    .eq("plan_date", input.date)
    .order("meal_slot_key", { ascending: true })
    .order("position", { ascending: true })
    .limit(100);
  const rows = (assertQuery(result) ?? []) as unknown as MealRow[];
  const items = rows.map((row) => {
    const nutrition = snapshotNutrition(row.frozen_snapshot);
    return {
      id: row.id,
      mealSlotKey: row.meal_slot_key,
      name: row.frozen_name,
      calories: nutrition.calories,
      proteinG: nutrition.proteinG,
      status:
        row.status === "completed" ||
        row.status === "completed_changed" ||
        row.status === "skipped"
          ? row.status
          : "planned",
    } satisfies TodayMealPlanItemProjection;
  });
  return {
    items,
    itemCount: items.length,
    plannedCount: items.filter((item) => item.status === "planned").length,
  };
}

export async function readTodayNutritionLogsProjection(
  input: ProjectionInput,
): Promise<TodayNutritionLogProjection> {
  const groupResult = await input.supabase
    .from("nutrition_log_groups")
    .select("id")
    .eq("user_id", input.userId)
    .eq("log_date", input.date)
    .order("created_at", { ascending: false })
    .limit(250);
  const groups = (assertQuery(groupResult) ?? []) as unknown as NutritionGroupRow[];
  if (!groups.length) {
    return {
      totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      foodLogCount: 0,
    };
  }

  const itemResult = await input.supabase
    .from("nutrition_log_group_items")
    .select("group_id,frozen_item_snapshot")
    .eq("user_id", input.userId)
    .in(
      "group_id",
      groups.map((group) => group.id),
    )
    .order("position", { ascending: true })
    .limit(1000);
  const rows = (assertQuery(itemResult) ?? []) as unknown as NutritionGroupItemRow[];
  const totals = sumNutrition(rows.map((row) => snapshotNutrition(row.frozen_item_snapshot)));
  return { totals, foodLogCount: rows.length };
}

export async function readTodayNutritionTargetsProjection(
  input: ProjectionInput,
): Promise<TodayNutritionTargetProjection> {
  const effective = await getEffectiveNutritionTarget(
    input.supabase,
    input.userId,
    input.date,
  );
  if (!effective.available || !effective.values) {
    return {
      hasTarget: false,
      dailyCalories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      waterMl: null,
      sourceType: "none",
    };
  }
  return {
    hasTarget: true,
    dailyCalories: effective.values.calories,
    proteinG: effective.values.protein_g,
    carbsG: effective.values.carbs_g,
    fatG: effective.values.fat_g,
    waterMl: effective.values.water_ml,
    sourceType: effective.source ?? "effective_target",
  };
}

export async function readTodayHydrationProjection(
  input: ProjectionInput,
): Promise<TodayHydrationProjection> {
  const result = await input.supabase
    .from("water_logs")
    .select("amount_ml")
    .eq("user_id", input.userId)
    .eq("log_date", input.date)
    .limit(250);
  const rows = (assertQuery(result) ?? []) as Array<{ amount_ml: number }>;
  return {
    totalMl: rows.reduce((total, row) => total + nonNegative(row.amount_ml), 0),
    logCount: rows.length,
  };
}

export async function readTodayShoppingProjection(
  input: ProjectionInput,
): Promise<TodayShoppingProjection> {
  return readTodayV1ShoppingProjection({
    supabase: input.supabase,
    userId: input.userId,
    date: input.date,
  });
}

export async function readTodayHabitsProjection(
  input: ProjectionInput,
): Promise<TodayHabitProjection> {
  const result = await input.supabase
    .from("fitness_habits")
    .select("name,completed")
    .eq("user_id", input.userId)
    .eq("habit_date", input.date)
    .order("created_at", { ascending: true })
    .limit(100);
  const rows = (assertQuery(result) ?? []) as HabitRow[];
  const open = rows.filter((row) => !row.completed);
  return {
    plannedCount: rows.length,
    completedCount: rows.length - open.length,
    openCount: open.length,
    openPreviewNames: open.slice(0, 2).map((row) => row.name),
  };
}

export async function readTodaySupplementsProjection(
  input: ProjectionInput,
): Promise<TodaySupplementProjection> {
  const result = await input.supabase
    .from("supplement_logs")
    .select("name,taken_today")
    .eq("user_id", input.userId)
    .eq("supplement_date", input.date)
    .order("created_at", { ascending: true })
    .limit(100);
  const rows = (assertQuery(result) ?? []) as SupplementRow[];
  const remaining = rows.filter((row) => !row.taken_today);
  return {
    plannedCount: rows.length,
    takenCount: rows.length - remaining.length,
    remainingCount: remaining.length,
    remainingPreviewNames: remaining.slice(0, 2).map((row) => row.name),
  };
}

export async function readTodaySleepProjection(
  input: ProjectionInput,
): Promise<TodaySleepProjection> {
  const result = await input.supabase
    .from("sleep_recovery_logs")
    .select("hours_slept,recovery_level,fatigue_level")
    .eq("user_id", input.userId)
    .lte("log_date", input.date)
    .order("log_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = assertQuery(result) as SleepRow | null;
  return row
    ? {
        hasData: true,
        hoursSlept: row.hours_slept,
        recoveryLevel: row.recovery_level,
        fatigueLevel: row.fatigue_level,
        poorRecovery:
          row.recovery_level === "low" || row.fatigue_level === "high",
      }
    : {
        hasData: false,
        hoursSlept: null,
        recoveryLevel: null,
        fatigueLevel: null,
        poorRecovery: false,
      };
}

export async function readTodayProfileContextProjection(
  input: ProjectionInput,
): Promise<TodayProfileContextProjection> {
  const [onboardingResult, nutritionResult, constraintsResult] = await Promise.all([
    input.supabase
      .from("onboarding_answers")
      .select("goal,goals,primary_goal,training_level,training_place,activity_level,training_days_per_week,available_days,workout_duration_minutes,preferred_workout_time,available_equipment,nutrition_preferences")
      .eq("user_id", input.userId)
      .maybeSingle(),
    input.supabase
      .from("user_nutrition_preference_profiles")
      .select("nutrition_goal,weekly_food_budget,max_cooking_time_minutes,meal_prep_days,meal_prep_preference,cooking_skill,kitchen_equipment,preferred_cuisines,liked_foods,disliked_foods,allergy_items,dietary_restrictions,allergies,repeat_tolerance,meals_per_day,ingredient_reuse_preference,grocery_style_preference,eating_schedule,supplements,tracks_calories_or_macros")
      .eq("user_id", input.userId)
      .maybeSingle(),
    input.supabase
      .from("user_fitness_constraints")
      .select("injury_or_limitation_labels,areas_to_protect,pain_sensitive_areas,movement_restrictions,movements_to_avoid,discomfort_exercises,mobility_limitations,professional_restrictions,legacy_context_notes,nutrition_restrictions")
      .eq("user_id", input.userId)
      .maybeSingle(),
  ]);
  const onboarding = (assertQuery(onboardingResult) ?? {}) as Record<string, unknown>;
  const nutrition = assertQuery(nutritionResult) as Record<string, unknown> | null;
  const constraints = assertQuery(constraintsResult) as Record<string, unknown> | null;
  const trainingFields = [
    onboarding.training_level,
    onboarding.training_place,
    onboarding.activity_level,
    onboarding.training_days_per_week,
    onboarding.available_days,
    onboarding.workout_duration_minutes,
    onboarding.preferred_workout_time,
    onboarding.available_equipment,
  ];
  return {
    state: "loaded",
    hasGoals:
      isMeaningful(onboarding.goals) ||
      isMeaningful(onboarding.primary_goal) ||
      isMeaningful(onboarding.goal),
    hasTrainingPreferences: trainingFields.some(isMeaningful),
    hasNutritionPreferences:
      isMeaningful(onboarding.nutrition_preferences) || isMeaningful(nutrition),
    hasConstraints: isMeaningful(constraints),
  };
}

export async function readTodayProgressContextProjection(
  input: ProjectionInput,
): Promise<TodayProgressContextProjection> {
  const result = await input.supabase
    .from("progress_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId);
  if (result.error) throw result.error;
  return { state: "loaded", entryCount: result.count ?? 0 };
}

function remaining(target: number | null, consumed: number | null) {
  return target === null || consumed === null
    ? null
    : Math.max(0, target - consumed);
}

function buildPromptContext(input: {
  date: string;
  workout: TodayProjectionEnvelope<TodayWorkoutProjection>;
  meals: TodayProjectionEnvelope<TodayMealsProjection>;
  logs: TodayProjectionEnvelope<TodayNutritionLogProjection>;
  targets: TodayProjectionEnvelope<TodayNutritionTargetProjection>;
  hydration: TodayProjectionEnvelope<TodayHydrationProjection>;
  shopping: TodayProjectionEnvelope<TodayShoppingProjection>;
  habits: TodayProjectionEnvelope<TodayHabitProjection>;
  supplements: TodayProjectionEnvelope<TodaySupplementProjection>;
  sleep: TodayProjectionEnvelope<TodaySleepProjection>;
  profile: TodayProjectionEnvelope<TodayProfileContextProjection>;
  progress: TodayProjectionEnvelope<TodayProgressContextProjection>;
}): TodayPromptContextProjection {
  const workout = input.workout.state === "loaded" ? input.workout.value : null;
  const meals = input.meals.state === "loaded" ? input.meals.value : null;
  const logs = input.logs.state === "loaded" ? input.logs.value : null;
  const targets = input.targets.state === "loaded" ? input.targets.value : null;
  const hydration = input.hydration.state === "loaded" ? input.hydration.value : null;
  const shopping = input.shopping.state === "loaded" ? input.shopping.value : null;
  const habits = input.habits.state === "loaded" ? input.habits.value : null;
  const supplements = input.supplements.state === "loaded" ? input.supplements.value : null;
  const sleep = input.sleep.state === "loaded" ? input.sleep.value : null;
  const profile = input.profile.state === "loaded" ? input.profile.value : null;
  const progress = input.progress.state === "loaded" ? input.progress.value : null;
  const wellnessLoaded = Boolean(habits || supplements || sleep);

  return {
    workout: {
      state: workout ? "loaded" : "failed",
      hasPlan: workout?.hasPlan ?? null,
      scheduled: workout?.state === "scheduled",
      active: workout?.state === "active",
      completed: workout?.state === "completed",
      skipped: workout?.state === "skipped",
      title: workout?.dayName ?? null,
      exerciseCount: workout?.exerciseCount ?? null,
      durationMinutes: workout?.sessionDurationMinutes ?? null,
      historyCount: workout?.recentCompletedCount ?? null,
    },
    nutrition: {
      targetsState: targets ? "loaded" : "failed",
      foodLogsState: logs ? "loaded" : "failed",
      hasTargets: Boolean(targets?.hasTarget),
      remainingCalories:
        logs && targets?.hasTarget
          ? remaining(targets.dailyCalories, logs.totals.calories)
          : null,
      remainingProtein:
        logs && targets?.hasTarget
          ? remaining(targets.proteinG, logs.totals.proteinG)
          : null,
      remainingCarbs:
        logs && targets?.hasTarget
          ? remaining(targets.carbsG, logs.totals.carbsG)
          : null,
      remainingFat:
        logs && targets?.hasTarget
          ? remaining(targets.fatG, logs.totals.fatG)
          : null,
      foodLogCount: logs?.foodLogCount ?? null,
      mealPlanCount: meals?.itemCount ?? null,
      plannedMealCount: meals?.plannedCount ?? null,
    },
    grocery: {
      state: shopping ? "loaded" : "failed",
      itemCount: shopping?.itemCount ?? null,
    },
    hydration: {
      state: hydration ? "loaded" : "failed",
      hasTarget: targets?.waterMl !== null && targets?.waterMl !== undefined,
      logCount: hydration?.logCount ?? null,
      remainingMl:
        hydration && targets?.waterMl !== null && targets?.waterMl !== undefined
          ? remaining(targets.waterMl, hydration.totalMl)
          : null,
    },
    recovery: {
      state: sleep ? "loaded" : "failed",
      hasData: Boolean(sleep?.hasData),
      sleepHours: sleep?.hoursSlept ?? null,
      poorRecovery: Boolean(sleep?.poorRecovery),
    },
    wellness: {
      state: wellnessLoaded ? "loaded" : "failed",
      habitCount: habits?.plannedCount ?? null,
      supplementCount: supplements?.plannedCount ?? null,
    },
    progress: {
      state: progress ? "loaded" : "failed",
      entryCount: progress?.entryCount ?? null,
    },
    profile: {
      state: profile ? "loaded" : "failed",
      hasGoals: Boolean(profile?.hasGoals),
      hasTrainingPreferences: Boolean(profile?.hasTrainingPreferences),
      hasNutritionPreferences: Boolean(profile?.hasNutritionPreferences),
      hasConstraints: Boolean(profile?.hasConstraints),
    },
    endOfWeek: new Date(`${input.date}T12:00:00.000Z`).getUTCDay() === 0,
  };
}

async function timed<T>(
  timings: TodayProjectionTimings,
  name: TodayProjectionDomainName,
  reader: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await reader();
  } finally {
    timings[name] = Math.max(0, performance.now() - startedAt);
  }
}

function settledEnvelope<T>(
  result: PromiseSettledResult<T>,
  errorCode: TodayProjectionErrorCode,
): TodayProjectionEnvelope<T> {
  return result.status === "fulfilled" ? loaded(result.value) : failed(errorCode);
}

export async function readTodayProjectionV1(
  input: ProjectionInput,
): Promise<TodayProjectionReadResult> {
  const timings = Object.fromEntries(
    DOMAIN_NAMES.map((name) => [name, 0]),
  ) as TodayProjectionTimings;
  const results = await Promise.allSettled([
    timed(timings, "workout", () => readTodayWorkoutProjection(input)),
    timed(timings, "meals", () => readTodayMealsProjection(input)),
    timed(timings, "nutrition_logs", () =>
      readTodayNutritionLogsProjection(input),
    ),
    timed(timings, "nutrition_targets", () =>
      readTodayNutritionTargetsProjection(input),
    ),
    timed(timings, "hydration", () => readTodayHydrationProjection(input)),
    timed(timings, "shopping", () => readTodayShoppingProjection(input)),
    timed(timings, "habits", () => readTodayHabitsProjection(input)),
    timed(timings, "supplements", () =>
      readTodaySupplementsProjection(input),
    ),
    timed(timings, "sleep", () => readTodaySleepProjection(input)),
    timed(timings, "profile_context", () =>
      readTodayProfileContextProjection(input),
    ),
    timed(timings, "progress_context", () =>
      readTodayProgressContextProjection(input),
    ),
  ]);

  const workout = settledEnvelope(results[0], "workout_unavailable");
  const meals = settledEnvelope(results[1], "meals_unavailable");
  const logs = settledEnvelope(results[2], "nutrition_logs_unavailable");
  const targets = settledEnvelope(results[3], "nutrition_targets_unavailable");
  const hydration = settledEnvelope(results[4], "hydration_unavailable");
  const shopping = settledEnvelope(results[5], "shopping_unavailable");
  const habits = settledEnvelope(results[6], "habits_unavailable");
  const supplements = settledEnvelope(results[7], "supplements_unavailable");
  const sleep = settledEnvelope(results[8], "sleep_unavailable");
  const profile = settledEnvelope(results[9], "profile_context_unavailable");
  const progress = settledEnvelope(results[10], "progress_context_unavailable");
  const wellnessState =
    habits.state === "failed" &&
    supplements.state === "failed" &&
    sleep.state === "failed"
      ? "failed"
      : "loaded";

  const response: TodayProjectionResponseV1 = {
    contractVersion: TODAY_PROJECTION_CONTRACT_VERSION,
    date: input.date,
    timezone: input.timezone,
    generatedAt: input.now.toISOString(),
    workout,
    meals,
    nutrition: { logs, targets },
    hydration,
    shopping,
    wellness: {
      state: wellnessState,
      habits,
      supplements,
      sleep,
    },
    profileContext: profile,
    progressContext: progress,
    promptContext: buildPromptContext({
      date: input.date,
      workout,
      meals,
      logs,
      targets,
      hydration,
      shopping,
      habits,
      supplements,
      sleep,
      profile,
      progress,
    }),
  };

  return { response, timings };
}