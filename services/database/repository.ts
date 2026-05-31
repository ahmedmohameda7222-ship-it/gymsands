"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid, todayIso } from "@/lib/utils";
import { egyptianFoods } from "@/data/egyptian-foods";
import muscleStrengthExercisesData from "@/data/muscle-strength-exercises.json";
import { defaultExerciseInstructions, sampleExerciseVideos, sampleWorkouts } from "@/data/workouts";
import type {
  BodyMeasurement,
  ExerciseMetadata,
  ExerciseVideo,
  FoodItem,
  FoodLog,
  GeneratedWorkoutPlan,
  MealPlanItem,
  MealType,
  OnboardingAnswers,
  Profile,
  ProgressEntry,
  ExerciseLog,
  UserExerciseLog,
  UserWorkoutSession,
  UserWorkoutPlan,
  Weekday,
  WelcomeSettings,
  Workout,
  WorkoutTemplate,
  WorkoutPlanDaySession,
  WorkoutSession,
  WorkoutSessionSummary
} from "@/types";
import { scaleFoodMacros } from "@/services/nutrition/calculations";

function mockDelay<T>(value: T) {
  return Promise.resolve(value);
}

const workoutPageSize = 60;
const skippedNotePrefix = "[skipped]";
const muscleStrengthExercises = muscleStrengthExercisesData as ExerciseMetadata[];

export type WorkoutFilters = {
  category?: string;
  categories?: string[];
  equipment?: string;
  equipmentRequired?: string[];
  difficulty?: string;
  experienceLevels?: string[];
  mechanics?: string[];
  forceTypes?: string[];
  secondaryMuscles?: string[];
};

export type WorkoutFilterOptions = {
  muscleCategories: string[];
  equipmentRequired: string[];
  mechanics: string[];
  forceTypes: string[];
  experienceLevels: string[];
  secondaryMuscles: string[];
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b)
  );
}

function splitList(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  if (!value || value.toLowerCase() === "none") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && item.toLowerCase() !== "none");
}

function hasAnySelected(values: Array<string | null | undefined>, selected: string[] | undefined) {
  if (!selected?.length) return true;
  const normalizedValues = values.map(normalizeText).filter(Boolean);
  return selected.some((item) => normalizedValues.includes(normalizeText(item)));
}

function looksLikeUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export const weekDays: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMealType(value: string | null | undefined): MealType {
  return mealTypes.includes(value as MealType) ? (value as MealType) : "Breakfast";
}

function summarizeWorkoutCategory(
  day: { exercises?: Array<{ category?: string | null; target_muscle?: string | null; equipment?: string | null }> } | null | undefined
) {
  const categories = new Set(
    (day?.exercises ?? [])
      .map((exercise) => exercise.category || exercise.target_muscle || exercise.equipment)
      .filter(Boolean)
  );
  const values = Array.from(categories) as string[];
  if (!values.length) return "Workout";
  return values.slice(0, 2).join(", ");
}

type SkipWorkoutDayInput = {
  id: string;
  plan_id?: string | null;
  planId?: string | null;
  day_name?: string;
  dayName?: string;
  weekday: Weekday | null;
  exercises: Array<{ category?: string | null; target_muscle?: string | null; equipment?: string | null }>;
};

function skipDayName(day: SkipWorkoutDayInput) {
  return day.day_name || day.dayName || "Workout day";
}

function skipDayPlanId(day: SkipWorkoutDayInput) {
  return day.plan_id ?? day.planId ?? null;
}

function isSchemaCompatibilityError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    message.includes("workout_category") ||
    message.includes("skipped") ||
    message.includes("skipped_at") ||
    message.includes("exercise_category") ||
    message.includes("exercise_order") ||
    message.includes("invalid input value for enum")
  );
}

function isMissingTemplateSchemaError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    error?.code === "42P01" ||
    message.includes("workout_templates") ||
    message.includes("user_workout_sessions") ||
    message.includes("user_exercise_logs") ||
    message.includes("template_id") ||
    message.includes("source") ||
    message.includes("source_workout_id") ||
    message.includes("instructions") ||
    message.includes("video_url")
  );
}

function markSkippedNote(notes = "") {
  return `${skippedNotePrefix}${notes ? ` ${notes}` : ""}`.trim();
}

function normalizeWorkoutSession(session: WorkoutSession): WorkoutSession {
  if (session.status === "skipped" || session.notes?.startsWith(skippedNotePrefix)) {
    return {
      ...session,
      status: "skipped",
      skipped_at: session.skipped_at ?? session.completed_at ?? session.started_at,
      notes: session.notes?.startsWith(skippedNotePrefix)
        ? session.notes.replace(skippedNotePrefix, "").trim() || null
        : session.notes
    };
  }
  return session;
}

function generatedSessionDate(session: UserWorkoutSession) {
  return session.completed_at || session.skipped_at || session.started_at || `${session.scheduled_date}T00:00:00.000Z`;
}

function mapGeneratedSessionToWorkoutSession(session: UserWorkoutSession): WorkoutSession {
  const date = generatedSessionDate(session);
  return {
    id: session.id,
    user_id: session.user_id,
    workout_id: null,
    plan_id: session.user_workout_plan_id,
    plan_day_id: session.plan_day_id,
    workout_day_name: session.day_title,
    workout_category: "Generated plan",
    workout_name: session.day_title,
    started_at: session.started_at || date,
    completed_at: session.completed_at,
    skipped_at: session.skipped_at,
    duration_minutes: session.duration_minutes,
    notes: session.notes,
    status: session.status === "skipped" ? "skipped" : session.status === "completed" ? "completed" : "started"
  };
}

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

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

function findExerciseMetadata(name: string | null | undefined) {
  const normalized = normalizeText(name);
  return muscleStrengthExercises.find((exercise) => normalizeText(exercise.exercise_name) === normalized) ?? null;
}

function mapMetadataToWorkout(exercise: ExerciseMetadata): Workout {
  const secondaryMuscles = splitList(exercise.secondary_muscles);
  return {
    id: exercise.id,
    name: exercise.exercise_name,
    category: exercise.mechanics || "Exercise",
    target_muscle: exercise.muscle_category || "General",
    equipment: exercise.equipment_required || "Varies",
    difficulty: exercise.experience_level || "Beginner",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: defaultExerciseInstructions,
    notes: exercise.exercise_url,
    muscle_category: exercise.muscle_category,
    equipment_required: exercise.equipment_required,
    mechanics: exercise.mechanics,
    force_type: exercise.force_type,
    experience_level: exercise.experience_level,
    secondary_muscles: secondaryMuscles,
    exercise_url: exercise.exercise_url,
    video_url: null,
    is_global: true
  };
}

function mapMetadataToVideo(exercise: ExerciseMetadata): ExerciseVideo {
  return {
    id: exercise.id,
    exercise_name: exercise.exercise_name,
    category_type: "Muscle Category",
    category: exercise.muscle_category,
    exercise_url: exercise.exercise_url,
    video_url: null,
    instructions: defaultExerciseInstructions,
    source: "muscle_strength_exercise_metadata_csv",
    muscle_category: exercise.muscle_category,
    equipment_required: exercise.equipment_required,
    mechanics: exercise.mechanics,
    force_type: exercise.force_type,
    experience_level: exercise.experience_level,
    secondary_muscles: splitList(exercise.secondary_muscles),
    is_global: true
  };
}

function hydrateWorkoutMetadata(workout: Workout): Workout {
  const metadata = findExerciseMetadata(workout.name);
  if (!metadata) {
    return {
      ...workout,
      muscle_category: workout.muscle_category ?? workout.target_muscle,
      equipment_required: workout.equipment_required ?? workout.equipment,
      experience_level: workout.experience_level ?? workout.difficulty,
      exercise_url: workout.exercise_url ?? (looksLikeUrl(workout.notes) ? workout.notes : null),
      secondary_muscles: workout.secondary_muscles ?? []
    };
  }

  const secondaryMuscles = splitList(metadata.secondary_muscles);
  return {
    ...workout,
    target_muscle: workout.target_muscle || metadata.muscle_category,
    equipment: workout.equipment || metadata.equipment_required,
    difficulty: workout.difficulty || metadata.experience_level,
    notes: workout.notes ?? metadata.exercise_url,
    muscle_category: workout.muscle_category ?? metadata.muscle_category,
    equipment_required: workout.equipment_required ?? metadata.equipment_required,
    mechanics: workout.mechanics ?? metadata.mechanics,
    force_type: workout.force_type ?? metadata.force_type,
    experience_level: workout.experience_level ?? metadata.experience_level,
    secondary_muscles: workout.secondary_muscles ?? secondaryMuscles,
    exercise_url: workout.exercise_url ?? metadata.exercise_url
  };
}

function mapVideoToWorkout(video: ExerciseVideo): Workout {
  const metadata = findExerciseMetadata(video.exercise_name);
  return {
    id: video.id,
    name: video.exercise_name,
    category: metadata?.mechanics ?? video.category_type ?? "Exercise",
    target_muscle: metadata?.muscle_category ?? video.muscle_category ?? video.category ?? "General",
    equipment: metadata?.equipment_required ?? video.equipment_required ?? (video.category_type === "Equipment" ? video.category ?? "Varies" : "Varies"),
    difficulty: metadata?.experience_level ?? video.experience_level ?? "Beginner",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: video.instructions || defaultExerciseInstructions,
    notes: video.exercise_url,
    muscle_category: metadata?.muscle_category ?? video.muscle_category ?? video.category,
    equipment_required: metadata?.equipment_required ?? video.equipment_required ?? null,
    mechanics: metadata?.mechanics ?? video.mechanics ?? null,
    force_type: metadata?.force_type ?? video.force_type ?? null,
    experience_level: metadata?.experience_level ?? video.experience_level ?? "Beginner",
    secondary_muscles: metadata ? splitList(metadata.secondary_muscles) : video.secondary_muscles ?? [],
    exercise_url: video.exercise_url,
    video_url: video.video_url,
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

function dedupeExerciseVideos(videos: ExerciseVideo[]) {
  const seen = new Set<string>();
  return videos.filter((video) => {
    const key = `${normalizeText(video.exercise_name)}-${normalizeText(video.category)}-${normalizeText(video.exercise_url)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function localWorkoutCategories() {
  return Array.from(
    new Set([
      ...sampleWorkouts.map((workout) => workout.target_muscle),
      ...sampleExerciseVideos.map((video) => video.category).filter(Boolean),
      ...muscleStrengthExercises.map((exercise) => exercise.muscle_category),
      ...muscleStrengthExercises.map((exercise) => exercise.equipment_required)
    ])
  ).sort() as string[];
}

function getLocalWorkoutFilterOptions(): WorkoutFilterOptions {
  return {
    muscleCategories: uniqueSorted(muscleStrengthExercises.map((exercise) => exercise.muscle_category)),
    equipmentRequired: uniqueSorted(muscleStrengthExercises.map((exercise) => exercise.equipment_required)),
    mechanics: uniqueSorted(muscleStrengthExercises.map((exercise) => exercise.mechanics)),
    forceTypes: uniqueSorted(muscleStrengthExercises.map((exercise) => exercise.force_type)),
    experienceLevels: uniqueSorted(muscleStrengthExercises.map((exercise) => exercise.experience_level)),
    secondaryMuscles: uniqueSorted(muscleStrengthExercises.flatMap((exercise) => splitList(exercise.secondary_muscles)))
  };
}

function matchesWorkoutFilters(workout: Workout, query = "", filters: WorkoutFilters = {}) {
  const normalized = normalizeText(query);
  const muscleCategories = filters.categories ?? (filters.category ? [filters.category] : []);
  const equipmentRequired = filters.equipmentRequired ?? (filters.equipment ? [filters.equipment] : []);
  const experienceLevels = filters.experienceLevels ?? (filters.difficulty ? [filters.difficulty] : []);
  const secondaryMuscles = workout.secondary_muscles ?? [];

  const matchesQuery =
    !normalized ||
    [
      workout.name,
      workout.target_muscle,
      workout.equipment,
      workout.category,
      workout.mechanics,
      workout.force_type,
      workout.experience_level,
      ...(secondaryMuscles ?? [])
    ].some((value) => normalizeText(value).includes(normalized));

  return (
    matchesQuery &&
    hasAnySelected([workout.muscle_category, workout.target_muscle, workout.category], muscleCategories) &&
    hasAnySelected([workout.equipment_required, workout.equipment], equipmentRequired) &&
    hasAnySelected([workout.mechanics, workout.category], filters.mechanics) &&
    hasAnySelected([workout.force_type], filters.forceTypes) &&
    hasAnySelected([workout.experience_level, workout.difficulty], experienceLevels) &&
    hasAnySelected(secondaryMuscles, filters.secondaryMuscles)
  );
}

function localWorkouts(query = "", filters: WorkoutFilters = {}) {
  const normalized = normalizeText(query);
  const source = dedupeWorkouts([
    ...muscleStrengthExercises.map(mapMetadataToWorkout),
    ...sampleWorkouts.map(hydrateWorkoutMetadata),
    ...sampleExerciseVideos.map(mapVideoToWorkout)
  ]);
  return source.filter((workout) => matchesWorkoutFilters(workout, normalized, filters));
}

export async function getFoodCategories() {
  const fallback = getDefaultFoodCategories();
  if (!supabase) return mockDelay(fallback);

  const request = supabase!
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

  let request = supabase!
    .from("food_items")
    .select("*")
    .eq("is_global", true)
    .order("food_name")
    .limit(limit);

  if (category) request = request.eq("category", category);
  if (query) request = request.ilike("food_name", `%${query}%`);

  const result = await withTimeout(
    request.then(({ data, error }) => {
      if (error) {
        console.warn("S&S Gym could not load Supabase foods, using local fallback.", error.message);
        return fallback;
      }
      return ((data?.length ? data : fallback) ?? []) as FoodItem[];
    }),
    fallback,
    "Foods",
    3500
  );

  return result;
}

export async function getCalorieTargets(userId: string) {
  const fallback = { daily_calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 70, water_ml: 2500 };
  if (!canUseUserData(userId)) return mockDelay(fallback);

  const { data, error } = await supabase!
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

  if (!canUseUserData(userId)) return mockDelay(payload);

  const { data, error } = await supabase!
    .from("calorie_targets")
    .upsert(payload, { onConflict: "user_id" })
    .select("daily_calories,protein_g,carbs_g,fat_g,water_ml")
    .single();

  if (error) throw error;
  return data;
}

export async function getTodayFoodLogs(userId: string, date = todayIso()) {
  if (!canUseUserData(userId)) return mockDelay<FoodLog[]>([]);
  const { data, error } = await supabase!
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
  mealType = "Breakfast"
}: {
  userId: string;
  food: FoodItem;
  quantity: number;
  mealType?: string;
}) {
  const macros = scaleFoodMacros(food, quantity);
  const safeMealType = normalizeMealType(mealType);
  const payload = {
    user_id: userId,
    food_item_id: isUuid(food.id) ? food.id : null,
    user_food_item_id: null,
    log_date: todayIso(),
    meal_type: safeMealType,
    food_name: food.food_name,
    serving_size: food.serving_size,
    quantity,
    calories: macros.calories,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    notes: null
  };

  if (!canUseUserData(userId)) return mockDelay({ ...payload, id: crypto.randomUUID() } as FoodLog);
  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
  if (error) {
    console.warn("S&S Gym could not add this food log.", error.message);
    throw error;
  }
  return data as FoodLog;
}


export async function getTodayMealPlanItems(userId: string, date = todayIso()) {
  if (!canUseUserData(userId)) return mockDelay<MealPlanItem[]>([]);
  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", date)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("S&S Gym could not load today's meal plan.", error.message);
    return [];
  }

  return (data ?? []) as MealPlanItem[];
}

export async function addFoodToMealPlan({
  userId,
  food,
  quantity,
  mealType = "Breakfast"
}: {
  userId: string;
  food: FoodItem;
  quantity: number;
  mealType?: MealType;
}) {
  const macros = scaleFoodMacros(food, quantity);
  const safeMealType = normalizeMealType(mealType);
  const payload = {
    user_id: userId,
    plan_date: todayIso(),
    meal_type: safeMealType,
    food_item_id: isUuid(food.id) ? food.id : null,
    user_food_item_id: null,
    food_name: food.food_name,
    serving_size: food.serving_size,
    quantity,
    calories: macros.calories,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    status: "planned",
    food_log_id: null,
    completed_at: null,
    notes: null
  };

  if (!canUseUserData(userId)) return mockDelay({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as MealPlanItem);

  const { data, error } = await supabase!.from("user_meal_plan_items").insert(payload).select("*").single();
  if (error) {
    console.warn("S&S Gym could not add this food to My Meal Plan.", error.message);
    throw error;
  }
  return data as MealPlanItem;
}

export async function markMealPlanItemDone(item: MealPlanItem) {
  if (item.status === "done") return { item, log: null as FoodLog | null };

  const logPayload = {
    user_id: item.user_id,
    food_item_id: item.food_item_id,
    user_food_item_id: item.user_food_item_id,
    log_date: item.plan_date,
    meal_type: item.meal_type,
    food_name: item.food_name,
    serving_size: item.serving_size,
    quantity: item.quantity,
    calories: item.calories,
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
    notes: item.notes
  };

  if (!supabase) {
    const log = { ...logPayload, id: crypto.randomUUID() } as FoodLog;
    return {
      item: { ...item, status: "done", food_log_id: log.id, completed_at: new Date().toISOString() } as MealPlanItem,
      log
    };
  }

  const inserted = await supabase!.from("food_logs").insert(logPayload).select("*").single();
  if (inserted.error) throw inserted.error;

  const updated = await supabase!
    .from("user_meal_plan_items")
    .update({ status: "done", food_log_id: inserted.data.id, completed_at: new Date().toISOString() })
    .eq("id", item.id)
    .select("*")
    .single();

  if (updated.error) throw updated.error;
  return { item: updated.data as MealPlanItem, log: inserted.data as FoodLog };
}

export async function deleteMealPlanItem(item: MealPlanItem) {
  if (!canUseUserData(item.user_id)) return mockDelay(true);

  if (item.food_log_id) {
    const logDelete = await supabase!.from("food_logs").delete().eq("id", item.food_log_id).eq("user_id", item.user_id);
    if (logDelete.error) throw logDelete.error;
  }

  const { error } = await supabase!.from("user_meal_plan_items").delete().eq("id", item.id);
  if (error) throw error;
  return true;
}

export async function updateMealPlanItem(
  item: MealPlanItem,
  patch: { mealType?: MealType; quantity?: number; notes?: string | null }
) {
  const previousQuantity = Math.max(0.1, toNumber(item.quantity, 1));
  const nextQuantity = Math.max(0.1, toNumber(patch.quantity ?? item.quantity, previousQuantity));
  const ratio = nextQuantity / previousQuantity;
  const macros = {
    calories: Math.round(toNumber(item.calories) * ratio),
    protein_g: Math.round(toNumber(item.protein_g) * ratio * 10) / 10,
    carbs_g: Math.round(toNumber(item.carbs_g) * ratio * 10) / 10,
    fat_g: Math.round(toNumber(item.fat_g) * ratio * 10) / 10
  };
  const payload = {
    meal_type: normalizeMealType(patch.mealType ?? item.meal_type),
    quantity: nextQuantity,
    ...macros,
    notes: patch.notes ?? item.notes ?? null
  };

  if (!canUseUserData(item.user_id)) {
    return mockDelay({ ...item, ...payload, updated_at: new Date().toISOString() } as MealPlanItem);
  }

  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .update(payload)
    .eq("id", item.id)
    .eq("user_id", item.user_id)
    .select("*")
    .single();
  if (error) throw error;

  if (item.food_log_id) {
    const logUpdate = await supabase!
      .from("food_logs")
      .update({
        meal_type: payload.meal_type,
        quantity: payload.quantity,
        calories: payload.calories,
        protein_g: payload.protein_g,
        carbs_g: payload.carbs_g,
        fat_g: payload.fat_g,
        notes: payload.notes
      })
      .eq("id", item.food_log_id)
      .eq("user_id", item.user_id);
    if (logUpdate.error) console.warn("S&S Gym could not sync the linked calorie log.", logUpdate.error.message);
  }

  return data as MealPlanItem;
}

export async function addCustomFoodLog(payload: Omit<FoodLog, "id">) {
  if (!canUseUserData(payload.user_id)) return mockDelay({ ...payload, id: crypto.randomUUID() } as FoodLog);
  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
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
  const { data, error } = await supabase!
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
  const { error } = await supabase!.from("food_logs").delete().eq("id", id);
  if (error) {
    console.warn("S&S Gym could not delete this food log.", error.message);
    throw error;
  }
  return true;
}

export async function copyYesterdaysMeals(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<FoodLog[]>([]);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const { data, error } = await supabase!.from("food_logs").select("*").eq("user_id", userId).eq("log_date", yesterday.toISOString().slice(0, 10));
  if (error) {
    console.warn("S&S Gym could not copy yesterday's meals.", error.message);
    return [];
  }
  const copies = (data ?? []).map(({ id: _id, created_at: _created, ...log }) => ({ ...log, log_date: todayIso() }));
  if (!copies.length) return [];
  const inserted = await supabase!.from("food_logs").insert(copies).select("*");
  if (inserted.error) throw inserted.error;
  return inserted.data as FoodLog[];
}

export async function getWorkoutCategories() {
  const fallback = localWorkoutCategories();
  if (!supabase) return mockDelay(fallback);

  const [workoutResult, videoResult] = await Promise.all([
    supabase!.from("workouts").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercise_videos").select("*").eq("is_global", true).limit(5000)
  ]);

  if (workoutResult.error || videoResult.error) {
    console.warn(
      "S&S Gym could not load workout categories, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return fallback;
  }

  const categories = new Set<string>();
  workoutResult.data?.forEach((workout) => {
    if (workout.muscle_category) categories.add(workout.muscle_category);
    if (workout.equipment_required) categories.add(workout.equipment_required);
    if (workout.target_muscle) categories.add(workout.target_muscle);
    if (workout.equipment) categories.add(workout.equipment);
  });
  videoResult.data?.forEach((video) => {
    if (video.muscle_category) categories.add(video.muscle_category);
    if (video.equipment_required) categories.add(video.equipment_required);
    if (video.category) categories.add(video.category);
  });
  fallback.forEach((value) => categories.add(value));

  const values = Array.from(categories).filter(Boolean).sort();
  return values.length ? values : fallback;
}

export async function getWorkoutFilterOptions() {
  const fallback = getLocalWorkoutFilterOptions();
  if (!supabase) return mockDelay(fallback);

  const [workoutResult, videoResult] = await Promise.all([
    supabase!.from("workouts").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercise_videos").select("*").eq("is_global", true).limit(5000)
  ]);

  if (workoutResult.error || videoResult.error) {
    console.warn(
      "S&S Gym could not load workout filter metadata, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return fallback;
  }

  const workouts = ((workoutResult.data ?? []) as Workout[]).map(hydrateWorkoutMetadata);
  const videos = ((videoResult.data ?? []) as ExerciseVideo[]).map(mapVideoToWorkout);
  const all = [...workouts, ...videos, ...muscleStrengthExercises.map(mapMetadataToWorkout)];

  return {
    muscleCategories: uniqueSorted([...fallback.muscleCategories, ...all.map((item) => item.muscle_category ?? item.target_muscle)]),
    equipmentRequired: uniqueSorted([...fallback.equipmentRequired, ...all.map((item) => item.equipment_required ?? item.equipment)]),
    mechanics: uniqueSorted([...fallback.mechanics, ...all.map((item) => item.mechanics ?? item.category)]),
    forceTypes: uniqueSorted([...fallback.forceTypes, ...all.map((item) => item.force_type)]),
    experienceLevels: uniqueSorted([...fallback.experienceLevels, ...all.map((item) => item.experience_level ?? item.difficulty)]),
    secondaryMuscles: uniqueSorted([...fallback.secondaryMuscles, ...all.flatMap((item) => item.secondary_muscles ?? [])])
  };
}

export async function getWorkouts(
  query = "",
  filters: WorkoutFilters = {},
  page = 0
) {
  const selectedCategory = filters.category || filters.equipment || filters.categories?.[0] || filters.equipmentRequired?.[0];
  const localMatches = localWorkouts(query, filters);
  const from = page * workoutPageSize;
  const to = from + workoutPageSize - 1;

  if (!supabase) {
    return mockDelay(localMatches.slice(from, to + 1));
  }

  let workoutRequest = supabase!.from("workouts").select("*").eq("is_global", true).order("name").limit(1200);
  if (query) {
    workoutRequest = workoutRequest.or(`name.ilike.%${query}%,target_muscle.ilike.%${query}%,equipment.ilike.%${query}%`);
  }

  let videoRequest = supabase!.from("exercise_videos").select("*").eq("is_global", true).order("exercise_name").limit(1200);
  if (selectedCategory) videoRequest = videoRequest.eq("category", selectedCategory);
  if (query) videoRequest = videoRequest.ilike("exercise_name", `%${query}%`);

  const [workoutResult, videoResult] = await Promise.all([workoutRequest, videoRequest]);
  if (workoutResult.error || videoResult.error) {
    console.warn(
      "S&S Gym could not load Supabase workouts, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return localMatches.slice(from, to + 1);
  }

  const directWorkouts = ((workoutResult.data ?? []) as Workout[]).map(hydrateWorkoutMetadata).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  const videoWorkouts = ((videoResult.data ?? []) as ExerciseVideo[]).map(mapVideoToWorkout).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  return dedupeWorkouts([...localMatches, ...directWorkouts, ...videoWorkouts]).slice(from, to + 1);
}

export async function getWorkout(id: string) {
  const local = localWorkouts("").find((workout) => workout.id === id) ?? sampleWorkouts.map(hydrateWorkoutMetadata)[0];
  if (!supabase || !isUuid(id)) return mockDelay(local);

  const workoutResult = await supabase!.from("workouts").select("*").eq("id", id).maybeSingle();
  if (workoutResult.error) {
    console.warn("S&S Gym could not load workout from workouts table.", workoutResult.error.message);
  }
  if (workoutResult.data) return hydrateWorkoutMetadata(workoutResult.data as Workout);

  const videoResult = await supabase!.from("exercise_videos").select("*").eq("id", id).maybeSingle();
  if (videoResult.error) {
    console.warn("S&S Gym could not load workout from exercise videos.", videoResult.error.message);
    return local;
  }
  return videoResult.data ? mapVideoToWorkout(videoResult.data as ExerciseVideo) : local;
}

export async function getExerciseVideos(query = "") {
  const localVideos = dedupeExerciseVideos([
    ...muscleStrengthExercises.map(mapMetadataToVideo),
    ...sampleExerciseVideos
  ]).filter((video) => !query || normalizeText(video.exercise_name).includes(normalizeText(query)));
  if (!supabase) return mockDelay(localVideos);
  let request = supabase!.from("exercise_videos").select("*").order("exercise_name").limit(100);
  if (query) request = request.ilike("exercise_name", `%${query}%`);
  const { data, error } = await request;
  if (error) {
    console.warn("S&S Gym could not load exercise videos, using local fallback.", error.message);
    return localVideos;
  }
  return dedupeExerciseVideos([...((data ?? []) as ExerciseVideo[]), ...localVideos]);
}

export async function startWorkoutSession(userId: string, workout: Workout) {
  const payload = {
    user_id: userId,
    workout_id: isUuid(workout.id) ? workout.id : null,
    workout_category: workout.category || workout.target_muscle || "Workout",
    workout_name: workout.name,
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_minutes: null,
    notes: null,
    status: "started"
  };
  if (!canUseUserData(userId)) return mockDelay({ ...payload, id: `mock-${crypto.randomUUID()}` } as WorkoutSession);
  let { data, error } = await supabase!.from("workout_sessions").insert(payload).select("*").single();
  if (error && isSchemaCompatibilityError(error)) {
    const { workout_category: _category, ...compatiblePayload } = payload;
    const compatible = await supabase!.from("workout_sessions").insert(compatiblePayload).select("*").single();
    data = compatible.data;
    error = compatible.error;
  }
  if (error) {
    console.warn("S&S Gym could not start a Supabase workout session.", error.message);
    return { ...payload, id: crypto.randomUUID() } as WorkoutSession;
  }
  return normalizeWorkoutSession(data as WorkoutSession);
}

export async function startWorkoutDaySession(userId: string, day: WorkoutPlanDaySession) {
  const payload = {
    user_id: userId,
    workout_id: null,
    plan_id: day.plan_id,
    plan_day_id: day.id,
    workout_day_name: day.day_name,
    workout_category: summarizeWorkoutCategory(day),
    workout_name: day.weekday ? `${day.day_name} - ${day.weekday}` : day.day_name,
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_minutes: null,
    notes: null,
    status: "started"
  };
  if (!canUseUserData(userId)) return mockDelay({ ...payload, id: `mock-${crypto.randomUUID()}` } as WorkoutSession);
  let { data, error } = await supabase!.from("workout_sessions").insert(payload).select("*").single();
  if (error && isSchemaCompatibilityError(error)) {
    const { workout_category: _category, ...compatiblePayload } = payload;
    const compatible = await supabase!.from("workout_sessions").insert(compatiblePayload).select("*").single();
    data = compatible.data;
    error = compatible.error;
  }
  if (error) {
    console.warn("S&S Gym could not start a workout day session.", error.message);
    throw error;
  }
  return normalizeWorkoutSession(data as WorkoutSession);
}

export async function getOpenWorkoutDaySession(userId: string, planDayId: string) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSession | null>(null);
  const { data, error } = await supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_day_id", planDayId)
    .eq("status", "started")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("S&S Gym could not load the open workout session.", error.message);
    return null;
  }

  return data ? normalizeWorkoutSession(data as WorkoutSession) : null;
}

export async function getOrStartWorkoutDaySession(userId: string, day: WorkoutPlanDaySession) {
  const open = await getOpenWorkoutDaySession(userId, day.id);
  if (open) return open;
  return startWorkoutDaySession(userId, day);
}

export async function getWorkoutSessionLogs(sessionId: string) {
  if (!supabase || !isUuid(sessionId)) return mockDelay<ExerciseLog[]>([]);
  const { data, error } = await supabase!
    .from("exercise_logs")
    .select("*")
    .eq("workout_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("S&S Gym could not load workout session logs.", error.message);
    return [];
  }

  return (data ?? []) as ExerciseLog[];
}

export async function updateWorkoutSessionDuration(sessionId: string, durationMinutes: number) {
  if (!supabase || !isUuid(sessionId)) return mockDelay(true);
  const { error } = await supabase!
    .from("workout_sessions")
    .update({ duration_minutes: Math.max(0, durationMinutes) })
    .eq("id", sessionId)
    .eq("status", "started");
  if (error) {
    console.warn("S&S Gym could not update workout duration.", error.message);
  }
  return true;
}

export type WorkoutSetLogInput = {
  planExerciseId?: string | null;
  exerciseOrder?: number | null;
  exerciseName: string;
  exerciseCategory?: string | null;
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
  if (!supabase || !isUuid(sessionId)) return mockDelay(true);
  const deleteResult = await supabase!.from("exercise_logs").delete().eq("workout_session_id", sessionId);
  if (deleteResult.error) throw deleteResult.error;

  const rows = logs.map((log) => ({
    workout_session_id: sessionId,
    plan_exercise_id: log.planExerciseId ?? null,
    exercise_order: log.exerciseOrder ?? null,
    exercise_name: log.exerciseName,
    exercise_category: log.exerciseCategory ?? null,
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
  let { error } = await supabase!.from("exercise_logs").insert(rows);
  if (error && isSchemaCompatibilityError(error)) {
    const compatibleRows = rows.map(({ exercise_category: _category, exercise_order: _order, ...row }) => row);
    const compatible = await supabase!.from("exercise_logs").insert(compatibleRows);
    error = compatible.error;
  }
  if (error) throw error;
  return true;
}

export async function completeWorkoutSession(sessionId: string, notes: string, durationMinutes: number) {
  if (!supabase || !isUuid(sessionId)) return mockDelay(true);
  const { error } = await supabase!
    .from("workout_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString(), notes, duration_minutes: durationMinutes })
    .eq("id", sessionId);
  if (error) {
    console.warn("S&S Gym could not complete this workout session.", error.message);
    throw error;
  }
  return true;
}

export async function skipWorkoutDay(userId: string, day: SkipWorkoutDayInput, notes = "") {
  const skippedAt = new Date().toISOString();
  const existing = await getOpenWorkoutDaySession(userId, day.id);
  const dayName = skipDayName(day);
  const planId = skipDayPlanId(day);
  const workoutName = day.weekday ? `${dayName} - ${day.weekday}` : dayName;

  if (!canUseUserData(userId)) {
    return mockDelay({
      id: `mock-${crypto.randomUUID()}`,
      user_id: userId,
      workout_id: null,
      plan_id: planId,
      plan_day_id: day.id,
      workout_day_name: dayName,
      workout_category: summarizeWorkoutCategory(day),
      workout_name: workoutName,
      started_at: skippedAt,
      completed_at: skippedAt,
      skipped_at: skippedAt,
      duration_minutes: 0,
      notes: notes || null,
      status: "skipped"
    } as WorkoutSession);
  }

  if (existing) {
    let { data, error } = await supabase!
      .from("workout_sessions")
      .update({
        status: "skipped",
        completed_at: skippedAt,
        skipped_at: skippedAt,
        duration_minutes: 0,
        notes: notes || existing.notes || null
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error && isSchemaCompatibilityError(error)) {
      const compatible = await supabase!
        .from("workout_sessions")
        .update({
          status: "completed",
          completed_at: skippedAt,
          duration_minutes: 0,
          notes: markSkippedNote(notes || existing.notes || "")
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      data = compatible.data;
      error = compatible.error;
    }
    if (error) throw error;
    return normalizeWorkoutSession(data as WorkoutSession);
  }

  const payload = {
    user_id: userId,
    workout_id: null,
    plan_id: planId,
    plan_day_id: day.id,
    workout_day_name: dayName,
    workout_category: summarizeWorkoutCategory(day),
    workout_name: workoutName,
    started_at: skippedAt,
    completed_at: skippedAt,
    skipped_at: skippedAt,
    duration_minutes: 0,
    notes: notes || null,
    status: "skipped"
  };

  let { data, error } = await supabase!.from("workout_sessions").insert(payload).select("*").single();
  if (error && isSchemaCompatibilityError(error)) {
    const compatiblePayload = {
      user_id: payload.user_id,
      workout_id: payload.workout_id,
      plan_id: payload.plan_id,
      plan_day_id: payload.plan_day_id,
      workout_day_name: payload.workout_day_name,
      workout_name: payload.workout_name,
      started_at: payload.started_at,
      completed_at: payload.completed_at,
      duration_minutes: payload.duration_minutes,
      notes: markSkippedNote(notes),
      status: "completed"
    };
    const compatible = await supabase!.from("workout_sessions").insert(compatiblePayload).select("*").single();
    data = compatible.data;
    error = compatible.error;
  }
  if (error) {
    console.warn("S&S Gym could not skip this workout day.", error.message);
    throw error;
  }
  return normalizeWorkoutSession(data as WorkoutSession);
}

export async function getWorkoutHistory(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSession[]>([]);
  let { data, error } = await supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("started_at", { ascending: false })
    .limit(20);
  if (error && isSchemaCompatibilityError(error)) {
    const compatible = await supabase!
      .from("workout_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(20);
    data = compatible.data;
    error = compatible.error;
  }
  if (error) {
    console.warn("S&S Gym could not load workout history.", error.message);
    return getGeneratedWorkoutActivity(userId, 20);
  }
  const legacyHistory = ((data ?? []) as WorkoutSession[]).map(normalizeWorkoutSession);
  const generatedHistory = await getGeneratedWorkoutActivity(userId, 20);
  return [...legacyHistory, ...generatedHistory]
    .sort((a, b) => sessionDateForSort(b).getTime() - sessionDateForSort(a).getTime())
    .slice(0, 20);
}

export async function getWorkoutHistoryDetailed(userId: string, limit = 100) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSessionSummary[]>([]);
  const { data, error } = await supabase!
    .from("workout_sessions")
    .select("*, exercise_logs(*)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("S&S Gym could not load workout history details.", error.message);
    return [];
  }
  return ((data ?? []) as WorkoutSessionSummary[])
    .map((session) => ({
      ...normalizeWorkoutSession(session),
      exercise_logs: sortExerciseLogsByWorkoutOrder(session.exercise_logs ?? [])
    }))
    .filter((session) => session.status === "completed");
}

export async function getWorkoutActivity(userId: string, limit = 180) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSession[]>([]);
  let { data, error } = await supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error && isSchemaCompatibilityError(error)) {
    const compatible = await supabase!
      .from("workout_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(limit);
    data = compatible.data;
    error = compatible.error;
  }

  if (error) {
    console.warn("S&S Gym could not load workout activity.", error.message);
    return getGeneratedWorkoutActivity(userId, limit);
  }

  const legacyActivity = ((data ?? []) as WorkoutSession[]).map(normalizeWorkoutSession);
  const generatedActivity = await getGeneratedWorkoutActivity(userId, limit);
  return [...legacyActivity, ...generatedActivity]
    .sort((a, b) => sessionDateForSort(b).getTime() - sessionDateForSort(a).getTime())
    .slice(0, limit);
}

function sessionDateForSort(session: WorkoutSession) {
  return new Date(session.completed_at || session.skipped_at || session.started_at);
}

function sortExerciseLogsByWorkoutOrder(logs: ExerciseLog[]) {
  return [...logs].sort((a, b) => {
    const orderA = a.exercise_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.exercise_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    const createdSort = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return createdSort || a.set_number - b.set_number;
  });
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
  template_id?: string | null;
  source?: "manual" | "template_recommendation";
  match_score?: number | null;
  match_explanation?: string | null;
  match_reasons?: string[] | null;
  program_duration_weeks?: number | null;
  days_per_week?: number | null;
  created_at: string;
  updated_at: string;
  user_workout_plan_days?: RawPlanDay[] | null;
};

type RawTemplateExercise = {
  id: string;
  workout_template_day_id?: string;
  exercise_order: number;
  exercise_name: string;
  sets: string | null;
  reps: string | null;
};

type RawTemplateDay = {
  id: string;
  workout_template_id?: string;
  day_index: number;
  day_title: string;
  workout_template_exercises?: RawTemplateExercise[] | null;
};

type RawTemplate = {
  id: string;
  title: string;
  main_goal: string;
  workout_type: string | null;
  training_level: string;
  program_duration_weeks: number;
  days_per_week: number;
  time_per_workout: string | null;
  equipment_required: string[] | null;
  target_gender: string | null;
  workout_template_days?: RawTemplateDay[] | null;
};

type RawGeneratedSession = {
  id: string;
  user_id: string;
  user_workout_plan_id: string;
  workout_template_day_id: string | null;
  plan_day_id: string | null;
  week_index: number;
  day_index: number;
  session_number: number;
  scheduled_date: string;
  day_title: string;
  status: UserWorkoutSession["status"];
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  user_exercise_logs?: UserExerciseLog[] | null;
};

type RawGeneratedPlan = RawWorkoutPlan & {
  workout_templates?: RawTemplate | RawTemplate[] | null;
  user_workout_sessions?: RawGeneratedSession[] | null;
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
    video_url: exercise.video_url ?? null,
    notes: exercise.video_url || exercise.notes,
    is_global: true
  });
}

function normalizeWorkoutPlan(plan: RawWorkoutPlan): UserWorkoutPlan {
  return {
    id: plan.id,
    user_id: plan.user_id,
    name: plan.name,
    is_active: plan.is_active,
    template_id: plan.template_id ?? null,
    source: plan.source ?? "manual",
    match_score: plan.match_score ?? null,
    match_explanation: plan.match_explanation ?? null,
    match_reasons: plan.match_reasons ?? [],
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

function normalizeWorkoutTemplate(template: RawTemplate | RawTemplate[] | null | undefined): WorkoutTemplate | null {
  const row = Array.isArray(template) ? template[0] : template;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    main_goal: row.main_goal,
    workout_type: row.workout_type,
    training_level: row.training_level,
    program_duration_weeks: row.program_duration_weeks,
    days_per_week: row.days_per_week,
    time_per_workout: row.time_per_workout,
    equipment_required: row.equipment_required ?? [],
    target_gender: row.target_gender,
    days: (row.workout_template_days ?? [])
      .map((day) => ({
        id: day.id,
        workout_template_id: day.workout_template_id ?? row.id,
        day_index: day.day_index,
        day_title: day.day_title,
        exercises: (day.workout_template_exercises ?? [])
          .map((exercise) => ({
            id: exercise.id,
            workout_template_day_id: exercise.workout_template_day_id ?? day.id,
            exercise_order: exercise.exercise_order,
            exercise_name: exercise.exercise_name,
            sets: exercise.sets,
            reps: exercise.reps
          }))
          .sort((a, b) => a.exercise_order - b.exercise_order)
      }))
      .sort((a, b) => a.day_index - b.day_index)
  };
}

function normalizeGeneratedSession(session: RawGeneratedSession): UserWorkoutSession {
  return {
    id: session.id,
    user_id: session.user_id,
    user_workout_plan_id: session.user_workout_plan_id,
    workout_template_day_id: session.workout_template_day_id,
    plan_day_id: session.plan_day_id,
    week_index: session.week_index,
    day_index: session.day_index,
    session_number: session.session_number,
    scheduled_date: session.scheduled_date,
    day_title: session.day_title,
    status: session.status,
    started_at: session.started_at,
    completed_at: session.completed_at,
    skipped_at: session.skipped_at,
    duration_minutes: session.duration_minutes,
    notes: session.notes,
    logs: [...(session.user_exercise_logs ?? [])].sort((a, b) => a.exercise_order - b.exercise_order)
  };
}

function normalizeGeneratedWorkoutPlan(plan: RawGeneratedPlan): GeneratedWorkoutPlan {
  return {
    ...normalizeWorkoutPlan(plan),
    template: normalizeWorkoutTemplate(plan.workout_templates),
    sessions: (plan.user_workout_sessions ?? [])
      .map(normalizeGeneratedSession)
      .sort((a, b) => {
        const dateSort = a.scheduled_date.localeCompare(b.scheduled_date);
        return dateSort || a.session_number - b.session_number;
      })
  };
}

export async function getActiveUserWorkoutPlan(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<UserWorkoutPlan | null>(null);

  const selectWithSource =
    "id,user_id,name,is_active,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes))";
  const selectLegacy =
    "id,user_id,name,is_active,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes))";

  const result = await supabase!
    .from("user_workout_plans")
    .select(selectWithSource)
    .eq("user_id", userId)
    .eq("is_active", true)
    .or("source.is.null,source.eq.manual")
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
    console.warn("S&S Gym could not load the saved workout plan.", error.message);
    return null;
  }

  return data ? normalizeWorkoutPlan(data as RawWorkoutPlan) : null;
}

export async function getGeneratedWorkoutPlan(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<GeneratedWorkoutPlan | null>(null);

  const { data, error } = await supabase!
    .from("user_workout_plans")
    .select(
      "id,user_id,name,is_active,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes)),workout_templates(id,title,main_goal,workout_type,training_level,program_duration_weeks,days_per_week,time_per_workout,equipment_required,target_gender,workout_template_days(id,workout_template_id,day_index,day_title,workout_template_exercises(id,workout_template_day_id,exercise_order,exercise_name,sets,reps))),user_workout_sessions(id,user_id,user_workout_plan_id,workout_template_day_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes,user_exercise_logs(id,user_workout_session_id,workout_template_exercise_id,plan_exercise_id,exercise_order,exercise_name,planned_sets,planned_reps,weight_kg,reps,notes,completed,completed_at,created_at,updated_at))"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("source", "template_recommendation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("S&S Gym could not load the generated workout plan.", error.message);
    return null;
  }

  return data ? normalizeGeneratedWorkoutPlan(data as unknown as RawGeneratedPlan) : null;
}

export type GeneratedExerciseLogInput = {
  workoutTemplateExerciseId?: string | null;
  planExerciseId?: string | null;
  exerciseOrder: number;
  exerciseName: string;
  plannedSets?: string | null;
  plannedReps?: string | null;
  weightKg?: number | null;
  reps?: number | null;
  notes?: string | null;
  completed: boolean;
};

export async function completeGeneratedWorkoutSession({
  userId,
  sessionId,
  logs,
  notes,
  durationMinutes,
  startedAt
}: {
  userId: string;
  sessionId: string;
  logs: GeneratedExerciseLogInput[];
  notes?: string;
  durationMinutes?: number;
  startedAt?: string;
}) {
  if (!canUseUserData(userId) || !isUuid(sessionId)) return mockDelay(true);

  const deleteResult = await supabase!.from("user_exercise_logs").delete().eq("user_workout_session_id", sessionId);
  if (deleteResult.error) throw deleteResult.error;

  const completedAt = new Date().toISOString();
  const rows = logs.map((log) => ({
    user_workout_session_id: sessionId,
    workout_template_exercise_id: log.workoutTemplateExerciseId ?? null,
    plan_exercise_id: log.planExerciseId ?? null,
    exercise_order: log.exerciseOrder,
    exercise_name: log.exerciseName,
    planned_sets: log.plannedSets ?? null,
    planned_reps: log.plannedReps ?? null,
    weight_kg: log.weightKg ?? null,
    reps: log.reps ?? null,
    notes: log.notes ?? null,
    completed: log.completed,
    completed_at: log.completed ? completedAt : null
  }));

  if (rows.length) {
    const { error: logsError } = await supabase!.from("user_exercise_logs").insert(rows);
    if (logsError) throw logsError;
  }

  const { error: sessionError } = await supabase!
    .from("user_workout_sessions")
    .update({
      status: "completed",
      started_at: startedAt ?? completedAt,
      completed_at: completedAt,
      duration_minutes: Math.max(0, durationMinutes ?? 0),
      notes: notes || null
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (sessionError) throw sessionError;
  return true;
}

export async function skipGeneratedWorkoutSession(userId: string, sessionId: string, notes = "") {
  if (!canUseUserData(userId) || !isUuid(sessionId)) return mockDelay(true);
  const skippedAt = new Date().toISOString();
  const { error } = await supabase!
    .from("user_workout_sessions")
    .update({
      status: "skipped",
      skipped_at: skippedAt,
      duration_minutes: 0,
      notes: notes || null
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw error;
  return true;
}

export async function getGeneratedWorkoutHistory(userId: string, limit = 100) {
  if (!canUseUserData(userId)) return mockDelay<UserWorkoutSession[]>([]);
  const { data, error } = await supabase!
    .from("user_workout_sessions")
    .select(
      "id,user_id,user_workout_plan_id,workout_template_day_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes,user_exercise_logs(id,user_workout_session_id,workout_template_exercise_id,plan_exercise_id,exercise_order,exercise_name,planned_sets,planned_reps,weight_kg,reps,notes,completed,completed_at,created_at,updated_at)"
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("S&S Gym could not load generated workout history.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawGeneratedSession[]).map(normalizeGeneratedSession);
}

export async function getGeneratedWorkoutActivity(userId: string, limit = 180) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSession[]>([]);
  const { data, error } = await supabase!
    .from("user_workout_sessions")
    .select("id,user_id,user_workout_plan_id,workout_template_day_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes")
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("scheduled_date", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("S&S Gym could not load generated workout activity.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawGeneratedSession[]).map((session) => mapGeneratedSessionToWorkoutSession(normalizeGeneratedSession(session)));
}

export async function getUserWorkoutPlanDay(dayId: string) {
  if (!supabase) return mockDelay<WorkoutPlanDaySession | null>(null);

  const { data, error } = await supabase!
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

export async function updateUserWorkoutPlanDay(dayId: string, day: WorkoutPlanDayInput) {
  const cleanExercises = day.exercises.filter(Boolean);
  const cleanName = day.dayName.trim();

  if (!cleanName) throw new Error("Workout day name is required.");
  if (!cleanExercises.length) throw new Error("Add at least one exercise before saving this workout day.");

  if (!supabase || !isUuid(dayId)) return mockDelay(true);

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
    const exerciseUrl = workout.exercise_url || workout.video_url || (looksLikeUrl(workout.notes) ? workout.notes : null);
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
      video_url: exerciseUrl,
      sort_order: exerciseIndex + 1,
      notes: looksLikeUrl(workout.notes) ? null : workout.notes
    };
  });

  if (!rows.length) return true;

  let { error } = await supabase!.from("user_workout_plan_exercises").insert(rows);
  if (error && isMissingTemplateSchemaError(error)) {
    const compatibleRows = rows.map(({ source_workout_id: _source, instructions: _instructions, video_url: _video, ...row }) => row);
    const compatible = await supabase!.from("user_workout_plan_exercises").insert(compatibleRows);
    error = compatible.error;
  }
  if (error) throw error;
  return true;
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

  if (!canUseUserData(userId)) {
    return mockDelay({ id: crypto.randomUUID(), name: planName, days: cleanDays });
  }

  const inactiveResult = await supabase!
    .from("user_workout_plans")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (inactiveResult.error) throw inactiveResult.error;

  const { data: plan, error: planError } = await supabase!
    .from("user_workout_plans")
    .insert({ user_id: userId, name: planName.trim(), is_active: true })
    .select("id")
    .single();

  if (planError) throw planError;

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
      const exerciseUrl = workout.exercise_url || workout.video_url || (looksLikeUrl(workout.notes) ? workout.notes : null);
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
        video_url: exerciseUrl,
        sort_order: exerciseIndex + 1,
        notes: looksLikeUrl(workout.notes) ? null : workout.notes
      };
    });

    const { error: exercisesError } = await supabase!.from("user_workout_plan_exercises").insert(exerciseRows);
    if (exercisesError) throw exercisesError;
  }

  return plan;
}

export function workoutsFromPlanDay(day: UserWorkoutPlan["days"][number] | null | undefined): Workout[] {
  return (day?.exercises ?? []).map((exercise) => mapPlanExerciseToWorkout(exercise as RawPlanExercise));
}


export async function saveOnboarding(answers: OnboardingAnswers) {
  if (!canUseUserData(answers.user_id)) return mockDelay(answers);
  let { data, error } = await supabase!.from("onboarding_answers").upsert(answers, { onConflict: "user_id" }).select("*").single();
  if (error && error.message.toLowerCase().includes("available_equipment")) {
    const { available_equipment: _availableEquipment, ...compatibleAnswers } = answers;
    const compatible = await supabase!.from("onboarding_answers").upsert(compatibleAnswers, { onConflict: "user_id" }).select("*").single();
    data = compatible.data;
    error = compatible.error;
  }
  if (error) throw error;
  return data as OnboardingAnswers;
}

export async function getOnboarding(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<OnboardingAnswers | null>(null);
  const { data, error } = await supabase!.from("onboarding_answers").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as OnboardingAnswers | null;
}

export async function getProgressEntries(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<ProgressEntry[]>([]);
  const { data, error } = await supabase!
    .from("progress_entries")
    .select("*")
    .eq("user_id", userId)
    .order("entry_date", { ascending: true });
  if (error) {
    console.warn("S&S Gym could not load progress entries.", error.message);
    return [];
  }

  const entries = (data ?? []) as ProgressEntry[];
  if (!entries.length) return [];

  const { data: measurements, error: measurementError } = await supabase!
    .from("body_measurements")
    .select("*")
    .eq("user_id", userId)
    .order("measured_at", { ascending: true });

  if (measurementError) {
    console.warn("S&S Gym could not load body measurements.", measurementError.message);
    return entries;
  }

  const byProgressId = new Map<string, BodyMeasurement>();
  (measurements ?? []).forEach((measurement) => {
    if (measurement.progress_entry_id) byProgressId.set(measurement.progress_entry_id, measurement as BodyMeasurement);
  });

  return entries.map((entry) => ({
    ...entry,
    measurements: byProgressId.get(entry.id) ?? null
  }));
}

export async function updateProfile(userId: string, patch: { fullName: string }) {
  const payload = { full_name: patch.fullName.trim(), updated_at: new Date().toISOString() };
  if (!payload.full_name) throw new Error("Enter your name before saving.");
  if (!canUseUserData(userId)) return mockDelay({ id: userId, ...payload } as Profile);

  const { data, error } = await supabase!
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function addProgressEntry(
  entry: Omit<ProgressEntry, "id">,
  photos?: File[],
  measurements?: Record<string, number | null>
) {
  if (!canUseUserData(entry.user_id)) {
    return mockDelay({
      ...entry,
      id: crypto.randomUUID(),
      measurements: measurements
        ? ({
            id: crypto.randomUUID(),
            user_id: entry.user_id,
            progress_entry_id: null,
            measured_at: entry.entry_date,
            waist_cm: entry.waist_cm,
            created_at: new Date().toISOString(),
            ...measurements
          } as BodyMeasurement)
        : null
    } as ProgressEntry);
  }
  const client = supabase!;
  const { data, error } = await client.from("progress_entries").insert(entry).select("*").single();
  if (error) throw error;
  let savedMeasurement: BodyMeasurement | null = null;

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
    const { data: measurementData, error: measurementError } = await client
      .from("body_measurements")
      .insert({
        user_id: entry.user_id,
        progress_entry_id: data.id,
        measured_at: entry.entry_date,
        waist_cm: entry.waist_cm,
        ...measurements
      })
      .select("*")
      .single();
    if (measurementError) throw measurementError;
    savedMeasurement = measurementData as BodyMeasurement;
  }

  return { ...(data as ProgressEntry), measurements: savedMeasurement };
}

export async function getWelcomeSettings(userId: string): Promise<WelcomeSettings> {
  const fallback: WelcomeSettings = {
    popup_enabled: true,
    show_frequency: "once_per_day",
    default_message: "Welcome back to S&S Gym. Ready for today?"
  };
  if (!canUseUserData(userId)) return fallback;

  const [settingsResult, customResult] = await Promise.all([
    supabase!.from("admin_settings").select("value").eq("key", "welcome_settings").maybeSingle(),
    supabase!.from("user_welcome_messages").select("message,popup_enabled,show_frequency").eq("user_id", userId).eq("is_active", true).maybeSingle()
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
  const { data, error } = await supabase!.from("user_welcome_messages").upsert({ ...payload, is_active: true }, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  return data;
}

export async function adminListUsers() {
  if (!supabase) {
    return mockDelay([
      { id: "mock-user", email: "member@ssgym.test", full_name: "S&S Gym Member", role: "admin" }
    ]);
  }
  const { data, error } = await supabase!.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: false });
  if (error) {
    console.warn("S&S Gym could not load admin users.", error.message);
    return [];
  }
  return data ?? [];
}

export async function adminUpdateUserRole(userId: string, role: "member" | "admin") {
  if (!supabase) return mockDelay(true);
  const { error } = await supabase!.from("profiles").update({ role }).eq("id", userId);
  if (error) throw error;
  return true;
}

export async function adminUpsertGlobalFood(food: Partial<FoodItem>) {
  if (!supabase) return mockDelay(food);
  const { data, error } = await supabase!
    .from("food_items")
    .upsert({ ...food, is_global: true, is_editable_by_user: false, cuisine: food.cuisine ?? "Egyptian" })
    .select("*")
    .single();
  if (error) throw error;
  return data as FoodItem;
}

export async function adminUpsertWorkout(workout: Partial<Workout>) {
  if (!supabase) return mockDelay(workout);
  const { data, error } = await supabase!.from("workouts").upsert({ ...workout, is_global: true }).select("*").single();
  if (error) throw error;
  return data as Workout;
}

export async function adminUpsertExerciseVideo(video: Partial<ExerciseVideo>) {
  if (!supabase) return mockDelay(video);
  const { data, error } = await supabase!.from("exercise_videos").upsert({ ...video, is_global: true }).select("*").single();
  if (error) throw error;
  return data as ExerciseVideo;
}

export async function adminUpdateWelcomeSettings(settings: WelcomeSettings) {
  if (!supabase) return mockDelay(settings);
  const { data, error } = await supabase!
    .from("admin_settings")
    .upsert({ key: "welcome_settings", value: settings }, { onConflict: "key" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function adminImportExerciseVideos(rows: Omit<ExerciseVideo, "id" | "is_global">[]) {
  if (!supabase) return mockDelay(rows.length);
  const importResult = await supabase!.from("workout_video_imports").insert({ imported_count: rows.length, status: "queued" }).select("id").single();
  if (importResult.error) throw importResult.error;
  const { error } = await supabase!.from("exercise_videos").upsert(
    rows.map((row) => ({
      ...row,
      is_global: true,
      source: row.source ?? "admin_import"
    })),
    { onConflict: "exercise_name,category_type,category" }
  );
  if (error) throw error;
  await supabase!.from("workout_video_imports").update({ status: "completed" }).eq("id", importResult.data.id);
  return rows.length;
}
