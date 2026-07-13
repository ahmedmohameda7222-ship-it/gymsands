import type { McpContext } from "@/lib/mcp/auth";
import { asObject, cleanDate, getArray, getOptionalNumber, getOptionalString, getString, requireConfirmation, type JsonObject } from "@/lib/mcp/schemas";
import { executeMcpTool as executeOriginalMcpTool } from "@/lib/mcp/tool-executor";
import { fail, num, ok, type DbRow, type McpToolResult } from "@/lib/mcp/tool-helpers";
import { ContextProjectionError, projectTaskContext, type ContextTask } from "@/lib/mcp/context-projections";

type MealKey = "breakfast" | "lunch" | "dinner" | "snack";
const mealKeys: MealKey[] = ["breakfast", "lunch", "dinner", "snack"];

function positive(value: unknown, fallback = 1) {
  const parsed = num(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("quantity must be greater than 0.");
  return parsed;
}

function nonNegative(value: unknown, field: string) {
  const parsed = num(value, 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a number >= 0.`);
  return parsed;
}

function normalizeMealKey(value: unknown): MealKey {
  const clean = String(value ?? "").trim().toLowerCase();
  if (clean === "breakfast" || clean === "lunch" || clean === "dinner" || clean === "snack") return clean;
  if (clean === "snacks") return "snack";
  throw new Error("meal_type must be breakfast, lunch, dinner, or snack.");
}

function dbMealType(value: unknown) {
  const key = normalizeMealKey(value);
  return key === "breakfast" ? "Breakfast" : key === "lunch" ? "Lunch" : key === "dinner" ? "Dinner" : "Snack";
}

function readMacro(item: JsonObject, canonical: "protein" | "carbs" | "fat") {
  return item[canonical] ?? item[`${canonical}_g`] ?? 0;
}

function plannedMealRow(ctx: McpContext, input: JsonObject): DbRow {
  const foodName = getString(input, "food_name");
  if (!foodName) throw new Error("food_name is required.");
  return {
    user_id: ctx.userId,
    plan_date: cleanDate(input.date ?? input.plan_date ?? input.planned_date),
    meal_type: dbMealType(input.meal_type),
    food_item_id: null,
    user_food_item_id: null,
    food_name: foodName,
    serving_size: getOptionalString(input, "serving_info") ?? getOptionalString(input, "serving_size") ?? "1 serving",
    quantity: positive(input.quantity ?? 1),
    calories: nonNegative(input.calories, "calories"),
    protein_g: nonNegative(readMacro(input, "protein"), "protein"),
    carbs_g: nonNegative(readMacro(input, "carbs"), "carbs"),
    fat_g: nonNegative(readMacro(input, "fat"), "fat"),
    status: "planned",
    food_log_id: null,
    completed_at: null,
    notes: getOptionalString(input, "notes") ?? null
  };
}

function dayMealItems(input: JsonObject): JsonObject[] {
  const date = cleanDate(input.date ?? input.plan_date ?? input.planned_date ?? "today");
  const flatMeals = getArray<JsonObject>(input, "meals");
  if (flatMeals.length) return flatMeals.map((meal) => ({ ...meal, date, meal_type: meal.meal_type ?? meal.type }));
  return mealKeys.flatMap((mealType) => getArray<JsonObject>(input, mealType).map((item) => ({ ...item, date, meal_type: mealType })));
}

function weekMealItems(input: JsonObject): JsonObject[] {
  const flatMeals = getArray<JsonObject>(input, "meals");
  if (flatMeals.length) return flatMeals.map((meal) => ({ ...meal, date: cleanDate(meal.date ?? meal.plan_date ?? input.start_date ?? "today") }));
  return getArray<JsonObject>(input, "days").flatMap((day) => {
    const date = cleanDate(day.date ?? day.plan_date ?? day.planned_date);
    const dayMeals = day.meals;
    if (dayMeals && typeof dayMeals === "object" && !Array.isArray(dayMeals)) {
      const mealObject = dayMeals as JsonObject;
      return mealKeys.flatMap((mealType) => getArray<JsonObject>(mealObject, mealType).map((item) => ({ ...item, date, meal_type: mealType })));
    }
    return getArray<JsonObject>(day, "meals").map((meal) => ({ ...meal, date, meal_type: meal.meal_type ?? meal.type }));
  });
}

async function insertPlannedMeals(ctx: McpContext, items: JsonObject[], sourceTool: string): Promise<McpToolResult> {
  if (!items.length) return fail("missing_required_input", "Provide at least one planned meal item.");
  const { data, error } = await ctx.supabase.from("user_meal_plan_items").insert(items.map((item) => plannedMealRow(ctx, item))).select("*");
  if (error) throw new Error(error.message);
  const createdItems = (data ?? []) as unknown as DbRow[];
  const createdIds = createdItems.map((item) => String(item.id));
  return ok({ ok: true, source_tool: sourceTool, created_count: createdIds.length, created_meal_plan_item_ids: createdIds, planned_meal_ids: createdIds, items: createdItems });
}

function groupMealPlanItems(items: DbRow[]) {
  return items.reduce<Record<MealKey, DbRow[]>>((grouped, item) => {
    grouped[normalizeMealKey(item.meal_type)].push(item);
    return grouped;
  }, { breakfast: [], lunch: [], dinner: [], snack: [] });
}

async function getMealPlanForDate(ctx: McpContext, dateInput: unknown) {
  const date = cleanDate(dateInput ?? "today");
  const { data, error } = await ctx.supabase.from("user_meal_plan_items").select("*").eq("user_id", ctx.userId).eq("plan_date", date).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const items = (data ?? []) as unknown as DbRow[];
  return ok({ ok: true, date, items, meals: groupMealPlanItems(items) });
}

async function getMealPlanForWeek(ctx: McpContext, input: JsonObject) {
  const startDate = cleanDate(input.start_date ?? "today");
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const endDate = end.toISOString().slice(0, 10);
  const { data, error } = await ctx.supabase.from("user_meal_plan_items").select("*").eq("user_id", ctx.userId).gte("plan_date", startDate).lte("plan_date", endDate).order("plan_date", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const items = (data ?? []) as unknown as DbRow[];
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    return { date, meals: groupMealPlanItems(items.filter((item) => item.plan_date === date)) };
  });
  return ok({ ok: true, start_date: startDate, end_date: endDate, days });
}

async function generateShoppingList(ctx: McpContext, input: JsonObject) {
  const startDate = cleanDate(input.start_date ?? "today");
  const endDate = cleanDate(input.end_date ?? startDate);
  const { data, error } = await ctx.supabase.from("user_meal_plan_items").select("food_name,serving_size,quantity,calories,protein_g,carbs_g,fat_g,plan_date,meal_type").eq("user_id", ctx.userId).gte("plan_date", startDate).lte("plan_date", endDate).order("food_name", { ascending: true });
  if (error) throw new Error(error.message);
  const grouped = new Map<string, DbRow & { dates: string[]; meals: string[] }>();
  ((data ?? []) as DbRow[]).forEach((item) => {
    const foodName = String(item.food_name ?? "Planned food").trim();
    const servingSize = String(item.serving_size ?? "serving").trim();
    const key = `${foodName.toLowerCase()}|${servingSize.toLowerCase()}`;
    const current = grouped.get(key) ?? { food_name: foodName, serving_size: servingSize, quantity: 0, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, dates: [], meals: [] };
    current.quantity = num(current.quantity) + num(item.quantity, 1);
    current.calories = num(current.calories) + num(item.calories);
    current.protein_g = num(current.protein_g) + num(item.protein_g);
    current.carbs_g = num(current.carbs_g) + num(item.carbs_g);
    current.fat_g = num(current.fat_g) + num(item.fat_g);
    current.dates = Array.from(new Set([...current.dates, String(item.plan_date ?? "")].filter(Boolean)));
    current.meals = Array.from(new Set([...current.meals, String(item.meal_type ?? "")].filter(Boolean)));
    grouped.set(key, current);
  });
  const items = Array.from(grouped.values()).map((item) => ({ ...item, quantity: Number(num(item.quantity).toFixed(2)), calories: Math.round(num(item.calories)), protein_g: Number(num(item.protein_g).toFixed(1)), carbs_g: Number(num(item.carbs_g).toFixed(1)), fat_g: Number(num(item.fat_g).toFixed(1)) }));
  return ok({ ok: true, start_date: startDate, end_date: endDate, item_count: items.length, shopping_list: items });
}

async function createCustomMeal(ctx: McpContext, input: JsonObject) {
  const items = getArray<JsonObject>(input, "items");
  if (!items.length) return fail("missing_required_input", "Provide at least one custom meal item.");
  const { data: meal, error: mealError } = await ctx.supabase.from("saved_recipes").insert({ user_id: ctx.userId, name: getString(input, "meal_name"), saved_item_type: "meal", notes: getOptionalString(input, "notes") ?? null, is_favorite: Boolean(input.is_favorite) }).select("*").single();
  if (mealError) throw new Error(mealError.message);
  const rows = items.map((item) => ({ recipe_id: meal.id, user_id: ctx.userId, food_name: getString(item, "food_name"), serving_unit: getOptionalString(item, "serving_hint") ?? getOptionalString(item, "serving_size") ?? "serving", quantity: positive(item.quantity ?? 1), calories: nonNegative(item.calories, "calories"), protein_g: nonNegative(readMacro(item, "protein"), "protein"), carbs_g: nonNegative(readMacro(item, "carbs"), "carbs"), fat_g: nonNegative(readMacro(item, "fat"), "fat") }));
  const { data: mealItems, error: itemsError } = await ctx.supabase.from("saved_recipe_ingredients").insert(rows).select("*");
  if (itemsError) {
    await ctx.supabase.from("saved_recipes").delete().eq("id", meal.id).eq("user_id", ctx.userId);
    throw new Error(itemsError.message);
  }
  return ok({ ok: true, meal, items: mealItems ?? [] });
}

async function updateMealPlanItem(ctx: McpContext, input: JsonObject) {
  const id = getString(input, "meal_plan_item_id");
  const patch: DbRow = {};
  if (input.date ?? input.plan_date ?? input.planned_date) patch.plan_date = cleanDate(input.date ?? input.plan_date ?? input.planned_date);
  if (input.meal_type !== undefined) patch.meal_type = dbMealType(input.meal_type);
  if (input.food_name !== undefined) patch.food_name = getString(input, "food_name");
  if (input.quantity !== undefined) patch.quantity = positive(input.quantity);
  if (input.serving_info !== undefined || input.serving_size !== undefined) patch.serving_size = getOptionalString(input, "serving_info") ?? getOptionalString(input, "serving_size") ?? "1 serving";
  if (input.calories !== undefined) patch.calories = nonNegative(input.calories, "calories");
  if (input.protein !== undefined || input.protein_g !== undefined) patch.protein_g = nonNegative(readMacro(input, "protein"), "protein");
  if (input.carbs !== undefined || input.carbs_g !== undefined) patch.carbs_g = nonNegative(readMacro(input, "carbs"), "carbs");
  if (input.fat !== undefined || input.fat_g !== undefined) patch.fat_g = nonNegative(readMacro(input, "fat"), "fat");
  if (input.notes !== undefined) patch.notes = getOptionalString(input, "notes") ?? null;
  if (!Object.keys(patch).length) throw new Error("No meal plan item changes provided.");
  const { data, error } = await ctx.supabase.from("user_meal_plan_items").update(patch).eq("id", id).eq("user_id", ctx.userId).eq("updated_at", getString(input, "expected_updated_at")).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return fail("version_conflict", "This meal-plan item changed after it was read. Fetch it again before updating.");
  return ok({ ok: true, item: data });
}

async function deleteMealPlanItem(ctx: McpContext, input: JsonObject) {
  const confirmation = requireConfirmation(input);
  if (confirmation) return ok(confirmation);
  const id = getString(input, "meal_plan_item_id");
  const read = await ctx.supabase.from("user_meal_plan_items").select("food_log_id").eq("id", id).eq("user_id", ctx.userId).maybeSingle();
  if (read.error) throw new Error(read.error.message);
  if (!read.data) throw new Error("Meal plan item not found.");
  const deleted = await ctx.supabase.from("user_meal_plan_items").delete().eq("id", id).eq("user_id", ctx.userId);
  if (deleted.error) throw new Error(deleted.error.message);
  return ok({ ok: true, deleted_meal_plan_item_id: id, kept_linked_food_log: Boolean((read.data as DbRow).food_log_id) });
}

async function markMealPlanItemDone(ctx: McpContext, input: JsonObject) {
  const id = getString(input, "meal_plan_item_id");
  const { data, error } = await ctx.supabase.rpc("complete_meal_plan_item", { p_item_id: id });
  if (error) throw new Error(error.message);
  const result = data as { item?: DbRow; log?: DbRow; already_done?: boolean } | null;
  if (!result?.item) throw new Error("Meal completion returned an invalid result.");
  return ok({ ok: true, item: result.item, already_done: Boolean(result.already_done), food_log_created: !result.already_done && Boolean(result.log), ...(result.log ? { food_log: result.log } : {}) });
}

async function addSleepRecoveryLog(ctx: McpContext, input: JsonObject) {
  const { data, error } = await ctx.supabase.from("sleep_recovery_logs").insert({
    user_id: ctx.userId,
    log_date: cleanDate(input.date ?? input.log_date ?? "today"),
    hours_slept: getOptionalNumber(input, "hours_slept") ?? null,
    sleep_quality: getOptionalString(input, "sleep_quality") ?? null,
    recovery_level: getOptionalString(input, "recovery_level") ?? null,
    fatigue_level: getOptionalString(input, "fatigue_level") ?? null,
    soreness_level: getOptionalString(input, "soreness_level") ?? null,
    stress_level: getOptionalString(input, "stress_level") ?? null,
    notes: getOptionalString(input, "notes") ?? null
  }).select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, log: data, guidance: "General fitness tracking only. Do not treat this as medical advice." });
}

export async function executeMcpTool(ctx: McpContext, toolName: string, rawInput: unknown): Promise<McpToolResult> {
  const input = asObject(rawInput);
  const contextTaskByTool: Partial<Record<string, ContextTask>> = {
    get_training_planning_context: "training_planning",
    get_nutrition_planning_context: "nutrition_planning",
    get_daily_execution_context: "daily_execution",
    get_progress_context: "progress_review",
    get_workout_adjustment_context: "workout_adjustment"
  };
  const contextTask = contextTaskByTool[toolName];
  if (contextTask) {
    try {
      const projection = await projectTaskContext({ supabase: ctx.supabase, userId: ctx.userId, scopes: ctx.scopes, task: contextTask, input });
      return ok(projection as unknown as Record<string, unknown>);
    } catch (error) {
      if (error instanceof ContextProjectionError) return fail(error.code, error.message);
      throw error;
    }
  }

  if (toolName === "create_day_meal_plan") return insertPlannedMeals(ctx, dayMealItems(input), toolName);
  if (toolName === "create_week_meal_plan") return insertPlannedMeals(ctx, weekMealItems(input), toolName);
  if (toolName === "get_meal_plan_for_date") return getMealPlanForDate(ctx, input.date ?? input.plan_date ?? input.planned_date ?? "today");
  if (toolName === "get_meal_plan_for_week") return getMealPlanForWeek(ctx, input);
  if (toolName === "generate_shopping_list") return generateShoppingList(ctx, input);
  if (toolName === "update_meal_plan_item") return updateMealPlanItem(ctx, input);
  if (toolName === "delete_meal_plan_item") return deleteMealPlanItem(ctx, input);
  if (toolName === "mark_meal_plan_item_done") return markMealPlanItemDone(ctx, input);
  if (toolName === "create_custom_meal") return createCustomMeal(ctx, input);
  if (toolName === "add_sleep_recovery_log") return addSleepRecoveryLog(ctx, input);
  return executeOriginalMcpTool(ctx, toolName, rawInput);
}

export type { McpToolResult };
