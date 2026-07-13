"use client";

import { defaultExerciseInstructions } from "@/data/workouts";
import { isIsoDate, todayIso } from "@/lib/date-utils";
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
  archived_at?: string | null;
};

type RawPlanDay = {
  id: string;
  plan_id: string;
  day_number: number;
  day_name: string;
  weekday: Weekday | null;
  notes: string | null;
  archived_at?: string | null;
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
  archived_at?: string | null;
  user_workout_plan_days?: RawPlanDay[] | null;
};

function workoutExercisePayload(workout: Workout, exerciseIndex: number) {
  const extended = workout as Workout & {
    block_type?: string | null;
    weight?: string | null;
    tempo?: string | null;
  };
  const exerciseGuideUrl = workout.exercise_url || (looksLikeUrl(workout.notes) ? workout.notes : null);
  const customVideoUrl = workout.custom_video_url || null;
  return {
    id: workout.plan_exercise_id && isUuid(workout.plan_exercise_id) ? workout.plan_exercise_id : undefined,
    source_workout_id:
      isUuid(workout.id) && workout.id !== workout.plan_exercise_id ? workout.id : null,
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
    block_type: extended.block_type ?? workout.category ?? "strength",
    weight: extended.weight ?? null,
    tempo: extended.tempo ?? null,
    sort_order: exerciseIndex + 1,
    order_index: exerciseIndex + 1,
    notes: looksLikeUrl(workout.notes) ? null : workout.notes
  };
}

function workoutDayPayload(day: WorkoutPlanDayInput) {
  return {
    day_name: day.dayName.trim(),
    weekday: day.weekday,
    notes: day.notes?.trim() || null,
    exercises: day.exercises.filter(Boolean).map(workoutExercisePayload)
  };
}

async function authenticatedUserId() {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user || !isUuid(data.user.id)) throw new Error("User session invalid");
  return data.user.id;
}

function mapPlanExerciseToWorkout(exercise: RawPlanExercise): Workout {
  return hydrateWorkoutMetadata({
    id: exercise.source_workout_id || exercise.workout_id || exercise.id,
    plan_exercise_id: exercise.id,
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
    archived_at: plan.archived_at ?? null,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    days: (plan.user_workout_plan_days ?? [])
      .filter((day) => !day.archived_at)
      .map((day) => ({
        id: day.id,
        plan_id: day.plan_id,
        day_number: day.day_number,
        day_name: day.day_name,
        weekday: day.weekday,
        notes: day.notes,
        exercises: (day.user_workout_plan_exercises ?? [])
          .filter((exercise) => !exercise.archived_at)
          .sort((a, b) => a.sort_order - b.sort_order)
      }))
      .sort((a, b) => a.day_number - b.day_number)
  };
}

export async function getActiveUserWorkoutPlan(userId: string) {
  if (!canUseUserData(userId)) return null;

  const selectWithSource =
    "id,user_id,name,is_active,is_default,source,program_duration_weeks,days_per_week,created_at,updated_at,archived_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,archived_at,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes,archived_at))";
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
    console.warn("Plaivra could not load the saved workout plan.", error.message);
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
    "id,user_id,name,is_active,is_default,source,program_duration_weeks,days_per_week,created_at,updated_at,archived_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,archived_at,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes,archived_at))";
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
    console.warn("Plaivra could not load Workout Plans.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawWorkoutPlan[]).map(normalizeWorkoutPlan);
}

export async function getUserWorkoutPlan(userId: string, planId: string) {
  if (!canUseUserData(userId) || !isUuid(planId)) return null;
  const selectWithSource =
    "id,user_id,name,is_active,is_default,source,program_duration_weeks,days_per_week,created_at,updated_at,archived_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,archived_at,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes,archived_at))";
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
    console.warn("Plaivra could not load this plan.", error.message);
    return null;
  }
  return data ? normalizeWorkoutPlan(data as unknown as RawWorkoutPlan) : null;
}

export async function setDefaultUserWorkoutPlan(userId: string, planId: string, scheduleStartDate = todayIso()) {
  if (!canUseUserData(userId) || !isUuid(planId)) throw new Error("User session invalid");
  if (!isIsoDate(scheduleStartDate)) throw new Error("Schedule start date must use YYYY-MM-DD.");
  const { error } = await supabase!.rpc("activate_workout_plan_atomic", {
    p_user_id: userId,
    p_plan_id: planId,
    p_schedule_start_date: scheduleStartDate,
    p_expected_updated_at: null
  });
  if (error) throw error;
  return true;
}

export async function deleteUserWorkoutPlan(userId: string, planId: string, scheduleStartDate = todayIso()) {
  if (!canUseUserData(userId) || !isUuid(planId)) throw new Error("User session invalid");
  if (!isIsoDate(scheduleStartDate)) throw new Error("Schedule start date must use YYYY-MM-DD.");
  const { error } = await supabase!.rpc("delete_workout_plan_atomic", {
    p_user_id: userId,
    p_plan_id: planId,
    p_confirmed: true,
    p_schedule_start_date: scheduleStartDate
  });
  if (error) throw error;
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
      "id,plan_id,day_number,day_name,weekday,notes,archived_at,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes,archived_at),user_workout_plans(id,user_id,name,is_active,archived_at)"
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
    console.warn("Plaivra could not load this workout day.", error.message);
    throw error;
  }

  if (!data) return null;
  const row = data as unknown as RawPlanDay & { user_workout_plans?: { id: string; user_id: string; name: string; is_active: boolean; is_default?: boolean | null; archived_at?: string | null } | { id: string; user_id: string; name: string; is_active: boolean; is_default?: boolean | null; archived_at?: string | null }[] | null };
  if (row.archived_at) return null;
  const planRelation = Array.isArray(row.user_workout_plans) ? row.user_workout_plans[0] : row.user_workout_plans;
  if (planRelation?.archived_at) return null;
  return {
    id: row.id,
    plan_id: row.plan_id,
    day_number: row.day_number,
    day_name: row.day_name,
    weekday: row.weekday,
    notes: row.notes,
    exercises: (row.user_workout_plan_exercises ?? [])
      .filter((exercise) => !exercise.archived_at)
      .sort((a, b) => a.sort_order - b.sort_order),
    plan: planRelation
      ? { id: planRelation.id, user_id: planRelation.user_id, name: planRelation.name, is_active: planRelation.is_active, is_default: planRelation.is_default ?? planRelation.is_active }
      : null
  };
}

export async function updateUserWorkoutPlanDay(dayId: string, day: WorkoutPlanDayInput, scheduleStartDate = todayIso()) {
  const cleanExercises = day.exercises.filter(Boolean);
  const cleanName = day.dayName.trim();

  if (!cleanName) throw new Error("Workout day name is required.");
  if (!cleanExercises.length) throw new Error("Add at least one exercise before saving this workout day.");

  if (!supabase || !isUuid(dayId)) throw new Error("Database not connected");
  if (!isIsoDate(scheduleStartDate)) throw new Error("Schedule start date must use YYYY-MM-DD.");
  const userId = await authenticatedUserId();
  const { error } = await supabase.rpc("save_workout_plan_day_atomic", {
    p_user_id: userId,
    p_day_id: dayId,
    p_day: workoutDayPayload({ ...day, dayName: cleanName, exercises: cleanExercises }),
    p_schedule_start_date: scheduleStartDate,
    p_expected_updated_at: null,
    p_rebuild_schedule: true
  });
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
  goal,
  description,
  programDurationWeeks,
  sessionDurationMinutes,
  startDate,
  days
}: {
  userId: string;
  planName: string;
  goal?: string | null;
  description?: string | null;
  programDurationWeeks?: number | null;
  sessionDurationMinutes?: number | null;
  startDate?: string | null;
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
  const scheduleStartDate = startDate ?? todayIso();
  if (!isIsoDate(scheduleStartDate)) throw new Error("Schedule start date must use YYYY-MM-DD.");

  const { data: plan, error: planError } = await supabase!.rpc("create_workout_plan_atomic", {
    p_user_id: userId,
    p_plan: {
      name: planName.trim(),
      source: "manual",
      goal: goal?.trim() || null,
      description: description?.trim() || null,
      program_duration_weeks: programDurationWeeks ?? null,
      session_duration_minutes: sessionDurationMinutes ?? null,
      days_per_week: cleanDays.length,
      days: cleanDays.map(workoutDayPayload)
    },
    p_activate: true,
    p_schedule_start_date: scheduleStartDate
  });
  if (planError) throw planError;
  if (!plan) throw new Error("Workout plan could not be created.");
  return plan as { id: string };
}

export function workoutsFromPlanDay(day: UserWorkoutPlan["days"][number] | null | undefined): Workout[] {
  return (day?.exercises ?? []).map((exercise) => mapPlanExerciseToWorkout(exercise as RawPlanExercise));
}

export async function getUserWorkoutPlanExerciseDetail(userId: string, exerciseId: string) {
  if (!supabase || !isUuid(userId) || !isUuid(exerciseId)) return null;
  const fullSelect = "id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes,archived_at";
  const fullResult = await supabase
    .from("user_workout_plan_exercises")
    .select(fullSelect)
    .eq("id", exerciseId)
    .maybeSingle();
  let exercise = fullResult.data as unknown as RawPlanExercise | null;
  let error = fullResult.error;
  if (error && isMissingTemplateSchemaError(error)) {
    const compatible = await supabase
      .from("user_workout_plan_exercises")
      .select("id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes")
      .eq("id", exerciseId)
      .maybeSingle();
    exercise = compatible.data as unknown as RawPlanExercise | null;
    error = compatible.error;
  }
  if (error) throw error;
  if (!exercise || exercise.archived_at) return null;

  const rawExercise = exercise as unknown as RawPlanExercise;
  const { data: day, error: dayError } = await supabase
    .from("user_workout_plan_days")
    .select("id,plan_id,day_name,archived_at")
    .eq("id", rawExercise.plan_day_id)
    .maybeSingle();
  if (dayError) throw dayError;
  if (!day || day.archived_at) return null;
  const { data: plan, error: planError } = await supabase
    .from("user_workout_plans")
    .select("id,user_id,name,archived_at")
    .eq("id", day.plan_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan || plan.archived_at) return null;

  return {
    exercise: mapPlanExerciseToWorkout(rawExercise),
    dayName: day.day_name,
    planName: plan.name
  };
}
