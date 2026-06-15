"use client";

import { defaultExerciseInstructions } from "@/data/workouts";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { UserWorkoutPlan, Weekday, Workout, WorkoutPlanDaySession } from "@/types";

export const weekDays: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function getCurrentWeekday(date = new Date()): Weekday {
  return weekDays[date.getDay()];
}

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function looksLikeUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function isMissingTemplateSchemaError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    error?.code === "42P01" ||
    message.includes("user_workout_sessions") ||
    message.includes("user_exercise_logs") ||
    message.includes("source") ||
    message.includes("source_workout_id") ||
    message.includes("instructions") ||
    message.includes("exercise_url") ||
    message.includes("video_url") ||
    message.includes("custom_video_url") ||
    message.includes("is_default")
  );
}

function hydrateWorkoutMetadata(workout: Workout): Workout {
  return {
    ...workout,
    muscle_category: workout.muscle_category ?? workout.target_muscle,
    equipment_required: workout.equipment_required ?? workout.equipment,
    experience_level: workout.experience_level ?? workout.difficulty,
    exercise_url: workout.exercise_url ?? (looksLikeUrl(workout.notes) ? workout.notes : null),
    secondary_muscles: workout.secondary_muscles ?? []
  };
}

export type WorkoutPlanDayInput = {
  dayName: string;
  weekday: Weekday | null;
  notes?: string;
  exercises: Workout[];
};

type RawPlanExercise = {
  id: string;
  plan_day_id: string;
  workout_id: string | null;
  source_workout_id: string | null;
  exercise_name: string;
  category: string | null;
  target_muscle: string | null;
  equipment: string | null;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  instructions?: string | null;
  exercise_url?: string | null;
  video_url?: string | null;
  custom_video_url?: string | null;
  sort_order: number;
  notes: string | null;
};

type RawPlanDay = {
  id: string;
  plan_id: string;
  day_number: number;
  day_name: string;
  weekday: Weekday | null;
  notes: string | null;
  user_workout_plan_exercises?: RawPlanExercise[] | null;
};

type RawWorkoutPlan = {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  is_default?: boolean | null;
  source?: UserWorkoutPlan["source"];
  program_duration_weeks?: number | null;
  days_per_week?: number | null;
  created_at: string;
  updated_at: string;
  user_workout_plan_days?: RawPlanDay[] | null;
};

function mapPlanExerciseToWorkout(exercise: RawPlanExercise): Workout {
  return hydrateWorkoutMetadata({
    id: exercise.source_workout_id || exercise.workout_id || exercise.id,
    name: exercise.exercise_name,
    category: exercise.category || "Exercise",
    target_muscle: exercise.target_muscle || "General",
    equipment: exercise.equipment || "Varies",
    difficulty: "Beginner",
    sets: exercise.sets,
    reps: exercise.reps,
    rest_seconds: exercise.rest_seconds,
    instructions: exercise.instructions || defaultExerciseInstructions,
    exercise_url: exercise.exercise_url ?? null,
    video_url: exercise.custom_video_url ?? exercise.video_url ?? null,
    custom_video_url: exercise.custom_video_url ?? exercise.video_url ?? null,
    notes: exercise.notes,
    is_global: true
  });
}

function normalizeWorkoutPlan(plan: RawWorkoutPlan): UserWorkoutPlan {
  return {
    id: plan.id,
    user_id: plan.user_id,
    name: plan.name,
    is_active: plan.is_active,
    is_default: plan.is_default ?? plan.is_active,
    source: plan.source ?? "manual",
    program_duration_weeks: plan.program_duration_weeks ?? null,
    days_per_week: plan.days_per_week ?? null,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    days: (plan.user_workout_plan_days ?? [])
      .map((day) => ({
        id: day.id,
        plan_id: day.plan_id,
        day_number: day.day_number,
        day_name: day.day_name,
        weekday: day.weekday,
        notes: day.notes,
        exercises: (day.user_workout_plan_exercises ?? []).sort((a, b) => a.sort_order - b.sort_order)
      }))
      .sort((a, b) => a.day_number - b.day_number)
  };
}

export async function getActiveUserWorkoutPlan(userId: string) {
  if (!canUseUserData(userId)) return null;

  const selectWithSource =
    "id,user_id,name,is_active,is_default,source,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes))";
  const selectLegacy =
    "id,user_id,name,is_active,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes))";

  const result = await supabase!
    .from("user_workout_plans")
    .select(selectWithSource)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let data: unknown = result.data;
  let error = result.error;

  if (error && isMissingTemplateSchemaError(error)) {
    const legacy = await supabase!
      .from("user_workout_plans")
      .select(selectLegacy)
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    console.warn("FitLife Hub could not load the saved workout plan.", error.message);
    return null;
  }

  return data ? normalizeWorkoutPlan(data as RawWorkoutPlan) : null;
}

export async function getDefaultUserWorkoutPlan(userId: string) {
  return getActiveUserWorkoutPlan(userId);
}

export async function getUserWorkoutPlans(userId: string) {
  if (!canUseUserData(userId)) return [];

  const selectWithSource =
    "id,user_id,name,is_active,is_default,source,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes))";
  const selectLegacy =
    "id,user_id,name,is_active,source,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes))";

  const result = await supabase!
    .from("user_workout_plans")
    .select(selectWithSource)
    .eq("user_id", userId)
    .or("source.is.null,source.eq.manual,source.eq.chatgpt,source.eq.imported")
    .order("created_at", { ascending: false });
  let data: unknown = result.data;
  let error = result.error;

  if (error && isMissingTemplateSchemaError(error)) {
    const legacy = await supabase!
      .from("user_workout_plans")
      .select(selectLegacy)
      .eq("user_id", userId)
      .or("source.is.null,source.eq.manual,source.eq.chatgpt,source.eq.imported")
      .order("created_at", { ascending: false });
    data = legacy.data as unknown;
    error = legacy.error;
  }

  if (error) {
    console.warn("FitLife Hub could not load Workout Plans.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawWorkoutPlan[]).map(normalizeWorkoutPlan);
}

export async function getUserWorkoutPlan(userId: string, planId: string) {
  if (!canUseUserData(userId) || !isUuid(planId)) return null;
  const selectWithSource =
    "id,user_id,name,is_active,is_default,source,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes))";
  const selectLegacy =
    "id,user_id,name,is_active,source,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes))";
  const result = await supabase!
    .from("user_workout_plans")
    .select(selectWithSource)
    .eq("user_id", userId)
    .eq("id", planId)
    .maybeSingle();
  let data: unknown = result.data;
  let error = result.error;
  if (error && isMissingTemplateSchemaError(error)) {
    const legacy = await supabase!
      .from("user_workout_plans")
      .select(selectLegacy)
      .eq("user_id", userId)
      .eq("id", planId)
      .maybeSingle();
    data = legacy.data as unknown;
    error = legacy.error;
  }
  if (error) {
    console.warn("FitLife Hub could not load this plan.", error.message);
    return null;
  }
  return data ? normalizeWorkoutPlan(data as unknown as RawWorkoutPlan) : null;
}

export async function setDefaultUserWorkoutPlan(userId: string, planId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");

  let clearResult = await supabase!
    .from("user_workout_plans")
    .update({ is_active: false, is_default: false })
    .eq("user_id", userId);

  if (clearResult.error && isMissingTemplateSchemaError(clearResult.error)) {
    clearResult = await supabase!.from("user_workout_plans").update({ is_active: false }).eq("user_id", userId);
  }
  if (clearResult.error) throw clearResult.error;

  let defaultResult = await supabase!
    .from("user_workout_plans")
    .update({ is_active: true, is_default: true })
    .eq("id", planId)
    .eq("user_id", userId);

  if (defaultResult.error && isMissingTemplateSchemaError(defaultResult.error)) {
    defaultResult = await supabase!
      .from("user_workout_plans")
      .update({ is_active: true })
      .eq("id", planId)
      .eq("user_id", userId);
  }
  if (defaultResult.error) throw defaultResult.error;
  return true;
}

export async function deleteUserWorkoutPlan(userId: string, planId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");

  const currentPlans = await getUserWorkoutPlans(userId);
  const deletingPlan = currentPlans.find((plan) => plan.id === planId);

  const { error } = await supabase!
    .from("user_workout_plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", userId);
  if (error) throw error;

  const shouldPromoteReplacement = Boolean(deletingPlan?.is_default ?? deletingPlan?.is_active);
  if (shouldPromoteReplacement) {
    const replacement = currentPlans.find((plan) => plan.id !== planId);
    if (replacement) await setDefaultUserWorkoutPlan(userId, replacement.id);
  }

  return true;
}

export async function getWorkoutPlanWeekOptions() {
  return { min: 1, max: 16, values: [1, 2, 3, 4, 6, 8, 10, 12, 16] };
}

export async function getWorkoutPlanDurationOptions() {
  return { min: 20, max: 90, values: [20, 30, 45, 60, 75, 90] };
}

export async function getUserWorkoutPlanDay(dayId: string) {
  if (!supabase) throw new Error("Database not connected");

  const result = await supabase!
    .from("user_workout_plan_days")
    .select(
      "id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes),user_workout_plans(id,user_id,name,is_active)"
    )
    .eq("id", dayId)
    .maybeSingle();
  let data: unknown = result.data;
  let error = result.error;

  if (error && isMissingTemplateSchemaError(error)) {
    const compatible = await supabase!
      .from("user_workout_plan_days")
      .select(
        "id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes),user_workout_plans(id,user_id,name,is_active)"
      )
      .eq("id", dayId)
      .maybeSingle();
    data = compatible.data;
    error = compatible.error;
  }

  if (error) {
    console.warn("FitLife Hub could not load this workout day.", error.message);
    throw error;
  }

  if (!data) return null;
  const row = data as unknown as RawPlanDay & { user_workout_plans?: { id: string; user_id: string; name: string; is_active: boolean; is_default?: boolean | null } | { id: string; user_id: string; name: string; is_active: boolean; is_default?: boolean | null }[] | null };
  const planRelation = Array.isArray(row.user_workout_plans) ? row.user_workout_plans[0] : row.user_workout_plans;
  return {
    id: row.id,
    plan_id: row.plan_id,
    day_number: row.day_number,
    day_name: row.day_name,
    weekday: row.weekday,
    notes: row.notes,
    exercises: (row.user_workout_plan_exercises ?? []).sort((a, b) => a.sort_order - b.sort_order),
    plan: planRelation
      ? { id: planRelation.id, user_id: planRelation.user_id, name: planRelation.name, is_active: planRelation.is_active, is_default: planRelation.is_default ?? planRelation.is_active }
      : null
  };
}

export async function updateUserWorkoutPlanDay(dayId: string, day: WorkoutPlanDayInput) {
  const cleanExercises = day.exercises.filter(Boolean);
  const cleanName = day.dayName.trim();

  if (!cleanName) throw new Error("Workout day name is required.");
  if (!cleanExercises.length) throw new Error("Add at least one exercise before saving this workout day.");

  if (!supabase) throw new Error("Database not connected");

  const { error: dayError } = await supabase!
    .from("user_workout_plan_days")
    .update({
      day_name: cleanName,
      weekday: day.weekday,
      notes: day.notes || null
    })
    .eq("id", dayId);

  if (dayError) throw dayError;

  const deleteResult = await supabase!.from("user_workout_plan_exercises").delete().eq("plan_day_id", dayId);
  if (deleteResult.error) throw deleteResult.error;

  const rows = cleanExercises.map((workout, exerciseIndex) => {
    const exerciseGuideUrl = workout.exercise_url || (looksLikeUrl(workout.notes) ? workout.notes : null);
    const customVideoUrl = workout.custom_video_url || null;
    return {
      plan_day_id: dayId,
      workout_id: null,
      source_workout_id: workout.id,
      exercise_name: workout.name,
      category: workout.category,
      target_muscle: workout.muscle_category || workout.target_muscle,
      equipment: workout.equipment_required || workout.equipment,
      sets: workout.sets ?? 3,
      reps: workout.reps ?? "8-12",
      rest_seconds: workout.rest_seconds ?? 75,
      instructions: workout.instructions || defaultExerciseInstructions,
      exercise_url: exerciseGuideUrl,
      video_url: customVideoUrl,
      custom_video_url: customVideoUrl,
      sort_order: exerciseIndex + 1,
      notes: looksLikeUrl(workout.notes) ? null : workout.notes
    };
  });

  if (!rows.length) return true;

  let { error } = await supabase!.from("user_workout_plan_exercises").insert(rows);
  if (error && isMissingTemplateSchemaError(error)) {
    const compatibleRows = rows.map(({ source_workout_id: _source, instructions: _instructions, exercise_url: _exerciseUrl, video_url: _video, custom_video_url: _customVideo, ...row }) => row);
    const compatible = await supabase!.from("user_workout_plan_exercises").insert(compatibleRows);
    error = compatible.error;
  }
  if (error) throw error;
  return true;
}

export async function createUserWorkoutPlanDay(planId: string, day: WorkoutPlanDayInput) {
  const cleanName = day.dayName.trim();
  const cleanExercises = day.exercises.filter(Boolean);
  if (!cleanName) throw new Error("Workout day name is required.");
  if (!supabase || !isUuid(planId)) {
    return {
      id: crypto.randomUUID(),
      plan_id: planId,
      day_number: 1,
      day_name: cleanName,
      weekday: day.weekday,
      notes: day.notes || null,
      exercises: []
    } as UserWorkoutPlan["days"][number];
  }

  const { data: existingDays, error: countError } = await supabase!
    .from("user_workout_plan_days")
    .select("day_number")
    .eq("plan_id", planId)
    .order("day_number", { ascending: false })
    .limit(1);
  if (countError) throw countError;
  const nextDayNumber = Number(existingDays?.[0]?.day_number ?? 0) + 1;

  const { data: savedDay, error: dayError } = await supabase!
    .from("user_workout_plan_days")
    .insert({
      plan_id: planId,
      day_number: nextDayNumber,
      day_name: cleanName,
      weekday: day.weekday,
      notes: day.notes || null
    })
    .select("id,plan_id,day_number,day_name,weekday,notes")
    .single();
  if (dayError) throw dayError;

  if (cleanExercises.length) {
    const rows = cleanExercises.map((workout, exerciseIndex) => {
      const exerciseGuideUrl = workout.exercise_url || (looksLikeUrl(workout.notes) ? workout.notes : null);
      const customVideoUrl = workout.custom_video_url || null;
      return {
        plan_day_id: savedDay.id,
        workout_id: null,
        source_workout_id: workout.id,
        exercise_name: workout.name,
        category: workout.category,
        target_muscle: workout.muscle_category || workout.target_muscle,
        equipment: workout.equipment_required || workout.equipment,
        sets: workout.sets ?? 3,
        reps: workout.reps ?? "8-12",
        rest_seconds: workout.rest_seconds ?? 75,
        instructions: workout.instructions || defaultExerciseInstructions,
        exercise_url: exerciseGuideUrl,
        video_url: customVideoUrl,
        custom_video_url: customVideoUrl,
        sort_order: exerciseIndex + 1,
        notes: looksLikeUrl(workout.notes) ? null : workout.notes
      };
    });
    let { error: exerciseError } = await supabase!.from("user_workout_plan_exercises").insert(rows);
    if (exerciseError && isMissingTemplateSchemaError(exerciseError)) {
      const compatibleRows = rows.map(({ source_workout_id: _source, instructions: _instructions, exercise_url: _exerciseUrl, video_url: _video, custom_video_url: _customVideo, ...row }) => row);
      const compatible = await supabase!.from("user_workout_plan_exercises").insert(compatibleRows);
      exerciseError = compatible.error;
    }
    if (exerciseError) throw exerciseError;
  }

  return {
    ...(savedDay as Omit<UserWorkoutPlan["days"][number], "exercises">),
    exercises: []
  };
}

export async function createUserWorkoutPlan({
  userId,
  planName,
  days
}: {
  userId: string;
  planName: string;
  days: WorkoutPlanDayInput[];
}) {
  const cleanDays = days
    .map((day) => ({
      ...day,
      dayName: day.dayName.trim(),
      exercises: day.exercises.filter(Boolean)
    }))
    .filter((day) => day.dayName && day.weekday && day.exercises.length);

  if (!planName.trim()) throw new Error("Plan name is required.");
  if (!cleanDays.length) throw new Error("Add at least one weekday with one workout.");

  if (!canUseUserData(userId)) throw new Error("User session invalid");

  let inactiveResult = await supabase!
    .from("user_workout_plans")
    .update({ is_active: false, is_default: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (inactiveResult.error && isMissingTemplateSchemaError(inactiveResult.error)) {
    inactiveResult = await supabase!
      .from("user_workout_plans")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);
  }

  if (inactiveResult.error) throw inactiveResult.error;

  let { data: plan, error: planError } = await supabase!
    .from("user_workout_plans")
    .insert({ user_id: userId, name: planName.trim(), is_active: true, is_default: true })
    .select("id")
    .single();

  if (planError && isMissingTemplateSchemaError(planError)) {
    const compatible = await supabase!
      .from("user_workout_plans")
      .insert({ user_id: userId, name: planName.trim(), is_active: true })
      .select("id")
      .single();
    plan = compatible.data;
    planError = compatible.error;
  }

  if (planError) throw planError;
  if (!plan) throw new Error("Workout plan could not be created.");

  for (let dayIndex = 0; dayIndex < cleanDays.length; dayIndex += 1) {
    const day = cleanDays[dayIndex];
    const { data: savedDay, error: dayError } = await supabase!
      .from("user_workout_plan_days")
      .insert({
        plan_id: plan.id,
        day_number: dayIndex + 1,
        day_name: day.dayName,
        weekday: day.weekday,
        notes: day.notes || null
      })
      .select("id")
      .single();

    if (dayError) throw dayError;

    const exerciseRows = day.exercises.map((workout, exerciseIndex) => {
      const exerciseGuideUrl = workout.exercise_url || (looksLikeUrl(workout.notes) ? workout.notes : null);
      const customVideoUrl = workout.custom_video_url || null;
      return {
        plan_day_id: savedDay.id,
        workout_id: null,
        source_workout_id: workout.id,
        exercise_name: workout.name,
        category: workout.category,
        target_muscle: workout.muscle_category || workout.target_muscle,
        equipment: workout.equipment_required || workout.equipment,
        sets: workout.sets ?? 3,
        reps: workout.reps ?? "8-12",
        rest_seconds: workout.rest_seconds ?? 75,
        instructions: workout.instructions || defaultExerciseInstructions,
        exercise_url: exerciseGuideUrl,
        video_url: customVideoUrl,
        custom_video_url: customVideoUrl,
        sort_order: exerciseIndex + 1,
        notes: looksLikeUrl(workout.notes) ? null : workout.notes
      };
    });

    let { error: exercisesError } = await supabase!.from("user_workout_plan_exercises").insert(exerciseRows);
    if (exercisesError && isMissingTemplateSchemaError(exercisesError)) {
      const compatibleRows = exerciseRows.map(({ source_workout_id: _source, instructions: _instructions, exercise_url: _exerciseUrl, video_url: _video, custom_video_url: _customVideo, ...row }) => row);
      const compatible = await supabase!.from("user_workout_plan_exercises").insert(compatibleRows);
      exercisesError = compatible.error;
    }
    if (exercisesError) throw exercisesError;
  }

  return plan;
}

export function workoutsFromPlanDay(day: UserWorkoutPlan["days"][number] | null | undefined): Workout[] {
  return (day?.exercises ?? []).map((exercise) => mapPlanExerciseToWorkout(exercise as RawPlanExercise));
}
