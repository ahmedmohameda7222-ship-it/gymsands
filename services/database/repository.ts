"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid, todayIso } from "@/lib/utils";
import { egyptianFoods } from "@/data/egyptian-foods";
import { defaultExerciseInstructions, sampleExerciseVideos, sampleWorkouts } from "@/data/workouts";
import type {
  BodyMeasurement,
  CustomMeal,
  DailyFitTask,
  DailyNutritionSummary,
  ExerciseVideo,
  FitnessHabit,
  FoodItem,
  FoodKitchen,
  FoodLog,
  FoodSubcategory,
  GeneratedWorkoutPlan,
  MealItem,
  MealPlanItem,
  MealType,
  OnboardingAnswers,
  PersonalRecord,
  Profile,
  ProgressEntry,
  ExerciseLog,
  SleepRecoveryLog,
  SupplementLog,
  UserExerciseVideo,
  UserExerciseLog,
  UserFoodItem,
  UserWorkoutSession,
  UserWorkoutPlan,
  WaterLog,
  Weekday,
  WelcomeSettings,
  Workout,
  WorkoutTemplate,
  WorkoutPlanDaySession,
  WorkoutSession,
  WorkoutSessionSummary
} from "@/types";
import { scaleFoodMacros, sumFoodLogs } from "@/services/nutrition/calculations";

function mockDelay<T>(value: T) {
  return Promise.resolve(value);
}

const workoutPageSize = 60;
const skippedNotePrefix = "[skipped]";

export type WorkoutFilters = {
  category?: string;
  categories?: string[];
  muscleCategories?: string[];
  primaryMuscles?: string[];
  equipment?: string;
  equipmentRequired?: string[];
  difficulty?: string;
  experienceLevels?: string[];
  mechanics?: string[];
  exerciseTypes?: string[];
  forceTypes?: string[];
  secondaryMuscles?: string[];
};

export type WorkoutFilterOptions = {
  muscleCategories: string[];
  primaryMuscles: string[];
  equipmentRequired: string[];
  mechanics: string[];
  exerciseTypes: string[];
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

function parseDurationMinutes(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const matches = value?.match(/\d+/g)?.map(Number).filter((item) => Number.isFinite(item) && item > 0) ?? [];
  if (!matches.length) return null;
  return Math.round(matches.reduce((sum, item) => sum + item, 0) / matches.length);
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
export const egyptianFoodKitchenName = "Egyptian Kitchen";
export const egyptianFoodSubcategories = [
  "Bread",
  "Breakfast",
  "Carb",
  "Dairy",
  "Dessert",
  "Dip",
  "Drink",
  "Legumes",
  "Snack",
  "Soup",
  "Stew",
  "Vegetable"
] as const;

const allowedEgyptianSubcategories = new Set<string>(egyptianFoodSubcategories);

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFoodSubcategory(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return "Snack";
  if (allowedEgyptianSubcategories.has(clean)) return clean;
  if (clean === "Rice") return "Carb";
  if (clean === "Sauce" || clean === "Salad") return "Dip";
  if (clean === "Protein" || clean === "Sandwich" || clean === "Meal" || clean === "Side") return "Breakfast";
  return "Snack";
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
    message.includes("exercise_url") ||
    message.includes("video_url") ||
    message.includes("custom_video_url") ||
    message.includes("is_default")
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
  return [...egyptianFoodSubcategories];
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
  return egyptianFoods
    .filter((food) => normalizeText(food.food_name).includes(normalized))
    .map((food) => ({
      ...food,
      cuisine: egyptianFoodKitchenName,
      category: normalizeFoodSubcategory(food.category)
    }));
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

function mapVideoToWorkout(video: ExerciseVideo): Workout {
  return {
    id: video.id,
    name: video.exercise_name,
    category: video.category_type ?? "Exercise",
    target_muscle: video.muscle_category ?? video.category ?? "General",
    equipment: video.equipment_required ?? (video.category_type === "Equipment" ? video.category ?? "Varies" : "Varies"),
    difficulty: video.experience_level ?? "Beginner",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: video.instructions || defaultExerciseInstructions,
    notes: video.exercise_url,
    muscle_category: video.muscle_category ?? video.category,
    equipment_required: video.equipment_required ?? null,
    mechanics: video.mechanics ?? null,
    force_type: video.force_type ?? null,
    experience_level: video.experience_level ?? "Beginner",
    secondary_muscles: video.secondary_muscles ?? [],
    exercise_url: video.exercise_url,
    video_url: video.video_url,
    is_global: video.is_global
  };
}

type ApprovedExerciseRow = {
  id: string;
  name: string;
  source?: string | null;
  source_url?: string | null;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  equipment: string[] | null;
  difficulty: string | null;
  mechanics: string | null;
  movement_pattern: string | null;
  force_type: string | null;
  instructions: string | null;
  video_url: string | null;
  is_global: boolean;
};

function mapApprovedExerciseToWorkout(exercise: ApprovedExerciseRow): Workout {
  const equipment = exercise.equipment?.length ? exercise.equipment.join(", ") : "Varies";
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.mechanics || exercise.movement_pattern || "Exercise",
    target_muscle: exercise.primary_muscle || "General",
    equipment,
    difficulty: exercise.difficulty || "Beginner",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: exercise.instructions || defaultExerciseInstructions,
    notes: exercise.source_url || (exercise.source ? `Source: ${exercise.source}` : null),
    muscle_category: exercise.primary_muscle,
    equipment_required: equipment,
    mechanics: exercise.mechanics,
    force_type: exercise.force_type,
    experience_level: exercise.difficulty || "Beginner",
    secondary_muscles: exercise.secondary_muscles ?? [],
    exercise_url: exercise.source_url ?? null,
    video_url: exercise.video_url,
    is_global: exercise.is_global
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
      ...sampleWorkouts.map((workout) => workout.equipment)
    ])
  ).sort() as string[];
}

function getLocalWorkoutFilterOptions(): WorkoutFilterOptions {
  const localWorkouts = sampleWorkouts.map(hydrateWorkoutMetadata);
  const localVideos = sampleExerciseVideos.map(mapVideoToWorkout);
  const all = [...localWorkouts, ...localVideos];
  return {
    muscleCategories: uniqueSorted(all.map((exercise) => exercise.muscle_category ?? exercise.target_muscle)),
    primaryMuscles: uniqueSorted(all.map((exercise) => exercise.target_muscle ?? exercise.muscle_category)),
    equipmentRequired: uniqueSorted(all.map((exercise) => exercise.equipment_required ?? exercise.equipment)),
    mechanics: uniqueSorted(all.map((exercise) => exercise.mechanics ?? exercise.category)),
    exerciseTypes: uniqueSorted(all.map((exercise) => exercise.category ?? exercise.mechanics)),
    forceTypes: uniqueSorted(all.map((exercise) => exercise.force_type)),
    experienceLevels: uniqueSorted(all.map((exercise) => exercise.experience_level ?? exercise.difficulty)),
    secondaryMuscles: uniqueSorted(all.flatMap((exercise) => exercise.secondary_muscles ?? []))
  };
}

function matchesWorkoutFilters(workout: Workout, query = "", filters: WorkoutFilters = {}) {
  const normalized = normalizeText(query);
  const broadCategories = filters.categories ?? (filters.category ? [filters.category] : []);
  const muscleCategories = filters.muscleCategories ?? [];
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
    hasAnySelected([workout.muscle_category, workout.target_muscle, workout.category, workout.equipment_required, workout.equipment], broadCategories) &&
    hasAnySelected([workout.muscle_category], muscleCategories) &&
    hasAnySelected([workout.target_muscle, workout.muscle_category], filters.primaryMuscles) &&
    hasAnySelected([workout.equipment_required, workout.equipment], equipmentRequired) &&
    hasAnySelected([workout.mechanics, workout.category], filters.mechanics) &&
    hasAnySelected([workout.category, workout.mechanics], filters.exerciseTypes) &&
    hasAnySelected([workout.force_type], filters.forceTypes) &&
    hasAnySelected([workout.experience_level, workout.difficulty], experienceLevels) &&
    hasAnySelected(secondaryMuscles, filters.secondaryMuscles)
  );
}

function localWorkouts(query = "", filters: WorkoutFilters = {}) {
  const normalized = normalizeText(query);
  const source = dedupeWorkouts([
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
        console.warn("FitLife Hub could not load food categories, using local fallback.", error.message);
        return fallback;
      }

      const values = Array.from(new Set((data ?? []).map((item) => item.category).filter(Boolean))).sort() as string[];
      return values.length ? values : fallback;
    });

  return withTimeout(request, fallback, "Food categories");
}

export async function getGlobalFoods(
  query = "",
  options: { category?: string; kitchen?: string; kitchenId?: string; subcategoryId?: string; limit?: number } = {}
) {
  const limit = options.limit ?? 36;
  const category = options.category;
  const fallback = localFoods(query)
    .filter((food) => !category || food.category === category)
    .filter((food) => !options.kitchenId || options.kitchen === egyptianFoodKitchenName || food.kitchen_id === options.kitchenId)
    .filter((food) => !options.subcategoryId || food.subcategory_id === options.subcategoryId || food.category === category)
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
  if (options.kitchenId) request = request.eq("kitchen_id", options.kitchenId);
  if (options.subcategoryId) request = request.eq("subcategory_id", options.subcategoryId);
  if (query) request = request.ilike("food_name", `%${query}%`);

  const result = await withTimeout(
    request.then(({ data, error }) => {
      if (error) {
        console.warn("FitLife Hub could not load Supabase foods, using local fallback.", error.message);
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
    console.warn("FitLife Hub could not load calorie targets.", error.message);
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
    console.warn("FitLife Hub could not load today's food logs.", error.message);
    return [];
  }
  return (data ?? []) as FoodLog[];
}

export async function addGlobalFoodToToday({
  userId,
  food,
  quantity,
  mealType = "Breakfast",
  date = todayIso()
}: {
  userId: string;
  food: FoodItem;
  quantity: number;
  mealType?: string;
  date?: string;
}) {
  const macros = scaleFoodMacros(food, quantity);
  const safeMealType = normalizeMealType(mealType);
  const isGlobalFood = food.is_global !== false;
  const payload = {
    user_id: userId,
    food_item_id: isGlobalFood && isUuid(food.id) ? food.id : null,
    user_food_item_id: !isGlobalFood && isUuid(food.id) ? food.id : null,
    log_date: date,
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
    console.warn("FitLife Hub could not add this food log.", error.message);
    throw error;
  }
  return data as FoodLog;
}

function normalizeUserFood(row: Record<string, unknown>): UserFoodItem {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    food_name: String(row.food_name ?? "Custom food"),
    serving_size: String(row.serving_size ?? "1 serving"),
    calories: toNumber(row.calories),
    protein_g: toNumber(row.protein_g),
    carbs_g: toNumber(row.carbs_g),
    fat_g: toNumber(row.fat_g),
    category: (row.category as string | null) ?? null,
    cuisine: (row.cuisine as string | null) ?? null,
    kitchen_id: (row.kitchen_id as string | null) ?? null,
    subcategory_id: (row.subcategory_id as string | null) ?? null,
    fiber_g: row.fiber_g === null || row.fiber_g === undefined ? null : toNumber(row.fiber_g),
    sugar_g: row.sugar_g === null || row.sugar_g === undefined ? null : toNumber(row.sugar_g),
    sodium_mg: row.sodium_mg === null || row.sodium_mg === undefined ? null : toNumber(row.sodium_mg),
    tags: (row.tags as string[] | null) ?? [],
    notes: (row.notes as string | null) ?? null,
    source_type: "user_created",
    is_global: false,
    is_editable_by_user: true
  };
}

function assertNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number.`);
}

export type UserFoodInput = {
  id?: string;
  userId: string;
  foodName: string;
  kitchenId?: string | null;
  cuisine?: string | null;
  subcategoryId?: string | null;
  category: string;
  servingSize: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  notes?: string | null;
};

function validateUserFoodInput(input: UserFoodInput) {
  if (!input.foodName.trim()) throw new Error("Food name is required.");
  if (!input.servingSize.trim()) throw new Error("Serving size is required.");
  if (!input.category.trim()) throw new Error("Choose or create a subcategory.");
  assertNonNegative(input.calories, "Calories");
  assertNonNegative(input.proteinG, "Protein");
  assertNonNegative(input.carbsG, "Carbs");
  assertNonNegative(input.fatG, "Fat");
  if (input.fiberG !== null && input.fiberG !== undefined) assertNonNegative(input.fiberG, "Fiber");
  if (input.sugarG !== null && input.sugarG !== undefined) assertNonNegative(input.sugarG, "Sugar");
  if (input.sodiumMg !== null && input.sodiumMg !== undefined) assertNonNegative(input.sodiumMg, "Sodium");
}

function userFoodPayload(input: UserFoodInput) {
  validateUserFoodInput(input);
  return {
    user_id: input.userId,
    food_name: input.foodName.trim(),
    serving_size: input.servingSize.trim(),
    calories: input.calories,
    protein_g: input.proteinG,
    carbs_g: input.carbsG,
    fat_g: input.fatG,
    category: input.category.trim(),
    cuisine: input.cuisine?.trim() || null,
    kitchen_id: input.kitchenId || null,
    subcategory_id: input.subcategoryId || null,
    fiber_g: input.fiberG ?? null,
    sugar_g: input.sugarG ?? null,
    sodium_mg: input.sodiumMg ?? null,
    notes: input.notes?.trim() || null
  };
}

export async function getFoodKitchens(userId: string) {
  const fallbackKitchen: FoodKitchen = {
    id: "egyptian-kitchen",
    user_id: null,
    name: egyptianFoodKitchenName,
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const fallbackSubcategories = egyptianFoodSubcategories.map((name) => ({
    id: `egyptian-${name.toLowerCase()}`,
    kitchen_id: fallbackKitchen.id,
    name,
    created_at: fallbackKitchen.created_at,
    updated_at: fallbackKitchen.updated_at
  })) as FoodSubcategory[];

  if (!canUseUserData(userId)) {
    return mockDelay({ kitchens: [fallbackKitchen], subcategories: fallbackSubcategories });
  }

  const [kitchensResult, subcategoriesResult] = await Promise.all([
    supabase!
      .from("food_kitchens")
      .select("*")
      .or(`is_system.eq.true,user_id.eq.${userId}`)
      .order("is_system", { ascending: false })
      .order("name"),
    supabase!.from("food_subcategories").select("*").order("name")
  ]);

  if (kitchensResult.error || subcategoriesResult.error) {
    console.warn(
      "FitLife Hub could not load food kitchens.",
      kitchensResult.error?.message || subcategoriesResult.error?.message
    );
    return { kitchens: [fallbackKitchen], subcategories: fallbackSubcategories };
  }

  return {
    kitchens: ((kitchensResult.data?.length ? kitchensResult.data : [fallbackKitchen]) ?? []) as FoodKitchen[],
    subcategories: ((subcategoriesResult.data?.length ? subcategoriesResult.data : fallbackSubcategories) ?? []) as FoodSubcategory[]
  };
}

export async function createFoodKitchen(userId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Kitchen name is required.");
  if (!canUseUserData(userId)) {
    return mockDelay({
      id: crypto.randomUUID(),
      user_id: userId,
      name: cleanName,
      is_system: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as FoodKitchen);
  }

  const { data, error } = await supabase!
    .from("food_kitchens")
    .insert({ user_id: userId, name: cleanName, is_system: false })
    .select("*")
    .single();
  if (error) throw error;
  return data as FoodKitchen;
}

export async function createFoodSubcategory(kitchenId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Subcategory name is required.");
  if (!supabase || !isUuid(kitchenId)) {
    return mockDelay({
      id: crypto.randomUUID(),
      kitchen_id: kitchenId,
      name: cleanName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as FoodSubcategory);
  }

  const { data, error } = await supabase!
    .from("food_subcategories")
    .insert({ kitchen_id: kitchenId, name: cleanName })
    .select("*")
    .single();
  if (error) throw error;
  return data as FoodSubcategory;
}

export async function getUserFoods(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<UserFoodItem[]>([]);
  const { data, error } = await supabase!.from("user_food_items").select("*").eq("user_id", userId).order("food_name");
  if (error) {
    console.warn("FitLife Hub could not load custom foods.", error.message);
    return [];
  }
  return (data ?? []).map((row) => normalizeUserFood(row as Record<string, unknown>));
}

export async function getFoodLibrary(
  userId: string,
  query = "",
  options: { category?: string; kitchen?: string; kitchenId?: string; subcategoryId?: string; limit?: number } = {}
) {
  const [globalFoods, userFoods] = await Promise.all([
    getGlobalFoods(query, { category: options.category, kitchen: options.kitchen, kitchenId: options.kitchenId, subcategoryId: options.subcategoryId, limit: options.limit ?? 60 }),
    getUserFoods(userId)
  ]);
  const normalizedQuery = normalizeText(query);
  const foods = [...globalFoods, ...userFoods].filter((food) => {
    const matchesQuery = !normalizedQuery || normalizeText(food.food_name).includes(normalizedQuery);
    const matchesCategory = !options.category || food.category === options.category;
    const matchesKitchen =
      !options.kitchenId ||
      food.kitchen_id === options.kitchenId ||
      (food.cuisine === egyptianFoodKitchenName && options.kitchen === egyptianFoodKitchenName);
    const matchesLegacyKitchen = !options.kitchen || food.cuisine === options.kitchen || food.kitchen_id === options.kitchen;
    const matchesSubcategory = !options.subcategoryId || food.subcategory_id === options.subcategoryId || food.category === options.category;
    return matchesQuery && matchesCategory && matchesKitchen && matchesLegacyKitchen && matchesSubcategory;
  });
  return foods.slice(0, options.limit ?? 80);
}

export async function upsertUserFood(input: UserFoodInput) {
  const payload = userFoodPayload(input);

  if (!canUseUserData(input.userId)) {
    return mockDelay(normalizeUserFood({ ...payload, id: input.id ?? crypto.randomUUID() }));
  }

  const request =
    input.id && isUuid(input.id)
      ? supabase!.from("user_food_items").update(payload).eq("id", input.id).eq("user_id", input.userId)
      : supabase!.from("user_food_items").insert(payload);

  const { data, error } = await request.select("*").single();
  if (error) throw error;
  return normalizeUserFood(data as Record<string, unknown>);
}

export async function deleteUserFood(userId: string, foodId: string) {
  if (!canUseUserData(userId) || !isUuid(foodId)) return mockDelay(true);
  const { error } = await supabase!.from("user_food_items").delete().eq("id", foodId).eq("user_id", userId);
  if (error) throw error;
  return true;
}

export async function getWaterLogs(userId: string, date: string) {
  if (!canUseUserData(userId)) return mockDelay<WaterLog[]>([]);
  const { data, error } = await supabase!
    .from("water_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("FitLife Hub could not load water logs.", error.message);
    return [];
  }
  return (data ?? []) as WaterLog[];
}

export async function addWaterLog(userId: string, date: string, amountMl: number) {
  if (!Number.isFinite(amountMl) || amountMl <= 0) throw new Error("Water amount must be greater than zero.");
  const payload = { user_id: userId, log_date: date, amount_ml: Math.round(amountMl) };
  if (!canUseUserData(userId)) return mockDelay({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() } as WaterLog);
  const { data, error } = await supabase!.from("water_logs").insert(payload).select("*").single();
  if (error) throw error;
  return data as WaterLog;
}

export async function deleteWaterLog(userId: string, id: string) {
  if (!canUseUserData(userId) || !isUuid(id)) return mockDelay(true);
  const { error } = await supabase!.from("water_logs").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  return true;
}

function weekDates(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export async function getNutritionWeek(userId: string, weekStart: string) {
  const dates = weekDates(weekStart);
  const [targets, logsResult, waterResult] = await Promise.all([
    getCalorieTargets(userId),
    canUseUserData(userId)
      ? supabase!
          .from("food_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("log_date", dates[0])
          .lte("log_date", dates[6])
          .order("log_date", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    canUseUserData(userId)
      ? supabase!
          .from("water_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("log_date", dates[0])
          .lte("log_date", dates[6])
      : Promise.resolve({ data: [], error: null })
  ]);

  if (logsResult.error) console.warn("FitLife Hub could not load weekly calorie logs.", logsResult.error.message);
  if (waterResult.error) console.warn("FitLife Hub could not load weekly water logs.", waterResult.error.message);

  const logs = ((logsResult.data ?? []) as FoodLog[]).reduce<Record<string, FoodLog[]>>((byDate, log) => {
    byDate[log.log_date] = [...(byDate[log.log_date] ?? []), log];
    return byDate;
  }, {});
  const water = ((waterResult.data ?? []) as WaterLog[]).reduce<Record<string, number>>((byDate, log) => {
    byDate[log.log_date] = (byDate[log.log_date] ?? 0) + toNumber(log.amount_ml);
    return byDate;
  }, {});

  return dates.map((date) => {
    const dayLogs = logs[date] ?? [];
    const totals = sumFoodLogs(dayLogs);
    return {
      date,
      planned_calories: toNumber(targets.daily_calories, 2200),
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      water_ml: water[date] ?? 0,
      logs: dayLogs
    } satisfies DailyNutritionSummary;
  });
}

export type CustomMealInput = {
  id?: string;
  userId: string;
  mealName: string;
  mealCategory?: string | null;
  notes?: string | null;
  isFavorite?: boolean;
  items: Array<{ food: FoodItem; quantity: number }>;
};

function mealItemTotals(food: Pick<FoodItem, "calories" | "protein_g" | "carbs_g" | "fat_g">, quantity: number) {
  return scaleFoodMacros(food, Math.max(0.1, quantity));
}

function summarizeMeal(items: MealItem[]) {
  return items.reduce(
    (sum, item) => ({
      calories: sum.calories + toNumber(item.calories),
      protein_g: Math.round((sum.protein_g + toNumber(item.protein_g)) * 10) / 10,
      carbs_g: Math.round((sum.carbs_g + toNumber(item.carbs_g)) * 10) / 10,
      fat_g: Math.round((sum.fat_g + toNumber(item.fat_g)) * 10) / 10
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

async function foodsById(foodIds: string[], userFoodIds: string[]) {
  const [globalResult, userResult] = await Promise.all([
    foodIds.length ? supabase!.from("food_items").select("*").in("id", foodIds) : Promise.resolve({ data: [], error: null }),
    userFoodIds.length ? supabase!.from("user_food_items").select("*").in("id", userFoodIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (globalResult.error) console.warn("FitLife Hub could not hydrate meal foods.", globalResult.error.message);
  if (userResult.error) console.warn("FitLife Hub could not hydrate custom meal foods.", userResult.error.message);

  const map = new Map<string, FoodItem>();
  ((globalResult.data ?? []) as FoodItem[]).forEach((food) => map.set(food.id, food));
  ((userResult.data ?? []) as Record<string, unknown>[]).map(normalizeUserFood).forEach((food) => map.set(food.id, food));
  return map;
}

export async function getCustomMeals(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<CustomMeal[]>([]);

  const { data: meals, error } = await supabase!
    .from("meals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("FitLife Hub could not load custom meals.", error.message);
    return [];
  }
  const mealRows = meals ?? [];
  if (!mealRows.length) return [];

  const mealIds = mealRows.map((meal) => meal.id);
  const { data: rawItems, error: itemError } = await supabase!.from("meal_food_items").select("*").in("meal_id", mealIds);
  if (itemError) throw itemError;

  const foodIds = Array.from(new Set((rawItems ?? []).map((item) => item.food_item_id).filter(Boolean))) as string[];
  const userFoodIds = Array.from(new Set((rawItems ?? []).map((item) => item.user_food_item_id).filter(Boolean))) as string[];
  const foodMap = await foodsById(foodIds, userFoodIds);

  const itemsByMeal = (rawItems ?? []).reduce<Record<string, MealItem[]>>((byMeal, item) => {
    const foodId = item.food_item_id || item.user_food_item_id;
    const food = foodId ? foodMap.get(foodId) : null;
    const quantity = toNumber(item.quantity, 1);
    const macros = food ? mealItemTotals(food, quantity) : { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const nextItem: MealItem = {
      id: item.id,
      meal_id: item.meal_id,
      food_item_id: item.food_item_id,
      user_food_item_id: item.user_food_item_id,
      food_name: food?.food_name ?? "Saved food",
      serving_size: food?.serving_size ?? "1 serving",
      quantity,
      ...macros
    };
    byMeal[item.meal_id] = [...(byMeal[item.meal_id] ?? []), nextItem];
    return byMeal;
  }, {});

  return mealRows.map((meal) => {
    const items = itemsByMeal[meal.id] ?? [];
    return {
      id: meal.id,
      user_id: meal.user_id,
      meal_name: meal.meal_name,
      meal_category: meal.meal_category ?? null,
      notes: meal.notes,
      is_favorite: Boolean(meal.is_favorite),
      created_at: meal.created_at,
      updated_at: meal.updated_at,
      items,
      totals: summarizeMeal(items)
    } satisfies CustomMeal;
  });
}

export async function upsertCustomMeal(input: CustomMealInput) {
  const cleanName = input.mealName.trim();
  if (!cleanName) throw new Error("Meal name is required.");
  if (!input.items.length) throw new Error("Add at least one food to the meal.");
  input.items.forEach((item) => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Meal food quantities must be greater than zero.");
  });

  if (!canUseUserData(input.userId)) {
    const items = input.items.map((item) => {
      const macros = mealItemTotals(item.food, item.quantity);
      return {
        id: crypto.randomUUID(),
        meal_id: input.id ?? "mock-meal",
        food_item_id: item.food.is_global === false ? null : item.food.id,
        user_food_item_id: item.food.is_global === false ? item.food.id : null,
        food_name: item.food.food_name,
        serving_size: item.food.serving_size,
        quantity: item.quantity,
        ...macros
      };
    });
    const now = new Date().toISOString();
    return mockDelay({
      id: input.id ?? crypto.randomUUID(),
      user_id: input.userId,
      meal_name: cleanName,
      meal_category: input.mealCategory ?? null,
      notes: input.notes ?? null,
      is_favorite: Boolean(input.isFavorite),
      created_at: now,
      updated_at: now,
      items,
      totals: summarizeMeal(items)
    } as CustomMeal);
  }

  const mealPayload = {
    user_id: input.userId,
    meal_name: cleanName,
    meal_category: input.mealCategory?.trim() || null,
    notes: input.notes?.trim() || null,
    is_favorite: Boolean(input.isFavorite)
  };

  const mealRequest =
    input.id && isUuid(input.id)
      ? supabase!.from("meals").update(mealPayload).eq("id", input.id).eq("user_id", input.userId)
      : supabase!.from("meals").insert(mealPayload);
  const { data: meal, error } = await mealRequest.select("*").single();
  if (error) throw error;

  const deleteResult = await supabase!.from("meal_food_items").delete().eq("meal_id", meal.id);
  if (deleteResult.error) throw deleteResult.error;

  const rows = input.items.map((item) => ({
    meal_id: meal.id,
    food_item_id: item.food.is_global !== false && isUuid(item.food.id) ? item.food.id : null,
    user_food_item_id: item.food.is_global === false && isUuid(item.food.id) ? item.food.id : null,
    quantity: item.quantity
  }));
  const { error: itemError } = await supabase!.from("meal_food_items").insert(rows);
  if (itemError) throw itemError;

  const meals = await getCustomMeals(input.userId);
  return meals.find((savedMeal) => savedMeal.id === meal.id) ?? meals[0];
}

export async function deleteCustomMeal(userId: string, mealId: string) {
  if (!canUseUserData(userId) || !isUuid(mealId)) return mockDelay(true);
  const { error } = await supabase!.from("meals").delete().eq("id", mealId).eq("user_id", userId);
  if (error) throw error;
  return true;
}

export async function addCustomMealToLog(userId: string, meal: CustomMeal, date = todayIso(), mealType: MealType = "Breakfast") {
  const payload = {
    user_id: userId,
    food_item_id: null,
    user_food_item_id: null,
    log_date: date,
    meal_type: normalizeMealType(mealType),
    food_name: meal.meal_name,
    serving_size: `${meal.items.length} foods`,
    quantity: 1,
    calories: meal.totals.calories,
    protein_g: meal.totals.protein_g,
    carbs_g: meal.totals.carbs_g,
    fat_g: meal.totals.fat_g,
    notes: meal.notes
  };
  if (!canUseUserData(userId)) return mockDelay({ ...payload, id: crypto.randomUUID() } as FoodLog);
  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return data as FoodLog;
}

export async function addCustomMealToMealPlan(userId: string, meal: CustomMeal, mealType: MealType = "Breakfast", date = todayIso()) {
  const safeMealType = normalizeMealType(mealType);
  const payload = {
    user_id: userId,
    plan_date: date,
    meal_type: safeMealType,
    food_item_id: null,
    user_food_item_id: null,
    food_name: meal.meal_name,
    serving_size: `${meal.items.length} foods`,
    quantity: 1,
    calories: meal.totals.calories,
    protein_g: meal.totals.protein_g,
    carbs_g: meal.totals.carbs_g,
    fat_g: meal.totals.fat_g,
    status: "planned",
    food_log_id: null,
    completed_at: null,
    notes: meal.notes
  };

  if (!canUseUserData(userId)) {
    return mockDelay({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as MealPlanItem);
  }

  const { data, error } = await supabase!.from("user_meal_plan_items").insert(payload).select("*").single();
  if (error) throw error;
  return data as MealPlanItem;
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
    console.warn("FitLife Hub could not load today's meal plan.", error.message);
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
  const isGlobalFood = food.is_global !== false;
  const payload = {
    user_id: userId,
    plan_date: todayIso(),
    meal_type: safeMealType,
    food_item_id: isGlobalFood && isUuid(food.id) ? food.id : null,
    user_food_item_id: !isGlobalFood && isUuid(food.id) ? food.id : null,
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
    console.warn("FitLife Hub could not add this food to My Meal Plan.", error.message);
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
    if (logUpdate.error) console.warn("FitLife Hub could not sync the linked calorie log.", logUpdate.error.message);
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
    console.warn("FitLife Hub could not delete this food log.", error.message);
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
    console.warn("FitLife Hub could not copy yesterday's meals.", error.message);
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

  const [workoutResult, videoResult, exerciseResult] = await Promise.all([
    supabase!.from("workouts").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercise_videos").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercises").select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global").eq("is_global", true).eq("is_approved", true).limit(5000)
  ]);

  if (workoutResult.error || videoResult.error) {
    console.warn(
      "FitLife Hub could not load workout categories, using local fallback.",
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
  if (!exerciseResult.error) {
    exerciseResult.data?.forEach((exercise) => {
      if (exercise.primary_muscle) categories.add(exercise.primary_muscle);
      (exercise.equipment ?? []).forEach((item: string) => categories.add(item));
    });
  }
  fallback.forEach((value) => categories.add(value));

  const values = Array.from(categories).filter(Boolean).sort();
  return values.length ? values : fallback;
}

export async function getWorkoutFilterOptions() {
  const fallback = getLocalWorkoutFilterOptions();
  if (!supabase) return mockDelay(fallback);

  const [workoutResult, videoResult, exerciseResult] = await Promise.all([
    supabase!.from("workouts").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercise_videos").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercises").select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global").eq("is_global", true).eq("is_approved", true).limit(5000)
  ]);

  if (workoutResult.error || videoResult.error) {
    console.warn(
      "FitLife Hub could not load workout filter metadata, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return fallback;
  }

  const workouts = ((workoutResult.data ?? []) as Workout[]).map(hydrateWorkoutMetadata);
  const videos = ((videoResult.data ?? []) as ExerciseVideo[]).map(mapVideoToWorkout);
  const approvedExercises = exerciseResult.error ? [] : ((exerciseResult.data ?? []) as ApprovedExerciseRow[]).map(mapApprovedExerciseToWorkout);
  const all = [...workouts, ...videos, ...approvedExercises];

  return {
    muscleCategories: uniqueSorted([...fallback.muscleCategories, ...all.map((item) => item.muscle_category ?? item.target_muscle)]),
    primaryMuscles: uniqueSorted([...fallback.primaryMuscles, ...all.map((item) => item.target_muscle ?? item.muscle_category)]),
    equipmentRequired: uniqueSorted([...fallback.equipmentRequired, ...all.map((item) => item.equipment_required ?? item.equipment)]),
    mechanics: uniqueSorted([...fallback.mechanics, ...all.map((item) => item.mechanics ?? item.category)]),
    exerciseTypes: uniqueSorted([...fallback.exerciseTypes, ...all.map((item) => item.category ?? item.mechanics)]),
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
  const selectedCategory = filters.category || filters.equipment || filters.muscleCategories?.[0] || filters.categories?.[0] || filters.equipmentRequired?.[0];
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

  let exerciseRequest = supabase!
    .from("exercises")
    .select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global")
    .eq("is_global", true)
    .eq("is_approved", true)
    .order("name")
    .limit(1200);
  if (query) {
    exerciseRequest = exerciseRequest.or(`name.ilike.%${query}%,primary_muscle.ilike.%${query}%,mechanics.ilike.%${query}%,movement_pattern.ilike.%${query}%`);
  }

  const [workoutResult, videoResult, exerciseResult] = await Promise.all([workoutRequest, videoRequest, exerciseRequest]);
  if (workoutResult.error || videoResult.error) {
    console.warn(
      "FitLife Hub could not load Supabase workouts, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return localMatches.slice(from, to + 1);
  }

  const directWorkouts = ((workoutResult.data ?? []) as Workout[]).map(hydrateWorkoutMetadata).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  const videoWorkouts = ((videoResult.data ?? []) as ExerciseVideo[]).map(mapVideoToWorkout).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  const approvedExercises = exerciseResult.error
    ? []
    : ((exerciseResult.data ?? []) as ApprovedExerciseRow[]).map(mapApprovedExerciseToWorkout).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  return dedupeWorkouts([...approvedExercises, ...localMatches, ...directWorkouts, ...videoWorkouts]).slice(from, to + 1);
}

export async function getWorkout(id: string) {
  const local = localWorkouts("").find((workout) => workout.id === id) ?? sampleWorkouts.map(hydrateWorkoutMetadata)[0];
  if (!supabase || !isUuid(id)) return mockDelay(local);

  const workoutResult = await supabase!.from("workouts").select("*").eq("id", id).maybeSingle();
  if (workoutResult.error) {
    console.warn("FitLife Hub could not load workout from workouts table.", workoutResult.error.message);
  }
  if (workoutResult.data) return hydrateWorkoutMetadata(workoutResult.data as Workout);

  const exerciseResult = await supabase!
    .from("exercises")
    .select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global")
    .eq("id", id)
    .eq("is_approved", true)
    .maybeSingle();
  if (exerciseResult.error) {
    console.warn("FitLife Hub could not load workout from approved exercises.", exerciseResult.error.message);
  }
  if (exerciseResult.data) return mapApprovedExerciseToWorkout(exerciseResult.data as ApprovedExerciseRow);

  const videoResult = await supabase!.from("exercise_videos").select("*").eq("id", id).maybeSingle();
  if (videoResult.error) {
    console.warn("FitLife Hub could not load workout from exercise videos.", videoResult.error.message);
    return local;
  }
  return videoResult.data ? mapVideoToWorkout(videoResult.data as ExerciseVideo) : local;
}

export async function getExerciseVideos(query = "") {
  const localVideos = dedupeExerciseVideos(sampleExerciseVideos).filter((video) => !query || normalizeText(video.exercise_name).includes(normalizeText(query)));
  if (!supabase) return mockDelay(localVideos);
  let request = supabase!.from("exercise_videos").select("*").order("exercise_name").limit(100);
  if (query) request = request.ilike("exercise_name", `%${query}%`);
  const { data, error } = await request;
  if (error) {
    console.warn("FitLife Hub could not load exercise videos, using local fallback.", error.message);
    return localVideos;
  }
  return dedupeExerciseVideos([...((data ?? []) as ExerciseVideo[]), ...localVideos]);
}

export async function getUserExerciseVideo(userId: string, exerciseId: string) {
  if (!canUseUserData(userId) || !exerciseId) return mockDelay<UserExerciseVideo | null>(null);
  const { data, error } = await supabase!
    .from("user_exercise_videos")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (error) {
    console.warn("FitLife Hub could not load custom exercise video.", error.message);
    return null;
  }
  return data as UserExerciseVideo | null;
}

export async function upsertUserExerciseVideo(userId: string, exerciseId: string, customVideoUrl: string) {
  const cleanUrl = customVideoUrl.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(cleanUrl)) throw new Error("Enter a valid http or https video URL.");
  const payload = { user_id: userId, exercise_id: exerciseId, custom_video_url: cleanUrl };
  if (!canUseUserData(userId)) return mockDelay({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as UserExerciseVideo);
  const { data, error } = await supabase!
    .from("user_exercise_videos")
    .upsert(payload, { onConflict: "user_id,exercise_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as UserExerciseVideo;
}

export async function resetUserExerciseVideo(userId: string, exerciseId: string) {
  if (!canUseUserData(userId)) return mockDelay(true);
  const { error } = await supabase!
    .from("user_exercise_videos")
    .delete()
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
  return true;
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
    console.warn("FitLife Hub could not start a Supabase workout session.", error.message);
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
    console.warn("FitLife Hub could not start a workout day session.", error.message);
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
    console.warn("FitLife Hub could not load the open workout session.", error.message);
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
    console.warn("FitLife Hub could not load workout session logs.", error.message);
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
    console.warn("FitLife Hub could not update workout duration.", error.message);
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
    console.warn("FitLife Hub could not complete this workout session.", error.message);
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
    console.warn("FitLife Hub could not skip this workout day.", error.message);
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
    console.warn("FitLife Hub could not load workout history.", error.message);
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
    console.warn("FitLife Hub could not load workout history details.", error.message);
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
    console.warn("FitLife Hub could not load workout activity.", error.message);
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
  template_id?: string | null;
  source?: "manual" | "generated_rules" | "template_recommendation";
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
    "id,user_id,name,is_active,is_default,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes))";
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
  if (!canUseUserData(userId)) return mockDelay<UserWorkoutPlan[]>([]);

  const selectWithSource =
    "id,user_id,name,is_active,is_default,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes))";
  const selectLegacy =
    "id,user_id,name,is_active,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes))";

  const result = await supabase!
    .from("user_workout_plans")
    .select(selectWithSource)
    .eq("user_id", userId)
    .or("source.is.null,source.eq.manual")
    .order("created_at", { ascending: false });
  let data: unknown = result.data;
  let error = result.error;

  if (error && isMissingTemplateSchemaError(error)) {
    const legacy = await supabase!
      .from("user_workout_plans")
      .select(selectLegacy)
      .eq("user_id", userId)
      .or("source.is.null,source.eq.manual")
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
  if (!canUseUserData(userId) || !isUuid(planId)) return mockDelay<UserWorkoutPlan | null>(null);
  const selectWithSource =
    "id,user_id,name,is_active,is_default,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes))";
  const selectLegacy =
    "id,user_id,name,is_active,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,video_url,sort_order,notes))";
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
  if (!canUseUserData(userId) || !isUuid(planId)) return mockDelay(true);

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
  if (!canUseUserData(userId) || !isUuid(planId)) return mockDelay(true);

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

export async function getWorkoutTemplateWeekOptions() {
  return mockDelay({ min: 1, max: 16, values: [1, 2, 3, 4, 6, 8, 10, 12, 16] });
}

export async function getWorkoutTemplateDurationOptions() {
  return mockDelay({ min: 20, max: 90, values: [20, 30, 45, 60, 75, 90] });
}

export async function getGeneratedWorkoutPlan(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<GeneratedWorkoutPlan | null>(null);

  const { data, error } = await supabase!
    .from("user_workout_plans")
    .select(
      "id,user_id,name,is_active,is_default,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes)),user_workout_sessions(id,user_id,user_workout_plan_id,workout_template_day_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes,user_exercise_logs(id,user_workout_session_id,workout_template_exercise_id,plan_exercise_id,exercise_order,exercise_name,planned_sets,planned_reps,weight_kg,reps,notes,completed,completed_at,created_at,updated_at))"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("source", "generated_rules")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("FitLife Hub could not load the generated workout plan.", error.message);
    return null;
  }

  return data ? normalizeGeneratedWorkoutPlan(data as unknown as RawGeneratedPlan) : null;
}

export async function getGeneratedWorkoutPlans(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<GeneratedWorkoutPlan[]>([]);

  const { data, error } = await supabase!
    .from("user_workout_plans")
    .select(
      "id,user_id,name,is_active,is_default,template_id,source,match_score,match_explanation,match_reasons,program_duration_weeks,days_per_week,created_at,updated_at,user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,user_workout_plan_exercises(id,plan_day_id,workout_id,source_workout_id,exercise_name,category,target_muscle,equipment,sets,reps,rest_seconds,instructions,exercise_url,video_url,custom_video_url,sort_order,notes))"
    )
    .eq("user_id", userId)
    .eq("source", "generated_rules")
    .order("match_score", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("FitLife Hub could not load generated workout plans.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawGeneratedPlan[]).map((plan) =>
    normalizeGeneratedWorkoutPlan({ ...plan, user_workout_sessions: plan.user_workout_sessions ?? [] })
  );
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
    if (!isMissingTemplateSchemaError(error)) console.warn("FitLife Hub could not load generated workout history.", error.message);
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
    if (!isMissingTemplateSchemaError(error)) console.warn("FitLife Hub could not load generated workout activity.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawGeneratedSession[]).map((session) => mapGeneratedSessionToWorkoutSession(normalizeGeneratedSession(session)));
}

export async function getUserWorkoutPlanDay(dayId: string) {
  if (!supabase) return mockDelay<WorkoutPlanDaySession | null>(null);

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
    return mockDelay({
      id: crypto.randomUUID(),
      plan_id: planId,
      day_number: 1,
      day_name: cleanName,
      weekday: day.weekday,
      notes: day.notes || null,
      exercises: []
    } as UserWorkoutPlan["days"][number]);
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

  if (!canUseUserData(userId)) {
    return mockDelay({ id: crypto.randomUUID(), name: planName, days: cleanDays });
  }

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


export async function saveOnboarding(answers: OnboardingAnswers) {
  if (!canUseUserData(answers.user_id)) return mockDelay(answers);
  let { data, error } = await supabase!.from("onboarding_answers").upsert(answers, { onConflict: "user_id" }).select("*").single();
  if (
    error &&
    (
      error.message.toLowerCase().includes("available_equipment") ||
      error.message.toLowerCase().includes("desired_duration_weeks") ||
      error.message.toLowerCase().includes("goals") ||
      error.message.toLowerCase().includes("training_cycle") ||
      error.message.toLowerCase().includes("min_workout_duration_minutes") ||
      error.message.toLowerCase().includes("max_workout_duration_minutes")
    )
  ) {
    const {
      available_equipment: _availableEquipment,
      desired_duration_weeks: _desiredDurationWeeks,
      goals: _goals,
      training_cycle: _trainingCycle,
      min_workout_duration_minutes: _minWorkoutDuration,
      max_workout_duration_minutes: _maxWorkoutDuration,
      ...compatibleAnswers
    } = answers;
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

function mockStamped<T extends { user_id: string }>(payload: T) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), created_at: now, updated_at: now, ...payload };
}

export type DailyFitTaskInput = Omit<DailyFitTask, "id" | "created_at" | "updated_at"> & { id?: string };

export async function getDailyFitTasks(userId: string, date = todayIso()) {
  if (!canUseUserData(userId)) return mockDelay<DailyFitTask[]>([]);
  const { data, error } = await supabase!
    .from("daily_fit_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("task_date", date)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("FitLife Hub could not load daily fit tasks.", error.message);
    return [];
  }
  return (data ?? []) as DailyFitTask[];
}

export async function upsertDailyFitTask(input: DailyFitTaskInput) {
  const payload = { ...input, title: input.title.trim(), notes: input.notes?.trim() || null };
  if (!payload.title) throw new Error("Task title is required.");
  if (!canUseUserData(input.user_id)) return mockDelay(mockStamped(payload) as DailyFitTask);
  const { data, error } = await supabase!.from("daily_fit_tasks").upsert(payload).select("*").single();
  if (error) throw error;
  return data as DailyFitTask;
}

export async function deleteDailyFitTask(userId: string, id: string) {
  if (!canUseUserData(userId) || !isUuid(id)) return mockDelay(true);
  const { error } = await supabase!.from("daily_fit_tasks").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export type FitnessHabitInput = Omit<FitnessHabit, "id" | "created_at" | "updated_at"> & { id?: string };

export async function getFitnessHabits(userId: string, date = todayIso()) {
  if (!canUseUserData(userId)) return mockDelay<FitnessHabit[]>([]);
  const { data, error } = await supabase!
    .from("fitness_habits")
    .select("*")
    .eq("user_id", userId)
    .eq("habit_date", date)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("FitLife Hub could not load fitness habits.", error.message);
    return [];
  }
  return (data ?? []) as FitnessHabit[];
}

export async function upsertFitnessHabit(input: FitnessHabitInput) {
  const payload = { ...input, name: input.name.trim(), notes: input.notes?.trim() || null };
  if (!payload.name) throw new Error("Habit name is required.");
  if (!canUseUserData(input.user_id)) return mockDelay(mockStamped(payload) as FitnessHabit);
  const { data, error } = await supabase!.from("fitness_habits").upsert(payload).select("*").single();
  if (error) throw error;
  return data as FitnessHabit;
}

export async function deleteFitnessHabit(userId: string, id: string) {
  if (!canUseUserData(userId) || !isUuid(id)) return mockDelay(true);
  const { error } = await supabase!.from("fitness_habits").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export type SleepRecoveryInput = Omit<SleepRecoveryLog, "id" | "created_at" | "updated_at"> & { id?: string };

export async function getSleepRecoveryLogs(userId: string, limit = 30) {
  if (!canUseUserData(userId)) return mockDelay<SleepRecoveryLog[]>([]);
  const { data, error } = await supabase!
    .from("sleep_recovery_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("FitLife Hub could not load sleep and recovery logs.", error.message);
    return [];
  }
  return (data ?? []) as SleepRecoveryLog[];
}

export async function upsertSleepRecoveryLog(input: SleepRecoveryInput) {
  const payload = { ...input, notes: input.notes?.trim() || null };
  if (!canUseUserData(input.user_id)) return mockDelay(mockStamped(payload) as SleepRecoveryLog);
  const { data, error } = await supabase!.from("sleep_recovery_logs").upsert(payload).select("*").single();
  if (error) throw error;
  return data as SleepRecoveryLog;
}

export async function deleteSleepRecoveryLog(userId: string, id: string) {
  if (!canUseUserData(userId) || !isUuid(id)) return mockDelay(true);
  const { error } = await supabase!.from("sleep_recovery_logs").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export type SupplementLogInput = Omit<SupplementLog, "id" | "created_at" | "updated_at"> & { id?: string };

export async function getSupplementLogs(userId: string, date = todayIso()) {
  if (!canUseUserData(userId)) return mockDelay<SupplementLog[]>([]);
  const { data, error } = await supabase!
    .from("supplement_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("supplement_date", date)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("FitLife Hub could not load supplements.", error.message);
    return [];
  }
  return (data ?? []) as SupplementLog[];
}

export async function upsertSupplementLog(input: SupplementLogInput) {
  const payload = {
    ...input,
    name: input.name.trim(),
    dose: input.dose?.trim() || null,
    time: input.time?.trim() || null,
    reminder: input.reminder?.trim() || null
  };
  if (!payload.name) throw new Error("Supplement name is required.");
  if (!canUseUserData(input.user_id)) return mockDelay(mockStamped(payload) as SupplementLog);
  const { data, error } = await supabase!.from("supplement_logs").upsert(payload).select("*").single();
  if (error) throw error;
  return data as SupplementLog;
}

export async function deleteSupplementLog(userId: string, id: string) {
  if (!canUseUserData(userId) || !isUuid(id)) return mockDelay(true);
  const { error } = await supabase!.from("supplement_logs").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export type PersonalRecordInput = Omit<PersonalRecord, "id" | "created_at" | "updated_at"> & { id?: string };

export async function getPersonalRecords(userId: string, limit = 100) {
  if (!canUseUserData(userId)) return mockDelay<PersonalRecord[]>([]);
  const { data, error } = await supabase!
    .from("personal_records")
    .select("*")
    .eq("user_id", userId)
    .order("exercise_name", { ascending: true })
    .order("record_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("FitLife Hub could not load personal records.", error.message);
    return [];
  }
  return (data ?? []) as PersonalRecord[];
}

export async function upsertPersonalRecord(input: PersonalRecordInput) {
  const payload = {
    ...input,
    exercise_name: input.exercise_name.trim(),
    record_type: input.record_type.trim(),
    notes: input.notes?.trim() || null
  };
  if (!payload.exercise_name) throw new Error("Exercise name is required.");
  if (!payload.record_type) throw new Error("Record type is required.");
  if (!canUseUserData(input.user_id)) return mockDelay(mockStamped(payload) as PersonalRecord);
  const { data, error } = await supabase!.from("personal_records").upsert(payload).select("*").single();
  if (error) throw error;
  return data as PersonalRecord;
}

export async function deletePersonalRecord(userId: string, id: string) {
  if (!canUseUserData(userId) || !isUuid(id)) return mockDelay(true);
  const { error } = await supabase!.from("personal_records").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export async function getProgressEntries(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<ProgressEntry[]>([]);
  const { data, error } = await supabase!
    .from("progress_entries")
    .select("*")
    .eq("user_id", userId)
    .order("entry_date", { ascending: true });
  if (error) {
    console.warn("FitLife Hub could not load progress entries.", error.message);
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
    console.warn("FitLife Hub could not load body measurements.", measurementError.message);
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
    default_message: "Welcome back to FitLife Hub. Ready for today?"
  };
  if (!canUseUserData(userId)) return fallback;

  const [settingsResult, customResult] = await Promise.all([
    supabase!.from("admin_settings").select("value").eq("key", "welcome_settings").maybeSingle(),
    supabase!.from("user_welcome_messages").select("message,popup_enabled,show_frequency").eq("user_id", userId).eq("is_active", true).maybeSingle()
  ]);

  if (settingsResult.error || customResult.error) {
    console.warn(
      "FitLife Hub could not load welcome settings.",
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
      { id: "mock-user", email: "member@ssgym.test", full_name: "FitLife Hub Member", role: "admin" }
    ]);
  }
  const { data, error } = await supabase!.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: false });
  if (error) {
    console.warn("FitLife Hub could not load admin users.", error.message);
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
