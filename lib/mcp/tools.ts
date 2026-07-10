import { emptyInputSchema } from "@/lib/mcp/schemas";

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: "read" | "low" | "medium" | "high";
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
  exercise_url: { type: "string", description: "Optional exercise guide URL" },
  custom_video_url: { type: "string", description: "Optional user-approved custom demonstration video URL" },
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
  { name: "get_fitlife_status", title: "Get Plaivra connection status", description: "Validate the connection and return the linked Plaivra account identity. The legacy internal tool name is retained temporarily for compatibility.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "get_user_profile", title: "Get Plaivra profile", description: "Return the authorized core fitness profile and targets. Use only when a narrower domain tool cannot satisfy the request.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "get_today_summary", title: "Get today's Plaivra summary", description: "Return today's calorie totals, planned meals, workout, and water total when the user granted the required cross-domain access.", inputSchema: emptyInputSchema, risk: "read" },

  { name: "search_foods", title: "Search foods", description: "Search global and user-owned foods before logging an ambiguous food.", inputSchema: objectSchema({ query: { type: "string" }, limit: { type: "number" }, meal_type: { type: "string" } }, ["query"]), risk: "read" },
  { name: "create_kitchen", title: "Create food collection", description: "Create a named user-owned collection for custom foods.", inputSchema: objectSchema({ name: { type: "string" } }, ["name"]), risk: "low" },
  { name: "get_kitchens", title: "Get food collections", description: "List user and system food collections.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "update_kitchen", title: "Update food collection", description: "Rename a user-owned food collection.", inputSchema: objectSchema({ kitchen_id: { type: "string" }, name: { type: "string" } }, ["kitchen_id", "name"]), risk: "medium" },
  { name: "delete_kitchen", title: "Delete food collection", description: "Permanently delete a user-owned food collection. Requires confirm:true.", inputSchema: objectSchema({ kitchen_id: { type: "string" }, confirm }, ["kitchen_id", "confirm"]), risk: "high" },
  { name: "assign_food_to_kitchen", title: "Assign food to collection", description: "Assign a user-owned food item to a collection.", inputSchema: objectSchema({ user_food_item_id: { type: "string" }, kitchen_id: { type: "string" } }, ["user_food_item_id", "kitchen_id"]), risk: "low" },
  { name: "get_foods_by_kitchen", title: "Get foods by collection", description: "Return foods assigned to a collection.", inputSchema: objectSchema({ kitchen_id: { type: "string" } }, ["kitchen_id"]), risk: "read" },
  { name: "add_food_log", title: "Log eaten food", description: "Add food the user says they ate directly to Food Log as completed. Do not add eaten food only to a meal plan.", inputSchema: objectSchema({ meal_type: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] }, date: isoDate, items: arrayOf(foodInput, ["food_name", "quantity"]), notes: { type: "string" } }, ["meal_type", "items"]), risk: "low" },
  { name: "get_food_logs_by_date", title: "Get food logs by date", description: "List user-owned food logs for a date so duplicates can be identified before editing or deletion.", inputSchema: objectSchema({ date: isoDate }, ["date"]), risk: "read" },
  { name: "update_food_log", title: "Update food log", description: "Update a user-owned eaten-food log.", inputSchema: objectSchema({ food_log_id: { type: "string" }, meal_type: { type: "string" }, quantity: { type: "number" }, calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" }, notes: { type: "string" } }, ["food_log_id"]), risk: "medium" },
  { name: "move_food_log_meal_type", title: "Move food log", description: "Move a user-owned food log to another meal type.", inputSchema: objectSchema({ food_log_id: { type: "string" }, meal_type: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] } }, ["food_log_id", "meal_type"]), risk: "medium" },
  { name: "delete_food_log", title: "Delete food log", description: "Permanently delete a user-owned eaten-food log. Requires confirm:true.", inputSchema: objectSchema({ food_log_id: { type: "string" }, confirm }, ["food_log_id", "confirm"]), risk: "high" },
  { name: "create_custom_food", title: "Create custom food", description: "Create a user-owned custom food with explicit nutrition values.", inputSchema: objectSchema(customFoodSchema, ["food_name", "serving_size", "calories", "protein_g", "carbs_g", "fat_g"]), risk: "medium" },
  { name: "create_custom_meal", title: "Create saved meal", description: "Create a user-owned saved meal from explicit food items.", inputSchema: objectSchema({ meal_name: { type: "string" }, meal_category: { type: "string" }, items: arrayOf(foodInput, ["food_name", "quantity"]), notes: { type: "string" } }, ["meal_name", "items"]), risk: "medium" },
  { name: "get_today_calories", title: "Get today's nutrition totals", description: "Return calorie target, consumed, remaining, and macro breakdown.", inputSchema: emptyInputSchema, risk: "read" },

  { name: "get_meal_plan", title: "Get meal plan", description: "Return user-owned planned meals by date and meal type.", inputSchema: objectSchema({ start_date: isoDate, end_date: isoDate }, ["start_date", "end_date"]), risk: "read" },
  { name: "get_meal_plan_for_date", title: "Get meal plan for date", description: "Return one date's planned meals grouped by meal type.", inputSchema: objectSchema({ date: isoDate }, ["date"]), risk: "read" },
  { name: "get_meal_plan_for_week", title: "Get meal plan for week", description: "Return seven days of planned meals grouped by date and meal type.", inputSchema: objectSchema({ start_date: isoDate }, ["start_date"]), risk: "read" },
  { name: "create_meal_plan_item", title: "Create meal-plan item", description: "Create one planned meal item from explicit food and macro values. This does not log eaten food.", inputSchema: objectSchema({ date: isoDate, meal_type: mealTypeLower, ...mealPlanFoodInput }, ["date", "meal_type", "food_name"]), risk: "low" },
  { name: "create_day_meal_plan", title: "Create day meal plan", description: "Create planned breakfast, lunch, dinner, and snack items for one date from explicit values.", inputSchema: objectSchema({ date: isoDate, breakfast: arrayOf(mealPlanFoodInput, ["food_name"]), lunch: arrayOf(mealPlanFoodInput, ["food_name"]), dinner: arrayOf(mealPlanFoodInput, ["food_name"]), snack: arrayOf(mealPlanFoodInput, ["food_name"]) }, ["date"]), risk: "medium" },
  { name: "create_week_meal_plan", title: "Create week meal plan", description: "Create planned meals for multiple dates from explicit values. This does not mark meals eaten.", inputSchema: objectSchema({ start_date: isoDate, days: arrayOf({ date: isoDate, meals: objectSchema({ breakfast: arrayOf(mealPlanFoodInput, ["food_name"]), lunch: arrayOf(mealPlanFoodInput, ["food_name"]), dinner: arrayOf(mealPlanFoodInput, ["food_name"]), snack: arrayOf(mealPlanFoodInput, ["food_name"]) }) }, ["date"]) }, ["start_date", "days"]), risk: "medium" },
  { name: "update_meal_plan_item", title: "Update meal-plan item", description: "Update a user-owned planned meal item without changing food logs unless it is later marked done.", inputSchema: objectSchema({ meal_plan_item_id: { type: "string" }, date: isoDate, meal_type: mealTypeLower, ...mealPlanFoodInput }, ["meal_plan_item_id"]), risk: "medium" },
  { name: "delete_meal_plan_item", title: "Delete meal-plan item", description: "Permanently delete a planned meal item. Requires confirm:true. A linked completed food log is retained.", inputSchema: objectSchema({ meal_plan_item_id: { type: "string" }, confirm }, ["meal_plan_item_id", "confirm"]), risk: "high" },
  { name: "mark_meal_plan_item_done", title: "Complete meal-plan item", description: "Mark a planned meal complete and create one linked food log. Repeated calls must not duplicate calories.", inputSchema: objectSchema({ meal_plan_item_id: { type: "string" } }, ["meal_plan_item_id"]), risk: "low" },
  { name: "generate_shopping_list", title: "Build shopping list", description: "Build an aggregated shopping list from saved meal-plan items. This does not create or guess meals.", inputSchema: objectSchema({ start_date: isoDate, end_date: isoDate }, ["start_date", "end_date"]), risk: "read" },
  { name: "get_grocery_items", title: "Get grocery items", description: "Return persisted user-owned grocery items for a week.", inputSchema: objectSchema({ week_start: isoDate }, ["week_start"]), risk: "read" },
  { name: "upsert_grocery_item", title: "Save grocery item", description: "Create or update one explicit user-owned grocery item.", inputSchema: objectSchema({ grocery_item_id: { type: "string" }, week_start: isoDate, source_meal_plan_item_id: { type: "string" }, item_name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" }, store_section: { type: "string", enum: ["Protein", "Carbs", "Vegetables", "Fruits", "Dairy", "Pantry", "Frozen", "Drinks", "Other"] }, checked: { type: "boolean" }, already_have: { type: "boolean" }, notes: { type: "string" }, created_by: { type: "string", enum: ["manual", "meal_plan", "chatgpt"] } }, ["week_start", "item_name"]), risk: "low" },

  { name: "add_water_log", title: "Add water log", description: "Add an explicit hydration amount in milliliters.", inputSchema: objectSchema({ amount_ml: { type: "number" }, date: isoDate }, ["amount_ml"]), risk: "low" },
  { name: "get_water_summary", title: "Get water summary", description: "Return water target, logged amount, remaining amount, and percentage.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "delete_water_log", title: "Delete water log", description: "Permanently delete a user-owned hydration log. Requires confirm:true.", inputSchema: objectSchema({ water_log_id: { type: "string" }, confirm }, ["water_log_id", "confirm"]), risk: "high" },

  { name: "create_custom_workout_plan", title: "Create workout plan", description: "Persist an exact user-requested or ChatGPT-created workout plan. Plaivra does not generate the plan itself.", inputSchema: objectSchema({ name: { type: "string" }, goal: { type: "string" }, description: { type: "string" }, duration_weeks: { type: "number" }, days_per_week: { type: "number" }, session_duration_minutes: { type: "number" }, activate: { type: "boolean" }, start_date: isoDate, days: arrayOf(dayInput, ["day_name", "day_number"]) }, ["name"]), risk: "medium" },
  { name: "get_workout_plans", title: "Get workout plans", description: "List user-owned workout plans.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "get_workout_plan_by_id", title: "Get workout plan", description: "Return one user-owned plan with days and exercises.", inputSchema: objectSchema({ plan_id: { type: "string" } }, ["plan_id"]), risk: "read" },
  { name: "create_workout_plan_day", title: "Create workout-plan day", description: "Add a day to a user-owned workout plan.", inputSchema: objectSchema({ plan_id: { type: "string" }, day_name: { type: "string" }, day_number: { type: "number" }, focus: { type: "string" }, weekday: { type: "string" }, session_duration_minutes: { type: "number" }, notes: { type: "string" } }, ["plan_id", "day_name", "day_number"]), risk: "medium" },
  { name: "update_workout_plan_day", title: "Update workout-plan day", description: "Update a user-owned workout-plan day.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, day_name: { type: "string" }, day_number: { type: "number" }, focus: { type: "string" }, weekday: { type: "string" }, session_duration_minutes: { type: "number" }, notes: { type: "string" } }, ["plan_day_id"]), risk: "medium" },
  { name: "delete_workout_plan_day", title: "Delete workout-plan day", description: "Permanently delete a day and its exercises. Requires confirm:true.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, confirm }, ["plan_day_id", "confirm"]), risk: "high" },
  { name: "add_exercise_to_plan_day", title: "Add exercise to plan day", description: "Add a warmup, strength, cardio, or cooldown item to a user-owned plan day.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, block_type: { type: "string" }, ...planExerciseInput }, ["plan_day_id", "exercise_name"]), risk: "medium" },
  { name: "add_warmup_to_plan_day", title: "Add warmup to plan day", description: "Add explicit warmup items to a user-owned plan day.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, items: arrayOf(planExerciseInput, ["exercise_name"]) }, ["plan_day_id", "items"]), risk: "medium" },
  { name: "add_cardio_to_plan_day", title: "Add cardio to plan day", description: "Add explicit cardio items to a user-owned plan day.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, items: arrayOf(planExerciseInput, ["exercise_name"]) }, ["plan_day_id", "items"]), risk: "medium" },
  { name: "add_cooldown_to_plan_day", title: "Add cooldown to plan day", description: "Add explicit cooldown items to a user-owned plan day.", inputSchema: objectSchema({ plan_day_id: { type: "string" }, items: arrayOf(planExerciseInput, ["exercise_name"]) }, ["plan_day_id", "items"]), risk: "medium" },
  { name: "update_plan_exercise", title: "Update plan exercise", description: "Update a user-owned plan exercise.", inputSchema: objectSchema({ plan_exercise_id: { type: "string" }, block_type: { type: "string" }, ...planExerciseInput }, ["plan_exercise_id"]), risk: "medium" },
  { name: "delete_plan_exercise", title: "Delete plan exercise", description: "Permanently delete an exercise from a user-owned plan. Requires confirm:true.", inputSchema: objectSchema({ plan_exercise_id: { type: "string" }, confirm }, ["plan_exercise_id", "confirm"]), risk: "high" },
  { name: "activate_workout_plan", title: "Activate workout plan", description: "Activate one user-owned plan and deactivate the others. Requires confirm:true.", inputSchema: objectSchema({ plan_id: { type: "string" }, confirm }, ["plan_id", "confirm"]), risk: "high" },
  { name: "delete_workout_plan", title: "Delete workout plan", description: "Permanently delete a user-owned workout plan and plan content. Requires confirm:true.", inputSchema: objectSchema({ plan_id: { type: "string" }, confirm }, ["plan_id", "confirm"]), risk: "high" },
  { name: "get_today_workout", title: "Get today's workout", description: "Return today's scheduled user-owned workout.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "start_workout", title: "Start workout", description: "Start a saved scheduled session or create a basic user-owned workout session.", inputSchema: objectSchema({ scheduled_session_id: { type: "string" }, plan_day_id: { type: "string" } }), risk: "low" },
  { name: "log_exercise_sets", title: "Log exercise sets", description: "Log explicit performed sets and return personal-record candidate information.", inputSchema: objectSchema({ workout_session_id: { type: "string" }, exercise_name: { type: "string" }, sets: arrayOf({ set_number: { type: "number" }, weight_kg: { type: "number" }, reps: { type: "number" }, duration_seconds: { type: "number" }, notes: { type: "string" } }, ["set_number"]) }, ["exercise_name", "sets"]), risk: "low" },
  { name: "complete_workout", title: "Complete workout", description: "Mark a user-owned workout complete.", inputSchema: objectSchema({ workout_session_id: { type: "string" }, duration_minutes: { type: "number" }, notes: { type: "string" } }, ["workout_session_id"]), risk: "low" },
  { name: "skip_workout", title: "Skip workout", description: "Mark a user-owned workout skipped with an optional reason.", inputSchema: objectSchema({ scheduled_session_id: { type: "string" }, workout_session_id: { type: "string" }, reason: { type: "string" } }), risk: "low" },

  { name: "get_personal_records", title: "Get personal records", description: "Return user-owned personal records, optionally filtered by exercise.", inputSchema: objectSchema({ exercise_name: { type: "string" } }), risk: "read" },
  { name: "add_personal_record", title: "Add personal record", description: "Save an explicit personal record and compare it with earlier user-owned records.", inputSchema: objectSchema({ exercise_name: { type: "string" }, record_type: { type: "string" }, weight_kg: { type: "number" }, reps: { type: "number" }, record_date: isoDate, notes: { type: "string" } }, ["exercise_name", "record_type"]), risk: "low" },
  { name: "add_weight_entry", title: "Add weight entry", description: "Save user-provided body weight for fitness progress tracking.", inputSchema: objectSchema({ weight_kg: { type: "number" }, date: isoDate, notes: { type: "string" } }, ["weight_kg"]), risk: "low" },
  { name: "add_body_measurement", title: "Add body measurement", description: "Save user-provided body measurements for fitness progress tracking, not diagnosis or treatment.", inputSchema: objectSchema({ measured_at: isoDate, waist_cm: { type: "number" }, hips_cm: { type: "number" }, chest_cm: { type: "number" }, neck_cm: { type: "number" }, shoulders_cm: { type: "number" }, left_arm_cm: { type: "number" }, right_arm_cm: { type: "number" }, left_thigh_cm: { type: "number" }, right_thigh_cm: { type: "number" }, glutes_cm: { type: "number" }, calves_cm: { type: "number" } }), risk: "low" },
  { name: "get_progress_summary", title: "Get progress summary", description: "Return authorized fitness progress, workout adherence, and aggregate nutrition totals for a period.", inputSchema: objectSchema({ period_days: { type: "number" } }), risk: "read" },

  { name: "update_user_profile", title: "Update core fitness profile", description: "Update explicit user-provided profile fields. Do not infer medical or demographic data.", inputSchema: objectSchema({ full_name: { type: "string" }, goal: { type: "string" }, weight_kg: { type: "number" }, target_weight_kg: { type: "number" }, height_cm: { type: "number" }, age: { type: "number" }, gender: { type: "string" }, activity_level: { type: "string" }, training_level: { type: "string" }, body_goal: { type: "string" } }), risk: "medium" },
  { name: "update_calorie_target", title: "Update nutrition target", description: "Update explicit calorie, macro, and water targets.", inputSchema: objectSchema({ daily_calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" }, water_ml: { type: "number" } }), risk: "medium" },
  { name: "update_training_goal", title: "Update training goal", description: "Update explicit training goal, experience level, and activity level.", inputSchema: objectSchema({ goal: { type: "string" }, training_level: { type: "string" }, activity_level: { type: "string" } }), risk: "medium" },
  { name: "update_water_target", title: "Update water target", description: "Update the explicit daily water target in milliliters.", inputSchema: objectSchema({ water_ml: { type: "number" } }, ["water_ml"]), risk: "medium" },
  { name: "update_body_goal", title: "Update body goal", description: "Update an explicit body goal and optional target weight.", inputSchema: objectSchema({ body_goal: { type: "string" }, target_weight_kg: { type: "number" } }), risk: "medium" },
  { name: "get_nutrition_preference_profile", title: "Get nutrition planning preferences", description: "Return authorized budget, cooking, cuisine, food, allergy/intolerance, and grocery preferences needed for meal planning.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "update_nutrition_preference_profile", title: "Update nutrition planning preferences", description: "Save explicit user-provided meal-planning preferences without generating a plan.", inputSchema: objectSchema({ weekly_food_budget: { type: "number" }, budget_currency: { type: "string" }, max_cooking_time_minutes: { type: "number" }, meal_prep_days: { type: "array", items: { type: "string" } }, cooking_skill: { type: "string" }, kitchen_equipment: { type: "array", items: { type: "string" } }, preferred_cuisines: { type: "array", items: { type: "string" } }, disliked_foods: { type: "array", items: { type: "string" } }, allergies: { type: "string" }, repeat_tolerance: { type: "string" }, meals_per_day: { type: "number" }, ingredient_reuse_preference: { type: "string" }, grocery_style_preference: { type: "string" } }), risk: "medium" },
  { name: "get_nutrition_target_profiles", title: "Get nutrition target profiles", description: "Return explicit default, training-day, rest-day, and high-activity targets.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "upsert_nutrition_target_profile", title: "Save nutrition target profile", description: "Store an explicit nutrition target profile. Plaivra does not generate target values.", inputSchema: objectSchema({ target_type: { type: "string", enum: ["default_day", "training_day", "rest_day", "high_activity_day"] }, calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" }, water_ml: { type: "number" }, notes: { type: "string" } }, ["target_type"]), risk: "medium" },

  { name: "get_progression_targets", title: "Get progression targets", description: "Return saved next-session targets supplied explicitly by the user or ChatGPT.", inputSchema: objectSchema({ plan_exercise_id: { type: "string" } }), risk: "read" },
  { name: "update_progression_target", title: "Update progression target", description: "Store an explicit next-session target. Plaivra does not calculate the recommendation.", inputSchema: objectSchema({ plan_exercise_id: { type: "string" }, exercise_name: { type: "string" }, next_target_weight_kg: { type: "number" }, next_target_reps: { type: "string" }, next_target_sets: { type: "number" }, progression_note: { type: "string" }, ai_recommendation: { type: "string" }, last_reviewed_by: { type: "string", enum: ["user", "chatgpt", "system"] } }, ["plan_exercise_id", "exercise_name"]), risk: "medium" },
  { name: "get_exercise_alternatives", title: "Get exercise alternatives", description: "Return saved alternatives for a user-owned plan exercise.", inputSchema: objectSchema({ plan_exercise_id: { type: "string" } }), risk: "read" },
  { name: "create_exercise_alternative", title: "Create exercise alternative", description: "Save one explicit user-requested or ChatGPT-provided alternative for a user-owned plan exercise.", inputSchema: objectSchema({ plan_exercise_id: { type: "string" }, original_exercise_name: { type: "string" }, alternative_exercise_name: { type: "string" }, reason: { type: "string" }, target_muscle: { type: "string" }, equipment: { type: "string" }, pain_friendly_note: { type: "string" }, created_by: { type: "string", enum: ["user", "chatgpt"] } }, ["plan_exercise_id", "original_exercise_name", "alternative_exercise_name", "reason"]), risk: "medium" },

  { name: "get_daily_fit_tasks", title: "Get daily tasks", description: "Return user-owned fitness tasks for a date.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "create_daily_fit_task", title: "Create daily task", description: "Create an explicit user-owned fitness task for a date.", inputSchema: objectSchema({ title: { type: "string" }, notes: { type: "string" }, date: isoDate }, ["title"]), risk: "low" },
  { name: "mark_daily_fit_task_done", title: "Complete daily task", description: "Mark a user-owned task completed.", inputSchema: objectSchema({ task_id: { type: "string" } }, ["task_id"]), risk: "low" },
  { name: "mark_daily_fit_task_skipped", title: "Skip daily task", description: "Mark a user-owned task skipped with an optional reason.", inputSchema: objectSchema({ task_id: { type: "string" }, reason: { type: "string" } }, ["task_id"]), risk: "low" },
  { name: "get_habits", title: "Get habits", description: "Return user-owned tracked habits for a date.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "mark_habit_done", title: "Complete habit", description: "Mark a user-owned habit complete by ID or name.", inputSchema: objectSchema({ habit_id: { type: "string" }, name: { type: "string" }, date: isoDate }), risk: "low" },
  { name: "create_habit", title: "Create habit", description: "Create an explicit user-owned fitness or wellness tracking habit.", inputSchema: objectSchema({ name: { type: "string" }, notes: { type: "string" }, schedule: { type: "string" } }, ["name"]), risk: "low" },
  { name: "add_sleep_recovery_log", title: "Add sleep and recovery log", description: "Track explicit user-provided sleep and recovery data. Do not diagnose or provide treatment.", inputSchema: objectSchema({ date: isoDate, hours_slept: { type: "number" }, sleep_quality: { type: "string" }, recovery_level: { type: "string" }, fatigue_level: { type: "string" }, soreness_level: { type: "string" }, stress_level: { type: "string" }, notes: { type: "string" } }), risk: "low" },
  { name: "get_sleep_recovery_summary", title: "Get sleep and recovery summary", description: "Return user-owned sleep and recovery logs for a period.", inputSchema: objectSchema({ period_days: { type: "number" } }), risk: "read" },
  { name: "get_today_supplements", title: "Get supplement tracking", description: "Return user-provided supplement tracking records for a date. This is not dosage advice.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },
  { name: "add_supplement_log", title: "Add supplement log", description: "Track explicit user-provided supplement information only. Do not recommend a dose.", inputSchema: objectSchema({ name: { type: "string" }, dose: { type: "string" }, time: { type: "string" }, reminder: { type: "string" }, date: isoDate }, ["name"]), risk: "low" },
  { name: "mark_supplement_taken", title: "Complete supplement log", description: "Mark a user-owned supplement tracking record as taken.", inputSchema: objectSchema({ log_id: { type: "string" }, name: { type: "string" }, date: isoDate }), risk: "low" },
  { name: "get_daily_checkins", title: "Get daily check-ins", description: "Return user-owned morning and evening fitness check-ins for a date range.", inputSchema: objectSchema({ start_date: isoDate, end_date: isoDate }, ["start_date"]), risk: "read" },
  { name: "upsert_daily_checkin", title: "Save daily check-in", description: "Save one explicit morning or evening fitness check-in.", inputSchema: objectSchema({ checkin_date: isoDate, checkin_type: { type: "string", enum: ["morning", "evening"] }, sleep_hours: { type: "number" }, energy_level: { type: "string" }, soreness_level: { type: "string" }, stress_level: { type: "string" }, motivation_level: { type: "string" }, workout_readiness: { type: "string" }, today_main_goal: { type: "string" }, today_blocker: { type: "string" }, workout_done: { type: "boolean" }, protein_hit: { type: "boolean" }, calories_hit: { type: "boolean" }, water_hit: { type: "boolean" }, steps_or_movement_done: { type: "boolean" }, meal_plan_followed: { type: "boolean" }, main_blocker: { type: "string" }, tomorrow_note: { type: "string" } }, ["checkin_date", "checkin_type"]), risk: "low" }
];

export const mcpTools: McpToolDefinition[] = toolDefinitions.map((tool) => {
  const readOnlyHint = tool.risk === "read";
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
