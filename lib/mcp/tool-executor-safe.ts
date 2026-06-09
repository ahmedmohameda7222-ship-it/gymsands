import type { McpContext } from "@/lib/mcp/auth";
import { asObject, cleanDate, cleanMealType, getArray, getNumber, getOptionalString, getString, type JsonObject } from "@/lib/mcp/schemas";
import { executeMcpTool as executeOriginalMcpTool, type McpToolResult } from "@/lib/mcp/tool-executor";

type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type DbRow = Record<string, unknown>;

type FoodCandidate = {
  id: string;
  source: "global" | "user";
  food_name: string;
  serving_size: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

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

function normalizeFood(row: DbRow, source: "global" | "user"): FoodCandidate {
  return {
    id: String(row.id),
    source,
    food_name: String(row.food_name ?? ""),
    serving_size: String(row.serving_size ?? ""),
    calories: num(row.calories),
    protein_g: num(row.protein_g),
    carbs_g: num(row.carbs_g),
    fat_g: num(row.fat_g)
  };
}

function scaleFood(food: FoodCandidate, quantity: number) {
  return {
    food_item_id: food.source === "global" ? food.id : null,
    user_food_item_id: food.source === "user" ? food.id : null,
    food_name: food.food_name,
    serving_size: food.serving_size,
    quantity,
    calories: Number((food.calories * quantity).toFixed(2)),
    protein_g: Number((food.protein_g * quantity).toFixed(2)),
    carbs_g: Number((food.carbs_g * quantity).toFixed(2)),
    fat_g: Number((food.fat_g * quantity).toFixed(2))
  };
}

async function findFoodById(ctx: McpContext, foodId: string): Promise<FoodCandidate | null> {
  const [globalFood, userFood] = await Promise.all([
    ctx.supabase
      .from("food_items")
      .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g")
      .eq("id", foodId)
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from("user_food_items")
      .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g")
      .eq("id", foodId)
      .eq("user_id", ctx.userId)
      .limit(1)
      .maybeSingle()
  ]);

  if (globalFood.error) throw new Error(globalFood.error.message);
  if (userFood.error) throw new Error(userFood.error.message);
  if (userFood.data) return normalizeFood(userFood.data as unknown as DbRow, "user");
  if (globalFood.data) return normalizeFood(globalFood.data as unknown as DbRow, "global");
  return null;
}

async function findFood(ctx: McpContext, query: string, limit = 5): Promise<{ exact?: FoodCandidate; candidates: FoodCandidate[] }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("food_name is required when food_item_id is not provided.");

  const [globalFoods, userFoods] = await Promise.all([
    ctx.supabase
      .from("food_items")
      .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g")
      .eq("is_global", true)
      .ilike("food_name", `%${cleanQuery}%`)
      .limit(limit),
    ctx.supabase
      .from("user_food_items")
      .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g")
      .eq("user_id", ctx.userId)
      .ilike("food_name", `%${cleanQuery}%`)
      .limit(limit)
  ]);

  if (globalFoods.error) throw new Error(globalFoods.error.message);
  if (userFoods.error) throw new Error(userFoods.error.message);

  const candidates = [
    ...(((userFoods.data ?? []) as unknown as DbRow[]).map((food) => normalizeFood(food, "user"))),
    ...(((globalFoods.data ?? []) as unknown as DbRow[]).map((food) => normalizeFood(food, "global")))
  ].slice(0, limit);

  const exact = candidates.find((food) => food.food_name.toLowerCase() === cleanQuery.toLowerCase()) ?? (candidates.length === 1 ? candidates[0] : undefined);
  return { exact, candidates };
}

async function resolvePlannedMealFood(ctx: McpContext, item: JsonObject): Promise<{ food?: FoodCandidate; ambiguous?: Record<string, unknown> }> {
  const foodId = getOptionalString(item, "food_item_id") ?? getOptionalString(item, "user_food_item_id");
  if (foodId) {
    const food = await findFoodById(ctx, foodId);
    if (food) return { food };
    return { ambiguous: { requested: item, reason: "food_item_id was not found for this user." } };
  }

  const match = await findFood(ctx, getString(item, "food_name"), 5);
  if (match.exact) return { food: match.exact };
  return { ambiguous: { requested: item, candidates: match.candidates } };
}

function plannedMealInput(date: string, item: JsonObject): JsonObject {
  return {
    ...item,
    date,
    plan_date: date,
    meal_type: item.meal_type ?? item.type
  };
}

async function buildPlannedMealRows(ctx: McpContext, items: JsonObject[]) {
  const rows: DbRow[] = [];
  const ambiguous: DbRow[] = [];

  for (const item of items) {
    const date = cleanDate(item.plan_date ?? item.date);
    const mealType = cleanMealType(item.meal_type);
    const quantity = getNumber(item, "quantity", 1);
    const { food, ambiguous: unresolved } = await resolvePlannedMealFood(ctx, item);
    if (!food) {
      ambiguous.push((unresolved ?? { requested: item }) as DbRow);
      continue;
    }

    rows.push({
      user_id: ctx.userId,
      plan_date: date,
      meal_type: mealType,
      ...scaleFood(food, quantity),
      status: "planned",
      food_log_id: null,
      completed_at: null,
      notes: getOptionalString(item, "notes") ?? getOptionalString(item, "serving_hint") ?? null
    });
  }

  return { rows, ambiguous };
}

async function insertPlannedMeals(ctx: McpContext, items: JsonObject[], sourceTool: string): Promise<McpToolResult> {
  if (!items.length) return fail("missing_required_input", "Provide at least one planned meal item.");

  const { rows, ambiguous } = await buildPlannedMealRows(ctx, items);
  if (ambiguous.length) {
    return ok({ ok: false, status: "needs_clarification", ambiguous_items: ambiguous }, "Some planned meal foods are ambiguous. Ask the user to choose a candidate.");
  }

  if (!rows.length) return fail("missing_required_input", "No planned meal rows could be created.");

  const { data, error } = await ctx.supabase.from("user_meal_plan_items").insert(rows).select("*");
  if (error) throw new Error(error.message);

  const createdItems = (data ?? []) as unknown as DbRow[];
  const createdIds = createdItems.map((item) => String(item.id));
  return ok({
    ok: true,
    source_tool: sourceTool,
    created_count: createdIds.length,
    created_meal_plan_item_ids: createdIds,
    planned_meal_ids: createdIds,
    items: createdItems
  });
}

function weekMealItems(input: JsonObject): JsonObject[] {
  const flatMeals = getArray<JsonObject>(input, "meals");
  if (flatMeals.length) {
    const fallbackStart = cleanDate(input.start_date ?? input.date ?? "today");
    return flatMeals.map((meal) => ({ ...meal, date: cleanDate(meal.date ?? meal.plan_date ?? fallbackStart) }));
  }

  const days = getArray<JsonObject>(input, "days");
  return days.flatMap((day) => {
    const date = cleanDate(day.date ?? day.plan_date);
    return getArray<JsonObject>(day, "meals").map((meal) => plannedMealInput(date, meal));
  });
}

async function calorieTargets(ctx: McpContext): Promise<DbRow> {
  const { data, error } = await ctx.supabase
    .from("calorie_targets")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbRow | null) ?? { daily_calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 70, water_ml: 2500 };
}

async function caloriesForDate(ctx: McpContext, date: string) {
  const [target, logs] = await Promise.all([
    calorieTargets(ctx),
    ctx.supabase.from("food_logs").select("*").eq("user_id", ctx.userId).eq("log_date", date)
  ]);
  if (logs.error) throw new Error(logs.error.message);
  const totals = sumMacros((logs.data ?? []) as DbRow[]);
  const dailyTarget = num(target.daily_calories, 2200);
  return {
    date,
    target: dailyTarget,
    consumed: totals.calories,
    remaining: Math.max(0, dailyTarget - totals.calories),
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
  const planResult = await ctx.supabase
    .from("user_workout_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", ctx.userId)
    .limit(1)
    .maybeSingle();
  if (planResult.error) throw new Error(planResult.error.message);
  if (!planResult.data) return { plan: null, days: [], exercises: [] };

  const { data: days, error: daysError } = await ctx.supabase
    .from("user_workout_plan_days")
    .select("*")
    .eq("plan_id", planId)
    .order("day_number", { ascending: true });
  if (daysError) throw new Error(daysError.message);

  const dayIds = ((days ?? []) as DbRow[]).map((day) => String(day.id));
  const exercisesResult = dayIds.length
    ? await ctx.supabase.from("user_workout_plan_exercises").select("*").in("plan_day_id", dayIds).order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (exercisesResult.error) throw new Error(exercisesResult.error.message);

  return { plan: planResult.data, days: days ?? [], exercises: exercisesResult.data ?? [] };
}

async function getSafeActivePlan(ctx: McpContext) {
  const { data, error } = await ctx.supabase
    .from("user_workout_plans")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbRow | null) ?? null;
}

async function getSafeTodayWorkout(ctx: McpContext, date: string) {
  const activePlan = await getSafeActivePlan(ctx);
  let request = ctx.supabase
    .from("user_workout_sessions")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("scheduled_date", date)
    .order("session_number", { ascending: true })
    .limit(1);

  if (activePlan?.id) request = request.eq("user_workout_plan_id", String(activePlan.id));

  const { data, error } = await request.maybeSingle();
  if (error) throw new Error(error.message);

  const workout = (data as DbRow | null) ?? null;
  let workoutDay: DbRow | null = null;
  let exercises: unknown[] = [];
  if (workout?.plan_day_id) {
    const dayResult = await ctx.supabase
      .from("user_workout_plan_days")
      .select("*")
      .eq("id", String(workout.plan_day_id))
      .limit(1)
      .maybeSingle();
    if (dayResult.error) throw new Error(dayResult.error.message);
    workoutDay = (dayResult.data as DbRow | null) ?? null;
    if (workoutDay?.id) {
      const exerciseResult = await ctx.supabase
        .from("user_workout_plan_exercises")
        .select("*")
        .eq("plan_day_id", String(workoutDay.id))
        .order("sort_order", { ascending: true });
      if (exerciseResult.error) throw new Error(exerciseResult.error.message);
      exercises = exerciseResult.data ?? [];
    }
  }

  return { active_plan: activePlan, workout, workout_day: workoutDay, exercises };
}

export async function executeMcpTool(ctx: McpContext, toolName: string, rawInput: unknown): Promise<McpToolResult> {
  if (toolName === "create_meal_plan_item") {
    const input = asObject(rawInput);
    const item = {
      ...input,
      date: cleanDate(input.date ?? input.plan_date ?? "today"),
      meal_type: input.meal_type
    };
    return insertPlannedMeals(ctx, [item], toolName);
  }

  if (toolName === "create_day_meal_plan") {
    const input = asObject(rawInput);
    const date = cleanDate(input.date ?? input.plan_date ?? "today");
    const meals = getArray<JsonObject>(input, "meals").map((meal) => plannedMealInput(date, meal));
    return insertPlannedMeals(ctx, meals, toolName);
  }

  if (toolName === "create_week_meal_plan") {
    const input = asObject(rawInput);
    return insertPlannedMeals(ctx, weekMealItems(input), toolName);
  }

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
    const [calories, water, mealPlan, workout] = await Promise.all([
      caloriesForDate(ctx, today),
      waterLogged(ctx, today),
      ctx.supabase.from("user_meal_plan_items").select("*").eq("user_id", ctx.userId).eq("plan_date", today),
      getSafeTodayWorkout(ctx, today)
    ]);
    if (mealPlan.error) throw new Error(mealPlan.error.message);
    return ok({ ok: true, date: today, calories, water_ml: water, meal_plan: mealPlan.data ?? [], ...workout });
  }

  return executeOriginalMcpTool(ctx, toolName, rawInput);
}

export type { McpToolResult };
