import { emptyInputSchema } from "@/lib/mcp/schemas";

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: "read" | "low" | "medium" | "high" | "admin";
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
    idempotentHint?: boolean;
  };
};

type McpToolSource = Omit<McpToolDefinition, "annotations">;

const isoDate = { type: "string", description: "ISO date YYYY-MM-DD, or today where supported." };
const confirm = { type: "boolean", description: "Set true only after explicit user confirmation." };
const mealTypeLower = { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] };

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function arrayOf(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "array", items: objectSchema(properties, required) };
}

const foodInput = {
  food_name: { type: "string" },
  quantity: { type: "number" },
  serving_hint: { type: "string" }
};

const mealPlanFoodInput = {
  food_name: { type: "string" },
  quantity: { type: "number" },
  serving_info: { type: "string" },
  calories: { type: "number" },
  protein: { type: "number" },
  carbs: { type: "number" },
  fat: { type: "number" },
  notes: { type: "string" }
};

const planExerciseInput = {
  exercise_name: { type: "string" },
  target_muscle: { type: "string" },
  equipment: { type: "string" },
  sets: { type: "number" },
  reps: { type: "string" },
  weight: { type: "string" },
  rest_seconds: { type: "number" },
  tempo: { type: "string" },
  instructions: { type: "string" },
  notes: { type: "string" },
  order_index: { type: "number" }
};

const dayInput = {
  day_name: { type: "string" },
  day_number: { type: "number" },
  focus: { type: "string" },
  weekday: { type: "string" },
  session_duration_minutes: { type: "number" },
  notes: { type: "string" },
  warmup: arrayOf(planExerciseInput, ["exercise_name"]),
  exercises: arrayOf(planExerciseInput, ["exercise_name"]),
  cardio: arrayOf(planExerciseInput, ["exercise_name"]),
  cooldown: arrayOf(planExerciseInput, ["exercise_name"])
};

const customFoodSchema = {
  food_name: { type: "string" },
  serving_size: { type: "string" },
  calories: { type: "number" },
  protein_g: { type: "number" },
  carbs_g: { type: "number" },
  fat_g: { type: "number" },
  category: { type: "string" },
  cuisine: { type: "string" },
  kitchen_id: { type: "string" },
  fiber_g: { type: "number" },
  sugar_g: { type: "number" },
  sodium_mg: { type: "number" },
  notes: { type: "string" }
};

const toolDefinitions: McpToolSource[] = [
  { name: "get_fitlife_status", title: "Get Plaivra status", description: "Validate the connection and return linked Plaivra account identity.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "get_user_profile", title: "Get user profile", description: "Return profile, onboarding, calorie targets, goal, training level, and water target.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "get_today_summary", title: "Get today's summary", description: "Return today's calorie totals, planned meals, workout, and water total.", inputSchema: emptyInputSchema, risk: "read" },

  { name: "search_foods", title: "Search foods", description: "Search global and user foods before logging ambiguous foods.", inputSchema: objectSchema({ query: { type: "string" }, limit: { type: "number" }, meal_type: { type: "string" } }, ["query"]), risk: "read" },
  { name: "create_kitchen", title: "Create kitchen", description: "Create a named, user-owned collection for custom foods.", inputSchema: objectSchema({ name: { type: "string" } }, ["name"]), risk: "low" },
  { name: "get_kitchens", title: "Get kitchens", description: "List user and system kitchens.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "update_kitchen", title: "Update kitchen", description: "Rename a user-owned kitchen.", inputSchema: objectSchema({ kitchen_id: { type: "string" }, name: { type: "string" } }, ["kitchen_id", "name"]), risk: "medium" },
  { name: "delete_kitchen", title: "Delete kitchen", description: "Permanently delete a user-owned food collection. Requires confirm:true.", inputSchema: objectSchema({ kitchen_id: { type: "string" }, confirm }, ["kitchen_id", "confirm"]), risk: "high" },
  { name: "assign_food_to_kitchen", title: "Assign food to kitchen", description: "Assign a user food item to a kitchen.", inputSchema: objectSchema({ user_food_item_id: { type: "string" }, kitchen_id: { type: "string" } }, ["user_food_item_id", "kitchen_id"]), risk: "low" },
  { name: "get_foods_by_kitchen", title: "Get foods by kitchen", description: "Return foods assigned to a kitchen.", inputSchema: objectSchema({ kitchen_id: { type: "string" } }, ["kitchen_id"]), risk: "read" },
  { name: "add_food_log", title: "Add food log", description: "Log meal items using Plaivra nutrition data, not model-guessed calories. Returns candidates if ambiguous.", inputSchema: objectSchema({ meal_type: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] }, date: isoDate, items: arrayOf(foodInput, ["food_name", "quantity"]), notes: { type: "string" } }, ["meal_type", "items"]), risk: "low" },
  { name: "get_food_logs_by_date", title: "Get food logs by date", description: "List food logs for a date so ChatGPT can find duplicates before editing/deleting.", inputSchema: objectSchema({ date: isoDate }, ["date"]), risk: "read" },
  { name: "update_food_log", title: "Update food log", description: "Update a user-owned food log.", inputSchema: objectSchema({ food_log_id: { type: "string" }, meal_type: { type: "string" }, quantity: { type: "number" }, calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" }, notes: { type: "string" } }, ["food_log_id"]), risk: "medium" },
  { name: "move_food_log_meal_type", title: "Move food log meal type", description: "Move a food log to another meal type.", inputSchema: objectSchema({ food_log_id: { type: "string" }, meal_type: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] } }, ["food_log_id", "meal_type"]), risk: "medium" },
  { name: "delete_food_log", title: "Delete food log", description: "Permanently delete a user-owned eaten-food log. Requires confirm:true.", inputSchema: objectSchema({ food_log_id: { type: "string" }, confirm }, ["food_log_id", "confirm"]), risk: "high" },
  { name: "create_custom_food", title: "Create custom food", description: "Create a user-owned custom food with full nutrition and optional kitchen_id.", inputSchema: objectSchema(customFoodSchema, ["food_name", "serving_size", "calories", "protein_g", "carbs_g", "fat_g"]), risk: "medium" },
  { name: "create_custom_meal", title: "Create custom meal", description: "Create a saved custom meal from Plaivra foods.", inputSchema: objectSchema({ meal_name: { type: "string" }, meal_category: { type: "string" }, items: arrayOf(foodInput, ["food_name", "quantity"]), notes: { type: "string" } }, ["meal_name", "items"]), risk: "medium" },
  { name: "get_today_calories", title: "Get today's calories", description: "Return calorie target, consumed, remaining, and macro breakdown.", inputSchema: emptyInputSchema, risk: "read" },

  { name: "get_meal_plan", title: "Get meal plan", description: "Return planned meals by date and meal type.", inputSchema: objectSchema({ start_date: isoDate, end_date: isoDate }, ["start_date", "end_date"]), risk: "read" },
  { name: "get_meal_plan_for_date", title: "Get meal plan for date", description: "Return one date's planned meals grouped by breakfast, lunch, dinner, and snack.", inputSchema: objectSchema({ date: isoDate }, ["date"]), risk: "read" },
  { name: "get_meal_plan_for_week", title: "Get meal plan for week", description: "Return 7 days of planned meals grouped by date and meal type.", inputSchema: objectSchema({ start_date: isoDate }, ["start_date"]), risk: "read" },
  { name: "create_meal_plan_item", title: "Create meal plan item", description: "Create one planned meal item from direct food name and macro values. Does not require an existing food item and does not log eaten food.", inputSchema: objectSchema({ date: isoDate, meal_type: mealTypeLower, ...mealPlanFoodInput }, ["date", "meal_type", "food_name"]), risk: "low" },
  { name: "create_day_meal_plan", title: "Create day meal plan", description: "Create breakfast/lunch/dinner/snack planned meals for one date from direct macro values.", inputSchema: objectSchema({ date: isoDate, breakfast: arrayOf(mealPlanFoodInput, ["food_name"]), lunch: arrayOf(mealPlanFoodInput, ["food_name"]), dinner: arrayOf(mealPlanFoodInput, ["food_name"]), snack: arrayOf(mealPlanFoodInput, ["food_name"]) }, ["date"]), risk: "medium" },
  { name: "create_week_meal_plan", title: "Create week meal plan", description: "Create planned meals for multiple dates from direct macro values. Does not mark meals eaten.", inputSchema: objectSchema({ start_date: isoDate, days: arrayOf({ date: isoDate, meals: objectSchema({ breakfast: arrayOf(mealPlanFoodInput, ["food_name"]), lunch: arrayOf(mealPlanFoodInput, ["food_name"]), dinner: arrayOf(mealPlanFoodInput, ["food_name"]), snack: arrayOf(mealPlanFoodInput, ["food_name"]) }) }, ["date"]) }, ["start_date", "days"]), risk: "medium" },
  { name: "update_meal_plan_item", title: "Update meal plan item", description: "Update a planned meal item owned by the current user without touching food logs unless it is later marked done.", inputSchema: objectSchema({ meal_plan_item_id: { type: "string" }, date: isoDate, meal_type: mealTypeLower, ...mealPlanFoodInput }, ["meal_plan_item_id"]), risk: "medium" },
  { name: "replace_meal_plan_item", title: "Replace meal plan item", description: "Compatibility alias for update_meal_plan_item.", inputSchema: objectSchema({ meal_plan_item_id: { type: "string" }, date: isoDate, meal_type: mealTypeLower, ...mealPlanFoodInput }, ["meal_plan_item_id"]), risk: "medium" },
  { name: "delete_meal_plan_item", title: "Delete meal plan item", description: "Permanently delete a planned meal item. Requires confirm:true. If it was completed, the linked food log is kept to preserve eaten-calorie history.", inputSchema: objectSchema({ meal_plan_item_id: { type: "string" }, confirm }, ["meal_plan_item_id", "confirm"]), risk: "high" },
  { name: "mark_meal_plan_item_done", title: "Mark meal plan item done", description: "Mark a planned meal done and create one linked food log. Repeated calls do not duplicate calories.", inputSchema: objectSchema({ meal_plan_item_id: { type: "string" } }, ["meal_plan_item_id"]), risk: "low" },
  { name: "generate_shopping_list", title: "Build shopping list", description: "Build an aggregated shopping list from saved Plaivra meal-plan items for a date range. This does not create or guess meals.", inputSchema: objectSchema({ start_date: isoDate, end_date: isoDate }, ["start_date", "end_date"]), risk: "read" },

  { name: "add_water_log", title: "Add water log", description: "Add hydration in milliliters.", inputSchema: objectSchema({ amount_ml: { type: "number" }, date: isoDate }, ["amount_ml"]), risk: "low" },
  { name: "get_water_summary", title: "Get water summary", description: "Return water target, logged amount, remaining amount, and percentage.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "delete_water_log", title: "Delete water log", description: "Permanently delete a user-owned hydration log. Requires confirm:true.", inputSchema: objectSchema({ water_log_id: { type: "string" }, confirm }, ["water_log_id", "confirm"]), risk: "high" },

  { name: "create_custom_workout_plan", title: "Create custom workout plan", description: "Save an exact ChatGPT-created workout plan. Plaivra does not generate the plan itself.", inputSchema: objectSchema({ name: { type: "string" }, goal: { type: "string" }, description: { type: "string" }, duration_weeks: { type: "number" }, days_per_week: { type: "number" }, session_duration_minutes: { type: "number" }, activate: { type: "boolean" }, start_date: isoDate, days: arrayOf(dayInput, ["day_name", "day_number"]) }, ["name"]), risk: "medium" },
  { name: "save_chatgpt_workout_plan", title: "Save ChatGPT workout plan", description: "Alias for create_custom_workout_plan. Accepts a full ChatGPT-provided plan object and persists it.", inputSchema: objectSchema({ name: { type: "string" }, goal: { type: "string" }, duration_weeks: { type: "number" }, days_per_week: { type: "number" }, session_duration_minutes: { type: "number" }, activate: { type: "boolean" }, start_date: isoDate, days: arrayOf(dayInput, ["day_name", "day_number"]) }, ["name", "days"]), risk: "medium" },
  { name: "generate_workout_plan", title: "Deprecated alias: save provided workout plan", description: "Compatibility wrapper for older connector prompts. It does not generate. It only saves a full ChatGPT-provided plan object.", inputSchema: objectSchema({ name: { type: "string" }, goal: { type: "string" }, duration_weeks: { type: "number" }, days_per_week: { type: "number" }, session_duration_minutes: { type: "number" }, activate: { type: "boolean" }, start_date: isoDate, days: arrayOf(dayInput, ["day_name", "day_number"]) }, ["name", "days"]), risk: "medium" },
  { name: "get_workout_plans", title: "Get workout plans", description: "List user-owned workout plans.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "get_workout_plan_by_id", title: "Get workout plan by id", description: "Return one user-owned plan with days and exercises.", inputSchema: objectSchema({ plan_id: { type: "string" } }, ["plan_id"]), risk: "read" },
  { name: "create_workout_plan_day", title: "Create workout plan day", description: "Add a day to a user-owned workout plan.", inputSchema: objectSchema({ plan_id: { type: "string" }, day_name: { type: "string" }, day_number: { type: "number" }, focus: { type: "string" }, weekday: { type: "string" }, session_duration_minutes: { type: "number" }, notes: { type: "string" } }, ["plan_id", "day_name", "day_number"]), risk: "medium" },
  { name: "update_workout_plan_day", title: "Update workout plan day", description: "Update a user-owned workout day.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, day_name: { type: "string" }, day_number: { type: "number" }, focus: { type: "string" }, weekday: { type: "string" }, session_duration_minutes: { type: "number" }, notes: { type: "string" } }, ["plan_day_id"]), risk: "medium" },
  { name: "delete_workout_plan_day", title: "Delete workout plan day", description: "Permanently delete a day and its exercises from a user-owned workout plan. Requires confirm:true.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, confirm }, ["plan_day_id", "confirm"]), risk: "high" },
  { name: "add_exercise_to_plan_day", title: "Add exercise to plan day", description: "Add a warmup, strength exercise, cardio, or cooldown item by name. No exercise library required.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, block_type: { type: "string" }, ...planExerciseInput }, ["plan_day_id", "exercise_name"]), risk: "medium" },
  { name: "add_warmup_to_plan_day", title: "Add warmup to plan day", description: "Add warmup items to a plan day.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, items: arrayOf(planExerciseInput, ["exercise_name"]) }, ["plan_day_id", "items"]), risk: "medium" },
  { name: "add_cardio_to_plan_day", title: "Add cardio to plan day", description: "Add cardio finisher items to a plan day.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, items: arrayOf(planExerciseInput, ["exercise_name"]) }, ["plan_day_id", "items"]), risk: "medium" },
  { name: "add_cooldown_to_plan_day", title: "Add cooldown to plan day", description: "Add cooldown/stretch items to a plan day.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, items: arrayOf(planExerciseInput, ["exercise_name"]) }, ["plan_day_id", "items"]), risk: "medium" },
  { name: "update_plan_exercise", title: "Update plan exercise", description: "Update a user-owned plan exercise.", inputSchema: objectSchema({ plan_exercise_id: { type: "string" }, block_type: { type: "string" }, ...planExerciseInput }, ["plan_exercise_id"]), risk: "medium" },
  { name: "delete_plan_exercise", title: "Delete plan exercise", description: "Permanently delete an exercise from a user-owned workout plan. Requires confirm:true.", inputSchema: objectSchema({ plan_exercise_id: { type: "string" }, confirm }, ["plan_exercise_id", "confirm"]), risk: "high" },
  { name: "activate_workout_plan", title: "Activate workout plan", description: "Activate one user-owned workout plan and deactivate all other plans. This overwrites active-plan state and requires confirm:true.", inputSchema: objectSchema({ plan_id: { type: "string" }, confirm }, ["plan_id", "confirm"]), risk: "high" },
  { name: "delete_workout_plan", title: "Delete workout plan", description: "Permanently delete a user-owned workout plan and its plan content. Requires confirm:true.", inputSchema: objectSchema({ plan_id: { type: "string" }, confirm }, ["plan_id", "confirm"]), risk: "high" },

  { name: "get_today_workout", title: "Get today's workout", description: "Return today's scheduled workout.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "start_workout", title: "Start workout", description: "Start a saved scheduled session or create a basic workout session.", inputSchema: objectSchema({ scheduled_session_id: { type: "string" }, plan_day_id: { type: "string" } }), risk: "low" },
  { name: "log_exercise_sets", title: "Log exercise sets", description: "Log performed exercise sets and return PR candidate info.", inputSchema: objectSchema({ workout_session_id: { type: "string" }, exercise_name: { type: "string" }, sets: arrayOf({ set_number: { type: "number" }, weight_kg: { type: "number" }, reps: { type: "number" }, duration_seconds: { type: "number" }, notes: { type: "string" } }, ["set_number"]) }, ["exercise_name", "sets"]), risk: "low" },
  { name: "complete_workout", title: "Complete workout", description: "Mark workout complete.", inputSchema: objectSchema({ workout_session_id: { type: "string" }, duration_minutes: { type: "number" }, notes: { type: "string" } }, ["workout_session_id"]), risk: "low" },
  { name: "skip_workout", title: "Skip workout", description: "Mark a workout skipped.", inputSchema: objectSchema({ scheduled_session_id: { type: "string" }, workout_session_id: { type: "string" }, reason: { type: "string" } }), risk: "low" },

  { name: "get_personal_records", title: "Get personal records", description: "Return personal records, optionally filtered by exercise.", inputSchema: objectSchema({ exercise_name: { type: "string" } }), risk: "read" },
  { name: "add_personal_record", title: "Add personal record", description: "Save a PR and compare against previous records.", inputSchema: objectSchema({ exercise_name: { type: "string" }, record_type: { type: "string" }, weight_kg: { type: "number" }, reps: { type: "number" }, record_date: isoDate, notes: { type: "string" } }, ["exercise_name", "record_type"]), risk: "low" },
  { name: "add_weight_entry", title: "Add weight entry", description: "Save body weight progress.", inputSchema: objectSchema({ weight_kg: { type: "number" }, date: isoDate, notes: { type: "string" } }, ["weight_kg"]), risk: "low" },
  { name: "add_body_measurement", title: "Add body measurement", description: "Save user-provided body measurements for fitness progress tracking, not diagnosis or treatment.", inputSchema: objectSchema({ measured_at: isoDate, waist_cm: { type: "number" }, hips_cm: { type: "number" }, chest_cm: { type: "number" }, neck_cm: { type: "number" }, shoulders_cm: { type: "number" }, left_arm_cm: { type: "number" }, right_arm_cm: { type: "number" }, left_thigh_cm: { type: "number" }, right_thigh_cm: { type: "number" }, glutes_cm: { type: "number" }, calves_cm: { type: "number" } }), risk: "low" },
  { name: "get_progress_summary", title: "Get progress summary", description: "Return progress entries, workout adherence, and aggregate food-log macros for a period.", inputSchema: objectSchema({ period_days: { type: "number" } }), risk: "read" },

  { name: "update_user_profile", title: "Update user profile", description: "Update user profile fields such as height, age, gender, activity level, training level, goal, and body goal.", inputSchema: objectSchema({ full_name: { type: "string" }, goal: { type: "string" }, weight_kg: { type: "number" }, target_weight_kg: { type: "number" }, height_cm: { type: "number" }, age: { type: "number" }, gender: { type: "string" }, activity_level: { type: "string" }, training_level: { type: "string" }, body_goal: { type: "string" } }), risk: "medium" },
  { name: "update_calorie_target", title: "Update calorie target", description: "Update calorie and macro targets.", inputSchema: objectSchema({ daily_calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" }, water_ml: { type: "number" } }), risk: "medium" },
  { name: "update_training_goal", title: "Update training goal", description: "Update profile training goal.", inputSchema: objectSchema({ goal: { type: "string" }, training_level: { type: "string" }, activity_level: { type: "string" } }), risk: "medium" },
  { name: "update_water_target", title: "Update water target", description: "Update daily water target in ml.", inputSchema: objectSchema({ water_ml: { type: "number" } }, ["water_ml"]), risk: "medium" },
  { name: "update_body_goal", title: "Update body goal", description: "Update body goal and target weight.", inputSchema: objectSchema({ body_goal: { type: "string" }, target_weight_kg: { type: "number" } }), risk: "medium" },

  { name: "get_daily_fit_tasks", title: "Get daily fit tasks", description: "Return tasks for a date.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "create_daily_fit_task", title: "Create daily fit task", description: "Create a user-owned fitness task for a specific date.", inputSchema: objectSchema({ title: { type: "string" }, notes: { type: "string" }, date: isoDate }, ["title"]), risk: "low" },
  { name: "mark_daily_fit_task_done", title: "Mark task done", description: "Mark a task completed.", inputSchema: objectSchema({ task_id: { type: "string" } }, ["task_id"]), risk: "low" },
  { name: "mark_daily_fit_task_skipped", title: "Mark task skipped", description: "Mark a task skipped by adding a reason note.", inputSchema: objectSchema({ task_id: { type: "string" }, reason: { type: "string" } }, ["task_id"]), risk: "low" },
  { name: "get_habits", title: "Get habits", description: "Return habits for a date.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "mark_habit_done", title: "Mark habit done", description: "Mark a habit done by id or name.", inputSchema: objectSchema({ habit_id: { type: "string" }, name: { type: "string" }, date: isoDate }), risk: "low" },
  { name: "create_habit", title: "Create habit", description: "Create a user-owned fitness or wellness tracking habit.", inputSchema: objectSchema({ name: { type: "string" }, notes: { type: "string" }, schedule: { type: "string" } }, ["name"]), risk: "low" },
  { name: "add_sleep_recovery_log", title: "Add sleep recovery log", description: "Track sleep/recovery and return general non-medical guidance.", inputSchema: objectSchema({ date: isoDate, hours_slept: { type: "number" }, sleep_quality: { type: "string" }, recovery_level: { type: "string" }, fatigue_level: { type: "string" }, soreness_level: { type: "string" }, stress_level: { type: "string" }, notes: { type: "string" } }), risk: "low" },
  { name: "get_sleep_recovery_summary", title: "Get sleep recovery summary", description: "Return recovery logs for a period.", inputSchema: objectSchema({ period_days: { type: "number" } }), risk: "read" },
  { name: "get_today_supplements", title: "Get today's supplements", description: "Return supplement logs.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "add_supplement_log", title: "Add supplement log", description: "Track user-provided supplement data only. No dosage advice.", inputSchema: objectSchema({ name: { type: "string" }, dose: { type: "string" }, time: { type: "string" }, reminder: { type: "string" }, date: isoDate }, ["name"]), risk: "low" },
  { name: "mark_supplement_taken", title: "Mark supplement taken", description: "Mark supplement as taken.", inputSchema: objectSchema({ log_id: { type: "string" }, name: { type: "string" }, date: isoDate }), risk: "low" },

  { name: "admin_api_status", title: "Admin API status", description: "Admin-only provider status.", inputSchema: emptyInputSchema, risk: "admin" },
  { name: "admin_search_users", title: "Admin search users", description: "Admin-only user search.", inputSchema: objectSchema({ query: { type: "string" } }, ["query"]), risk: "admin" },
  { name: "get_admin_user_summary", title: "Deprecated admin user summary", description: "Deprecated compatibility tool. It is disabled and does not read member data.", inputSchema: objectSchema({ user_id: { type: "string" }, email: { type: "string" } }), risk: "admin" },
  { name: "admin_create_global_food", title: "Deprecated admin global food", description: "Deprecated compatibility tool. It is disabled and does not create global food data.", inputSchema: objectSchema(customFoodSchema, ["food_name", "serving_size", "calories", "protein_g", "carbs_g", "fat_g"]), risk: "admin" },
  { name: "admin_create_global_workout_or_exercise", title: "Deprecated admin global exercise", description: "Deprecated compatibility tool. It is disabled and does not create global exercise data.", inputSchema: objectSchema({ name: { type: "string" }, category: { type: "string" }, target_muscle: { type: "string" }, equipment: { type: "string" }, difficulty: { type: "string" }, instructions: { type: "string" } }, ["name"]), risk: "admin" }
];

const adminReadOnlyTools = new Set([
  "admin_api_status",
  "admin_search_users",
  "get_admin_user_summary",
  // These deprecated compatibility tools return a disabled response and do not mutate data.
  "admin_create_global_food",
  "admin_create_global_workout_or_exercise"
]);

export const mcpTools: McpToolDefinition[] = toolDefinitions.map((tool) => {
  const readOnlyHint = tool.risk === "read" || (tool.risk === "admin" && adminReadOnlyTools.has(tool.name));
  return {
    ...tool,
    annotations: {
      readOnlyHint,
      destructiveHint: tool.risk === "high",
      openWorldHint: false,
      idempotentHint: readOnlyHint
    }
  };
});
