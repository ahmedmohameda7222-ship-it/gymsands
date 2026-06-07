import { configuredProviders } from "@/lib/integrations/env";
import type { McpContext } from "@/lib/mcp/auth";
import { asObject, cleanDate, cleanMealType, getArray, getBoolean, getNumber, getOptionalNumber, getOptionalString, getString, requireConfirmation, type JsonObject } from "@/lib/mcp/schemas";

type FoodCandidate = {
  id: string;
  source: "global" | "user";
  food_name: string;
  serving_size: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  category?: string | null;
};

export type McpToolResult = {
  structuredContent: Record<string, unknown>;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
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
    ctx.supabase.from("food_items").select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,category").eq("is_global", true).ilike("food_name", `%${cleanQuery}%`).limit(limit),
    ctx.supabase.from("user_food_items").select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,category").eq("user_id", ctx.userId).ilike("food_name", `%${cleanQuery}%`).limit(limit)
  ]);

  if (globalFoods.error) throw new Error(globalFoods.error.message);
  if (userFoods.error) throw new Error(userFoods.error.message);

  const candidates: FoodCandidate[] = [
    ...((userFoods.data ?? []) as Array<Omit<FoodCandidate, "source">>).map((food) => ({ ...food, source: "user" as const })),
    ...((globalFoods.data ?? []) as Array<Omit<FoodCandidate, "source">>).map((food) => ({ ...food, source: "global" as const }))
  ].slice(0, limit);
  const normalized = cleanQuery.toLowerCase();
  const exact = candidates.find((food) => food.food_name.toLowerCase() === normalized) ?? (candidates.length === 1 ? candidates[0] : undefined);
  return { exact, candidates };
}

async function targets(ctx: McpContext) {
  const { data, error } = await ctx.supabase.from("calorie_targets").select("daily_calories,protein_g,carbs_g,fat_g,water_ml").eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? { daily_calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 70, water_ml: 2500 };
}

async function waterLogged(ctx: McpContext, date: string) {
  const { data, error } = await ctx.supabase.from("water_logs").select("amount_ml").eq("user_id", ctx.userId).eq("log_date", date);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + num(row.amount_ml), 0);
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
    macros: { protein_g: totals.protein_g, carbs_g: totals.carbs_g, fat_g: totals.fat_g, targets: target },
    logs: logs.data ?? []
  };
}

async function requirePlan(ctx: McpContext, planId: string) {
  const { data, error } = await ctx.supabase.from("user_workout_plans").select("*").eq("id", planId).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workout plan not found for this user.");
  return data as Record<string, unknown>;
}

async function planDayIds(ctx: McpContext, planId: string) {
  const { data, error } = await ctx.supabase.from("user_workout_plan_days").select("id,day_name,day_number").eq("plan_id", planId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
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
        const [calories, water, mealPlan, workout, tasks, habits, sleep, supplements, prs] = await Promise.all([
          caloriesForDate(ctx, today),
          waterLogged(ctx, today),
          ctx.supabase.from("user_meal_plan_items").select("*").eq("user_id", ctx.userId).eq("plan_date", today),
          ctx.supabase.from("user_workout_sessions").select("*").eq("user_id", ctx.userId).eq("scheduled_date", today).maybeSingle(),
          ctx.supabase.from("daily_fit_tasks").select("*").eq("user_id", ctx.userId).eq("task_date", today),
          ctx.supabase.from("fitness_habits").select("*").eq("user_id", ctx.userId).eq("habit_date", today),
          ctx.supabase.from("sleep_recovery_logs").select("*").eq("user_id", ctx.userId).eq("log_date", today).order("created_at", { ascending: false }).limit(1),
          ctx.supabase.from("supplement_logs").select("*").eq("user_id", ctx.userId).eq("supplement_date", today),
          ctx.supabase.from("personal_records").select("*").eq("user_id", ctx.userId).order("record_date", { ascending: false }).limit(5)
        ]);
        for (const result of [mealPlan, workout, tasks, habits, sleep, supplements, prs]) if (result.error) throw new Error(result.error.message);
        return ok({ ok: true, date: today, calories, water_ml: water, meal_plan: mealPlan.data ?? [], workout: workout.data ?? null, daily_tasks: tasks.data ?? [], habits: habits.data ?? [], sleep_recovery: sleep.data ?? [], supplements: supplements.data ?? [], recent_prs: prs.data ?? [] });
      }

      case "search_foods": {
        const { candidates } = await findFood(ctx, getString(input, "query"), Math.min(25, Math.max(1, getNumber(input, "limit", 10))));
        return ok({ ok: true, foods: candidates });
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

      case "create_custom_food": {
        const { data, error } = await ctx.supabase.from("user_food_items").insert({ user_id: ctx.userId, food_name: getString(input, "food_name"), serving_size: getString(input, "serving_size"), calories: getNumber(input, "calories"), protein_g: getNumber(input, "protein_g"), carbs_g: getNumber(input, "carbs_g"), fat_g: getNumber(input, "fat_g"), category: getOptionalString(input, "category") ?? null, notes: getOptionalString(input, "notes") ?? null }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, food: data });
      }

      case "create_custom_meal": {
        const mealName = getString(input, "meal_name");
        const items = getArray<JsonObject>(input, "items");
        if (!items.length) return fail("missing_required_input", "items is required.");
        const { data: meal, error: mealError } = await ctx.supabase.from("meals").insert({ user_id: ctx.userId, meal_name: mealName, meal_category: getOptionalString(input, "meal_category") ?? null, notes: getOptionalString(input, "notes") ?? null }).select("*").single();
        if (mealError || !meal) throw new Error(mealError?.message ?? "Could not create meal.");
        const mealItems = [];
        for (const item of items) {
          const match = await findFood(ctx, getString(item, "food_name"), 3);
          if (!match.exact) return ok({ ok: false, status: "needs_clarification", item, candidates: match.candidates });
          mealItems.push({ meal_id: meal.id, food_item_id: match.exact.source === "global" ? match.exact.id : null, user_food_item_id: match.exact.source === "user" ? match.exact.id : null, quantity: getNumber(item, "quantity", 1) });
        }
        const { data, error } = await ctx.supabase.from("meal_food_items").insert(mealItems).select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, meal, items: data ?? [] });
      }

      case "get_today_calories":
        return ok({ ok: true, ...(await caloriesForDate(ctx, cleanDate("today"))) });

      case "delete_food_log": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        const id = getString(input, "food_log_id");
        const { error } = await ctx.supabase.from("food_logs").delete().eq("id", id).eq("user_id", ctx.userId);
        if (error) throw new Error(error.message);
        return ok({ ok: true, deleted_food_log_id: id });
      }

      case "get_meal_plan": {
        const start = cleanDate(input.start_date);
        const end = cleanDate(input.end_date);
        const { data, error } = await ctx.supabase.from("user_meal_plan_items").select("*").eq("user_id", ctx.userId).gte("plan_date", start).lte("plan_date", end).order("plan_date", { ascending: true });
        if (error) throw new Error(error.message);
        return ok({ ok: true, start_date: start, end_date: end, items: data ?? [] });
      }

      case "create_meal_plan_item":
      case "create_day_meal_plan":
      case "create_week_meal_plan": {
        const meals = toolName === "create_meal_plan_item" ? [input] : getArray<JsonObject>(input, "meals");
        if (toolName === "create_week_meal_plan" && !getBoolean(input, "confirm")) return ok({ requires_confirmation: true, preview: input });
        if (!meals.length) return fail("missing_required_input", "meals is required.");
        const rows = [];
        for (const meal of meals) {
          const match = getOptionalString(meal, "food_item_id") ? undefined : await findFood(ctx, getString(meal, "food_name"), 5);
          let food = match?.exact;
          if (!food && getOptionalString(meal, "food_item_id")) {
            const result = await ctx.supabase.from("food_items").select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,category").eq("id", getString(meal, "food_item_id")).maybeSingle();
            if (result.error) throw new Error(result.error.message);
            if (result.data) food = { ...(result.data as Omit<FoodCandidate, "source">), source: "global" };
          }
          if (!food) return ok({ ok: false, status: "needs_clarification", item: meal, candidates: match?.candidates ?? [] });
          rows.push({ user_id: ctx.userId, plan_date: cleanDate(meal.date ?? input.date ?? input.start_date), meal_type: cleanMealType(meal.meal_type), ...scaleFood(food, getNumber(meal, "quantity", 1)), status: "planned", notes: getOptionalString(meal, "notes") ?? null });
        }
        const { data, error } = await ctx.supabase.from("user_meal_plan_items").insert(rows).select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, items: data ?? [], totals: sumMacros((data ?? []) as Array<Record<string, unknown>>) });
      }

      case "replace_meal_plan_item": {
        const id = getString(input, "meal_plan_item_id");
        const match = await findFood(ctx, getString(input, "food_name"), 5);
        if (!match.exact) return ok({ ok: false, status: "needs_clarification", candidates: match.candidates });
        const { data, error } = await ctx.supabase.from("user_meal_plan_items").update({ ...scaleFood(match.exact, getNumber(input, "quantity", 1)), notes: getOptionalString(input, "notes") ?? null }).eq("id", id).eq("user_id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, item: data });
      }

      case "mark_meal_plan_item_done": {
        const id = getString(input, "meal_plan_item_id");
        const { data: item, error: itemError } = await ctx.supabase.from("user_meal_plan_items").select("*").eq("id", id).eq("user_id", ctx.userId).maybeSingle();
        if (itemError) throw new Error(itemError.message);
        if (!item) return fail("target_record_not_found", "Meal plan item not found.");
        const { data: log, error: logError } = await ctx.supabase.from("food_logs").insert({ user_id: ctx.userId, log_date: item.plan_date, meal_type: item.meal_type, food_item_id: item.food_item_id, user_food_item_id: item.user_food_item_id, food_name: item.food_name, serving_size: item.serving_size, quantity: item.quantity, calories: item.calories, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g, notes: item.notes }).select("*").single();
        if (logError || !log) throw new Error(logError?.message ?? "Could not create food log.");
        const update = await ctx.supabase.from("user_meal_plan_items").update({ status: "done", food_log_id: log.id, completed_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.userId).select("*").single();
        if (update.error) throw new Error(update.error.message);
        return ok({ ok: true, item: update.data, food_log: log });
      }

      case "generate_shopping_list": {
        const start = cleanDate(input.start_date);
        const end = cleanDate(input.end_date);
        const { data, error } = await ctx.supabase.from("user_meal_plan_items").select("food_name,quantity,serving_size,plan_date,meal_type").eq("user_id", ctx.userId).gte("plan_date", start).lte("plan_date", end);
        if (error) throw new Error(error.message);
        const grouped = new Map<string, Record<string, unknown>>();
        for (const row of data ?? []) {
          const key = String(row.food_name);
          const existing = grouped.get(key) ?? { food_name: key, quantity: 0, serving_size: row.serving_size, uses: [] };
          existing.quantity = num(existing.quantity) + num(row.quantity);
          (existing.uses as Array<Record<string, unknown>>).push({ date: row.plan_date, meal_type: row.meal_type });
          grouped.set(key, existing);
        }
        return ok({ ok: true, shopping_list: Array.from(grouped.values()) });
      }

      case "add_water_log": {
        const date = cleanDate(input.date);
        const amount = Math.round(getNumber(input, "amount_ml"));
        if (amount <= 0) return fail("missing_required_input", "amount_ml must be positive.");
        const { data, error } = await ctx.supabase.from("water_logs").insert({ user_id: ctx.userId, log_date: date, amount_ml: amount }).select("*").single();
        if (error) throw new Error(error.message);
        const target = await targets(ctx);
        const logged = await waterLogged(ctx, date);
        return ok({ ok: true, log: data, summary: { date, target_ml: target.water_ml, logged_ml: logged, remaining_ml: Math.max(0, num(target.water_ml) - logged), percentage: target.water_ml ? Math.round((logged / num(target.water_ml)) * 100) : 0 } });
      }

      case "get_water_summary": {
        const date = cleanDate(input.date);
        const target = await targets(ctx);
        const logged = await waterLogged(ctx, date);
        return ok({ ok: true, date, target_ml: target.water_ml, logged_ml: logged, remaining_ml: Math.max(0, num(target.water_ml) - logged), percentage: target.water_ml ? Math.round((logged / num(target.water_ml)) * 100) : 0 });
      }

      case "delete_water_log": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        const id = getString(input, "water_log_id");
        const { error } = await ctx.supabase.from("water_logs").delete().eq("id", id).eq("user_id", ctx.userId);
        if (error) throw new Error(error.message);
        return ok({ ok: true, deleted_water_log_id: id });
      }

      case "search_exercises": {
        const query = getString(input, "query");
        const { data, error } = await ctx.supabase.from("exercises").select("id,name,primary_muscle,equipment,difficulty,instructions").ilike("name", `%${query}%`).limit(20);
        if (error) throw new Error(error.message);
        return ok({ ok: true, exercises: data ?? [] });
      }

      case "get_active_workout_plan": {
        const { data: plan, error } = await ctx.supabase.from("user_workout_plans").select("*").eq("user_id", ctx.userId).eq("is_active", true).maybeSingle();
        if (error) throw new Error(error.message);
        if (!plan) return ok({ ok: true, plan: null, days: [], exercises: [] });
        const days = await planDayIds(ctx, String(plan.id));
        const ids = days.map((day) => String(day.id));
        const exercises = ids.length ? await ctx.supabase.from("user_workout_plan_exercises").select("*").in("plan_day_id", ids).order("sort_order", { ascending: true }) : { data: [], error: null };
        if (exercises.error) throw new Error(exercises.error.message);
        return ok({ ok: true, plan, days, exercises: exercises.data ?? [] });
      }

      case "generate_workout_plan":
        return ok({ requires_confirmation: true, message: "This package wires the MCP tool and auth. Keep using the existing /api/workout-plan/generate logic for full plan persistence, or move that route body into this executor. Call without direct replacement until confirmed.", requested_plan: input });

      case "replace_exercise": {
        const planId = getString(input, "plan_id");
        await requirePlan(ctx, planId);
        const days = await planDayIds(ctx, planId);
        const ids = days.map((day) => String(day.id));
        const { data, error } = await ctx.supabase.from("user_workout_plan_exercises").update({ exercise_name: getString(input, "new_exercise_name"), notes: getOptionalString(input, "reason") ?? null }).in("plan_day_id", ids).ilike("exercise_name", getString(input, "old_exercise_name")).select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, replaced_count: data?.length ?? 0, exercises: data ?? [] });
      }

      case "add_cardio_to_plan": {
        const planId = getString(input, "plan_id");
        await requirePlan(ctx, planId);
        const days = await planDayIds(ctx, planId);
        const selected = getArray<string>(input, "days");
        const targetDays = selected.length ? days.filter((day) => selected.includes(String(day.day_name)) || selected.includes(String(day.day_number))) : days;
        const rows = targetDays.map((day, index) => ({ plan_day_id: day.id, workout_id: null, source_workout_id: null, exercise_name: `${getNumber(input, "duration_minutes", 15)} min cardio`, category: "cardio", target_muscle: "cardiorespiratory", equipment: "Any", sets: null, reps: `${getNumber(input, "duration_minutes", 15)} min`, rest_seconds: null, sort_order: 900 + index, notes: getString(input, "intensity", "moderate") }));
        const { data, error } = await ctx.supabase.from("user_workout_plan_exercises").insert(rows).select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, inserted_count: data?.length ?? 0, items: data ?? [] });
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

      case "edit_workout_plan":
        return ok({ requires_confirmation: true, message: "Use replace_exercise, add_cardio_to_plan, or activate_workout_plan for typed safe edits in this foundation.", requested_operations: getArray(input, "operations") });

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
        if (generatedSession.data) {
          const rows = sets.map((set, index) => ({ user_workout_session_id: sessionId, exercise_order: getNumber(set, "set_number", index + 1), exercise_name: exerciseName, weight_kg: getOptionalNumber(set, "weight_kg") ?? null, reps: getOptionalNumber(set, "reps") ?? null, notes: getOptionalString(set, "notes") ?? null, completed: true, completed_at: new Date().toISOString() }));
          const { data, error } = await ctx.supabase.from("user_exercise_logs").upsert(rows, { onConflict: "user_workout_session_id,exercise_order" }).select("*");
          if (error) throw new Error(error.message);
          return ok({ ok: true, logs: data ?? [], pr_candidate: rows.some((row) => row.weight_kg && row.reps) });
        }
        const rows = sets.map((set) => ({ workout_session_id: sessionId, exercise_name: exerciseName, set_number: getNumber(set, "set_number", 1), weight_kg: getOptionalNumber(set, "weight_kg") ?? null, reps: getOptionalNumber(set, "reps") ?? null, notes: getOptionalString(set, "notes") ?? null, completed_at: new Date().toISOString() }));
        const { data, error } = await ctx.supabase.from("exercise_logs").insert(rows).select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, logs: data ?? [], pr_candidate: rows.some((row) => row.weight_kg && row.reps) });
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
        const exerciseName = getString(input, "exercise_name");
        const weight = getOptionalNumber(input, "weight_kg") ?? null;
        const reps = getOptionalNumber(input, "reps") ?? null;
        const estimatedOneRepMax = weight && reps ? Number((weight * (1 + reps / 30)).toFixed(2)) : null;
        const previous = await ctx.supabase.from("personal_records").select("weight_kg,reps").eq("user_id", ctx.userId).ilike("exercise_name", exerciseName).limit(20);
        if (previous.error) throw new Error(previous.error.message);
        const previousBest = Math.max(...(previous.data ?? []).map((record) => num(record.weight_kg) * (1 + num(record.reps) / 30)), 0);
        const { data, error } = await ctx.supabase.from("personal_records").insert({ user_id: ctx.userId, exercise_name: exerciseName, record_type: getString(input, "record_type"), weight_kg: weight, reps, record_date: cleanDate(input.record_date), notes: getOptionalString(input, "notes") ?? null }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, record: data, estimated_1rm_kg: estimatedOneRepMax, is_new_pr: estimatedOneRepMax ? estimatedOneRepMax > previousBest : true });
      }

      case "add_weight_entry": {
        const { data, error } = await ctx.supabase.from("progress_entries").insert({ user_id: ctx.userId, entry_date: cleanDate(input.date), body_weight_kg: getNumber(input, "weight_kg"), notes: getOptionalString(input, "notes") ?? null }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, entry: data });
      }

      case "add_body_measurement": {
        const allowed = ["waist_cm", "hips_cm", "chest_cm", "neck_cm", "shoulders_cm", "left_arm_cm", "right_arm_cm", "left_thigh_cm", "right_thigh_cm", "glutes_cm", "calves_cm"];
        const payload: Record<string, unknown> = { user_id: ctx.userId, measured_at: cleanDate(input.measured_at) };
        for (const key of allowed) {
          const value = getOptionalNumber(input, key);
          if (value !== undefined) payload[key] = value;
        }
        const { data, error } = await ctx.supabase.from("body_measurements").insert(payload).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, measurement: data });
      }

      case "get_progress_summary": {
        const days = Math.max(1, Math.min(365, getNumber(input, "period_days", 30)));
        const since = dateDaysAgo(days);
        const [progress, workouts, calories, prs, water, habits] = await Promise.all([
          ctx.supabase.from("progress_entries").select("*").eq("user_id", ctx.userId).gte("entry_date", since).order("entry_date", { ascending: true }),
          ctx.supabase.from("user_workout_sessions").select("*").eq("user_id", ctx.userId).gte("scheduled_date", since),
          ctx.supabase.from("food_logs").select("*").eq("user_id", ctx.userId).gte("log_date", since),
          ctx.supabase.from("personal_records").select("*").eq("user_id", ctx.userId).gte("record_date", since),
          ctx.supabase.from("water_logs").select("*").eq("user_id", ctx.userId).gte("log_date", since),
          ctx.supabase.from("fitness_habits").select("*").eq("user_id", ctx.userId).gte("habit_date", since)
        ]);
        for (const result of [progress, workouts, calories, prs, water, habits]) if (result.error) throw new Error(result.error.message);
        return ok({ ok: true, period_days: days, since, progress: progress.data ?? [], workout_adherence: workouts.data ?? [], calories: sumMacros((calories.data ?? []) as Array<Record<string, unknown>>), personal_records: prs.data ?? [], water_logs: water.data ?? [], habits: habits.data ?? [] });
      }

      case "get_daily_fit_tasks": {
        const date = cleanDate(input.date);
        const { data, error } = await ctx.supabase.from("daily_fit_tasks").select("*").eq("user_id", ctx.userId).eq("task_date", date);
        if (error) throw new Error(error.message);
        return ok({ ok: true, date, tasks: data ?? [] });
      }
      case "create_daily_fit_task": {
        const { data, error } = await ctx.supabase.from("daily_fit_tasks").insert({ user_id: ctx.userId, task_date: cleanDate(input.date), title: getString(input, "title"), notes: getOptionalString(input, "notes") ?? null }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, task: data });
      }
      case "mark_daily_fit_task_done": {
        const { data, error } = await ctx.supabase.from("daily_fit_tasks").update({ completed: true }).eq("id", getString(input, "task_id")).eq("user_id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, task: data });
      }
      case "mark_daily_fit_task_skipped": {
        const { data, error } = await ctx.supabase.from("daily_fit_tasks").update({ completed: false, notes: getOptionalString(input, "reason") ?? "Skipped" }).eq("id", getString(input, "task_id")).eq("user_id", ctx.userId).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, task: data });
      }
      case "get_habits": {
        const date = cleanDate(input.date);
        const { data, error } = await ctx.supabase.from("fitness_habits").select("*").eq("user_id", ctx.userId).eq("habit_date", date);
        if (error) throw new Error(error.message);
        return ok({ ok: true, date, habits: data ?? [] });
      }
      case "mark_habit_done": {
        const date = cleanDate(input.date);
        const id = getOptionalString(input, "habit_id");
        const name = getOptionalString(input, "name");
        const request = id ? ctx.supabase.from("fitness_habits").update({ completed: true }).eq("id", id).eq("user_id", ctx.userId) : ctx.supabase.from("fitness_habits").insert({ user_id: ctx.userId, habit_date: date, name, completed: true });
        const { data, error } = await request.select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, habit: data?.[0] ?? null });
      }
      case "create_habit": {
        const { data, error } = await ctx.supabase.from("fitness_habits").insert({ user_id: ctx.userId, habit_date: cleanDate("today"), name: getString(input, "name"), notes: [getOptionalString(input, "notes"), getOptionalString(input, "schedule")].filter(Boolean).join(" | ") || null }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, habit: data });
      }

      case "add_sleep_recovery_log": {
        const hours = getOptionalNumber(input, "hours_slept");
        const recommendation = hours !== undefined && hours < 6 ? "Consider a lighter session and avoid training through serious pain. This is general fitness guidance, not medical advice." : "Track recovery and adjust intensity based on soreness and fatigue.";
        const { data, error } = await ctx.supabase.from("sleep_recovery_logs").insert({ user_id: ctx.userId, log_date: cleanDate(input.date), hours_slept: hours ?? null, sleep_quality: getOptionalString(input, "sleep_quality") ?? null, recovery_level: getOptionalString(input, "recovery_level") ?? null, fatigue_level: getOptionalString(input, "fatigue_level") ?? null, soreness_level: getOptionalString(input, "soreness_level") ?? null, notes: [getOptionalString(input, "stress_level"), getOptionalString(input, "notes")].filter(Boolean).join(" | ") || null }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, log: data, recommendation });
      }
      case "get_sleep_recovery_summary": {
        const days = Math.max(1, Math.min(90, getNumber(input, "period_days", 7)));
        const { data, error } = await ctx.supabase.from("sleep_recovery_logs").select("*").eq("user_id", ctx.userId).gte("log_date", dateDaysAgo(days)).order("log_date", { ascending: false });
        if (error) throw new Error(error.message);
        return ok({ ok: true, period_days: days, logs: data ?? [] });
      }
      case "get_today_supplements": {
        const date = cleanDate(input.date);
        const { data, error } = await ctx.supabase.from("supplement_logs").select("*").eq("user_id", ctx.userId).eq("supplement_date", date);
        if (error) throw new Error(error.message);
        return ok({ ok: true, date, supplements: data ?? [] });
      }
      case "add_supplement_log": {
        const { data, error } = await ctx.supabase.from("supplement_logs").insert({ user_id: ctx.userId, supplement_date: cleanDate(input.date), name: getString(input, "name"), dose: getOptionalString(input, "dose") ?? null, time: getOptionalString(input, "time") ?? null, reminder: getOptionalString(input, "reminder") ?? null, taken_today: false }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, supplement: data, safety: "Tracking only. FitLife does not provide medical dosage advice." });
      }
      case "mark_supplement_taken": {
        const date = cleanDate(input.date);
        const id = getOptionalString(input, "log_id");
        const request = id ? ctx.supabase.from("supplement_logs").update({ taken_today: true }).eq("id", id).eq("user_id", ctx.userId) : ctx.supabase.from("supplement_logs").update({ taken_today: true }).eq("user_id", ctx.userId).eq("supplement_date", date).ilike("name", getString(input, "name"));
        const { data, error } = await request.select("*");
        if (error) throw new Error(error.message);
        return ok({ ok: true, supplements: data ?? [] });
      }

      case "admin_api_status":
        assertAdmin(ctx);
        return ok({ ok: true, providers: configuredProviders() });
      case "admin_search_users": {
        assertAdmin(ctx);
        const query = getString(input, "query");
        const { data, error } = await ctx.supabase.from("profiles").select("id,email,full_name,role,created_at").or(`email.ilike.%${query}%,full_name.ilike.%${query}%`).limit(20);
        if (error) throw new Error(error.message);
        return ok({ ok: true, users: data ?? [] });
      }
      case "get_admin_user_summary": {
        assertAdmin(ctx);
        const targetUserId = getOptionalString(input, "user_id") ?? ctx.userId;
        const [profile, calories, workouts, progress] = await Promise.all([
          ctx.supabase.from("profiles").select("*").eq("id", targetUserId).maybeSingle(),
          ctx.supabase.from("food_logs").select("*").eq("user_id", targetUserId).gte("log_date", dateDaysAgo(30)),
          ctx.supabase.from("user_workout_sessions").select("*").eq("user_id", targetUserId).gte("scheduled_date", dateDaysAgo(30)),
          ctx.supabase.from("progress_entries").select("*").eq("user_id", targetUserId).gte("entry_date", dateDaysAgo(30))
        ]);
        for (const result of [profile, calories, workouts, progress]) if (result.error) throw new Error(result.error.message);
        return ok({ ok: true, profile: profile.data, meal_logging_summary: sumMacros((calories.data ?? []) as Array<Record<string, unknown>>), workout_history: workouts.data ?? [], progress: progress.data ?? [] });
      }
      case "admin_create_global_food": {
        assertAdmin(ctx);
        const { data, error } = await ctx.supabase.from("food_items").insert({ food_name: getString(input, "food_name"), serving_size: getString(input, "serving_size"), calories: getNumber(input, "calories"), protein_g: getNumber(input, "protein_g"), carbs_g: getNumber(input, "carbs_g"), fat_g: getNumber(input, "fat_g"), category: getOptionalString(input, "category") ?? null, cuisine: getOptionalString(input, "cuisine") ?? null, is_global: true, is_editable_by_user: false, source_type: "admin_created", created_by: ctx.userId }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, food: data });
      }
      case "admin_create_global_workout_or_exercise": {
        assertAdmin(ctx);
        const { data, error } = await ctx.supabase.from("workouts").insert({ name: getString(input, "name"), category: getString(input, "category"), target_muscle: getString(input, "target_muscle"), equipment: getString(input, "equipment"), difficulty: getString(input, "difficulty"), instructions: getString(input, "instructions"), is_global: true, created_by: ctx.userId }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, workout: data });
      }

      default:
        return fail("unknown_tool", `Unknown FitLife MCP tool: ${toolName}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "FitLife MCP tool failed.";
    if (message === "not_admin") return fail("not_admin", "Admin access is required.");
    return fail("tool_error", message);
  }
}
