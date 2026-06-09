import type { McpContext } from "@/lib/mcp/auth";
import { asObject, cleanDate, getArray, getNumber, getOptionalNumber, getOptionalString, getString, type JsonObject } from "@/lib/mcp/schemas";
import { executeMcpTool as executeOriginalMcpTool, type McpToolResult } from "@/lib/mcp/tool-executor";

type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type DbRow = Record<string, unknown>;
type MealKey = "breakfast" | "lunch" | "dinner" | "snack";

const mealKeys: MealKey[] = ["breakfast", "lunch", "dinner", "snack"];

function ok(structuredContent: Record<string, unknown>, message?: string): McpToolResult {
  return { structuredContent, content: [{ type: "text", text: message ?? JSON.stringify(structuredContent) }] };
}

function fail(code: string, message: string, details?: unknown): McpToolResult {
  return { isError: true, structuredContent: { ok: false, code, message, details }, content: [{ type: "text", text: message }] };
}

function num(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

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
  if (clean === "breakfast") return "breakfast";
  if (clean === "lunch") return "lunch";
  if (clean === "dinner") return "dinner";
  if (clean === "snack" || clean === "snacks") return "snack";
  throw new Error("meal_type must be breakfast, lunch, dinner, or snack.");
}

function dbMealType(value: unknown) {
  const key = normalizeMealKey(value);
  return key === "breakfast" ? "Breakfast" : key === "lunch" ? "Lunch" : key === "dinner" ? "Dinner" : "Snack";
}

function sumMacros(rows: DbRow[]): MacroTotals {
  return rows.reduce<MacroTotals>(
    (total, row) => ({
      calories: total.calories + num(row.calories),
      protein_g: total.protein_g + num(row.protein_g),
      carbs_g: total.carbs_g + num(row.carbs_g),
      fat_g: total.fat_g + num(row.fat_g)
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

function readMacro(item: JsonObject, canonical: "protein" | "carbs" | "fat") {
  const dbKey = `${canonical}_g`;
  return item[canonical] ?? item[dbKey] ?? 0;
}

function plannedMealRow(ctx: McpContext, input: JsonObject): DbRow {
  const date = cleanDate(input.date ?? input.plan_date ?? input.planned_date);
  const foodName = getString(input, "food_name");
  if (!foodName) throw new Error("food_name is required.");
  return {
    user_id: ctx.userId,
    plan_date: date,
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
  const rows = items.map((item) => plannedMealRow(ctx, item));
  const { data, error } = await ctx.supabase.from("user_meal_plan_items").insert(rows).select("*");
  if (error) throw new Error(error.message);
  const createdItems = (data ?? []) as unknown as DbRow[];
  const createdIds = createdItems.map((item) => String(item.id));
  const createdByDate = createdItems.reduce<Record<string, string[]>>((grouped, item) => {
    const date = String(item.plan_date ?? "unknown");
    grouped[date] = [...(grouped[date] ?? []), String(item.id)];
    return grouped;
  }, {});
  return ok({ ok: true, source_tool: sourceTool, created_count: createdIds.length, created: createdByDate, created_meal_plan_item_ids: createdIds, planned_meal_ids: createdIds, items: createdItems });
}

function groupMealPlanItems(items: DbRow[]) {
  return items.reduce<Record<string, DbRow[]>>(
    (grouped, item) => {
      const key = normalizeMealKey(item.meal_type);
      grouped[key].push(item);
      return grouped;
    },
    { breakfast: [], lunch: [], dinner: [], snack: [] }
  );
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
  const grouped = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    const dayItems = items.filter((item) => item.plan_date === date);
    return [date, groupMealPlanItems(dayItems)] as const;
  });
  return ok({ ok: true, start_date: startDate, end_date: endDate, days: Object.fromEntries(grouped) });
}

async function updateMealPlanItem(ctx: McpContext, input: JsonObject) {
  const id = getString(input, "meal_plan_item_id");
  if (!id) throw new Error("meal_plan_item_id is required.");
  const patch: DbRow = {};
  if (input.date ?? input.plan_date ?? input.planned_date) patch.plan_date = cleanDate(input.date ?? input.plan_date ?? input.planned_date);
  if (input.meal_type !== undefined) patch.meal_type = dbMealType(input.meal_type);
  if (input.food_name !== undefined) {
    const foodName = getString(input, "food_name");
    if (!foodName) throw new Error("food_name is required.");
    patch.food_name = foodName;
  }
  if (input.quantity !== undefined) patch.quantity = positive(input.quantity);
  if (input.serving_info !== undefined || input.serving_size !== undefined) patch.serving_size = getOptionalString(input, "serving_info") ?? getOptionalString(input, "serving_size") ?? "1 serving";
  if (input.calories !== undefined) patch.calories = nonNegative(input.calories, "calories");
  if (input.protein !== undefined || input.protein_g !== undefined) patch.protein_g = nonNegative(readMacro(input, "protein"), "protein");
  if (input.carbs !== undefined || input.carbs_g !== undefined) patch.carbs_g = nonNegative(readMacro(input, "carbs"), "carbs");
  if (input.fat !== undefined || input.fat_g !== undefined) patch.fat_g = nonNegative(readMacro(input, "fat"), "fat");
  if (input.notes !== undefined) patch.notes = getOptionalString(input, "notes") ?? null;
  if (!Object.keys(patch).length) throw new Error("No meal plan item changes provided.");
  const { data, error } = await ctx.supabase.from("user_meal_plan_items").update(patch).eq("id", id).eq("user_id", ctx.userId).select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, item: data });
}

async function deleteMealPlanItem(ctx: McpContext, input: JsonObject) {
  const id = getString(input, "meal_plan_item_id");
  if (!id) throw new Error("meal_plan_item_id is required.");
  const { data: item, error: readError } = await ctx.supabase.from("user_meal_plan_items").select("*").eq("id", id).eq("user_id", ctx.userId).limit(1).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!item) throw new Error("Meal plan item not found.");
  const { error } = await ctx.supabase.from("user_meal_plan_items").delete().eq("id", id).eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return ok({ ok: true, deleted_meal_plan_item_id: id, kept_linked_food_log: Boolean((item as DbRow).food_log_id) });
}

async function markMealPlanItemDone(ctx: McpContext, input: JsonObject) {
  const id = getString(input, "meal_plan_item_id");
  if (!id) throw new Error("meal_plan_item_id is required.");
  const { data: item, error: readError } = await ctx.supabase.from("user_meal_plan_items").select("*").eq("id", id).eq("user_id", ctx.userId).limit(1).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!item) throw new Error("Meal plan item not found.");
  const row = item as DbRow;
  if (row.status === "done" || row.food_log_id) return ok({ ok: true, item: row, already_done: true, food_log_created: false });
  const logPayload = {
    user_id: ctx.userId,
    food_item_id: row.food_item_id ?? null,
    user_food_item_id: row.user_food_item_id ?? null,
    log_date: row.plan_date,
    meal_type: row.meal_type,
    food_name: row.food_name,
    serving_size: row.serving_size ?? "1 serving",
    quantity: row.quantity ?? 1,
    calories: row.calories ?? 0,
    protein_g: row.protein_g ?? 0,
    carbs_g: row.carbs_g ?? 0,
    fat_g: row.fat_g ?? 0,
    notes: row.notes ?? null
  };
  const inserted = await ctx.supabase.from("food_logs").insert(logPayload).select("*").single();
  if (inserted.error) throw new Error(inserted.error.message);
  const updated = await ctx.supabase.from("user_meal_plan_items").update({ status: "done", food_log_id: inserted.data.id, completed_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.userId).select("*").single();
  if (updated.error) throw new Error(updated.error.message);
  return ok({ ok: true, item: updated.data, food_log: inserted.data, food_log_created: true });
}

async function calorieTargets(ctx: McpContext): Promise<DbRow> {
  const { data, error } = await ctx.supabase.from("calorie_targets").select("*").eq("user_id", ctx.userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbRow | null) ?? { daily_calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 70, water_ml: 2500 };
}

async function caloriesForDate(ctx: McpContext, date: string) {
  const [target, logs] = await Promise.all([calorieTargets(ctx), ctx.supabase.from("food_logs").select("*").eq("user_id", ctx.userId).eq("log_date", date)]);
  if (logs.error) throw new Error(logs.error.message);
  const totals = sumMacros((logs.data ?? []) as DbRow[]);
  const dailyTarget = num(target.daily_calories, 2200);
  return { date, target: dailyTarget, consumed: totals.calories, remaining: Math.max(0, dailyTarget - totals.calories), macros: { ...totals, targets: target }, logs: logs.data ?? [] };
}

async function waterLogged(ctx: McpContext, date: string) {
  const { data, error } = await ctx.supabase.from("water_logs").select("amount_ml").eq("user_id", ctx.userId).eq("log_date", date);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbRow[]).reduce<number>((sum, row) => sum + num(row.amount_ml), 0);
}

async function getFullPlan(ctx: McpContext, planId: string) {
  const planResult = await ctx.supabase.from("user_workout_plans").select("*").eq("id", planId).eq("user_id", ctx.userId).limit(1).maybeSingle();
  if (planResult.error) throw new Error(planResult.error.message);
  if (!planResult.data) return { plan: null, days: [], exercises: [] };
  const { data: days, error: daysError } = await ctx.supabase.from("user_workout_plan_days").select("*").eq("plan_id", planId).order("day_number", { ascending: true });
  if (daysError) throw new Error(daysError.message);
  const dayIds = ((days ?? []) as DbRow[]).map((day) => String(day.id));
  const exercisesResult = dayIds.length ? await ctx.supabase.from("user_workout_plan_exercises").select("*").in("plan_day_id", dayIds).order("sort_order", { ascending: true }) : { data: [], error: null };
  if (exercisesResult.error) throw new Error(exercisesResult.error.message);
  return { plan: planResult.data, days: days ?? [], exercises: exercisesResult.data ?? [] };
}

async function getSafeActivePlan(ctx: McpContext) {
  const { data, error } = await ctx.supabase.from("user_workout_plans").select("*").eq("user_id", ctx.userId).eq("is_active", true).order("updated_at", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbRow | null) ?? null;
}

async function getSafeTodayWorkout(ctx: McpContext, date: string) {
  const activePlan = await getSafeActivePlan(ctx);
  let request = ctx.supabase.from("user_workout_sessions").select("*").eq("user_id", ctx.userId).eq("scheduled_date", date).order("session_number", { ascending: true }).limit(1);
  if (activePlan?.id) request = request.eq("user_workout_plan_id", String(activePlan.id));
  const { data, error } = await request.maybeSingle();
  if (error) throw new Error(error.message);
  const workout = (data as DbRow | null) ?? null;
  let workoutDay: DbRow | null = null;
  let exercises: unknown[] = [];
  if (workout?.plan_day_id) {
    const dayResult = await ctx.supabase.from("user_workout_plan_days").select("*").eq("id", String(workout.plan_day_id)).limit(1).maybeSingle();
    if (dayResult.error) throw new Error(dayResult.error.message);
    workoutDay = (dayResult.data as DbRow | null) ?? null;
    if (workoutDay?.id) {
      const exerciseResult = await ctx.supabase.from("user_workout_plan_exercises").select("*").eq("plan_day_id", String(workoutDay.id)).order("sort_order", { ascending: true });
      if (exerciseResult.error) throw new Error(exerciseResult.error.message);
      exercises = exerciseResult.data ?? [];
    }
  }
  return { active_plan: activePlan, workout, workout_day: workoutDay, exercises };
}

export async function executeMcpTool(ctx: McpContext, toolName: string, rawInput: unknown): Promise<McpToolResult> {
  const input = asObject(rawInput);
  if (toolName === "create_meal_plan_item") return insertPlannedMeals(ctx, [{ ...input, date: cleanDate(input.date ?? input.plan_date ?? input.planned_date ?? "today") }], toolName);
  if (toolName === "create_day_meal_plan") return insertPlannedMeals(ctx, dayMealItems(input), toolName);
  if (toolName === "create_week_meal_plan") return insertPlannedMeals(ctx, weekMealItems(input), toolName);
  if (toolName === "get_meal_plan_for_date") return getMealPlanForDate(ctx, input.date ?? input.plan_date ?? input.planned_date ?? "today");
  if (toolName === "get_meal_plan_for_week") return getMealPlanForWeek(ctx, input);
  if (toolName === "update_meal_plan_item" || toolName === "replace_meal_plan_item") return updateMealPlanItem(ctx, input);
  if (toolName === "delete_meal_plan_item") return deleteMealPlanItem(ctx, input);
  if (toolName === "mark_meal_plan_item_done") return markMealPlanItemDone(ctx, input);
  if (toolName === "get_active_workout_plan") {
    const activePlan = await getSafeActivePlan(ctx);
    if (!activePlan?.id) return ok({ ok: true, plan: null, days: [], exercises: [] });
    return ok({ ok: true, ...(await getFullPlan(ctx, String(activePlan.id))) });
  }
  if (toolName === "get_today_workout") {
    const today = cleanDate("today");
    return ok({ ok: true, date: today, ...(await getSafeTodayWorkout(ctx, today)) });
  }
  if (toolName === "get_today_summary") {
    const today = cleanDate("today");
    const [calories, water, mealPlan, workout] = await Promise.all([caloriesForDate(ctx, today), waterLogged(ctx, today), ctx.supabase.from("user_meal_plan_items").select("*").eq("user_id", ctx.userId).eq("plan_date", today), getSafeTodayWorkout(ctx, today)]);
    if (mealPlan.error) throw new Error(mealPlan.error.message);
    return ok({ ok: true, date: today, calories, water_ml: water, meal_plan: mealPlan.data ?? [], ...workout });
  }
  return executeOriginalMcpTool(ctx, toolName, rawInput);
}

export type { McpToolResult };
