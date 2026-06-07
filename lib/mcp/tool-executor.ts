import { configuredProviders } from "@/lib/integrations/env";
import type { McpContext } from "@/lib/mcp/auth";
import {
  asObject,
  cleanDate,
  cleanMealType,
  getArray,
  getNumber,
  getOptionalNumber,
  getOptionalString,
  getString,
  requireConfirmation,
  type JsonObject
} from "@/lib/mcp/schemas";

export type McpToolResult = {
  structuredContent: Record<string, unknown>;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

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

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sumMacros(rows: Array<Record<string, unknown>>) {
  return rows.reduce(
    (total, row) => ({
      calories: total.calories + num(row.calories),
      protein_g: total.protein_g + num(row.protein_g),
      carbs_g: total.carbs_g + num(row.carbs_g),
      fat_g: total.fat_g + num(row.fat_g)
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

function normalizeFood(row: Record<string, unknown>, source: "global" | "user"): FoodCandidate {
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

async function findFood(ctx: McpContext, query: string, limit = 5): Promise<{ exact?: FoodCandidate; candidates: FoodCandidate[] }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("food_name is required.");

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
    ...((userFoods.data ?? []) as Array<Record<string, unknown>>).map((food) => normalizeFood(food, "user")),
    ...((globalFoods.data ?? []) as Array<Record<string, unknown>>).map((food) => normalizeFood(food, "global"))
  ].slice(0, limit);

  const exact = candidates.find((food) => food.food_name.toLowerCase() === cleanQuery.toLowerCase()) ?? (candidates.length === 1 ? candidates[0] : undefined);
  return { exact, candidates };
}

async function targets(ctx: McpContext) {
  const { data, error } = await ctx.supabase.from("calorie_targets").select("*").eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? { daily_calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 70, water_ml: 2500 };
}

async function waterLogged(ctx: McpContext, date: string) {
  const { data, error } = await ctx.supabase.from("water_logs").select("amount_ml").eq("user_id", ctx.userId).eq("log_date", date);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).reduce((sum, row) => sum + num(row.amount_ml), 0);
}

async function caloriesForDate(ctx: McpContext, date: string) {
  const [target, logs] = await Promise.all([
    targets(ctx),
    ctx.supabase.from("food_logs").select("*").eq("user_id", ctx.userId).eq("log_date", date)
  ]);
  if (logs.error) throw new Error(logs.error.message);
  const totals = sumMacros((logs.data ?? []) as Array<Record<string, unknown>>);
  return {
    date,
    target: target.daily_calories,
    consumed: totals.calories,
    remaining: Math.max(0, num(target.daily_calories) - totals.calories),
    macros: { ...totals, targets: target },
    logs: logs.data ?? []
  };
}

async function requirePlan(ctx: McpContext, planId: string) {
  const { data, error } = await ctx.supabase.from("user_workout_plans").select("*").eq("id", planId).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workout plan not found for this user.");
  return data as Record<string, unknown>;
}

async function requireDay(ctx: McpContext, dayId: string) {
  const { data, error } = await ctx.supabase.from("user_workout_plan_days").select("*").eq("id", dayId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workout plan day not found.");
  await requirePlan(ctx, String(data.plan_id));
  return data as Record<string, unknown>;
}

async function requireExercise(ctx: McpContext, exerciseId: string) {
  const { data, error } = await ctx.supabase.from("user_workout_plan_exercises").select("*").eq("id", exerciseId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Plan exercise not found.");
  await requireDay(ctx, String(data.plan_day_id));
  return data as Record<string, unknown>;
}

async function getFullPlan(ctx: McpContext, planId: string) {
  const plan = await requirePlan(ctx, planId);
  const { data: days, error: daysError } = await ctx.supabase.from("user_workout_plan_days").select("*").eq("plan_id", planId).order("day_number", { ascending: true });
  if (daysError) throw new Error(daysError.message);
  const dayIds = (days ?? []).map((day) => String(day.id));
  const exercises = dayIds.length ? await ctx.supabase.from("user_workout_plan_exercises").select("*").in("plan_day_id", dayIds).order("sort_order", { ascending: true }) : { data: [], error: null };
  if (exercises.error) throw new Error(exercises.error.message);
  return { plan, days: days ?? [], exercises: exercises.data ?? [] };
}

function exerciseRow(planDayId: string, input: JsonObject, blockType: string) {
  const order = getOptionalNumber(input, "order_index") ?? getOptionalNumber(input, "sort_order") ?? 1;
  return {
    plan_day_id: planDayId,
    workout_id: null,
    source_workout_id: null,
    exercise_name: getString(input, "exercise_name"),
    category: getOptionalString(input, "block_type") ?? blockType,
    block_type: getOptionalString(input, "block_type") ?? blockType,
    target_muscle: getOptionalString(input, "target_muscle") ?? null,
    equipment: getOptionalString(input, "equipment") ?? null,
    sets: getOptionalNumber(input, "sets") ?? null,
    reps: getOptionalString(input, "reps") ?? null,
    weight: getOptionalString(input, "weight") ?? null,
    rest_seconds: getOptionalNumber(input, "rest_seconds") ?? null,
    tempo: getOptionalString(input, "tempo") ?? null,
    instructions: getOptionalString(input, "instructions") ?? null,
    sort_order: order,
    order_index: order,
    notes: getOptionalString(input, "notes") ?? null
  };
}

async function insertBlock(ctx: McpContext, dayId: string, blockType: string, items: JsonObject[]) {
  if (!items.length) return [];
  await requireDay(ctx, dayId);
  const rows = items.map((item, index) => exerciseRow(dayId, { order_index: index + 1, ...item }, blockType));
  const { data, error } = await ctx.supabase.from("user_workout_plan_exercises").insert(rows).select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

function itemsFrom(day: JsonObject, names: string[]) {
  for (const name of names) {
    const items = getArray<JsonObject>(day, name);
    if (items.length) return items;
  }
  return [];
}

async function saveChatGptPlan(ctx: McpContext, input: JsonObject) {
  const days = getArray<JsonObject>(input, "days");
  if (!days.length) return fail("missing_required_input", "Provide a full ChatGPT-created plan object with days.");

  const activate = input.activate !== false;
  if (activate) await ctx.supabase.from("user_workout_plans").update({ is_active: false, is_default: false }).eq("user_id", ctx.userId);

  const { data: plan, error: planError } = await ctx.supabase
    .from("user_workout_plans")
    .insert({
      user_id: ctx.userId,
      name: getString(input, "name"),
      goal: getOptionalString(input, "goal") ?? null,
      description: getOptionalString(input, "description") ?? null,
      is_active: activate,
      is_default: activate,
      source: "chatgpt",
      chatgpt_source: true,
      program_duration_weeks: getOptionalNumber(input, "duration_weeks") ?? getOptionalNumber(input, "desired_duration_weeks") ?? null,
      days_per_week: getOptionalNumber(input, "days_per_week") ?? days.length,
      session_duration_minutes: getOptionalNumber(input, "session_duration_minutes") ?? getOptionalNumber(input, "workout_duration_minutes") ?? null,
      match_explanation: "Created by ChatGPT through FitLife MCP.",
      match_reasons: ["chatgpt_created"]
    })
    .select("*")
    .single();

  if (planError || !plan) throw new Error(planError?.message ?? "Could not save workout plan.");

  let savedDaysCount = 0;
  let savedExercisesCount = 0;
  const savedDayIds: string[] = [];

  for (const day of days) {
    const dayNumber = Math.max(1, getNumber(day, "day_number", savedDaysCount + 1));
    const { data: savedDay, error: dayError } = await ctx.supabase
      .from("user_workout_plan_days")
      .insert({
        plan_id: plan.id,
        day_number: dayNumber,
        day_name: getString(day, "day_name", `Day ${dayNumber}`),
        focus: getOptionalString(day, "focus") ?? null,
        weekday: getOptionalString(day, "weekday") ?? null,
        session_duration_minutes: getOptionalNumber(day, "session_duration_minutes") ?? getOptionalNumber(input, "session_duration_minutes") ?? null,
        notes: getOptionalString(day, "notes") ?? null
      })
      .select("*")
      .single();

    if (dayError || !savedDay) throw new Error(dayError?.message ?? "Could not save plan day.");
    savedDayIds.push(savedDay.id);
    savedDaysCount += 1;

    for (const [block, items] of [
      ["warmup", itemsFrom(day, ["warmup", "warm_up"])],
      ["strength", itemsFrom(day, ["exercises", "strength", "main_workout"])],
      ["cardio", itemsFrom(day, ["cardio", "cardio_finisher"])],
      ["cooldown", itemsFrom(day, ["cooldown", "cool_down", "stretching"])]
    ] as Array<[string, JsonObject[]]>) {
      savedExercisesCount += (await insertBlock(ctx, savedDay.id, block, items)).length;
    }
  }

  const durationWeeks = Math.max(1, getNumber(input, "duration_weeks", getNumber(input, "desired_duration_weeks", 1)));
  const start = new Date(`${cleanDate(input.start_date ?? "today")}T00:00:00.000Z`);
  if (activate) {
    const rows = savedDayIds.flatMap((dayId, dayIndex) =>
      Array.from({ length: durationWeeks }, (_, weekIndex) => ({
        user_id: ctx.userId,
        user_workout_plan_id: plan.id,
        workout_template_day_id: null,
        plan_day_id: dayId,
        week_index: weekIndex + 1,
        day_index: dayIndex + 1,
        session_number: weekIndex * savedDayIds.length + dayIndex + 1,
        scheduled_date: addDays(start, weekIndex * 7 + dayIndex).toISOString().slice(0, 10),
        day_title: getString(days[dayIndex], "day_name", `Day ${dayIndex + 1}`),
        status: "scheduled"
      }))
    );
    if (rows.length) {
      const { error } = await ctx.supabase.from("user_workout_sessions").insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  return ok({ success: true, ok: true, plan_id: plan.id, saved_days_count: savedDaysCount, saved_exercises_count: savedExercisesCount });
}

async function upsertTarget(ctx: McpContext, patch: Record<string, unknown>) {
  const { data, error } = await ctx.supabase.from("calorie_targets").upsert({ user_id: ctx.userId, ...patch }, { onConflict: "user_id" }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

function assertAdmin(ctx: McpContext) {
  if (ctx.profile.role !== "admin") throw new Error("not_admin");
}

export async function executeMcpTool(ctx: McpContext, toolName: string, rawInput: unknown): Promise<McpToolResult> {
  const input = asObject(rawInput);

  try {
    switch (toolName) {
      case "get_fitlife_status":
        return ok({ ok: true, connected: true, user_id: ctx.userId, connection_id: ctx.connectionId, scopes: ctx.scopes, profile: ctx.profile });

      case "get_user_profile": {
        const [profile, onboarding, target] = await Promise.all([
          ctx.supabase.from("profiles").select("*").eq("id", ctx.userId).maybeSingle(),
          ctx.supabase.from("user_onboarding").select("*").eq("user_id", ctx.userId).maybeSingle(),
          ctx.supabase.from("calorie_targets").select("*").eq("user_id", ctx.userId).maybeSingle()
        ]);
        for (const result of [profile, onboarding, target]) if (result.error) throw new Error(result.error.message);
        return ok({ ok: true, profile: profile.data, onboarding: onboarding.data, calorie_targets: target.data });
      }

      case "get_today_summary": {
        const today = cleanDate("today");
        const [calories, water, mealPlan, workout] = await Promise.all([
          caloriesForDate(ctx, today),
          waterLogged(ctx, today),
          ctx.supabase.from("user_meal_plan_items").select("*").eq("user_id", ctx.userId).eq("plan_date", today),
          ctx.supabase.from("user_workout_sessions").select("*").eq("user_id", ctx.userId).eq("scheduled_date", today).maybeSingle()
        ]);
        if (mealPlan.error) throw new Error(mealPlan.error.message);
        if (workout.error) throw new Error(workout.error.message);
        return ok({ ok: true, date: today, calories, water_ml: water, meal_plan: mealPlan.data ?? [], workout: workout.data ?? null });
      }

      case "search_foods": {
        const { candidates } = await findFood(ctx, getString(input, "query"), Math.min(25, Math.max(1, getNumber(input, "limit", 10))));
        return ok({ ok: true, foods: candidates });
      }

      case "create_kitchen": {
        const { data, error } = await ctx.supabase.from("food_kitchens").insert({ user_id: ctx.userId, name: getString(input, "name"), is_system: false }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, kitchen: data });
      }

      case "get_kitchens": {
        const { data, error } = await ctx.supabase.from("food_kitchens").select("*").or(`user_id.eq.${ctx.userId},is_system.eq.true`).order("name", { ascending: true });
        if (error) throw new Error(error.message);
        return ok({ ok: true, kitchens: data ?? [] });
      }

      case "update_kitchen": {
        const { data, error } = await ctx.supabase.from("food_kitchens").update({ name: getString(input, "name") }).eq("id", getString(input, "kitchen_id")).eq("user_id", ctx.userId).eq("is_system", false).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, kitchen: data });
      }

      case "delete_kitchen": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        const { error } = await ctx.supabase.from("food_kitchens").delete().eq("id", getString(input, "kitchen_id")).eq("user_id", ctx.userId).eq("is_system", false);
        if (error) throw new Error(error.message);
        return ok({ ok: true, deleted_kitchen_id: getString(input, "kitchen_id") });
      }

      case "assign_food_to_kitchen": {
        const { data, error } = await ctx.supabase.from("user_food_items").update({ kitchen_id: getString(input, "kitchen_id") }).eq("id", getString(input, "user_food_item_id")).eq("user_id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, food: data });
      }

      case "get_foods_by_kitchen": {
        const { data, error } = await ctx.supabase.from("user_food_items").select("*").eq("user_id", ctx.userId).eq("kitchen_id", getString(input, "kitchen_id")).order("food_name", { ascending: true });
        if (error) throw new Error(error.message);
        return ok({ ok: true, foods: data ?? [] });
      }

      case "create_custom_food": {
        const { data, error } = await ctx.supabase.from("user_food_items").insert({
          user_id: ctx.userId,
          food_name: getString(input, "food_name"),
          serving_size: getString(input, "serving_size"),
          calories: getNumber(input, "calories"),
          protein_g: getNumber(input, "protein_g"),
          carbs_g: getNumber(input, "carbs_g"),
          fat_g: getNumber(input, "fat_g"),
          category: getOptionalString(input, "category") ?? null,
          cuisine: getOptionalString(input, "cuisine") ?? null,
          kitchen_id: getOptionalString(input, "kitchen_id") ?? null,
          fiber_g: getOptionalNumber(input, "fiber_g") ?? null,
          sugar_g: getOptionalNumber(input, "sugar_g") ?? null,
          sodium_mg: getOptionalNumber(input, "sodium_mg") ?? null,
          notes: getOptionalString(input, "notes") ?? null
        }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, food: data });
      }

      case "add_food_log": {
        const mealType = cleanMealType(input.meal_type);
        const date = cleanDate(input.date);
        const items = getArray<JsonObject>(input, "items");
        if (!items.length) return fail("missing_required_input", "items is required.");
        const rows: Array<Record<string, unknown>> = [];
        const ambiguous: Array<Record<string, unknown>> = [];
        for (const item of items) {
          const match = await findFood(ctx, getString(item, "food_name"), 5);
          if (!match.exact) {
            ambiguous.push({ requested: item, candidates: match.candidates });
            continue;
          }
          rows.push({ user_id: ctx.userId, log_date: date, meal_type: mealType, ...scaleFood(match.exact, getNumber(item, "quantity", 1)), notes: getOptionalString(input, "notes") ?? getOptionalString(item, "serving_hint") ?? null });
        }
        if (ambiguous.length) return ok({ ok: false, status: "needs_clarification", ambiguous_items: ambiguous }, "Some foods are ambiguous. Ask the user to choose a candidate.");
        const { data, error } = await ctx.supabase.from("food_logs").insert(rows).select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, saved_items: data ?? [], totals: sumMacros((data ?? []) as Array<Record<string, unknown>>) });
      }

      case "get_food_logs_by_date": {
        const date = cleanDate(input.date);
        const { data, error } = await ctx.supabase.from("food_logs").select("*").eq("user_id", ctx.userId).eq("log_date", date).order("created_at", { ascending: true });
        if (error) throw new Error(error.message);
        return ok({ ok: true, date, logs: data ?? [] });
      }

      case "update_food_log": {
        const patch: Record<string, unknown> = {};
        if (getOptionalString(input, "meal_type")) patch.meal_type = cleanMealType(input.meal_type);
        for (const key of ["quantity", "calories", "protein_g", "carbs_g", "fat_g"]) {
          const value = getOptionalNumber(input, key);
          if (value !== undefined) patch[key] = value;
        }
        if (getOptionalString(input, "notes") !== undefined) patch.notes = getOptionalString(input, "notes") ?? null;
        const { data, error } = await ctx.supabase.from("food_logs").update(patch).eq("id", getString(input, "food_log_id")).eq("user_id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, log: data });
      }

      case "move_food_log_meal_type": {
        const { data, error } = await ctx.supabase.from("food_logs").update({ meal_type: cleanMealType(input.meal_type) }).eq("id", getString(input, "food_log_id")).eq("user_id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, log: data });
      }

      case "delete_food_log": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        const { error } = await ctx.supabase.from("food_logs").delete().eq("id", getString(input, "food_log_id")).eq("user_id", ctx.userId);
        if (error) throw new Error(error.message);
        return ok({ ok: true, deleted_food_log_id: getString(input, "food_log_id") });
      }

      case "get_today_calories":
        return ok({ ok: true, ...(await caloriesForDate(ctx, cleanDate("today"))) });

      case "get_meal_plan": {
        const { data, error } = await ctx.supabase.from("user_meal_plan_items").select("*").eq("user_id", ctx.userId).gte("plan_date", cleanDate(input.start_date)).lte("plan_date", cleanDate(input.end_date)).order("plan_date", { ascending: true });
        if (error) throw new Error(error.message);
        return ok({ ok: true, items: data ?? [] });
      }

      case "create_custom_workout_plan":
      case "save_chatgpt_workout_plan":
      case "generate_workout_plan":
        return saveChatGptPlan(ctx, input);

      case "get_workout_plans": {
        const { data, error } = await ctx.supabase.from("user_workout_plans").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        return ok({ ok: true, plans: data ?? [] });
      }

      case "get_workout_plan_by_id":
        return ok({ ok: true, ...(await getFullPlan(ctx, getString(input, "plan_id"))) });

      case "get_active_workout_plan": {
        const { data, error } = await ctx.supabase.from("user_workout_plans").select("*").eq("user_id", ctx.userId).eq("is_active", true).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return ok({ ok: true, plan: null, days: [], exercises: [] });
        return ok({ ok: true, ...(await getFullPlan(ctx, String(data.id))) });
      }

      case "create_workout_plan_day": {
        await requirePlan(ctx, getString(input, "plan_id"));
        const { data, error } = await ctx.supabase.from("user_workout_plan_days").insert({ plan_id: getString(input, "plan_id"), day_number: getNumber(input, "day_number"), day_name: getString(input, "day_name"), focus: getOptionalString(input, "focus") ?? null, weekday: getOptionalString(input, "weekday") ?? null, session_duration_minutes: getOptionalNumber(input, "session_duration_minutes") ?? null, notes: getOptionalString(input, "notes") ?? null }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, day: data });
      }

      case "update_workout_plan_day": {
        await requireDay(ctx, getString(input, "plan_day_id"));
        const patch: Record<string, unknown> = {};
        for (const key of ["day_name", "focus", "weekday", "notes"]) if (getOptionalString(input, key) !== undefined) patch[key] = getOptionalString(input, key);
        if (getOptionalNumber(input, "day_number") !== undefined) patch.day_number = getOptionalNumber(input, "day_number");
        if (getOptionalNumber(input, "session_duration_minutes") !== undefined) patch.session_duration_minutes = getOptionalNumber(input, "session_duration_minutes");
        const { data, error } = await ctx.supabase.from("user_workout_plan_days").update(patch).eq("id", getString(input, "plan_day_id")).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, day: data });
      }

      case "delete_workout_plan_day": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        await requireDay(ctx, getString(input, "plan_day_id"));
        const { error } = await ctx.supabase.from("user_workout_plan_days").delete().eq("id", getString(input, "plan_day_id"));
        if (error) throw new Error(error.message);
        return ok({ ok: true, deleted_plan_day_id: getString(input, "plan_day_id") });
      }

      case "add_exercise_to_plan_day": {
        await requireDay(ctx, getString(input, "plan_day_id"));
        const { data, error } = await ctx.supabase.from("user_workout_plan_exercises").insert(exerciseRow(getString(input, "plan_day_id"), input, getOptionalString(input, "block_type") ?? "strength")).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, exercise: data });
      }

      case "add_warmup_to_plan_day":
      case "add_cardio_to_plan_day":
      case "add_cooldown_to_plan_day": {
        const block = toolName === "add_warmup_to_plan_day" ? "warmup" : toolName === "add_cardio_to_plan_day" ? "cardio" : "cooldown";
        const items = await insertBlock(ctx, getString(input, "plan_day_id"), block, getArray<JsonObject>(input, "items"));
        return ok({ ok: true, inserted_count: items.length, items });
      }

      case "add_cardio_to_plan": {
        const full = await getFullPlan(ctx, getString(input, "plan_id"));
        const rows = (full.days as Array<Record<string, unknown>>).map((day, index) => exerciseRow(String(day.id), { exercise_name: `${getNumber(input, "duration_minutes", 15)} min cardio`, reps: `${getNumber(input, "duration_minutes", 15)} min`, target_muscle: "cardiorespiratory", equipment: "Any", order_index: 900 + index, notes: getOptionalString(input, "intensity") ?? "moderate" }, "cardio"));
        const { data, error } = await ctx.supabase.from("user_workout_plan_exercises").insert(rows).select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, inserted_count: data?.length ?? 0, items: data ?? [] });
      }

      case "update_plan_exercise": {
        await requireExercise(ctx, getString(input, "plan_exercise_id"));
        const patch = exerciseRow("unused", input, getOptionalString(input, "block_type") ?? "strength") as Record<string, unknown>;
        delete patch.plan_day_id;
        const { data, error } = await ctx.supabase.from("user_workout_plan_exercises").update(patch).eq("id", getString(input, "plan_exercise_id")).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, exercise: data });
      }

      case "delete_plan_exercise": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        await requireExercise(ctx, getString(input, "plan_exercise_id"));
        const { error } = await ctx.supabase.from("user_workout_plan_exercises").delete().eq("id", getString(input, "plan_exercise_id"));
        if (error) throw new Error(error.message);
        return ok({ ok: true, deleted_plan_exercise_id: getString(input, "plan_exercise_id") });
      }

      case "activate_workout_plan": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        const planId = getString(input, "plan_id");
        await requirePlan(ctx, planId);
        await ctx.supabase.from("user_workout_plans").update({ is_active: false, is_default: false }).eq("user_id", ctx.userId);
        const { data, error } = await ctx.supabase.from("user_workout_plans").update({ is_active: true, is_default: true }).eq("id", planId).eq("user_id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, active_plan: data });
      }

      case "delete_workout_plan": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        await requirePlan(ctx, getString(input, "plan_id"));
        const { error } = await ctx.supabase.from("user_workout_plans").delete().eq("id", getString(input, "plan_id")).eq("user_id", ctx.userId);
        if (error) throw new Error(error.message);
        return ok({ ok: true, deleted_plan_id: getString(input, "plan_id") });
      }

      case "search_exercises":
        return ok({ ok: true, exercises: [], message: "No exercise library is required. ChatGPT can create exercise names directly in user plans." });

      case "replace_exercise": {
        const full = await getFullPlan(ctx, getString(input, "plan_id"));
        const ids = (full.days as Array<Record<string, unknown>>).map((day) => String(day.id));
        const { data, error } = await ctx.supabase.from("user_workout_plan_exercises").update({ exercise_name: getString(input, "new_exercise_name"), notes: getOptionalString(input, "reason") ?? null }).in("plan_day_id", ids).ilike("exercise_name", getString(input, "old_exercise_name")).select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, replaced_count: data?.length ?? 0, exercises: data ?? [] });
      }

      case "get_today_workout": {
        const today = cleanDate("today");
        const { data, error } = await ctx.supabase.from("user_workout_sessions").select("*").eq("user_id", ctx.userId).eq("scheduled_date", today).maybeSingle();
        if (error) throw new Error(error.message);
        return ok({ ok: true, date: today, workout: data ?? null });
      }

      case "start_workout": {
        const scheduledId = getOptionalString(input, "scheduled_session_id");
        if (scheduledId) {
          const { data, error } = await ctx.supabase.from("user_workout_sessions").update({ status: "started", started_at: new Date().toISOString() }).eq("id", scheduledId).eq("user_id", ctx.userId).select("*").single();
          if (error) throw new Error(error.message);
          return ok({ ok: true, session: data });
        }
        const { data, error } = await ctx.supabase.from("workout_sessions").insert({ user_id: ctx.userId, plan_day_id: getOptionalString(input, "plan_day_id") ?? null, workout_name: "ChatGPT logged workout", status: "started" }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, session: data });
      }

      case "log_exercise_sets": {
        const sessionId = getString(input, "workout_session_id");
        const exerciseName = getString(input, "exercise_name");
        const sets = getArray<JsonObject>(input, "sets");
        const generatedSession = await ctx.supabase.from("user_workout_sessions").select("id").eq("id", sessionId).eq("user_id", ctx.userId).maybeSingle();
        if (generatedSession.error) throw new Error(generatedSession.error.message);
        if (generatedSession.data) {
          const rows = sets.map((set, index) => ({ user_workout_session_id: sessionId, exercise_order: getNumber(set, "set_number", index + 1), exercise_name: exerciseName, weight_kg: getOptionalNumber(set, "weight_kg") ?? null, reps: getOptionalNumber(set, "reps") ?? null, notes: getOptionalString(set, "notes") ?? null, completed: true, completed_at: new Date().toISOString() }));
          const { data, error } = await ctx.supabase.from("user_exercise_logs").upsert(rows, { onConflict: "user_workout_session_id,exercise_order" }).select("*");
          if (error) throw new Error(error.message);
          return ok({ ok: true, logs: data ?? [] });
        }
        const rows = sets.map((set) => ({ workout_session_id: sessionId, exercise_name: exerciseName, set_number: getNumber(set, "set_number", 1), weight_kg: getOptionalNumber(set, "weight_kg") ?? null, reps: getOptionalNumber(set, "reps") ?? null, notes: getOptionalString(set, "notes") ?? null, completed_at: new Date().toISOString() }));
        const { data, error } = await ctx.supabase.from("exercise_logs").insert(rows).select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, logs: data ?? [] });
      }

      case "complete_workout": {
        const sessionId = getString(input, "workout_session_id");
        const update = { status: "completed", completed_at: new Date().toISOString(), duration_minutes: getOptionalNumber(input, "duration_minutes") ?? null, notes: getOptionalString(input, "notes") ?? null };
        const generated = await ctx.supabase.from("user_workout_sessions").update(update).eq("id", sessionId).eq("user_id", ctx.userId).select("*").maybeSingle();
        if (generated.error) throw new Error(generated.error.message);
        if (generated.data) return ok({ ok: true, session: generated.data });
        const { data, error } = await ctx.supabase.from("workout_sessions").update(update).eq("id", sessionId).eq("user_id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, session: data });
      }

      case "skip_workout": {
        const id = getOptionalString(input, "scheduled_session_id") ?? getOptionalString(input, "workout_session_id");
        if (!id) return fail("missing_required_input", "scheduled_session_id or workout_session_id is required.");
        const { data, error } = await ctx.supabase.from("user_workout_sessions").update({ status: "skipped", skipped_at: new Date().toISOString(), notes: getOptionalString(input, "reason") ?? null }).eq("id", id).eq("user_id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, session: data });
      }

      case "get_personal_records": {
        let request = ctx.supabase.from("personal_records").select("*").eq("user_id", ctx.userId).order("record_date", { ascending: false });
        const exercise = getOptionalString(input, "exercise_name");
        if (exercise) request = request.ilike("exercise_name", `%${exercise}%`);
        const { data, error } = await request;
        if (error) throw new Error(error.message);
        return ok({ ok: true, records: data ?? [] });
      }

      case "add_personal_record": {
        const { data, error } = await ctx.supabase.from("personal_records").insert({ user_id: ctx.userId, exercise_name: getString(input, "exercise_name"), record_type: getString(input, "record_type"), weight_kg: getOptionalNumber(input, "weight_kg") ?? null, reps: getOptionalNumber(input, "reps") ?? null, record_date: cleanDate(input.record_date), notes: getOptionalString(input, "notes") ?? null }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, record: data });
      }

      case "update_user_profile":
      case "update_training_goal":
      case "update_body_goal": {
        const patch: Record<string, unknown> = {};
        for (const key of ["full_name", "goal", "gender", "activity_level", "training_level", "body_goal"]) if (getOptionalString(input, key) !== undefined) patch[key] = getOptionalString(input, key);
        for (const key of ["weight_kg", "target_weight_kg", "height_cm", "age"]) if (getOptionalNumber(input, key) !== undefined) patch[key] = key === "age" ? Math.round(getNumber(input, key)) : getOptionalNumber(input, key);
        const { data, error } = await ctx.supabase.from("profiles").update(patch).eq("id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, profile: data });
      }

      case "update_calorie_target": {
        const patch: Record<string, unknown> = {};
        for (const key of ["daily_calories", "protein_g", "carbs_g", "fat_g", "water_ml"]) if (getOptionalNumber(input, key) !== undefined) patch[key] = key === "daily_calories" || key === "water_ml" ? Math.round(getNumber(input, key)) : getOptionalNumber(input, key);
        return ok({ ok: true, calorie_target: await upsertTarget(ctx, patch) });
      }

      case "update_water_target":
        return ok({ ok: true, calorie_target: await upsertTarget(ctx, { water_ml: Math.round(getNumber(input, "water_ml")) }) });

      case "add_weight_entry": {
        const { data, error } = await ctx.supabase.from("progress_entries").insert({ user_id: ctx.userId, entry_date: cleanDate(input.date), body_weight_kg: getNumber(input, "weight_kg"), notes: getOptionalString(input, "notes") ?? null }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, entry: data });
      }

      case "get_progress_summary": {
        const days = Math.max(1, Math.min(365, getNumber(input, "period_days", 30)));
        const since = dateDaysAgo(days);
        const [progress, workouts, calories] = await Promise.all([
          ctx.supabase.from("progress_entries").select("*").eq("user_id", ctx.userId).gte("entry_date", since),
          ctx.supabase.from("user_workout_sessions").select("*").eq("user_id", ctx.userId).gte("scheduled_date", since),
          ctx.supabase.from("food_logs").select("*").eq("user_id", ctx.userId).gte("log_date", since)
        ]);
        for (const result of [progress, workouts, calories]) if (result.error) throw new Error(result.error.message);
        return ok({ ok: true, period_days: days, progress: progress.data ?? [], workout_adherence: workouts.data ?? [], calories: sumMacros((calories.data ?? []) as Array<Record<string, unknown>>) });
      }

      case "admin_api_status":
        assertAdmin(ctx);
        return ok({ ok: true, providers: configuredProviders() });

      case "admin_create_global_workout_or_exercise":
        assertAdmin(ctx);
        return ok({ ok: false, deprecated: true, message: "Global exercise libraries are deprecated for user plan creation. Use create_custom_workout_plan." });

      default:
        return fail("unknown_tool", `Unknown FitLife MCP tool: ${toolName}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "FitLife MCP tool failed.";
    if (message === "not_admin") return fail("not_admin", "Admin access is required.");
    return fail("tool_error", message);
  }
}
