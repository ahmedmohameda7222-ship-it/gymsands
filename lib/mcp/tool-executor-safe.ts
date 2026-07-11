import type { McpContext } from "@/lib/mcp/auth";
import { asObject, cleanDate, getArray, getBoolean, getNumber, getOptionalNumber, getOptionalString, getString, requireConfirmation, type JsonObject } from "@/lib/mcp/schemas";
import { executeMcpTool as executeOriginalMcpTool } from "@/lib/mcp/tool-executor";
import { fail, num, ok, sumMacros, type DbRow, type MacroTotals, type McpToolResult } from "@/lib/mcp/tool-helpers";
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
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    const dayItems = items.filter((item) => item.plan_date === date);
    return { date, meals: groupMealPlanItems(dayItems) };
  });
  return ok({ ok: true, start_date: startDate, end_date: endDate, days });
}

async function generateShoppingList(ctx: McpContext, input: JsonObject) {
  const startDate = cleanDate(input.start_date ?? "today");
  const endDate = cleanDate(input.end_date ?? startDate);
  const { data, error } = await ctx.supabase
    .from("user_meal_plan_items")
    .select("food_name,serving_size,quantity,calories,protein_g,carbs_g,fat_g,plan_date,meal_type")
    .eq("user_id", ctx.userId)
    .gte("plan_date", startDate)
    .lte("plan_date", endDate)
    .order("food_name", { ascending: true });
  if (error) throw new Error(error.message);

  const grouped = new Map<string, DbRow & { dates: string[]; meals: string[] }>();
  ((data ?? []) as DbRow[]).forEach((item) => {
    const foodName = String(item.food_name ?? "Planned food").trim();
    const servingSize = String(item.serving_size ?? "serving").trim();
    const key = `${foodName.toLowerCase()}|${servingSize.toLowerCase()}`;
    const current = grouped.get(key) ?? {
      food_name: foodName,
      serving_size: servingSize,
      quantity: 0,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      dates: [],
      meals: []
    };
    current.quantity = num(current.quantity) + num(item.quantity, 1);
    current.calories = num(current.calories) + num(item.calories);
    current.protein_g = num(current.protein_g) + num(item.protein_g);
    current.carbs_g = num(current.carbs_g) + num(item.carbs_g);
    current.fat_g = num(current.fat_g) + num(item.fat_g);
    current.dates = Array.from(new Set([...current.dates, String(item.plan_date ?? "")].filter(Boolean)));
    current.meals = Array.from(new Set([...current.meals, String(item.meal_type ?? "")].filter(Boolean)));
    grouped.set(key, current);
  });

  const items = Array.from(grouped.values()).map((item) => ({
    ...item,
    quantity: Number(num(item.quantity).toFixed(2)),
    calories: Math.round(num(item.calories)),
    protein_g: Number(num(item.protein_g).toFixed(1)),
    carbs_g: Number(num(item.carbs_g).toFixed(1)),
    fat_g: Number(num(item.fat_g).toFixed(1))
  }));

  return ok({
    ok: true,
    start_date: startDate,
    end_date: endDate,
    item_count: items.length,
    shopping_list: items
  });
}

async function createCustomMeal(ctx: McpContext, input: JsonObject) {
  const mealName = getString(input, "meal_name");
  const items = getArray<JsonObject>(input, "items");
  if (!items.length) return fail("missing_required_input", "Provide at least one custom meal item.");

  const { data: meal, error: mealError } = await ctx.supabase
    .from("saved_recipes")
    .insert({
      user_id: ctx.userId,
      name: mealName,
      saved_item_type: "meal",
      notes: getOptionalString(input, "notes") ?? null,
      is_favorite: Boolean(input.is_favorite)
    })
    .select("*")
    .single();
  if (mealError) throw new Error(mealError.message);

  const rows = items.map((item) => {
    const foodName = getString(item, "food_name");
    return {
      recipe_id: meal.id,
      user_id: ctx.userId,
      food_name: foodName,
      serving_unit: getOptionalString(item, "serving_hint") ?? getOptionalString(item, "serving_size") ?? "serving",
      quantity: positive(item.quantity ?? 1),
      calories: nonNegative(item.calories, "calories"),
      protein_g: nonNegative(readMacro(item, "protein"), "protein"),
      carbs_g: nonNegative(readMacro(item, "carbs"), "carbs"),
      fat_g: nonNegative(readMacro(item, "fat"), "fat")
    };
  });
  const { data: mealItems, error: itemsError } = await ctx.supabase.from("saved_recipe_ingredients").insert(rows).select("*");
  if (itemsError) {
    await ctx.supabase.from("saved_recipes").delete().eq("id", meal.id).eq("user_id", ctx.userId);
    throw new Error(itemsError.message);
  }
  return ok({ ok: true, meal, items: mealItems ?? [] });
}

async function getDailyFitTasks(ctx: McpContext, input: JsonObject) {
  const date = cleanDate(input.date ?? "today");
  const { data, error } = await ctx.supabase.from("daily_fit_tasks").select("*").eq("user_id", ctx.userId).eq("task_date", date).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ok({ ok: true, date, tasks: data ?? [] });
}

async function createDailyFitTask(ctx: McpContext, input: JsonObject) {
  const { data, error } = await ctx.supabase
    .from("daily_fit_tasks")
    .insert({
      user_id: ctx.userId,
      task_date: cleanDate(input.date ?? "today"),
      title: getString(input, "title"),
      notes: getOptionalString(input, "notes") ?? null,
      completed: false
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, task: data });
}

async function markDailyFitTask(ctx: McpContext, input: JsonObject, completed: boolean) {
  const id = getString(input, "task_id");
  const reason = getOptionalString(input, "reason");
  const patch: DbRow = { completed };
  if (!completed && reason) patch.notes = reason;
  const { data, error } = await ctx.supabase.from("daily_fit_tasks").update(patch).eq("id", id).eq("user_id", ctx.userId).select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, task: data });
}

async function getHabits(ctx: McpContext, input: JsonObject) {
  const date = cleanDate(input.date ?? "today");
  const { data, error } = await ctx.supabase.from("fitness_habits").select("*").eq("user_id", ctx.userId).eq("habit_date", date).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ok({ ok: true, date, habits: data ?? [] });
}

async function createHabit(ctx: McpContext, input: JsonObject) {
  const { data, error } = await ctx.supabase
    .from("fitness_habits")
    .insert({
      user_id: ctx.userId,
      habit_date: cleanDate(input.date ?? "today"),
      name: getString(input, "name"),
      notes: getOptionalString(input, "notes") ?? getOptionalString(input, "schedule") ?? null,
      completed: false
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, habit: data });
}

async function markHabitDone(ctx: McpContext, input: JsonObject) {
  const id = getOptionalString(input, "habit_id");
  let request = ctx.supabase.from("fitness_habits").update({ completed: true }).eq("user_id", ctx.userId);
  if (id) request = request.eq("id", id);
  else request = request.eq("name", getString(input, "name")).eq("habit_date", cleanDate(input.date ?? "today"));
  const { data, error } = await request.select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, habit: data });
}

async function addSleepRecoveryLog(ctx: McpContext, input: JsonObject) {
  const { data, error } = await ctx.supabase
    .from("sleep_recovery_logs")
    .insert({
      user_id: ctx.userId,
      log_date: cleanDate(input.date ?? input.log_date ?? "today"),
      hours_slept: getOptionalNumber(input, "hours_slept") ?? null,
      sleep_quality: getOptionalString(input, "sleep_quality") ?? null,
      recovery_level: getOptionalString(input, "recovery_level") ?? null,
      fatigue_level: getOptionalString(input, "fatigue_level") ?? null,
      soreness_level: getOptionalString(input, "soreness_level") ?? null,
      stress_level: getOptionalString(input, "stress_level") ?? null,
      notes: getOptionalString(input, "notes") ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, log: data, guidance: "General fitness tracking only. Do not treat this as medical advice." });
}

async function getSleepRecoverySummary(ctx: McpContext, input: JsonObject) {
  const periodDays = Math.max(1, Math.round(num(input.period_days, 7)));
  const since = new Date();
  since.setDate(since.getDate() - periodDays + 1);
  const sinceDate = since.toISOString().slice(0, 10);
  const { data, error } = await ctx.supabase.from("sleep_recovery_logs").select("*").eq("user_id", ctx.userId).gte("log_date", sinceDate).order("log_date", { ascending: false });
  if (error) throw new Error(error.message);
  const logs = (data ?? []) as DbRow[];
  const sleepValues = logs.map((log) => num(log.hours_slept, NaN)).filter(Number.isFinite);
  const averageSleep = sleepValues.length ? Number((sleepValues.reduce((sum, value) => sum + value, 0) / sleepValues.length).toFixed(1)) : null;
  return ok({ ok: true, period_days: periodDays, since: sinceDate, average_sleep_hours: averageSleep, logs });
}

async function getTodaySupplements(ctx: McpContext, input: JsonObject) {
  const date = cleanDate(input.date ?? "today");
  const { data, error } = await ctx.supabase.from("supplement_logs").select("*").eq("user_id", ctx.userId).eq("supplement_date", date).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ok({ ok: true, date, supplements: data ?? [] });
}

async function addSupplementLog(ctx: McpContext, input: JsonObject) {
  const { data, error } = await ctx.supabase
    .from("supplement_logs")
    .insert({
      user_id: ctx.userId,
      supplement_date: cleanDate(input.date ?? "today"),
      name: getString(input, "name"),
      dose: getOptionalString(input, "dose") ?? null,
      time: getOptionalString(input, "time") ?? null,
      reminder: getOptionalString(input, "reminder") ?? null,
      taken_today: Boolean(input.taken_today)
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, supplement: data });
}

async function markSupplementTaken(ctx: McpContext, input: JsonObject) {
  const id = getOptionalString(input, "log_id");
  let request = ctx.supabase.from("supplement_logs").update({ taken_today: true }).eq("user_id", ctx.userId);
  if (id) request = request.eq("id", id);
  else request = request.eq("name", getString(input, "name")).eq("supplement_date", cleanDate(input.date ?? "today"));
  const { data, error } = await request.select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, supplement: data });
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
  const { data, error } = await ctx.supabase.from("user_meal_plan_items").update(patch).eq("id", id).eq("user_id", ctx.userId).eq("updated_at", getString(input, "expected_updated_at")).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return fail("version_conflict", "This meal-plan item changed after it was read. Fetch it again before updating.");
  return ok({ ok: true, item: data });
}

async function deleteMealPlanItem(ctx: McpContext, input: JsonObject) {
  const confirmation = requireConfirmation(input);
  if (confirmation) return ok(confirmation);
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
  const completedAt = new Date().toISOString();
  const claimed = await ctx.supabase
    .from("user_meal_plan_items")
    .update({ status: "done", completed_at: completedAt })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .is("food_log_id", null)
    .neq("status", "done")
    .select("*")
    .maybeSingle();
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data) {
    const reread = await ctx.supabase.from("user_meal_plan_items").select("*").eq("id", id).eq("user_id", ctx.userId).maybeSingle();
    if (reread.error) throw new Error(reread.error.message);
    return ok({ ok: true, item: reread.data ?? row, already_done: true, food_log_created: false });
  }
  const claimedRow = claimed.data as DbRow;
  const logPayload = {
    user_id: ctx.userId,
    food_item_id: claimedRow.food_item_id ?? null,
    user_food_item_id: claimedRow.user_food_item_id ?? null,
    log_date: claimedRow.plan_date,
    meal_type: claimedRow.meal_type,
    food_name: claimedRow.food_name,
    serving_size: claimedRow.serving_size ?? "1 serving",
    quantity: claimedRow.quantity ?? 1,
    calories: claimedRow.calories ?? 0,
    protein_g: claimedRow.protein_g ?? 0,
    carbs_g: claimedRow.carbs_g ?? 0,
    fat_g: claimedRow.fat_g ?? 0,
    notes: claimedRow.notes ?? null
  };
  const inserted = await ctx.supabase.from("food_logs").insert(logPayload).select("*").single();
  if (inserted.error) throw new Error(inserted.error.message);
  const updated = await ctx.supabase.from("user_meal_plan_items").update({ food_log_id: inserted.data.id, completed_at: completedAt }).eq("id", id).eq("user_id", ctx.userId).select("*").single();
  if (updated.error) throw new Error(updated.error.message);
  return ok({ ok: true, item: updated.data, food_log: inserted.data, food_log_created: true });
}

async function calorieTargets(ctx: McpContext): Promise<DbRow | null> {
  const { data, error } = await ctx.supabase.from("calorie_targets").select("*").eq("user_id", ctx.userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbRow | null) ?? null;
}

async function caloriesForDate(ctx: McpContext, date: string) {
  const [target, logs] = await Promise.all([calorieTargets(ctx), ctx.supabase.from("food_logs").select("*").eq("user_id", ctx.userId).eq("log_date", date)]);
  if (logs.error) throw new Error(logs.error.message);
  const totals = sumMacros((logs.data ?? []) as DbRow[]);
  const dailyTarget = target ? num(target.daily_calories, 0) : null;
  return {
    date,
    target: dailyTarget,
    consumed: totals.calories,
    remaining: dailyTarget === null ? null : Math.max(0, dailyTarget - totals.calories),
    needs_target_setup: dailyTarget === null,
    macros: { ...totals, targets: target },
    logs: logs.data ?? []
  };
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

async function getOwnedPlanDay(ctx: McpContext, dayId: string, expectedPlanId?: string) {
  const dayResult = await ctx.supabase
    .from("user_workout_plan_days")
    .select("*")
    .eq("id", dayId)
    .limit(1)
    .maybeSingle();
  if (dayResult.error) throw new Error(dayResult.error.message);
  const day = (dayResult.data as DbRow | null) ?? null;
  if (!day?.plan_id) return null;

  const planId = String(day.plan_id);
  if (expectedPlanId && planId !== expectedPlanId) return null;
  const planResult = await ctx.supabase
    .from("user_workout_plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", ctx.userId)
    .limit(1)
    .maybeSingle();
  if (planResult.error) throw new Error(planResult.error.message);
  return planResult.data ? day : null;
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
    const expectedPlanId = activePlan?.id
      ? String(activePlan.id)
      : typeof workout.user_workout_plan_id === "string"
        ? workout.user_workout_plan_id
        : undefined;
    workoutDay = await getOwnedPlanDay(ctx, String(workout.plan_day_id), expectedPlanId);
    if (workoutDay?.id) {
      const exerciseResult = await ctx.supabase.from("user_workout_plan_exercises").select("*").eq("plan_day_id", String(workoutDay.id)).order("sort_order", { ascending: true });
      if (exerciseResult.error) throw new Error(exerciseResult.error.message);
      exercises = exerciseResult.data ?? [];
    }
  }
  return { active_plan: activePlan, workout, workout_day: workoutDay, exercises };
}

const alternativeReasons = new Set(["machine_taken", "no_equipment", "pain_or_discomfort", "too_hard", "home_alternative", "same_muscle", "lower_back_friendly", "knee_friendly", "shoulder_friendly", "other"]);

function stringArray(input: JsonObject, key: string) {
  return getArray(input, key).map(String).map((item) => item.trim()).filter(Boolean);
}




async function getSingleUserRow(ctx: McpContext, table: string, key: string) {
  const { data, error } = await ctx.supabase.from(table).select("*").eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  return ok({ ok: true, [key]: data ?? null });
}


async function updateNutritionPreferences(ctx: McpContext, input: JsonObject) {
  const payload = {
    user_id: ctx.userId,
    weekly_food_budget: getOptionalNumber(input, "weekly_food_budget") ?? null,
    budget_currency: getOptionalString(input, "budget_currency") ?? null,
    max_cooking_time_minutes: getOptionalNumber(input, "max_cooking_time_minutes") ?? null,
    meal_prep_days: stringArray(input, "meal_prep_days"),
    cooking_skill: getOptionalString(input, "cooking_skill") ?? null,
    kitchen_equipment: stringArray(input, "kitchen_equipment"),
    preferred_cuisines: stringArray(input, "preferred_cuisines"),
    disliked_foods: stringArray(input, "disliked_foods"),
    allergies: getOptionalString(input, "allergies") ?? null,
    repeat_tolerance: getOptionalString(input, "repeat_tolerance") ?? null,
    meals_per_day: getOptionalNumber(input, "meals_per_day") ?? null,
    ingredient_reuse_preference: getOptionalString(input, "ingredient_reuse_preference") ?? null,
    grocery_style_preference: getOptionalString(input, "grocery_style_preference") ?? null
  };
  const { data, error } = await ctx.supabase.from("user_nutrition_preference_profiles").upsert(payload, { onConflict: "user_id" }).select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, nutrition_preference_profile: data });
}

async function getOwnedPlanExercise(ctx: McpContext, exerciseId: string) {
  const { data, error } = await ctx.supabase.from("user_workout_plan_exercises").select("*").eq("id", exerciseId).maybeSingle();
  if (error) throw new Error(error.message);
  const exercise = data as DbRow | null;
  if (!exercise?.plan_day_id) return null;
  const day = await getOwnedPlanDay(ctx, String(exercise.plan_day_id));
  return day ? exercise : null;
}

async function getProgressionTargets(ctx: McpContext, input: JsonObject) {
  let query = ctx.supabase.from("user_progression_targets").select("*").eq("user_id", ctx.userId).order("updated_at", { ascending: false });
  const exerciseId = getOptionalString(input, "plan_exercise_id");
  if (exerciseId) query = query.eq("plan_exercise_id", exerciseId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ok({ ok: true, progression_targets: data ?? [] });
}

async function updateProgressionTarget(ctx: McpContext, input: JsonObject) {
  const exerciseId = getString(input, "plan_exercise_id");
  if (!await getOwnedPlanExercise(ctx, exerciseId)) return fail("not_found", "Plan exercise was not found for this user.");
  const reviewedBy = getOptionalString(input, "last_reviewed_by") ?? "chatgpt";
  const { data, error } = await ctx.supabase.from("user_progression_targets").upsert({
    user_id: ctx.userId,
    plan_exercise_id: exerciseId,
    exercise_name: getString(input, "exercise_name"),
    next_target_weight_kg: getOptionalNumber(input, "next_target_weight_kg") ?? null,
    next_target_reps: getOptionalString(input, "next_target_reps") ?? null,
    next_target_sets: getOptionalNumber(input, "next_target_sets") ?? null,
    progression_note: getOptionalString(input, "progression_note") ?? null,
    ai_recommendation: getOptionalString(input, "ai_recommendation") ?? null,
    last_reviewed_at: new Date().toISOString(),
    last_reviewed_by: reviewedBy
  }, { onConflict: "user_id,plan_exercise_id" }).select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, progression_target: data });
}

async function getExerciseAlternatives(ctx: McpContext, input: JsonObject) {
  let query = ctx.supabase.from("user_exercise_alternatives").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false });
  const exerciseId = getOptionalString(input, "plan_exercise_id");
  if (exerciseId) query = query.eq("plan_exercise_id", exerciseId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ok({ ok: true, exercise_alternatives: data ?? [] });
}

async function createExerciseAlternative(ctx: McpContext, input: JsonObject) {
  const exerciseId = getString(input, "plan_exercise_id");
  if (!await getOwnedPlanExercise(ctx, exerciseId)) return fail("not_found", "Plan exercise was not found for this user.");
  const reason = getString(input, "reason");
  if (!alternativeReasons.has(reason)) return fail("invalid_reason", "Unsupported exercise replacement reason.");
  const { data, error } = await ctx.supabase.from("user_exercise_alternatives").insert({
    user_id: ctx.userId,
    plan_exercise_id: exerciseId,
    original_exercise_name: getString(input, "original_exercise_name"),
    alternative_exercise_name: getString(input, "alternative_exercise_name"),
    reason,
    target_muscle: getOptionalString(input, "target_muscle") ?? null,
    equipment: getOptionalString(input, "equipment") ?? null,
    pain_friendly_note: getOptionalString(input, "pain_friendly_note") ?? null,
    created_by: getOptionalString(input, "created_by") ?? "chatgpt"
  }).select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, exercise_alternative: data, applied_to_plan: false });
}

async function getGroceryItems(ctx: McpContext, input: JsonObject) {
  const weekStart = cleanDate(input.week_start);
  const { data, error } = await ctx.supabase.from("user_grocery_items").select("*").eq("user_id", ctx.userId).eq("week_start", weekStart).order("store_section").order("item_name");
  if (error) throw new Error(error.message);
  return ok({ ok: true, week_start: weekStart, grocery_items: data ?? [] });
}

async function upsertGroceryItem(ctx: McpContext, input: JsonObject) {
  const sourceMealId = getOptionalString(input, "source_meal_plan_item_id");
  if (sourceMealId) {
    const owned = await ctx.supabase.from("user_meal_plan_items").select("id").eq("id", sourceMealId).eq("user_id", ctx.userId).maybeSingle();
    if (owned.error) throw new Error(owned.error.message);
    if (!owned.data) return fail("not_found", "Source meal-plan item was not found for this user.");
  }
  const payload = {
    user_id: ctx.userId,
    week_start: cleanDate(input.week_start),
    source_meal_plan_item_id: sourceMealId ?? null,
    item_name: getString(input, "item_name"),
    quantity: getOptionalNumber(input, "quantity") ?? null,
    unit: getOptionalString(input, "unit") ?? null,
    store_section: getOptionalString(input, "store_section") ?? "Other",
    checked: getBoolean(input, "checked"),
    already_have: getBoolean(input, "already_have"),
    notes: getOptionalString(input, "notes") ?? null,
    created_by: getOptionalString(input, "created_by") ?? "chatgpt"
  };
  const itemId = getOptionalString(input, "grocery_item_id");
  const query = itemId
    ? ctx.supabase.from("user_grocery_items").update(payload).eq("id", itemId).eq("user_id", ctx.userId)
    : ctx.supabase.from("user_grocery_items").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, grocery_item: data });
}

async function getDailyCheckins(ctx: McpContext, input: JsonObject) {
  const startDate = cleanDate(input.start_date);
  const endDate = cleanDate(input.end_date ?? startDate);
  const { data, error } = await ctx.supabase.from("user_daily_checkins").select("*").eq("user_id", ctx.userId).gte("checkin_date", startDate).lte("checkin_date", endDate).order("checkin_date", { ascending: false });
  if (error) throw new Error(error.message);
  return ok({ ok: true, start_date: startDate, end_date: endDate, checkins: data ?? [] });
}

async function upsertDailyCheckin(ctx: McpContext, input: JsonObject) {
  const checkinType = getString(input, "checkin_type");
  const { data, error } = await ctx.supabase.from("user_daily_checkins").upsert({
    user_id: ctx.userId,
    checkin_date: cleanDate(input.checkin_date),
    checkin_type: checkinType,
    sleep_hours: getOptionalNumber(input, "sleep_hours") ?? null,
    energy_level: getOptionalString(input, "energy_level") ?? null,
    soreness_level: getOptionalString(input, "soreness_level") ?? null,
    stress_level: getOptionalString(input, "stress_level") ?? null,
    motivation_level: getOptionalString(input, "motivation_level") ?? null,
    workout_readiness: getOptionalString(input, "workout_readiness") ?? null,
    today_main_goal: getOptionalString(input, "today_main_goal") ?? null,
    today_blocker: getOptionalString(input, "today_blocker") ?? null,
    workout_done: input.workout_done === undefined ? null : getBoolean(input, "workout_done"),
    protein_hit: input.protein_hit === undefined ? null : getBoolean(input, "protein_hit"),
    calories_hit: input.calories_hit === undefined ? null : getBoolean(input, "calories_hit"),
    water_hit: input.water_hit === undefined ? null : getBoolean(input, "water_hit"),
    steps_or_movement_done: input.steps_or_movement_done === undefined ? null : getBoolean(input, "steps_or_movement_done"),
    meal_plan_followed: input.meal_plan_followed === undefined ? null : getBoolean(input, "meal_plan_followed"),
    main_blocker: getOptionalString(input, "main_blocker") ?? null,
    tomorrow_note: getOptionalString(input, "tomorrow_note") ?? null
  }, { onConflict: "user_id,checkin_date,checkin_type" }).select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, checkin: data });
}

async function getNutritionTargetProfiles(ctx: McpContext) {
  const { data, error } = await ctx.supabase.from("user_nutrition_target_profiles").select("*").eq("user_id", ctx.userId).order("target_type");
  if (error) throw new Error(error.message);
  return ok({ ok: true, nutrition_target_profiles: data ?? [] });
}

async function upsertNutritionTargetProfile(ctx: McpContext, input: JsonObject) {
  const { data, error } = await ctx.supabase.from("user_nutrition_target_profiles").upsert({
    user_id: ctx.userId,
    target_type: getString(input, "target_type"),
    calories: getOptionalNumber(input, "calories") ?? null,
    protein_g: getOptionalNumber(input, "protein_g") ?? null,
    carbs_g: getOptionalNumber(input, "carbs_g") ?? null,
    fat_g: getOptionalNumber(input, "fat_g") ?? null,
    water_ml: getOptionalNumber(input, "water_ml") ?? null,
    notes: getOptionalString(input, "notes") ?? null
  }, { onConflict: "user_id,target_type" }).select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, nutrition_target_profile: data, generated_by_plaivra: false });
}

export async function executeMcpTool(ctx: McpContext, toolName: string, rawInput: unknown): Promise<McpToolResult> {
  const input = asObject(rawInput);
  const contextTaskByTool: Partial<Record<string, ContextTask>> = {
    get_training_planning_context: "training_planning",
    get_nutrition_planning_context: "nutrition_planning",
    get_daily_execution_context: "daily_execution",
    get_progress_context: "progress_review",
    get_workout_adjustment_context: "workout_adjustment",
    get_today_summary: "daily_execution",
    get_progress_summary: "progress_review"
  };
  const contextTask = contextTaskByTool[toolName];
  if (contextTask) {
    try {
      const projection = await projectTaskContext({
        supabase: ctx.supabase,
        userId: ctx.userId,
        scopes: ctx.scopes,
        task: contextTask,
        input
      });
      return ok(projection as unknown as Record<string, unknown>);
    } catch (error) {
      if (error instanceof ContextProjectionError) return fail(error.code, error.message);
      throw error;
    }
  }
  if (toolName === "get_user_profile") {
    return fail("tool_retired", "Use a task-specific Plaivra context tool instead of requesting the complete profile.");
  }
  if (toolName === "get_nutrition_preference_profile") return getSingleUserRow(ctx, "user_nutrition_preference_profiles", "nutrition_preference_profile");
  if (toolName === "update_nutrition_preference_profile") return updateNutritionPreferences(ctx, input);
  if (toolName === "get_progression_targets") return getProgressionTargets(ctx, input);
  if (toolName === "update_progression_target") return updateProgressionTarget(ctx, input);
  if (toolName === "get_exercise_alternatives") return getExerciseAlternatives(ctx, input);
  if (toolName === "create_exercise_alternative") return createExerciseAlternative(ctx, input);
  if (toolName === "get_grocery_items") return getGroceryItems(ctx, input);
  if (toolName === "upsert_grocery_item") return upsertGroceryItem(ctx, input);
  if (toolName === "get_daily_checkins") return getDailyCheckins(ctx, input);
  if (toolName === "upsert_daily_checkin") return upsertDailyCheckin(ctx, input);
  if (toolName === "get_nutrition_target_profiles") return getNutritionTargetProfiles(ctx);
  if (toolName === "upsert_nutrition_target_profile") return upsertNutritionTargetProfile(ctx, input);
  if (toolName === "create_meal_plan_item") return insertPlannedMeals(ctx, [{ ...input, date: cleanDate(input.date ?? input.plan_date ?? input.planned_date ?? "today") }], toolName);
  if (toolName === "create_day_meal_plan") return insertPlannedMeals(ctx, dayMealItems(input), toolName);
  if (toolName === "create_week_meal_plan") return insertPlannedMeals(ctx, weekMealItems(input), toolName);
  if (toolName === "get_meal_plan_for_date") return getMealPlanForDate(ctx, input.date ?? input.plan_date ?? input.planned_date ?? "today");
  if (toolName === "get_meal_plan_for_week") return getMealPlanForWeek(ctx, input);
  if (toolName === "generate_shopping_list") return generateShoppingList(ctx, input);
  if (toolName === "update_meal_plan_item") return updateMealPlanItem(ctx, input);
  if (toolName === "delete_meal_plan_item") return deleteMealPlanItem(ctx, input);
  if (toolName === "mark_meal_plan_item_done") return markMealPlanItemDone(ctx, input);
  if (toolName === "create_custom_meal") return createCustomMeal(ctx, input);
  if (toolName === "get_daily_fit_tasks") return getDailyFitTasks(ctx, input);
  if (toolName === "create_daily_fit_task") return createDailyFitTask(ctx, input);
  if (toolName === "mark_daily_fit_task_done") return markDailyFitTask(ctx, input, true);
  if (toolName === "mark_daily_fit_task_skipped") return markDailyFitTask(ctx, input, false);
  if (toolName === "get_habits") return getHabits(ctx, input);
  if (toolName === "create_habit") return createHabit(ctx, input);
  if (toolName === "mark_habit_done") return markHabitDone(ctx, input);
  if (toolName === "add_sleep_recovery_log") return addSleepRecoveryLog(ctx, input);
  if (toolName === "get_sleep_recovery_summary") return getSleepRecoverySummary(ctx, input);
  if (toolName === "get_today_supplements") return getTodaySupplements(ctx, input);
  if (toolName === "add_supplement_log") return addSupplementLog(ctx, input);
  if (toolName === "mark_supplement_taken") return markSupplementTaken(ctx, input);
  if (toolName === "get_today_workout") {
    const today = cleanDate("today");
    return ok({ ok: true, date: today, ...(await getSafeTodayWorkout(ctx, today)) });
  }
  return executeOriginalMcpTool(ctx, toolName, rawInput);
}

export type { McpToolResult };
