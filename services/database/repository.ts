"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid, todayIso } from "@/lib/utils";
import { egyptianFoods } from "@/data/egyptian-foods";
import { defaultExerciseInstructions, sampleExerciseVideos, sampleWorkouts } from "@/data/workouts";
import type {
  ExerciseVideo,
  FoodItem,
  FoodLog,
  OnboardingAnswers,
  ProgressEntry,
  ExerciseLog,
  UserWorkoutPlan,
  Weekday,
  WelcomeSettings,
  Workout,
  WorkoutPlanDaySession,
  WorkoutSession,
  WorkoutSessionSummary
} from "@/types";
import { scaleFoodMacros } from "@/services/nutrition/calculations";

function mockDelay<T>(value: T) {
  return Promise.resolve(value);
}

const workoutPageSize = 60;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function looksLikeUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export const weekDays: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function getCurrentWeekday(date = new Date()): Weekday {
  return weekDays[date.getDay()];
}

export function getDefaultFoodCategories() {
  return Array.from(new Set(egyptianFoods.map((food) => food.category).filter(Boolean))).sort() as string[];
}

function withTimeout<T>(request: PromiseLike<T>, fallback: T, label: string, timeoutMs = 4500) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`${label} timed out, using fallback.`);
      resolve(fallback);
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(request), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function localFoods(query = "") {
  const normalized = normalizeText(query);
  return egyptianFoods.filter((food) => normalizeText(food.food_name).includes(normalized));
}

function mapVideoToWorkout(video: ExerciseVideo): Workout {
  return {
    id: video.id,
    name: video.exercise_name,
    category: video.category_type ?? "Exercise",
    target_muscle: video.category ?? "General",
    equipment: video.category_type === "Equipment" ? video.category ?? "Varies" : "Varies",
    difficulty: "Beginner",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: video.instructions || defaultExerciseInstructions,
    notes: video.exercise_url,
    is_global: video.is_global
  };
}

function dedupeWorkouts(workouts: Workout[]) {
  const seen = new Set<string>();
  return workouts.filter((workout) => {
    const key = `${normalizeText(workout.name)}-${normalizeText(workout.target_muscle)}-${normalizeText(workout.equipment)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function localWorkoutCategories() {
  return Array.from(
    new Set([
      ...sampleWorkouts.map((workout) => workout.target_muscle),
      ...sampleExerciseVideos.map((video) => video.category).filter(Boolean)
    ])
  ).sort() as string[];
}

function localWorkouts(query = "", category?: string) {
  const normalized = normalizeText(query);
  return dedupeWorkouts([
    ...sampleWorkouts,
    ...sampleExerciseVideos.map(mapVideoToWorkout)
  ]).filter((workout) => {
    const matchesCategory =
      !category ||
      workout.category === category ||
      workout.target_muscle === category ||
      workout.equipment === category;
    const matchesQuery =
      !normalized ||
      normalizeText(workout.name).includes(normalized) ||
      normalizeText(workout.target_muscle).includes(normalized) ||
      normalizeText(workout.equipment).includes(normalized);
    return matchesCategory && matchesQuery;
  });
}

export async function getFoodCategories() {
  const fallback = getDefaultFoodCategories();
  if (!supabase) return mockDelay(fallback);

  const request = supabase
    .from("food_items")
    .select("category")
    .eq("is_global", true)
    .not("category", "is", null)
    .limit(250)
    .then(({ data, error }) => {
      if (error) {
        console.warn("S&S Gym could not load food categories, using local fallback.", error.message);
        return fallback;
      }

      const values = Array.from(new Set((data ?? []).map((item) => item.category).filter(Boolean))).sort() as string[];
      return values.length ? values : fallback;
    });

  return withTimeout(request, fallback, "Food categories");
}

export async function getGlobalFoods(
  query = "",
  options: { category?: string; limit?: number } = {}
) {
  const limit = options.limit ?? 36;
  const category = options.category;
  const fallback = localFoods(query)
    .filter((food) => !category || food.category === category)
    .slice(0, limit);

  if (!supabase) {
    return mockDelay(fallback);
  }

  let request = supabase
    .from("food_items")
    .select("*")
    .eq("is_global", true)
    .order("food_name")
    .limit(limit);

  if (category) request = request.eq("category", category);
  if (query) request = request.ilike("food_name", `%${query}%`);

  const { data, error } = await request;
  if (error) {
    console.warn("S&S Gym could not load Supabase foods, using local fallback.", error.message);
    return fallback;
  }
  return ((data?.length ? data : fallback) ?? []) as FoodItem[];
}

export async function getCalorieTargets(userId: string) {
  const fallback = { daily_calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 70, water_ml: 2500 };
  if (!supabase) return mockDelay(fallback);

  const { data, error } = await supabase
    .from("calorie_targets")
    .select("daily_calories,protein_g,carbs_g,fat_g,water_ml")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("S&S Gym could not load calorie targets.", error.message);
    return fallback;
  }

  return data ?? fallback;
}

export async function upsertCalorieTargets({
  userId,
  dailyCalories,
  proteinG,
  carbsG,
  fatG,
  waterMl = 2500
}: {
  userId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl?: number;
}) {
  const payload = {
    user_id: userId,
    daily_calories: dailyCalories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    water_ml: waterMl
  };

  if (!supabase) return mockDelay(payload);

  const { data, error } = await supabase
    .from("calorie_targets")
    .upsert(payload, { onConflict: "user_id" })
    .select("daily_calories,protein_g,carbs_g,fat_g,water_ml")
    .single();

  if (error) throw error;
  return data;
}

export async function getTodayFoodLogs(userId: string, date = todayIso()) {
  if (!supabase) return mockDelay<FoodLog[]>([]);
  const { data, error } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("S&S Gym could not load today's food logs.", error.message);
    return [];
  }
  return (data ?? []) as FoodLog[];
}

export async function addGlobalFoodToToday({
  userId,
  food,
  quantity,
  mealType = "Meal"
}: {
  userId: string;
  food: FoodItem;
  quantity: number;
  mealType?: string;
}) {
  const macros = scaleFoodMacros(food, quantity);
  const payload = {
    user_id: userId,
    food_item_id: isUuid(food.id) ? food.id : null,
    user_food_item_id: null,
    log_date: todayIso(),
    meal_type: mealType,
    food_name: food.food_name,
    serving_size: food.serving_size,
    quantity,
    calories: macros.calories,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    notes: null
  };

  if (!supabase) return mockDelay(payload as FoodLog);
  const { data, error } = await supabase.from("food_logs").insert(payload).select("*").single();
  if (error) {
    console.warn("S&S Gym could not add this food log.", error.message);
    throw error;
  }
  return data as FoodLog;
}

export async function addCustomFoodLog(payload: Omit<FoodLog, "id">) {
  if (!supabase) return mockDelay({ ...payload, id: crypto.randomUUID() } as FoodLog);
  const { data, error } = await supabase.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return data as FoodLog;
}

export async function updateFoodLogQuantity(log: FoodLog, quantity: number) {
  const unit = {
    calories: log.calories / log.quantity,
    protein_g: log.protein_g / log.quantity,
    carbs_g: log.carbs_g / log.quantity,
    fat_g: log.fat_g / log.quantity
  };
  const macros = scaleFoodMacros(unit, quantity);
  if (!supabase) return mockDelay({ ...log, quantity, ...macros });
  const { data, error } = await supabase
    .from("food_logs")
    .update({ quantity, ...macros })
    .eq("id", log.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as FoodLog;
}

export async function deleteFoodLog(id: string) {
  if (!supabase) return mockDelay(true);
  const { error } = await supabase.from("food_logs").delete().eq("id", id);
  if (error) {
    console.warn("S&S Gym could not delete this food log.", error.message);
    throw error;
  }
  return true;
}

export async function copyYesterdaysMeals(userId: string) {
  if (!supabase) return mockDelay<FoodLog[]>([]);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const { data, error } = await supabase.from("food_logs").select("*").eq("user_id", userId).eq("log_date", yesterday.toISOString().slice(0, 10));
  if (error) {
    console.warn("S&S Gym could not copy yesterday's meals.", error.message);
    return [];
  }
  const copies = (data ?? []).map(({ id: _id, created_at: _created, ...log }) => ({ ...log, log_date: todayIso() }));
  if (!copies.length) return [];
  const inserted = await supabase.from("food_logs").insert(copies).select("*");
  if (inserted.error) throw inserted.error;
  return inserted.data as FoodLog[];
}

export async function getWorkoutCategories() {
  if (!supabase) return mockDelay(localWorkoutCategories());

  const [workoutResult, videoResult] = await Promise.all([
    supabase.from("workouts").select("category,target_muscle,equipment").eq("is_global", true).limit(5000),
    supabase.from("exercise_videos").select("category,category_type").eq("is_global", true).limit(5000)
  ]);

  if (workoutResult.error || videoResult.error) {
    console.warn(
      "S&S Gym could not load workout categories, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return localWorkoutCategories();
  }

  const categories = new Set<string>();
  workoutResult.data?.forEach((workout) => {
    if (workout.target_muscle) categories.add(workout.target_muscle);
    if (workout.equipment) categories.add(workout.equipment);
  });
  videoResult.data?.forEach((video) => {
    if (video.category) categories.add(video.category);
  });

  const values = Array.from(categories).filter(Boolean).sort();
  return values.length ? values : localWorkoutCategories();
}

export async function getWorkouts(
  query = "",
  filters?: { category?: string; equipment?: string; difficulty?: string },
  page = 0
) {
  const selectedCategory = filters?.category || filters?.equipment;
  if (!supabase) {
    return mockDelay(localWorkouts(query, selectedCategory).slice(page * workoutPageSize, (page + 1) * workoutPageSize));
  }

  const from = page * workoutPageSize;
  const to = from + workoutPageSize - 1;

  let workoutRequest = supabase.from("workouts").select("*").eq("is_global", true).order("name").range(from, to);
  if (selectedCategory) {
    workoutRequest = workoutRequest.or(`category.eq.${selectedCategory},target_muscle.eq.${selectedCategory},equipment.eq.${selectedCategory}`);
  } else if (query) {
    workoutRequest = workoutRequest.or(`name.ilike.%${query}%,target_muscle.ilike.%${query}%,equipment.ilike.%${query}%`);
  }
  if (filters?.difficulty) workoutRequest = workoutRequest.eq("difficulty", filters.difficulty);

  let videoRequest = supabase.from("exercise_videos").select("*").eq("is_global", true).order("exercise_name").range(from, to);
  if (selectedCategory) videoRequest = videoRequest.eq("category", selectedCategory);
  if (query) videoRequest = videoRequest.ilike("exercise_name", `%${query}%`);

  const [workoutResult, videoResult] = await Promise.all([workoutRequest, videoRequest]);
  if (workoutResult.error || videoResult.error) {
    console.warn(
      "S&S Gym could not load Supabase workouts, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return localWorkouts(query, selectedCategory).slice(from, to + 1);
  }

  const normalizedQuery = normalizeText(query);
  const directWorkouts = ((workoutResult.data ?? []) as Workout[]).filter(
    (workout) =>
      !normalizedQuery ||
      normalizeText(workout.name).includes(normalizedQuery) ||
      normalizeText(workout.target_muscle).includes(normalizedQuery) ||
      normalizeText(workout.equipment).includes(normalizedQuery)
  );
  const videoWorkouts = ((videoResult.data ?? []) as ExerciseVideo[]).map(mapVideoToWorkout);
  return dedupeWorkouts([...directWorkouts, ...videoWorkouts]);
}

export async function getWorkout(id: string) {
  const local = localWorkouts("").find((workout) => workout.id === id) ?? sampleWorkouts[0];
  if (!supabase) return mockDelay(local);

  const workoutResult = await supabase.from("workouts").select("*").eq("id", id).maybeSingle();
  if (workoutResult.error) {
    console.warn("S&S Gym could not load workout from workouts table.", workoutResult.error.message);
  }
  if (workoutResult.data) return workoutResult.data as Workout;

  const videoResult = await supabase.from("exercise_videos").select("*").eq("id", id).maybeSingle();
  if (videoResult.error) {
    console.warn("S&S Gym could not load workout from exercise videos.", videoResult.error.message);
    return local;
  }
  return videoResult.data ? mapVideoToWorkout(videoResult.data as ExerciseVideo) : local;
}

export async function getExerciseVideos(query = "") {
  if (!supabase) return mockDelay(sampleExerciseVideos);
  let request = supabase.from("exercise_videos").select("*").order("exercise_name").limit(100);
  if (query) request = request.ilike("exercise_name", `%${query}%`);
  const { data, error } = await request;
  if (error) {
    console.warn("S&S Gym could not load exercise videos, using local fallback.", error.message);
    return sampleExerciseVideos.filter((video) => normalizeText(video.exercise_name).includes(normalizeText(query)));
  }
  return (data ?? []) as ExerciseVideo[];
}

export async function startWorkoutSession(userId: string, workout: Workout) {
  const payload = {
    user_id: userId,
    workout_id: isUuid(workout.id) ? workout.id : null,
    workout_name: workout.name,
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_minutes: null,
    notes: null,
    status: "started"
  };
  if (!supabase) return mockDelay({ ...payload, id: crypto.randomUUID() } as WorkoutSession);
  const { data, error } = await supabase.from("workout_sessions").insert(payload).select("*").single();
  if (error) {
    console.warn("S&S Gym could not start a Supabase workout session.", error.message);
    return { ...payload, id: crypto.randomUUID() } as WorkoutSession;
  }
  return data as WorkoutSession;
}

export async function startWorkoutDaySession(userId: string, day: WorkoutPlanDaySession) {
  const payload = {
    user_id: userId,
    workout_id: null,
    plan_id: day.plan_id,
    plan_day_id: day.id,
    workout_day_name: day.day_name,
    workout_name: day.weekday ? `${day.day_name} - ${day.weekday}` : day.day_name,
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_minutes: null,
    notes: null,
    status: "started"
  };
  if (!supabase) return mockDelay({ ...payload, id: crypto.randomUUID() } as WorkoutSession);
  const { data, error } = await supabase.from("workout_sessions").insert(payload).select("*").single();
  if (error) {
    console.warn("S&S Gym could not start a workout day session.", error.message);
    throw error;
  }
  return data as WorkoutSession;
}

export type WorkoutSetLogInput = {
  planExerciseId?: string | null;
  exerciseName: string;
  plannedSets?: number | null;
  plannedReps?: string | null;
  plannedRestSeconds?: number | null;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  notes?: string | null;
  completedAt?: string | null;
};

export async function saveWorkoutSetLogs(sessionId: string, logs: WorkoutSetLogInput[]) {
  if (!supabase) return mockDelay(true);
  const deleteResult = await supabase.from("exercise_logs").delete().eq("workout_session_id", sessionId);
  if (deleteResult.error) throw deleteResult.error;

  const rows = logs.map((log) => ({
    workout_session_id: sessionId,
    plan_exercise_id: log.planExerciseId ?? null,
    exercise_name: log.exerciseName,
    planned_sets: log.plannedSets ?? null,
    planned_reps: log.plannedReps ?? null,
    planned_rest_seconds: log.plannedRestSeconds ?? null,
    set_number: log.setNumber,
    reps: log.reps,
    weight_kg: log.weightKg,
    notes: log.notes ?? null,
    completed_at: log.completedAt ?? null
  }));

  if (!rows.length) return true;
  const { error } = await supabase.from("exercise_logs").insert(rows);
  if (error) throw error;
  return true;
}

export async function completeWorkoutSession(sessionId: string, notes: string, durationMinutes: number) {
  if (!supabase) return mockDelay(true);
  const { error } = await supabase
    .from("workout_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString(), notes, duration_minutes: durationMinutes })
    .eq("id", sessionId);
  if (error) {
    console.warn("S&S Gym could not complete this workout session.", error.message);
    throw error;
  }
  return true;
}

export async function getWorkoutHistory(userId: string) {
  if (!supabase) return mockDelay<WorkoutSession[]>([]);
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(10);
  if (error) {
    console.warn("S&S Gym could not load workout history.", error.message);
    return [];
  }
  return (data ?? []) as WorkoutSession[];
}

export async function getWorkoutHistoryDetailed(userId: string) {
  if (!supabase) return mockDelay<WorkoutSessionSummary[]>([]);
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*, exercise_logs(*)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(12);
  if (error) {
    console.warn("S&S Gym could not load workout history details.", error.message);
    return [];
  }
  return ((data ?? []) as WorkoutSessionSummary[]).map((session) => ({
    ...session,
    exercise_logs: [...(session.exercise_logs ?? [])].sort((a, b) => {
      if (a.exercise_name !== b.exercise_name) return a.exercise_name.localeCompare(b.exercise_name);
      return a.set_number - b.set_number;
    })
  }));
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
  video_url?: string | null;
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
  created_at: string;
  updated_at: string;
  user_workout_plan_days?: RawPlanDay[] | null;
};

function mapPlanExerciseToWorkout(exercise: RawPlanExercise): Workout {
  return {
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
    notes: exercise.video_url || exercise.notes,
    is_global: true
  };
}

function normalizeWorkoutPlan(plan: RawWorkoutPlan): UserWorkoutPlan {
  return {
    id: plan.id,
    user_id: plan.user_id,
    name: plan.name,
    is_active: plan.is_active,
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
  if (!supabase) return mockDelay<UserWorkoutPlan | null>(null);

  const { data, error } = await supabase
    .from("user_workout_plans")
    .select(
      "id,user_id,name,is_active,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes))"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("S&S Gym could not load the saved workout plan.", error.message);
    return null;
  }

  return data ? normalizeWorkoutPlan(data as RawWorkoutPlan) : null;
}


export async function getUserWorkoutPlanDay(dayId: string) {
  if (!supabase) return mockDelay<WorkoutPlanDaySession | null>(null);

  const { data, error } = await supabase
    .from("user_workout_plan_days")
    .select(
      "id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes),user_workout_plans(id,user_id,name)"
    )
    .eq("id", dayId)
    .maybeSingle();

  if (error) {
    console.warn("S&S Gym could not load this workout day.", error.message);
    throw error;
  }

  if (!data) return null;
  const row = data as unknown as RawPlanDay & { user_workout_plans?: { id: string; user_id: string; name: string } | { id: string; user_id: string; name: string }[] | null };
  const planRelation = Array.isArray(row.user_workout_plans) ? row.user_workout_plans[0] : row.user_workout_plans;
  return {
    id: row.id,
    plan_id: row.plan_id,
    day_number: row.day_number,
    day_name: row.day_name,
    weekday: row.weekday,
    notes: row.notes,
    exercises: (row.user_workout_plan_exercises ?? []).sort((a, b) => a.sort_order - b.sort_order),
    plan: planRelation ? { id: planRelation.id, user_id: planRelation.user_id, name: planRelation.name } : null
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

  if (!supabase) {
    return mockDelay({ id: crypto.randomUUID(), name: planName, days: cleanDays });
  }

  const inactiveResult = await supabase
    .from("user_workout_plans")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (inactiveResult.error) throw inactiveResult.error;

  const { data: plan, error: planError } = await supabase
    .from("user_workout_plans")
    .insert({ user_id: userId, name: planName.trim(), is_active: true })
    .select("id")
    .single();

  if (planError) throw planError;

  for (let dayIndex = 0; dayIndex < cleanDays.length; dayIndex += 1) {
    const day = cleanDays[dayIndex];
    const { data: savedDay, error: dayError } = await supabase
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

    const exerciseRows = day.exercises.map((workout, exerciseIndex) => ({
      plan_day_id: savedDay.id,
      workout_id: null,
      source_workout_id: workout.id,
      exercise_name: workout.name,
      category: workout.category,
      target_muscle: workout.target_muscle,
      equipment: workout.equipment,
      sets: workout.sets ?? 3,
      reps: workout.reps ?? "8-12",
      rest_seconds: workout.rest_seconds ?? 75,
      instructions: workout.instructions || defaultExerciseInstructions,
      video_url: looksLikeUrl(workout.notes) ? workout.notes : null,
      sort_order: exerciseIndex + 1,
      notes: looksLikeUrl(workout.notes) ? null : workout.notes
    }));

    const { error: exercisesError } = await supabase.from("user_workout_plan_exercises").insert(exerciseRows);
    if (exercisesError) throw exercisesError;
  }

  return plan;
}

export function workoutsFromPlanDay(day: UserWorkoutPlan["days"][number] | null | undefined): Workout[] {
  return (day?.exercises ?? []).map((exercise) => mapPlanExerciseToWorkout(exercise as RawPlanExercise));
}


export async function saveOnboarding(answers: OnboardingAnswers) {
  if (!supabase) return mockDelay(answers);
  const { data, error } = await supabase.from("onboarding_answers").upsert(answers, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  return data as OnboardingAnswers;
}

export async function getOnboarding(userId: string) {
  if (!supabase) return mockDelay<OnboardingAnswers | null>(null);
  const { data, error } = await supabase.from("onboarding_answers").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as OnboardingAnswers | null;
}

export async function getProgressEntries(userId: string) {
  if (!supabase) return mockDelay<ProgressEntry[]>([]);
  const { data, error } = await supabase
    .from("progress_entries")
    .select("*")
    .eq("user_id", userId)
    .order("entry_date", { ascending: true });
  if (error) {
    console.warn("S&S Gym could not load progress entries.", error.message);
    return [];
  }
  return (data ?? []) as ProgressEntry[];
}

export async function addProgressEntry(
  entry: Omit<ProgressEntry, "id">,
  photos?: File[],
  measurements?: Record<string, number | null>
) {
  if (!supabase) return mockDelay({ ...entry, id: crypto.randomUUID() } as ProgressEntry);
  const client = supabase;
  const { data, error } = await client.from("progress_entries").insert(entry).select("*").single();
  if (error) throw error;

  if (photos?.length) {
    await Promise.all(
      photos.map(async (photo) => {
        const path = `${entry.user_id}/${data.id}/${crypto.randomUUID()}-${photo.name}`;
        const upload = await client.storage.from("progress-photos").upload(path, photo, { upsert: false });
        if (upload.error) throw upload.error;
        const { error: photoError } = await client.from("progress_photos").insert({
          user_id: entry.user_id,
          progress_entry_id: data.id,
          storage_path: path
        });
        if (photoError) throw photoError;
      })
    );
  }

  if (measurements && Object.values(measurements).some((value) => value !== null)) {
    const { error: measurementError } = await client.from("body_measurements").insert({
      user_id: entry.user_id,
      progress_entry_id: data.id,
      measured_at: entry.entry_date,
      ...measurements
    });
    if (measurementError) throw measurementError;
  }

  return data as ProgressEntry;
}

export async function getWelcomeSettings(userId: string): Promise<WelcomeSettings> {
  const fallback: WelcomeSettings = {
    popup_enabled: true,
    show_frequency: "once_per_day",
    default_message: "Welcome back to S&S Gym. Ready for today?"
  };
  if (!supabase) return fallback;

  const [settingsResult, customResult] = await Promise.all([
    supabase.from("admin_settings").select("value").eq("key", "welcome_settings").maybeSingle(),
    supabase.from("user_welcome_messages").select("message,popup_enabled,show_frequency").eq("user_id", userId).eq("is_active", true).maybeSingle()
  ]);

  if (settingsResult.error || customResult.error) {
    console.warn(
      "S&S Gym could not load welcome settings.",
      settingsResult.error?.message || customResult.error?.message
    );
    return fallback;
  }

  const settings = settingsResult.data;
  const custom = customResult.data;
  const parsed = (settings?.value as WelcomeSettings | null) ?? fallback;
  return {
    ...parsed,
    default_message: custom?.message ?? parsed.default_message,
    popup_enabled: custom?.popup_enabled ?? parsed.popup_enabled,
    show_frequency: custom?.show_frequency ?? parsed.show_frequency
  };
}

export async function adminUpsertWelcomeMessage(payload: {
  user_id: string;
  message: string;
  popup_enabled: boolean;
  show_frequency: "every_login" | "once_per_day";
}) {
  if (!supabase) return mockDelay(payload);
  const { data, error } = await supabase.from("user_welcome_messages").upsert({ ...payload, is_active: true }, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  return data;
}

export async function adminListUsers() {
  if (!supabase) {
    return mockDelay([
      { id: "mock-user", email: "member@ssgym.test", full_name: "S&S Gym Member", role: "admin" }
    ]);
  }
  const { data, error } = await supabase.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: false });
  if (error) {
    console.warn("S&S Gym could not load admin users.", error.message);
    return [];
  }
  return data ?? [];
}

export async function adminUpdateUserRole(userId: string, role: "member" | "admin") {
  if (!supabase) return mockDelay(true);
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw error;
  return true;
}

export async function adminUpsertGlobalFood(food: Partial<FoodItem>) {
  if (!supabase) return mockDelay(food);
  const { data, error } = await supabase
    .from("food_items")
    .upsert({ ...food, is_global: true, is_editable_by_user: false, cuisine: food.cuisine ?? "Egyptian" })
    .select("*")
    .single();
  if (error) throw error;
  return data as FoodItem;
}

export async function adminUpsertWorkout(workout: Partial<Workout>) {
  if (!supabase) return mockDelay(workout);
  const { data, error } = await supabase.from("workouts").upsert({ ...workout, is_global: true }).select("*").single();
  if (error) throw error;
  return data as Workout;
}

export async function adminUpsertExerciseVideo(video: Partial<ExerciseVideo>) {
  if (!supabase) return mockDelay(video);
  const { data, error } = await supabase.from("exercise_videos").upsert({ ...video, is_global: true }).select("*").single();
  if (error) throw error;
  return data as ExerciseVideo;
}

export async function adminUpdateWelcomeSettings(settings: WelcomeSettings) {
  if (!supabase) return mockDelay(settings);
  const { data, error } = await supabase
    .from("admin_settings")
    .upsert({ key: "welcome_settings", value: settings }, { onConflict: "key" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function adminImportExerciseVideos(rows: Omit<ExerciseVideo, "id" | "is_global">[]) {
  if (!supabase) return mockDelay(rows.length);
  const importResult = await supabase.from("workout_video_imports").insert({ imported_count: rows.length, status: "queued" }).select("id").single();
  if (importResult.error) throw importResult.error;
  const { error } = await supabase.from("exercise_videos").upsert(
    rows.map((row) => ({
      ...row,
      is_global: true,
      source: row.source ?? "admin_import"
    })),
    { onConflict: "exercise_name,category_type,category" }
  );
  if (error) throw error;
  await supabase.from("workout_video_imports").update({ status: "completed" }).eq("id", importResult.data.id);
  return rows.length;
}
