import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getMcpActivityForUser } from "@/lib/mcp/activity";

type JsonRow = Record<string, unknown>;

const OWNED_EXPORT_TABLES = [
  "onboarding_answers",
  "user_app_settings",
  "user_ai_permission_settings",
  "user_consents",
  "user_fitness_constraints",
  "user_nutrition_preference_profiles",
  "user_nutrition_target_profiles",
  "user_welcome_messages",
  "user_workout_plans",
  "workout_sessions",
  "user_workout_sessions",
  "user_progression_targets",
  "user_exercise_alternatives",
  "user_exercise_favorites",
  "user_custom_exercises",
  "user_custom_exercise_mapping_sets",
  "user_exercise_videos",
  "food_logs",
  "calorie_targets",
  "user_food_items",
  "user_meal_plan_items",
  "custom_meals",
  "meals",
  "saved_recipes",
  "user_food_favorites",
  "user_grocery_items",
  "user_shopping_checks",
  "imported_foods",
  "imported_cardio_activities",
  "water_logs",
  "progress_entries",
  "body_measurements",
  "progress_photos",
  "personal_records",
  "daily_fit_tasks",
  "fitness_habits",
  "sleep_recovery_logs",
  "supplement_logs",
  "user_daily_checkins"
] as const;

type OwnedExportTable = (typeof OWNED_EXPORT_TABLES)[number];

export type StorageManifestEntry = {
  bucket: "progress-photos";
  path: string;
  record_id: string | null;
  kind: "progress_photo";
};

export type PlaivraDataExport = {
  format: "plaivra-user-data-export";
  formatVersion: 2;
  generatedAt: string;
  scope: "authenticated-current-user-canonical-data";
  account: Record<string, unknown>;
  data: Record<string, unknown>;
  storageManifest: StorageManifestEntry[];
  warnings: string[];
};

function ids(rows: JsonRow[], key = "id") {
  return rows.map((row) => row[key]).filter((value): value is string => typeof value === "string");
}

async function listUserStoragePaths(supabase: SupabaseClient, userId: string, warnings: string[]) {
  if (!supabase.storage?.from) return [] as string[];
  const storage = supabase.storage.from("progress-photos");
  async function list(prefix: string): Promise<string[]> {
    const paths: string[] = [];
    for (let offset = 0; offset < 10_000; offset += 1000) {
      const result = await storage.list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (result.error) {
        warnings.push("The private storage manifest could not be fully enumerated.");
        return paths;
      }
      const entries = result.data ?? [];
      for (const entry of entries) {
        const path = `${prefix}/${entry.name}`;
        if (entry.id) paths.push(path);
        else paths.push(...await list(path));
      }
      if (entries.length < 1000) break;
    }
    return paths;
  }
  return list(userId);
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
    if ((data?.length ?? 0) === 5000) warnings.push(`${table} reached the per-table export safety limit; contact support for a complete assisted export.`);
    return (data ?? []) as JsonRow[];
  }

  async function relatedRows(table: string, foreignKey: string, ownerIds: string[]) {
    if (!ownerIds.length) return [] as JsonRow[];
    const { data, error } = await supabase.from(table).select("*").in(foreignKey, ownerIds).limit(5000);
    if (error) {
      warnings.push(`${table} could not be included in this export.`);
      return [] as JsonRow[];
    }
    if ((data?.length ?? 0) === 5000) warnings.push(`${table} reached the per-table export safety limit; contact support for a complete assisted export.`);
    return (data ?? []) as JsonRow[];
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id,email,full_name,avatar_url,role,goal,weight_kg,target_weight_kg,height_cm,age,gender,activity_level,training_level,body_goal,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileResult.error) warnings.push("profile could not be included in this export.");

  const connectionResult = await supabase
    .from("chatgpt_connections")
    .select("id,label,scopes,is_active,last_used_at,revoked_at,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (connectionResult.error) warnings.push("ChatGPT connection metadata could not be included in this export.");

  const privacyRequestResult = await supabase
    .from("privacy_requests")
    .select("id,request_type,status,message,completed_at,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (privacyRequestResult.error) warnings.push("Privacy request history could not be included in this export.");

  const integrationResult = await supabase
    .from("user_integrations")
    .select("id,provider,expires_at,scopes,provider_user_id,connected_at,updated_at")
    .eq("user_id", user.id)
    .limit(5000);
  if (integrationResult.error) warnings.push("External integration metadata could not be included in this export.");

  const accountStateResult = await supabase
    .from("account_access_states")
    .select("state,reason_code,disabled_at,created_at,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (accountStateResult.error) warnings.push("Account lifecycle status could not be included in this export.");

  const tableEntries = await Promise.all(
    OWNED_EXPORT_TABLES.map(async (table) => [table, await ownedRows(table)] as const)
  );
  const owned = Object.fromEntries(tableEntries) as Record<OwnedExportTable, JsonRow[]>;

  const planDays = await relatedRows("user_workout_plan_days", "plan_id", ids(owned.user_workout_plans));
  const planExercises = await relatedRows("user_workout_plan_exercises", "plan_day_id", ids(planDays));
  const planWeekTemplates = await relatedRows("user_workout_plan_week_templates", "plan_id", ids(owned.user_workout_plans));
  const planWeeks = await relatedRows("user_workout_plan_weeks", "plan_id", ids(owned.user_workout_plans));
  const planSessionsV2 = await relatedRows("user_workout_plan_sessions", "week_template_id", ids(planWeekTemplates));
  const planPhasesV2 = await relatedRows("user_workout_plan_phases", "plan_session_id", ids(planSessionsV2));
  const planActivitiesV2 = await relatedRows("user_workout_plan_activities", "plan_phase_id", ids(planPhasesV2));
  const planBlocks = await relatedRows("user_workout_plan_blocks", "plan_day_id", ids(planDays));
  const planBlockItems = await relatedRows("user_workout_plan_block_items", "block_id", ids(planBlocks));
  const exerciseLogs = await relatedRows("exercise_logs", "workout_session_id", ids(owned.workout_sessions));
  const userExerciseLogs = await relatedRows("user_exercise_logs", "user_workout_session_id", ids(owned.user_workout_sessions));
  const customExerciseMappingEntries = await relatedRows(
    "user_custom_exercise_mapping_entries",
    "mapping_set_id",
    ids(owned.user_custom_exercise_mapping_sets)
  );
  const customMealItems = await relatedRows("custom_meal_items", "meal_id", ids(owned.custom_meals));
  const mealFoodItems = await relatedRows("meal_food_items", "meal_id", ids(owned.meals));
  const recipeIngredients = await relatedRows("saved_recipe_ingredients", "recipe_id", ids(owned.saved_recipes));

  let chatGptActivity: Awaited<ReturnType<typeof getMcpActivityForUser>> = [];
  try {
    chatGptActivity = await getMcpActivityForUser(supabase, user.id, 5000);
  } catch {
    warnings.push("Redacted ChatGPT activity could not be included in this export.");
  }

  const metadataStorageManifest = owned.progress_photos.flatMap<StorageManifestEntry>((photo) => {
    if (typeof photo.storage_path !== "string" || !photo.storage_path) return [];
    return [{
      bucket: "progress-photos",
      path: photo.storage_path,
      record_id: typeof photo.id === "string" ? photo.id : null,
      kind: "progress_photo"
    }];
  });
  const discoveredStoragePaths = await listUserStoragePaths(supabase, user.id, warnings);
  const knownPaths = new Set(metadataStorageManifest.map((item) => item.path));
  const storageManifest = [
    ...metadataStorageManifest,
    ...discoveredStoragePaths.filter((path) => !knownPaths.has(path)).map<StorageManifestEntry>((path) => ({
      bucket: "progress-photos",
      path,
      record_id: null,
      kind: "progress_photo"
    }))
  ];

  return {
    format: "plaivra-user-data-export",
    formatVersion: 2,
    generatedAt: new Date().toISOString(),
    scope: "authenticated-current-user-canonical-data",
    account: {
      auth_user_id: user.id,
      email: user.email ?? null,
      created_at: user.created_at,
      profile: profileResult.data ?? null,
      lifecycle: accountStateResult.data ?? null
    },
    data: {
      onboarding: owned.onboarding_answers,
      app_settings: owned.user_app_settings,
      ai_permissions: owned.user_ai_permission_settings,
      consent_history: owned.user_consents,
      privacy_requests: privacyRequestResult.data ?? [],
      functional_constraints: owned.user_fitness_constraints,
      welcome_messages: owned.user_welcome_messages,
      chatgpt_connections: connectionResult.data ?? [],
      chatgpt_activity: chatGptActivity,
      external_integration_metadata: integrationResult.data ?? [],
      workouts: {
        plans: owned.user_workout_plans,
        plan_days: planDays,
        plan_exercises: planExercises,
        program_week_templates: planWeekTemplates,
        program_weeks: planWeeks,
        program_sessions: planSessionsV2,
        program_phases: planPhasesV2,
        planned_activities: planActivitiesV2,
        legacy_plan_blocks: planBlocks,
        legacy_plan_block_items: planBlockItems,
        sessions: owned.workout_sessions,
        exercise_logs: exerciseLogs,
        scheduled_sessions: owned.user_workout_sessions,
        scheduled_exercise_logs: userExerciseLogs,
        progression_targets: owned.user_progression_targets,
        exercise_alternatives: owned.user_exercise_alternatives,
        exercise_favorites: owned.user_exercise_favorites,
        custom_exercises: owned.user_custom_exercises,
        custom_exercise_mapping_sets: owned.user_custom_exercise_mapping_sets,
        custom_exercise_mapping_entries: customExerciseMappingEntries,
        exercise_videos: owned.user_exercise_videos
      },
      nutrition: {
        preference_profiles: owned.user_nutrition_preference_profiles,
        target_profiles: owned.user_nutrition_target_profiles,
        food_logs: owned.food_logs,
        calorie_targets: owned.calorie_targets,
        custom_foods: owned.user_food_items,
        meal_plan_items: owned.user_meal_plan_items,
        custom_meals: owned.custom_meals,
        custom_meal_items: customMealItems,
        saved_meals: owned.meals,
        saved_meal_items: mealFoodItems,
        food_favorites: owned.user_food_favorites,
        saved_recipes: owned.saved_recipes,
        saved_recipe_ingredients: recipeIngredients,
        grocery_items: owned.user_grocery_items,
        shopping_checks: owned.user_shopping_checks,
        imported_foods: owned.imported_foods
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
        supplements: owned.supplement_logs,
        daily_checkins: owned.user_daily_checkins,
        imported_cardio_activities: owned.imported_cardio_activities
      }
    },
    storageManifest,
    warnings
  };
}
