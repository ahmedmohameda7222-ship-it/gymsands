"use client";

import { defaultExerciseInstructions } from "@/data/workouts";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { UserWorkoutPlan, UserWorkoutPlanDay, UserWorkoutPlanExercise, Weekday, Workout, WorkoutPlanDaySession } from "@/types";

const fullPlanSelect =
  "id,user_id,name,is_active,is_default,template_id,source,chatgpt_source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,session_duration_minutes,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,session_duration_minutes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,weight,rest_seconds,tempo,instructions,exercise_url,video_url,custom_video_url,block_type,sort_order,order_index,notes))";

const compatPlanSelect =
  "id,user_id,name,is_active,is_default,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes))";

const legacyPlanSelect =
  "id,user_id,name,is_active,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes))";

type RawPlanExercise = Record<string, unknown>;
type RawPlanDay = Record<string, unknown> & { user_workout_plan_exercises?: RawPlanExercise[] | null };
type RawWorkoutPlan = Record<string, unknown> & { user_workout_plan_days?: RawPlanDay[] | null };

type ExtendedWorkout = Workout & {
  block_type?: string | null;
  weight?: string | null;
  tempo?: string | null;
  order_index?: number | null;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, fallback: number | null = null) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asWeekday(value: unknown): Weekday | null {
  const weekday = nullableText(value);
  return weekday as Weekday | null;
}

function isCompatibilityError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    error?.code === "42703" ||
    error?.code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("column") ||
    message.includes("chatgpt_source") ||
    message.includes("session_duration_minutes") ||
    message.includes("block_type") ||
    message.includes("weight") ||
    message.includes("tempo") ||
    message.includes("order_index")
  );
}

function sortPlans(plans: UserWorkoutPlan[]) {
  return [...plans].sort((a, b) => {
    const activeSort = Number(Boolean(b.is_active || b.is_default)) - Number(Boolean(a.is_active || a.is_default));
    if (activeSort) return activeSort;
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
  });
}

function normalizeExercise(row: RawPlanExercise, index: number): UserWorkoutPlanExercise {
  const order = num(row.order_index, num(row.sort_order, index + 1)) ?? index + 1;
  const blockType = nullableText(row.block_type) ?? nullableText(row.category) ?? "strength";
  return {
    id: text(row.id, crypto.randomUUID()),
    plan_day_id: text(row.plan_day_id),
    workout_id: nullableText(row.workout_id),
    source_workout_id: nullableText(row.source_workout_id),
    exercise_name: text(row.exercise_name, "Exercise"),
    category: nullableText(row.category) ?? blockType,
    target_muscle: nullableText(row.target_muscle),
    equipment: nullableText(row.equipment),
    sets: num(row.sets),
    reps: nullableText(row.reps),
    rest_seconds: num(row.rest_seconds),
    instructions: nullableText(row.instructions),
    exercise_url: nullableText(row.exercise_url),
    video_url: nullableText(row.video_url),
    custom_video_url: nullableText(row.custom_video_url),
    sort_order: order,
    notes: nullableText(row.notes),
    block_type: blockType,
    weight: nullableText(row.weight),
    tempo: nullableText(row.tempo),
    order_index: order
  } as UserWorkoutPlanExercise & Record<string, unknown>;
}

function normalizeDay(row: RawPlanDay): UserWorkoutPlanDay {
  const exercises = array(row.user_workout_plan_exercises)
    .map((exercise, index) => normalizeExercise(exercise as RawPlanExercise, index))
    .sort((a, b) => ((a as UserWorkoutPlanExercise & { order_index?: number }).order_index ?? a.sort_order) - ((b as UserWorkoutPlanExercise & { order_index?: number }).order_index ?? b.sort_order));

  return {
    id: text(row.id),
    plan_id: text(row.plan_id),
    day_number: num(row.day_number, 0) ?? 0,
    day_name: text(row.day_name, "Workout day"),
    weekday: asWeekday(row.weekday),
    notes: nullableText(row.notes),
    exercises
  };
}

function normalizePlan(row: RawWorkoutPlan): UserWorkoutPlan {
  const source = nullableText(row.source) ?? (row.chatgpt_source ? "chatgpt" : "manual");
  const days = array(row.user_workout_plan_days)
    .map((day) => normalizeDay(day as RawPlanDay))
    .sort((a, b) => a.day_number - b.day_number);

  return {
    id: text(row.id),
    user_id: text(row.user_id),
    name: text(row.name, "Workout plan"),
    is_active: bool(row.is_active),
    is_default: typeof row.is_default === "boolean" ? row.is_default : bool(row.is_active),
    template_id: nullableText(row.template_id),
    source: source as UserWorkoutPlan["source"],
    match_score: num(row.match_score),
    match_explanation: nullableText(row.match_explanation),
    match_reasons: Array.isArray(row.match_reasons) ? (row.match_reasons as string[]) : [],
    program_duration_weeks: num(row.program_duration_weeks),
    days_per_week: num(row.days_per_week, days.length),
    created_at: text(row.created_at, new Date().toISOString()),
    updated_at: text(row.updated_at, text(row.created_at, new Date().toISOString())),
    days,
    chatgpt_source: bool(row.chatgpt_source),
    session_duration_minutes: num(row.session_duration_minutes)
  } as UserWorkoutPlan & Record<string, unknown>;
}

async function queryPlans(userId: string, select: string) {
  const { data, error } = await supabase!
    .from("user_workout_plans")
    .select(select)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { plans: null, error };
  return { plans: sortPlans(((data ?? []) as RawWorkoutPlan[]).map(normalizePlan)), error: null };
}

export async function getAllUserWorkoutPlans(userId: string) {
  if (!supabase || !isUuid(userId)) return [];

  for (const select of [fullPlanSelect, compatPlanSelect, legacyPlanSelect]) {
    const result = await queryPlans(userId, select);
    if (result.plans) return result.plans;
    if (!isCompatibilityError(result.error)) {
      console.warn("FitLife could not load workout plans.", result.error?.message);
      return [];
    }
  }

  return [];
}

export async function getActiveWorkoutPlan(userId: string) {
  const plans = await getAllUserWorkoutPlans(userId);
  return plans.find((plan) => plan.is_active) ?? plans.find((plan) => plan.is_default) ?? null;
}

export async function getWorkoutPlanById(userId: string, planId: string) {
  const plans = await getAllUserWorkoutPlans(userId);
  return plans.find((plan) => plan.id === planId) ?? null;
}

export function workoutFromLoadedPlanExercise(exercise: UserWorkoutPlanExercise): Workout {
  const extended = exercise as UserWorkoutPlanExercise & { block_type?: string | null; weight?: string | null; tempo?: string | null; order_index?: number | null };
  const blockType = extended.block_type ?? exercise.category ?? "strength";
  return {
    id: exercise.source_workout_id || exercise.workout_id || exercise.id,
    name: exercise.exercise_name,
    category: exercise.category || blockType || "Exercise",
    target_muscle: exercise.target_muscle || "General",
    equipment: exercise.equipment || "Varies",
    difficulty: "Beginner",
    sets: exercise.sets,
    reps: exercise.reps,
    rest_seconds: exercise.rest_seconds,
    instructions: exercise.instructions || defaultExerciseInstructions,
    notes: exercise.notes,
    muscle_category: exercise.target_muscle,
    equipment_required: exercise.equipment,
    exercise_url: exercise.exercise_url ?? null,
    video_url: exercise.custom_video_url ?? exercise.video_url ?? null,
    custom_video_url: exercise.custom_video_url ?? exercise.video_url ?? null,
    is_global: true,
    block_type: blockType,
    weight: extended.weight ?? null,
    tempo: extended.tempo ?? null,
    order_index: extended.order_index ?? exercise.sort_order
  } as ExtendedWorkout;
}

export function workoutsFromLoadedPlanDay(day: UserWorkoutPlan["days"][number] | null | undefined): Workout[] {
  return (day?.exercises ?? []).map(workoutFromLoadedPlanExercise);
}

export async function getWorkoutPlanDayById(dayId: string) {
  if (!supabase || !isUuid(dayId)) return null;
  const plans = await getAllUserWorkoutPlansFromDay(dayId);
  return plans;
}

async function getAllUserWorkoutPlansFromDay(dayId: string): Promise<WorkoutPlanDaySession | null> {
  const { data: dayRow, error: dayError } = await supabase!
    .from("user_workout_plan_days")
    .select("id,plan_id")
    .eq("id", dayId)
    .limit(1)
    .maybeSingle();

  if (dayError || !dayRow) {
    if (dayError) console.warn("FitLife could not locate workout day.", dayError.message);
    return null;
  }

  const { data: planRow, error: planError } = await supabase!
    .from("user_workout_plans")
    .select(fullPlanSelect)
    .eq("id", String(dayRow.plan_id))
    .limit(1)
    .maybeSingle();

  let plan = planRow ? normalizePlan(planRow as RawWorkoutPlan) : null;
  if (planError && isCompatibilityError(planError)) {
    const compatible = await supabase!
      .from("user_workout_plans")
      .select(compatPlanSelect)
      .eq("id", String(dayRow.plan_id))
      .limit(1)
      .maybeSingle();
    if (compatible.error) return null;
    plan = compatible.data ? normalizePlan(compatible.data as RawWorkoutPlan) : null;
  } else if (planError) {
    console.warn("FitLife could not load workout day plan.", planError.message);
    return null;
  }

  const day = plan?.days.find((item) => item.id === dayId);
  if (!day || !plan) return null;
  return {
    ...day,
    plan: {
      id: plan.id,
      user_id: plan.user_id,
      name: plan.name,
      is_active: plan.is_active,
      is_default: plan.is_default ?? plan.is_active
    }
  };
}

function looksLikeUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function exerciseInsertRow(dayId: string, workout: Workout, index: number) {
  const extended = workout as ExtendedWorkout;
  const blockType = extended.block_type ?? workout.category ?? "strength";
  const order = index + 1;
  return {
    plan_day_id: dayId,
    workout_id: null,
    source_workout_id: isUuid(workout.id) ? workout.id : null,
    exercise_name: workout.name,
    category: workout.category || blockType,
    block_type: blockType,
    target_muscle: workout.muscle_category || workout.target_muscle || null,
    equipment: workout.equipment_required || workout.equipment || null,
    sets: workout.sets ?? null,
    reps: workout.reps ?? null,
    weight: extended.weight ?? null,
    rest_seconds: workout.rest_seconds ?? null,
    tempo: extended.tempo ?? null,
    instructions: workout.instructions || defaultExerciseInstructions,
    exercise_url: workout.exercise_url || (looksLikeUrl(workout.notes) ? workout.notes : null),
    video_url: workout.video_url ?? extended.custom_video_url ?? null,
    custom_video_url: workout.custom_video_url ?? null,
    sort_order: order,
    order_index: extended.order_index ?? order,
    notes: looksLikeUrl(workout.notes) ? null : workout.notes
  };
}

function compatibleExerciseRow(row: Record<string, unknown>) {
  const { block_type: _blockType, weight: _weight, tempo: _tempo, order_index: _orderIndex, custom_video_url: _customVideoUrl, exercise_url: _exerciseUrl, ...compatible } = row;
  return compatible;
}

export async function updateLoadedWorkoutPlanDay(
  dayId: string,
  day: { dayName: string; weekday: Weekday | null; notes?: string; exercises: Workout[] }
) {
  if (!supabase || !isUuid(dayId)) return true;

  const { error: dayError } = await supabase!
    .from("user_workout_plan_days")
    .update({
      day_name: day.dayName.trim(),
      weekday: day.weekday,
      notes: day.notes?.trim() || null
    })
    .eq("id", dayId);

  if (dayError) throw dayError;

  const deleteResult = await supabase!.from("user_workout_plan_exercises").delete().eq("plan_day_id", dayId);
  if (deleteResult.error) throw deleteResult.error;

  const rows = day.exercises.map((workout, index) => exerciseInsertRow(dayId, workout, index));
  if (!rows.length) return true;

  const fullInsert = await supabase!.from("user_workout_plan_exercises").insert(rows);
  if (!fullInsert.error) return true;
  if (!isCompatibilityError(fullInsert.error)) throw fullInsert.error;

  const compatible = await supabase!.from("user_workout_plan_exercises").insert(rows.map(compatibleExerciseRow));
  if (compatible.error) throw compatible.error;
  return true;
}
