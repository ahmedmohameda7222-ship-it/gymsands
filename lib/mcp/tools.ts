import { emptyInputSchema } from "@/lib/mcp/schemas";
import {
  dailyExecutionContextOutputSchema,
  nutritionPlanningContextOutputSchema,
  progressContextOutputSchema,
  trainingPlanningContextOutputSchema,
  workoutAdjustmentContextOutputSchema
} from "@/lib/mcp/context-projections";

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  risk: "read" | "low" | "medium" | "high";
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
    idempotentHint?: boolean;
  };
};

type McpToolSource = Omit<McpToolDefinition, "annotations" | "outputSchema"> & { outputSchema?: Record<string, unknown> };

export const MCP_CATALOG_VERSION = "2026-07-2";

const isoDate = { type: "string", description: "ISO date YYYY-MM-DD, or today where supported." };
const uuid = { type: "string", format: "uuid" };
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
  exercise_url: { type: "string" },
  custom_video_url: { type: "string" },
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

const performedSetInput = {
  plan_exercise_id: uuid,
  exercise_order: { type: "number" },
  exercise_name: { type: "string" },
  exercise_category: { type: "string" },
  planned_sets: { type: "number" },
  planned_reps: { type: "string" },
  planned_rest_seconds: { type: "number" },
  set_number: { type: "number" },
  weight_kg: { type: "number" },
  reps: { type: "number" },
  notes: { type: "string" },
  completed_at: { type: "string" }
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
  fiber_g: { type: "number" },
  sugar_g: { type: "number" },
  sodium_mg: { type: "number" },
  notes: { type: "string" }
};

const toolDefinitions: McpToolSource[] = [
  { name: "get_plaivra_status", title: "Get Plaivra connection status", description: "Validate the connection and return the linked Plaivra account identity.", inputSchema: emptyInputSchema, risk: "read" },
  { name: "get_training_planning_context", title: "Get training planning context", description: "Return only authorized training goal, schedule, existing-plan, and user-authored functional constraint fields needed to plan training.", inputSchema: emptyInputSchema, outputSchema: trainingPlanningContextOutputSchema, risk: "read" },
  { name: "get_nutrition_planning_context", title: "Get nutrition planning context", description: "Return only authorized nutrition targets, planning preferences, and user-confirmed food constraints needed to plan meals.", inputSchema: emptyInputSchema, outputSchema: nutritionPlanningContextOutputSchema, risk: "read" },
  { name: "get_daily_execution_context", title: "Get daily execution context", description: "Return only the authorized Today sections relevant to the granted permissions.", inputSchema: objectSchema({ date: isoDate }), outputSchema: dailyExecutionContextOutputSchema, risk: "read" },
  { name: "get_progress_context", title: "Get progress review context", description: "Return bounded progress entries, workout adherence, and personal records for a review period.", inputSchema: objectSchema({ period_days: { type: "number", minimum: 1, maximum: 180 }, end_date: isoDate }), outputSchema: progressContextOutputSchema, risk: "read" },
  { name: "get_workout_adjustment_context", title: "Get workout adjustment context", description: "Return the active plan, recent performed sets, and authorized constraints needed to adjust a workout.", inputSchema: objectSchema({ plan_exercise_id: uuid }), outputSchema: workoutAdjustmentContextOutputSchema, risk: "read" },

  { name: "search_foods", title: "Search foods", description: "Search global and user-owned foods before logging an ambiguous food.", inputSchema: objectSchema({ query: { type: "string" }, limit: { type: "number" }, meal_type: { type: "string" } }, ["query"]), risk: "read" },
  { name: "add_food_log", title: "Log eaten food", description: "Add food the user says they ate directly to Food Log as completed.", inputSchema: objectSchema({ meal_type: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] }, date: isoDate, items: arrayOf(foodInput, ["food_name", "quantity"]), notes: { type: "string" } }, ["meal_type", "items"]), risk: "low" },
  { name: "get_food_logs_by_date", title: "Get food logs by date", description: "List user-owned food logs for a date.", inputSchema: objectSchema({ date: isoDate }, ["date"]), risk: "read" },
  { name: "update_food_log", title: "Update food log", description: "Update a user-owned food log only if its version timestamp still matches.", inputSchema: { ...objectSchema({ food_log_id: uuid, expected_updated_at: { type: "string" }, meal_type: { type: "string" }, quantity: { type: "number" }, calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" }, notes: { type: "string" } }, ["food_log_id", "expected_updated_at"]), anyOf: ["meal_type", "quantity", "calories", "protein_g", "carbs_g", "fat_g", "notes"].map((field) => ({ type: "object", required: [field] })) }, risk: "medium" },
  { name: "delete_food_log", title: "Delete food log", description: "Permanently delete a user-owned eaten-food log. Requires confirm:true.", inputSchema: objectSchema({ food_log_id: uuid, confirm }, ["food_log_id", "confirm"]), risk: "high" },
  { name: "create_custom_food", title: "Create custom food", description: "Create a user-owned custom food with explicit nutrition values.", inputSchema: objectSchema(customFoodSchema, ["food_name", "serving_size", "calories", "protein_g", "carbs_g", "fat_g"]), risk: "medium" },
  { name: "create_custom_meal", title: "Create saved meal", description: "Create a user-owned saved meal from explicit food items.", inputSchema: objectSchema({ meal_name: { type: "string" }, meal_category: { type: "string" }, items: arrayOf(foodInput, ["food_name", "quantity"]), notes: { type: "string" } }, ["meal_name", "items"]), risk: "medium" },

  { name: "create_day_meal_plan", title: "Create day meal plan", description: "Create planned meal items for one date from explicit values.", inputSchema: { ...objectSchema({ date: isoDate, breakfast: arrayOf(mealPlanFoodInput, ["food_name"]), lunch: arrayOf(mealPlanFoodInput, ["food_name"]), dinner: arrayOf(mealPlanFoodInput, ["food_name"]), snack: arrayOf(mealPlanFoodInput, ["food_name"]) }, ["date"]), anyOf: ["breakfast", "lunch", "dinner", "snack"].map((field) => ({ type: "object", required: [field] })) }, risk: "medium" },
  { name: "create_week_meal_plan", title: "Create week meal plan", description: "Create planned meals for multiple dates from explicit values.", inputSchema: objectSchema({ start_date: isoDate, days: arrayOf({ date: isoDate, meals: objectSchema({ breakfast: arrayOf(mealPlanFoodInput, ["food_name"]), lunch: arrayOf(mealPlanFoodInput, ["food_name"]), dinner: arrayOf(mealPlanFoodInput, ["food_name"]), snack: arrayOf(mealPlanFoodInput, ["food_name"]) }) }, ["date"]) }, ["start_date", "days"]), risk: "medium" },
  { name: "get_meal_plan_for_date", title: "Get meal plan for date", description: "Return one date's planned meals grouped by meal type.", inputSchema: objectSchema({ date: isoDate }, ["date"]), risk: "read" },
  { name: "get_meal_plan_for_week", title: "Get meal plan for week", description: "Return seven days of planned meals grouped by date and meal type.", inputSchema: objectSchema({ start_date: isoDate }, ["start_date"]), risk: "read" },
  { name: "update_meal_plan_item", title: "Update meal-plan item", description: "Update a user-owned planned meal item only if its version timestamp still matches.", inputSchema: { ...objectSchema({ meal_plan_item_id: uuid, expected_updated_at: { type: "string" }, date: isoDate, meal_type: mealTypeLower, ...mealPlanFoodInput }, ["meal_plan_item_id", "expected_updated_at"]), anyOf: ["date", "meal_type", "food_name", "quantity", "serving_info", "calories", "protein", "carbs", "fat", "notes"].map((field) => ({ type: "object", required: [field] })) }, risk: "medium" },
  { name: "delete_meal_plan_item", title: "Delete meal-plan item", description: "Permanently delete a planned meal item. Requires confirm:true.", inputSchema: objectSchema({ meal_plan_item_id: uuid, confirm }, ["meal_plan_item_id", "confirm"]), risk: "high" },
  { name: "mark_meal_plan_item_done", title: "Complete meal-plan item", description: "Mark a planned meal complete and create one linked food log without duplicate calories.", inputSchema: objectSchema({ meal_plan_item_id: uuid }, ["meal_plan_item_id"]), risk: "low" },
  { name: "generate_shopping_list", title: "Build shopping list", description: "Build an aggregated shopping list from saved meal-plan items.", inputSchema: objectSchema({ start_date: isoDate, end_date: isoDate }, ["start_date", "end_date"]), risk: "read" },

  { name: "add_water_log", title: "Add water log", description: "Add an explicit hydration amount in milliliters.", inputSchema: objectSchema({ amount_ml: { type: "number" }, date: isoDate }, ["amount_ml"]), risk: "low" },
  { name: "get_water_summary", title: "Get water summary", description: "Return water target, logged amount, and remaining amount.", inputSchema: objectSchema({ date: isoDate }), risk: "read" },

  { name: "create_custom_workout_plan", title: "Create workout plan", description: "Persist an exact user-requested or ChatGPT-created workout plan from an explicit user-local schedule date.", inputSchema: objectSchema({ name: { type: "string" }, goal: { type: "string" }, description: { type: "string" }, duration_weeks: { type: "number" }, days_per_week: { type: "number" }, session_duration_minutes: { type: "number" }, activate: { type: "boolean" }, start_date: isoDate, days: arrayOf(dayInput, ["day_name", "day_number"]) }, ["name", "start_date", "days"]), risk: "medium" },
  { name: "get_workout_plan_by_id", title: "Get workout plan", description: "Return one user-owned plan with days and exercises.", inputSchema: objectSchema({ plan_id: uuid }, ["plan_id"]), risk: "read" },
  { name: "activate_workout_plan", title: "Activate workout plan", description: "Make one user-owned plan active from an explicit user-local schedule date only if its version timestamp still matches.", inputSchema: objectSchema({ plan_id: uuid, schedule_start_date: isoDate, expected_updated_at: { type: "string" } }, ["plan_id", "schedule_start_date", "expected_updated_at"]), risk: "medium" },
  { name: "delete_workout_plan", title: "Delete workout plan", description: "Permanently delete a history-free user-owned workout plan from an explicit local schedule boundary. Requires confirm:true.", inputSchema: objectSchema({ plan_id: uuid, schedule_start_date: isoDate, confirm }, ["plan_id", "schedule_start_date", "confirm"]), risk: "high" },
  { name: "start_workout", title: "Start workout", description: "Start a saved scheduled session or workout-plan day.", inputSchema: objectSchema({ scheduled_session_id: uuid, plan_day_id: uuid }), risk: "low" },
  { name: "log_exercise_sets", title: "Log exercise sets", description: "Idempotently save explicit performed sets using the plan-exercise identity or stable exercise order.", inputSchema: { ...objectSchema({ workout_session_id: uuid, plan_exercise_id: uuid, exercise_order: { type: "number" }, exercise_name: { type: "string" }, sets: arrayOf({ set_number: { type: "number" }, weight_kg: { type: "number" }, reps: { type: "number" }, duration_seconds: { type: "number" }, notes: { type: "string" } }, ["set_number"]) }, ["workout_session_id", "exercise_name", "sets"]), anyOf: [{ required: ["plan_exercise_id"] }, { required: ["exercise_order"] }] }, risk: "low" },
  { name: "complete_workout", title: "Complete workout", description: "Idempotently save any final sets and complete a user-owned workout in one transaction.", inputSchema: objectSchema({ workout_session_id: uuid, duration_minutes: { type: "number" }, notes: { type: "string" }, logs: arrayOf(performedSetInput, ["exercise_name", "set_number"]) }, ["workout_session_id"]), risk: "low" },
  { name: "skip_workout", title: "Skip workout", description: "Mark a user-owned workout skipped with an optional reason.", inputSchema: { ...objectSchema({ scheduled_session_id: uuid, workout_session_id: uuid, reason: { type: "string" } }), anyOf: ["scheduled_session_id", "workout_session_id"].map((field) => ({ type: "object", required: [field] })) }, risk: "low" },

  { name: "add_weight_entry", title: "Add weight entry", description: "Save user-provided body weight for fitness progress tracking.", inputSchema: objectSchema({ weight_kg: { type: "number" }, date: isoDate, notes: { type: "string" } }, ["weight_kg"]), risk: "low" },
  { name: "add_body_measurement", title: "Add body measurement", description: "Save user-provided body measurements for fitness progress tracking.", inputSchema: { ...objectSchema({ measured_at: isoDate, waist_cm: { type: "number" }, hips_cm: { type: "number" }, chest_cm: { type: "number" }, neck_cm: { type: "number" }, shoulders_cm: { type: "number" }, left_arm_cm: { type: "number" }, right_arm_cm: { type: "number" }, left_thigh_cm: { type: "number" }, right_thigh_cm: { type: "number" }, glutes_cm: { type: "number" }, calves_cm: { type: "number" } }), anyOf: ["waist_cm", "hips_cm", "chest_cm", "neck_cm", "shoulders_cm", "left_arm_cm", "right_arm_cm", "left_thigh_cm", "right_thigh_cm", "glutes_cm", "calves_cm"].map((field) => ({ type: "object", required: [field] })) }, risk: "low" },
  { name: "add_sleep_recovery_log", title: "Add sleep and recovery log", description: "Track explicit user-provided sleep and recovery data without diagnosis.", inputSchema: { ...objectSchema({ date: isoDate, hours_slept: { type: "number" }, sleep_quality: { type: "string" }, recovery_level: { type: "string" }, fatigue_level: { type: "string" }, soreness_level: { type: "string" }, stress_level: { type: "string" }, notes: { type: "string" } }), anyOf: ["hours_slept", "sleep_quality", "recovery_level", "fatigue_level", "soreness_level", "stress_level", "notes"].map((field) => ({ type: "object", required: [field] })) }, risk: "low" }
];

export const MCP_PUBLIC_TOOL_NAMES = [
  "get_plaivra_status",
  "get_training_planning_context",
  "get_nutrition_planning_context",
  "get_daily_execution_context",
  "get_progress_context",
  "get_workout_adjustment_context",
  "search_foods",
  "add_food_log",
  "get_food_logs_by_date",
  "update_food_log",
  "delete_food_log",
  "create_custom_food",
  "create_custom_meal",
  "create_day_meal_plan",
  "create_week_meal_plan",
  "get_meal_plan_for_date",
  "get_meal_plan_for_week",
  "update_meal_plan_item",
  "delete_meal_plan_item",
  "mark_meal_plan_item_done",
  "generate_shopping_list",
  "add_water_log",
  "get_water_summary",
  "create_custom_workout_plan",
  "get_workout_plan_by_id",
  "activate_workout_plan",
  "delete_workout_plan",
  "start_workout",
  "log_exercise_sets",
  "complete_workout",
  "skip_workout",
  "add_weight_entry",
  "add_body_measurement",
  "add_sleep_recovery_log"
] as const;

const publicToolNameSet = new Set<string>(MCP_PUBLIC_TOOL_NAMES);

export const MCP_IDEMPOTENT_WRITE_TOOL_NAMES = new Set([
  "add_food_log",
  "create_custom_food",
  "create_custom_meal",
  "create_day_meal_plan",
  "create_week_meal_plan",
  "mark_meal_plan_item_done",
  "add_water_log",
  "create_custom_workout_plan",
  "start_workout",
  "log_exercise_sets",
  "complete_workout",
  "skip_workout",
  "add_weight_entry",
  "add_body_measurement",
  "add_sleep_recovery_log"
]);

const outputString = { type: "string" } as const;
const outputNumber = { type: "number" } as const;
const outputBoolean = { type: "boolean" } as const;
const outputStringArray = { type: "array", items: outputString } as const;

const publicRecordSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: outputString, source: outputString, food_name: outputString, serving_size: outputString,
    quantity: outputNumber, calories: outputNumber, protein_g: outputNumber, carbs_g: outputNumber,
    fat_g: outputNumber, fiber_g: outputNumber, sugar_g: outputNumber, sodium_mg: outputNumber,
    category: outputString, cuisine: outputString, kitchen_id: outputString, food_item_id: outputString,
    user_food_item_id: outputString, log_date: outputString, meal_type: outputString, meal_id: outputString,
    meal_name: outputString, meal_category: outputString, is_favorite: outputBoolean, plan_date: outputString,
    status: outputString, food_log_id: outputString, completed_at: outputString, name: outputString,
    goal: outputString, description: outputString, is_active: outputBoolean, is_default: outputBoolean,
    chatgpt_source: outputBoolean, program_duration_weeks: outputNumber, days_per_week: outputNumber,
    session_duration_minutes: outputNumber, start_date: outputString, day_number: outputNumber,
    day_name: outputString, focus: outputString, weekday: outputString, plan_id: outputString,
    plan_day_id: outputString, workout_id: outputString, exercise_name: outputString,
    target_muscle: outputString, equipment: outputString, sets: outputNumber,
    reps: { anyOf: [outputString, outputNumber] }, weight: outputString, weight_kg: outputNumber,
    rest_seconds: outputNumber, tempo: outputString, instructions: outputString, exercise_url: outputString,
    video_url: outputString, custom_video_url: outputString, sort_order: outputNumber, order_index: outputNumber,
    scheduled_date: outputString, scheduled_session_id: outputString, user_workout_plan_id: outputString,
    user_workout_session_id: outputString, week_index: outputNumber, day_index: outputNumber,
    session_number: outputNumber, day_title: outputString, workout_name: outputString, started_at: outputString,
    skipped_at: outputString, duration_minutes: outputNumber, set_number: outputNumber,
    exercise_order: outputNumber, duration_seconds: outputNumber, completed: outputBoolean,
    amount_ml: outputNumber, entry_date: outputString, body_weight_kg: outputNumber, measured_at: outputString,
    waist_cm: outputNumber, hips_cm: outputNumber, chest_cm: outputNumber, neck_cm: outputNumber,
    shoulders_cm: outputNumber, left_arm_cm: outputNumber, right_arm_cm: outputNumber,
    left_thigh_cm: outputNumber, right_thigh_cm: outputNumber, glutes_cm: outputNumber,
    calves_cm: outputNumber, hours_slept: outputNumber, sleep_quality: outputString,
    recovery_level: outputString, fatigue_level: outputString, soreness_level: outputString,
    stress_level: outputString, updated_at: outputString
  }
} as const;

const recordArraySchema = { type: "array", items: publicRecordSchema } as const;
const macroTotalsSchema = { type: "object", additionalProperties: false, required: ["calories", "protein_g", "carbs_g", "fat_g"], properties: { calories: outputNumber, protein_g: outputNumber, carbs_g: outputNumber, fat_g: outputNumber } } as const;
const groupedMealsSchema = { type: "object", additionalProperties: false, required: ["breakfast", "lunch", "dinner", "snack"], properties: { breakfast: recordArraySchema, lunch: recordArraySchema, dinner: recordArraySchema, snack: recordArraySchema } } as const;

function closedSuccessOutput(required: string[], properties: Record<string, unknown>) {
  return {
    type: "object",
    required: ["ok", ...required],
    additionalProperties: false,
    properties: {
      ok: { type: "boolean", const: true },
      ...properties,
      catalog_version: outputString,
      affected_at: outputString,
      next_step_hint: outputString
    }
  };
}

const publicOutputSchemas: Record<string, Record<string, unknown>> = {
  get_plaivra_status: closedSuccessOutput(["connected", "scopes", "profile"], { connected: outputBoolean, scopes: outputStringArray, profile: { type: "object", additionalProperties: false, required: ["id", "role"], properties: { id: outputString, email: outputString, full_name: outputString, role: { type: "string", enum: ["member", "admin"] } } } }),
  search_foods: closedSuccessOutput(["foods"], { foods: recordArraySchema }),
  add_food_log: closedSuccessOutput(["saved_items", "totals"], { saved_items: recordArraySchema, totals: macroTotalsSchema }),
  get_food_logs_by_date: closedSuccessOutput(["date", "logs"], { date: outputString, logs: recordArraySchema }),
  update_food_log: closedSuccessOutput(["log"], { log: publicRecordSchema }),
  delete_food_log: closedSuccessOutput(["deleted_food_log_id"], { deleted_food_log_id: outputString }),
  create_custom_food: closedSuccessOutput(["food"], { food: publicRecordSchema }),
  create_custom_meal: closedSuccessOutput(["meal", "items"], { meal: publicRecordSchema, items: recordArraySchema }),
  create_day_meal_plan: closedSuccessOutput(["created_count", "created_meal_plan_item_ids"], { source_tool: outputString, created_count: outputNumber, created_meal_plan_item_ids: outputStringArray, planned_meal_ids: outputStringArray, items: recordArraySchema }),
  create_week_meal_plan: closedSuccessOutput(["created_count", "created_meal_plan_item_ids"], { source_tool: outputString, created_count: outputNumber, created_meal_plan_item_ids: outputStringArray, planned_meal_ids: outputStringArray, items: recordArraySchema }),
  get_meal_plan_for_date: closedSuccessOutput(["date", "items", "meals"], { date: outputString, items: recordArraySchema, meals: groupedMealsSchema }),
  get_meal_plan_for_week: closedSuccessOutput(["start_date", "end_date", "days"], { start_date: outputString, end_date: outputString, days: { type: "array", items: { type: "object", additionalProperties: false, required: ["date", "meals"], properties: { date: outputString, meals: groupedMealsSchema } } } }),
  update_meal_plan_item: closedSuccessOutput(["item"], { item: publicRecordSchema }),
  delete_meal_plan_item: closedSuccessOutput(["deleted_meal_plan_item_id"], { deleted_meal_plan_item_id: outputString, kept_linked_food_log: outputBoolean }),
  mark_meal_plan_item_done: closedSuccessOutput(["item"], { item: publicRecordSchema, already_done: outputBoolean, food_log_created: outputBoolean, food_log: publicRecordSchema }),
  generate_shopping_list: closedSuccessOutput(["item_count", "shopping_list"], { start_date: outputString, end_date: outputString, item_count: outputNumber, shopping_list: { type: "array", items: { type: "object", additionalProperties: false, properties: { food_name: outputString, serving_size: outputString, quantity: outputNumber, calories: outputNumber, protein_g: outputNumber, carbs_g: outputNumber, fat_g: outputNumber, dates: outputStringArray, meals: outputStringArray } } } }),
  add_water_log: closedSuccessOutput(["log", "logged_ml"], { log: publicRecordSchema, logged_ml: outputNumber }),
  get_water_summary: closedSuccessOutput(["date", "logged_ml"], { date: outputString, target_ml: outputNumber, logged_ml: outputNumber, remaining_ml: outputNumber, needs_target_setup: outputBoolean }),
  create_custom_workout_plan: closedSuccessOutput(["plan_id", "saved_days_count", "saved_exercises_count"], { success: outputBoolean, plan_id: outputString, saved_days_count: outputNumber, saved_exercises_count: outputNumber }),
  get_workout_plan_by_id: closedSuccessOutput(["plan"], { plan: publicRecordSchema, days: recordArraySchema, exercises: recordArraySchema }),
  activate_workout_plan: closedSuccessOutput(["active_plan"], { active_plan: publicRecordSchema }),
  delete_workout_plan: closedSuccessOutput(["deleted_plan_id"], { deleted_plan_id: outputString }),
  start_workout: closedSuccessOutput(["session"], { session: publicRecordSchema }),
  log_exercise_sets: closedSuccessOutput(["logs"], { logs: recordArraySchema }),
  complete_workout: closedSuccessOutput(["session"], { session: publicRecordSchema }),
  skip_workout: closedSuccessOutput(["session"], { session: publicRecordSchema }),
  add_weight_entry: closedSuccessOutput(["entry"], { entry: publicRecordSchema }),
  add_body_measurement: closedSuccessOutput(["measurement"], { measurement: publicRecordSchema }),
  add_sleep_recovery_log: closedSuccessOutput(["log"], { log: publicRecordSchema, guidance: outputString })
};

export const mcpTools: McpToolDefinition[] = toolDefinitions
  .filter((tool) => publicToolNameSet.has(tool.name))
  .map((tool) => {
    const readOnlyHint = tool.risk === "read";
    const requiresIdempotencyKey = MCP_IDEMPOTENT_WRITE_TOOL_NAMES.has(tool.name);
    const inputSchema = requiresIdempotencyKey
      ? {
          ...tool.inputSchema,
          properties: {
            ...((tool.inputSchema.properties as Record<string, unknown> | undefined) ?? {}),
            idempotency_key: { type: "string", minLength: 16, maxLength: 200, description: "Stable unique key for this intended mutation." }
          },
          required: Array.from(new Set([...(tool.inputSchema.required as string[] | undefined ?? []), "idempotency_key"]))
        }
      : tool.inputSchema;
    return {
      ...tool,
      inputSchema,
      outputSchema: tool.outputSchema ?? publicOutputSchemas[tool.name],
      annotations: {
        readOnlyHint,
        destructiveHint: tool.risk === "high",
        openWorldHint: false,
        idempotentHint: readOnlyHint || requiresIdempotencyKey
      }
    };
  });
