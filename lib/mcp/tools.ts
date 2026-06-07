import { emptyInputSchema } from "@/lib/mcp/schemas";

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: "read" | "low" | "medium" | "high" | "admin";
};

const isoDate = { type: "string", description: "ISO date YYYY-MM-DD, or today where supported." };
const confirm = { type: "boolean", description: "Set true only after explicit user confirmation." };

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

export const mcpTools: McpToolDefinition[] = [
  { name: "get_fitlife_status", title: "Get FitLife status", description: "Validate the connection and return linked FitLife account identity.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "get_user_profile", title: "Get user profile", description: "Return profile, onboarding, calorie targets, goal, training level, and water target.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "get_today_summary", title: "Get today's summary", description: "Return today's calories, meals, workout, water, habits, tasks, recovery, supplements, and recent PRs.", inputSchema: emptyInputSchema, risk: "read" },

  { name: "search_foods", title: "Search foods", description: "Search global and user foods before logging ambiguous foods.", inputSchema: objectSchema({ query: { type: "string" }, limit: { type: "number" }, meal_type: { type: "string" } }, ["query"]), risk: "read" },
  { name: "add_food_log", title: "Add food log", description: "Log meal items using FitLife nutrition data, not model-guessed calories. Returns candidates if ambiguous.", inputSchema: objectSchema({ meal_type: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] }, date: isoDate, items: arrayOf(foodInput, ["food_name", "quantity"]), notes: { type: "string" } }, ["meal_type", "items"]), risk: "low" },
  { name: "create_custom_food", title: "Create custom food", description: "Create a user-owned custom food from user-provided nutrition values.", inputSchema: objectSchema({ food_name: { type: "string" }, serving_size: { type: "string" }, calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" }, category: { type: "string" }, notes: { type: "string" } }, ["food_name", "serving_size", "calories", "protein_g", "carbs_g", "fat_g"]), risk: "medium" },
  { name: "create_custom_meal", title: "Create custom meal", description: "Create a saved custom meal from FitLife foods.", inputSchema: objectSchema({ meal_name: { type: "string" }, meal_category: { type: "string" }, items: arrayOf(foodInput, ["food_name", "quantity"]), notes: { type: "string" } }, ["meal_name", "items"]), risk: "medium" },
  { name: "get_today_calories", title: "Get today's calories", description: "Return calorie target, consumed, remaining, and macro breakdown.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "delete_food_log", title: "Delete food log", description: "Delete a user-owned food log. Requires confirm:true.", inputSchema: objectSchema({ food_log_id: { type: "string" }, confirm }, ["food_log_id"]), risk: "high" },

  { name: "get_meal_plan", title: "Get meal plan", description: "Return planned meals by date and meal type.", inputSchema: objectSchema({ start_date: isoDate, end_date: isoDate }, ["start_date", "end_date"]), risk: "read" },
  { name: "create_meal_plan_item", title: "Create meal plan item", description: "Create one planned meal item from an existing FitLife food.", inputSchema: objectSchema({ date: isoDate, meal_type: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] }, food_name: { type: "string" }, food_item_id: { type: "string" }, quantity: { type: "number" }, notes: { type: "string" } }, ["date", "meal_type", "quantity"]), risk: "low" },
  { name: "create_day_meal_plan", title: "Create day meal plan", description: "Create breakfast/lunch/dinner/snack plan items for one date.", inputSchema: objectSchema({ date: isoDate, target_calories: { type: "number" }, target_protein_g: { type: "number" }, style: { type: "string" }, cuisine: { type: "string" }, meals: arrayOf({ meal_type: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] }, food_name: { type: "string" }, quantity: { type: "number" }, notes: { type: "string" } }, ["meal_type", "food_name", "quantity"]) }, ["date", "meals"]), risk: "medium" },
  { name: "create_week_meal_plan", title: "Create week meal plan", description: "Preview or create a 7-day meal plan. Without confirm:true it returns a preview.", inputSchema: objectSchema({ start_date: isoDate, target_calories: { type: "number" }, dietary_preferences: { type: "array", items: { type: "string" } }, avoid_foods: { type: "array", items: { type: "string" } }, cuisine: { type: "string" }, meals: arrayOf({ date: isoDate, meal_type: { type: "string" }, food_name: { type: "string" }, quantity: { type: "number" }, notes: { type: "string" } }, ["date", "meal_type", "food_name", "quantity"]), confirm }, ["start_date"]), risk: "medium" },
  { name: "replace_meal_plan_item", title: "Replace meal plan item", description: "Replace a user-owned meal plan item.", inputSchema: objectSchema({ meal_plan_item_id: { type: "string" }, food_name: { type: "string" }, quantity: { type: "number" }, notes: { type: "string" } }, ["meal_plan_item_id", "food_name"]), risk: "medium" },
  { name: "mark_meal_plan_item_done", title: "Mark meal plan item done", description: "Convert a planned meal into a food log and mark it done.", inputSchema: objectSchema({ meal_plan_item_id: { type: "string" } }, ["meal_plan_item_id"]), risk: "low" },
  { name: "generate_shopping_list", title: "Generate shopping list", description: "Generate a grouped shopping list from planned meals.", inputSchema: objectSchema({ start_date: isoDate, end_date: isoDate }, ["start_date", "end_date"]), risk: "read" },

  { name: "add_water_log", title: "Add water log", description: "Add hydration in milliliters.", inputSchema: objectSchema({ amount_ml: { type: "number" }, date: isoDate }, ["amount_ml"]), risk: "low" },
  { name: "get_water_summary", title: "Get water summary", description: "Return water target, logged amount, remaining amount, and percentage.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "delete_water_log", title: "Delete water log", description: "Delete a water log. Requires confirm:true.", inputSchema: objectSchema({ water_log_id: { type: "string" }, confirm }, ["water_log_id"]), risk: "high" },

  { name: "search_exercises", title: "Search exercises", description: "Search approved exercises by name, muscle, equipment, or difficulty.", inputSchema: objectSchema({ query: { type: "string" }, target_muscle: { type: "string" }, equipment: { type: "string" }, difficulty: { type: "string" } }, ["query"]), risk: "read" },
  { name: "get_active_workout_plan", title: "Get active workout plan", description: "Return the active workout plan with days and exercises.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "generate_workout_plan", title: "Generate workout plan", description: "Generate and save a workout plan using existing FitLife generation logic. Replacing an active plan requires confirm:true.", inputSchema: objectSchema({ goal: { type: "string" }, goals: { type: "array", items: { type: "string" } }, training_level: { type: "string" }, days_per_week: { type: "number" }, training_place: { type: "string" }, available_equipment: { type: "array", items: { type: "string" } }, workout_duration_minutes: { type: "number" }, limitations: { type: "string" }, desired_duration_weeks: { type: "number" }, confirm }, ["goal", "training_level", "days_per_week"]), risk: "medium" },
  { name: "edit_workout_plan", title: "Edit workout plan", description: "Apply safe edit operations to a user-owned plan.", inputSchema: objectSchema({ plan_id: { type: "string" }, operations: { type: "array", items: { type: "object" } }, confirm }, ["plan_id", "operations"]), risk: "medium" },
  { name: "replace_exercise", title: "Replace exercise", description: "Replace an exercise in a user-owned plan by name.", inputSchema: objectSchema({ plan_id: { type: "string" }, old_exercise_name: { type: "string" }, new_exercise_name: { type: "string" }, reason: { type: "string" } }, ["plan_id", "old_exercise_name"]), risk: "medium" },
  { name: "add_cardio_to_plan", title: "Add cardio to plan", description: "Add cardio to selected plan days or all days.", inputSchema: objectSchema({ plan_id: { type: "string" }, duration_minutes: { type: "number" }, intensity: { type: "string" }, days: { type: "array", items: { type: "string" } } }, ["plan_id", "duration_minutes", "intensity"]), risk: "medium" },
  { name: "activate_workout_plan", title: "Activate workout plan", description: "Activate a plan and deactivate others. Requires confirm:true.", inputSchema: objectSchema({ plan_id: { type: "string" }, confirm }, ["plan_id"]), risk: "high" },

  { name: "get_today_workout", title: "Get today's workout", description: "Return today's scheduled workout.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "start_workout", title: "Start workout", description: "Start a generated session or create a basic workout session.", inputSchema: objectSchema({ scheduled_session_id: { type: "string" }, plan_day_id: { type: "string" } }), risk: "low" },
  { name: "log_exercise_sets", title: "Log exercise sets", description: "Log performed exercise sets and return PR candidate info.", inputSchema: objectSchema({ workout_session_id: { type: "string" }, exercise_name: { type: "string" }, sets: arrayOf({ set_number: { type: "number" }, weight_kg: { type: "number" }, reps: { type: "number" }, duration_seconds: { type: "number" }, notes: { type: "string" } }, ["set_number"]) }, ["exercise_name", "sets"]), risk: "low" },
  { name: "complete_workout", title: "Complete workout", description: "Mark workout complete.", inputSchema: objectSchema({ workout_session_id: { type: "string" }, duration_minutes: { type: "number" }, notes: { type: "string" } }, ["workout_session_id"]), risk: "low" },
  { name: "skip_workout", title: "Skip workout", description: "Mark a workout skipped.", inputSchema: objectSchema({ scheduled_session_id: { type: "string" }, workout_session_id: { type: "string" }, reason: { type: "string" } }), risk: "low" },

  { name: "get_personal_records", title: "Get personal records", description: "Return personal records, optionally filtered by exercise.", inputSchema: objectSchema({ exercise_name: { type: "string" } }), risk: "read" },
  { name: "add_personal_record", title: "Add personal record", description: "Save a PR and compare against previous records.", inputSchema: objectSchema({ exercise_name: { type: "string" }, record_type: { type: "string" }, weight_kg: { type: "number" }, reps: { type: "number" }, record_date: isoDate, notes: { type: "string" } }, ["exercise_name", "record_type"]), risk: "low" },

  { name: "add_weight_entry", title: "Add weight entry", description: "Save body weight progress.", inputSchema: objectSchema({ weight_kg: { type: "number" }, date: isoDate, notes: { type: "string" } }, ["weight_kg"]), risk: "low" },
  { name: "add_body_measurement", title: "Add body measurement", description: "Save body measurements.", inputSchema: objectSchema({ measured_at: isoDate, waist_cm: { type: "number" }, hips_cm: { type: "number" }, chest_cm: { type: "number" }, neck_cm: { type: "number" }, shoulders_cm: { type: "number" }, left_arm_cm: { type: "number" }, right_arm_cm: { type: "number" }, left_thigh_cm: { type: "number" }, right_thigh_cm: { type: "number" }, glutes_cm: { type: "number" }, calves_cm: { type: "number" } }), risk: "low" },
  { name: "get_progress_summary", title: "Get progress summary", description: "Return progress, adherence, calories, PRs, water, and habits for a period.", inputSchema: objectSchema({ period_days: { type: "number" } }), risk: "read" },

  { name: "get_daily_fit_tasks", title: "Get daily fit tasks", description: "Return tasks for a date.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "create_daily_fit_task", title: "Create daily fit task", description: "Create a task.", inputSchema: objectSchema({ title: { type: "string" }, notes: { type: "string" }, date: isoDate }, ["title"]), risk: "low" },
  { name: "mark_daily_fit_task_done", title: "Mark task done", description: "Mark a task completed.", inputSchema: objectSchema({ task_id: { type: "string" } }, ["task_id"]), risk: "low" },
  { name: "mark_daily_fit_task_skipped", title: "Mark task skipped", description: "Mark a task skipped by adding a reason note.", inputSchema: objectSchema({ task_id: { type: "string" }, reason: { type: "string" } }, ["task_id"]), risk: "low" },
  { name: "get_habits", title: "Get habits", description: "Return habits for a date.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "mark_habit_done", title: "Mark habit done", description: "Mark a habit done by id or name.", inputSchema: objectSchema({ habit_id: { type: "string" }, name: { type: "string" }, date: isoDate }), risk: "low" },
  { name: "create_habit", title: "Create habit", description: "Create a habit.", inputSchema: objectSchema({ name: { type: "string" }, notes: { type: "string" }, schedule: { type: "string" } }, ["name"]), risk: "low" },

  { name: "add_sleep_recovery_log", title: "Add sleep recovery log", description: "Track sleep/recovery. General guidance only, no medical diagnosis.", inputSchema: objectSchema({ date: isoDate, hours_slept: { type: "number" }, sleep_quality: { type: "string" }, recovery_level: { type: "string" }, fatigue_level: { type: "string" }, soreness_level: { type: "string" }, stress_level: { type: "string" }, notes: { type: "string" } }), risk: "low" },
  { name: "get_sleep_recovery_summary", title: "Get sleep recovery summary", description: "Return sleep/recovery logs for a period.", inputSchema: objectSchema({ period_days: { type: "number" } }), risk: "read" },
  { name: "get_today_supplements", title: "Get today's supplements", description: "Return supplement logs for today or a date.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "add_supplement_log", title: "Add supplement log", description: "Track user-provided supplement data only; no dosage advice.", inputSchema: objectSchema({ name: { type: "string" }, dose: { type: "string" }, time: { type: "string" }, reminder: { type: "string" }, date: isoDate }, ["name"]), risk: "low" },
  { name: "mark_supplement_taken", title: "Mark supplement taken", description: "Mark supplement taken by id or name.", inputSchema: objectSchema({ log_id: { type: "string" }, name: { type: "string" }, date: isoDate }), risk: "low" },

  { name: "get_admin_user_summary", title: "Get admin user summary", description: "Admin only: return adherence, workout, meal, and progress summary.", inputSchema: objectSchema({ user_id: { type: "string" }, email: { type: "string" } }), risk: "admin" },
  { name: "admin_search_users", title: "Admin search users", description: "Admin only: search users.", inputSchema: objectSchema({ query: { type: "string" } }, ["query"]), risk: "admin" },
  { name: "admin_create_global_food", title: "Admin create global food", description: "Admin only: create global food.", inputSchema: objectSchema({ food_name: { type: "string" }, serving_size: { type: "string" }, calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" }, category: { type: "string" }, cuisine: { type: "string" } }, ["food_name", "serving_size", "calories", "protein_g", "carbs_g", "fat_g"]), risk: "admin" },
  { name: "admin_create_global_workout_or_exercise", title: "Admin create global workout or exercise", description: "Admin only: create global workout/exercise.", inputSchema: objectSchema({ name: { type: "string" }, category: { type: "string" }, target_muscle: { type: "string" }, equipment: { type: "string" }, difficulty: { type: "string" }, instructions: { type: "string" } }, ["name", "category", "target_muscle", "equipment", "difficulty", "instructions"]), risk: "admin" },
  { name: "admin_api_status", title: "Admin API status", description: "Admin only: return configured integration status.", inputSchema: emptyInputSchema, risk: "admin" }
];
