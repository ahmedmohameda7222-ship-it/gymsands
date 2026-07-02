import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getMcpActivityForUser } from "@/lib/mcp/activity";

type JsonRow = Record<string, unknown>;

const OWNED_EXPORT_TABLES = [
  "onboarding_answers",
  "user_app_settings",
  "user_ai_permission_settings",
  "user_consents",
  "privacy_requests",
  "user_workout_plans",
  "workout_sessions",
  "user_workout_sessions",
  "food_logs",
  "calorie_targets",
  "user_food_items",
  "user_meal_plan_items",
  "meals",
  "water_logs",
  "progress_entries",
  "body_measurements",
  "progress_photos",
  "personal_records",
  "daily_fit_tasks",
  "fitness_habits",
  "sleep_recovery_logs",
  "supplement_logs",
  "user_exercise_favorites",
  "user_custom_exercises",
  "user_exercise_videos",
  "user_food_favorites",
  "saved_recipes",
  "user_shopping_checks"
] as const;

type OwnedExportTable = (typeof OWNED_EXPORT_TABLES)[number];

export type PlaivraDataExport = {
  format: "plaivra-user-data-export";
  formatVersion: 1;
  generatedAt: string;
  scope: "authenticated-current-user-meaningful-subset";
  account: Record<string, unknown>;
  data: Record<string, unknown>;
  warnings: string[];
};

function ids(rows: JsonRow[], key = "id") {
  return rows.map((row) => row[key]).filter((value): value is string => typeof value === "string");
}

export async function buildCurrentUserDataExport(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email" | "created_at">
): Promise<PlaivraDataExport> {
  const warnings: string[] = [];

  async function ownedRows(table: OwnedExportTable) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", user.id)
      .limit(5000);
    if (error) {
      warnings.push(`${table} could not be included in this export.`);
      return [] as JsonRow[];
    }
    return (data ?? []) as JsonRow[];
  }

  async function relatedRows(table: string, foreignKey: string, ownerIds: string[]) {
    if (!ownerIds.length) return [] as JsonRow[];
    const { data, error } = await supabase.from(table).select("*").in(foreignKey, ownerIds).limit(5000);
    if (error) {
      warnings.push(`${table} could not be included in this export.`);
      return [] as JsonRow[];
    }
    return (data ?? []) as JsonRow[];
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id,email,full_name,avatar_url,role,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileResult.error) warnings.push("profile could not be included in this export.");

  const connectionResult = await supabase
    .from("chatgpt_connections")
    .select("id,label,scopes,is_active,last_used_at,revoked_at,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (connectionResult.error) warnings.push("ChatGPT connection metadata could not be included in this export.");

  const tableEntries = await Promise.all(
    OWNED_EXPORT_TABLES.map(async (table) => [table, await ownedRows(table)] as const)
  );
  const owned = Object.fromEntries(tableEntries) as Record<OwnedExportTable, JsonRow[]>;

  const planDays = await relatedRows("user_workout_plan_days", "plan_id", ids(owned.user_workout_plans));
  const planExercises = await relatedRows("user_workout_plan_exercises", "plan_day_id", ids(planDays));
  const exerciseLogs = await relatedRows("exercise_logs", "workout_session_id", ids(owned.workout_sessions));
  const userExerciseLogs = await relatedRows("user_exercise_logs", "user_workout_session_id", ids(owned.user_workout_sessions));
  const mealFoodItems = await relatedRows("meal_food_items", "meal_id", ids(owned.meals));
  const recipeIngredients = await relatedRows("saved_recipe_ingredients", "recipe_id", ids(owned.saved_recipes));

  let chatGptActivity: Awaited<ReturnType<typeof getMcpActivityForUser>> = [];
  try {
    chatGptActivity = await getMcpActivityForUser(supabase, user.id, 50);
  } catch {
    warnings.push("Recent redacted ChatGPT activity could not be included in this export.");
  }

  return {
    format: "plaivra-user-data-export",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: "authenticated-current-user-meaningful-subset",
    account: {
      auth_user_id: user.id,
      email: user.email ?? null,
      created_at: user.created_at,
      profile: profileResult.data ?? null
    },
    data: {
      onboarding: owned.onboarding_answers,
      app_settings: owned.user_app_settings,
      ai_permissions: owned.user_ai_permission_settings,
      consent_history: owned.user_consents,
      privacy_requests: owned.privacy_requests,
      chatgpt_connections: connectionResult.data ?? [],
      chatgpt_activity: chatGptActivity,
      workouts: {
        plans: owned.user_workout_plans,
        plan_days: planDays,
        plan_exercises: planExercises,
        sessions: owned.workout_sessions,
        exercise_logs: exerciseLogs,
        scheduled_sessions: owned.user_workout_sessions,
        scheduled_exercise_logs: userExerciseLogs,
        exercise_favorites: owned.user_exercise_favorites,
        custom_exercises: owned.user_custom_exercises,
        exercise_videos: owned.user_exercise_videos
      },
      nutrition: {
        food_logs: owned.food_logs,
        calorie_targets: owned.calorie_targets,
        custom_foods: owned.user_food_items,
        meal_plan_items: owned.user_meal_plan_items,
        saved_meals: owned.meals,
        saved_meal_items: mealFoodItems,
        food_favorites: owned.user_food_favorites,
        saved_recipes: owned.saved_recipes,
        saved_recipe_ingredients: recipeIngredients,
        shopping_checks: owned.user_shopping_checks
      },
      hydration: owned.water_logs,
      progress: {
        entries: owned.progress_entries,
        measurements: owned.body_measurements,
        photo_metadata: owned.progress_photos,
        personal_records: owned.personal_records
      },
      wellness: {
        daily_tasks: owned.daily_fit_tasks,
        habits: owned.fitness_habits,
        sleep_recovery: owned.sleep_recovery_logs,
        supplements: owned.supplement_logs
      }
    },
    warnings
  };
}
