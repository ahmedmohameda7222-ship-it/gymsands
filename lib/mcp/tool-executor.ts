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
import { fail, num, ok, sumMacros, type MacroTotals, type McpToolResult } from "@/lib/mcp/tool-helpers";

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
  return data ?? null;
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
  const dailyTarget = target ? num(target.daily_calories) : null;
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

async function requireWorkoutSession(ctx: McpContext, sessionId: string) {
  const { data, error } = await ctx.supabase
    .from("workout_sessions")
    .select("id,user_id,scheduled_session_id")
    .eq("id", sessionId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workout session not found for this user.");
  return data as Record<string, unknown>;
}

async function getFullPlan(ctx: McpContext, planId: string) {
  const plan = await requirePlan(ctx, planId);
  const { data: days, error: daysError } = await ctx.supabase.from("user_workout_plan_days").select("*").eq("plan_id", planId).is("archived_at", null).order("day_number", { ascending: true });
  if (daysError) throw new Error(daysError.message);
  const dayIds = (days ?? []).map((day) => String(day.id));
  const exercises = dayIds.length ? await ctx.supabase.from("user_workout_plan_exercises").select("*").in("plan_day_id", dayIds).is("archived_at", null).order("sort_order", { ascending: true }) : { data: [], error: null };
  if (exercises.error) throw new Error(exercises.error.message);
  return { plan, days: days ?? [], exercises: exercises.data ?? [] };
}

function exerciseRow(planDayId: string, input: JsonObject, blockType: string) {
  const order = getOptionalNumber(input, "order_index") ?? getOptionalNumber(input, "sort_order") ?? 1;
  return {
    plan_day_id: planDayId,
    workout_id: null,
    exercise_name: getOptionalString(input, "exercise_name") ?? getOptionalString(input, "name") ?? getString(input, "title"),
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
    exercise_url: getOptionalString(input, "exercise_url") ?? null,
    video_url: getOptionalString(input, "custom_video_url") ?? null,
    custom_video_url: getOptionalString(input, "custom_video_url") ?? null,
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

function planDayItems(day: JsonObject) {
  return [
    ...itemsFrom(day, ["warmup", "warm_up"]),
    ...itemsFrom(day, ["exercises", "strength", "main_workout"]),
    ...itemsFrom(day, ["cardio", "cardio_finisher"]),
    ...itemsFrom(day, ["cooldown", "cool_down", "stretching"])
  ];
}

function importedExerciseName(item: JsonObject) {
  return getOptionalString(item, "exercise_name") ?? getOptionalString(item, "name") ?? getOptionalString(item, "title") ?? "";
}

function validateChatGptPlanInput(days: JsonObject[]) {
  const allItems = days.flatMap(planDayItems);
  const itemCount = allItems.length;
  const unnamedCount = allItems.filter((item) => importedExerciseName(item).trim().length === 0).length;
  if (!itemCount) return "The imported plan has days but no workout blocks. Add warmup, exercises, cardio, or cooldown items before saving.";
  if (unnamedCount) return `The imported plan has ${unnamedCount} workout item${unnamedCount === 1 ? "" : "s"} without an exercise name. Add exercise_name, name, or title before saving.`;
  return null;
}

async function saveChatGptPlan(ctx: McpContext, input: JsonObject) {
  const days = getArray<JsonObject>(input, "days");
  if (!days.length) return fail("missing_required_input", "Provide a full ChatGPT-created plan object with days.");
  const validationError = validateChatGptPlanInput(days);
  if (validationError) return fail("invalid_workout_plan", validationError);

  const activate = input.activate !== false;
  const scheduleStartDate = cleanDate(input.start_date);
  let savedExercisesCount = 0;
  const rpcDays = days.map((day, dayIndex) => {
    const exercises = ([
      ["warmup", itemsFrom(day, ["warmup", "warm_up"])],
      ["strength", itemsFrom(day, ["exercises", "strength", "main_workout"])],
      ["cardio", itemsFrom(day, ["cardio", "cardio_finisher"])],
      ["cooldown", itemsFrom(day, ["cooldown", "cool_down", "stretching"])]
    ] as Array<[string, JsonObject[]]>).flatMap(([blockType, items]) =>
      items.map((item, itemIndex) => {
        savedExercisesCount += 1;
        const row = exerciseRow("rpc", { ...item, order_index: itemIndex + 1 }, blockType);
        const { plan_day_id: _planDayId, ...exercise } = row;
        return exercise;
      })
    );
    return {
      day_name: getString(day, "day_name", `Day ${dayIndex + 1}`),
      weekday: getOptionalString(day, "weekday") ?? null,
      session_duration_minutes: getOptionalNumber(day, "session_duration_minutes") ?? getOptionalNumber(input, "session_duration_minutes") ?? null,
      notes: getOptionalString(day, "notes") ?? getOptionalString(day, "focus") ?? null,
      exercises
    };
  });

  const { data: plan, error } = await ctx.supabase.rpc("create_workout_plan_atomic", {
    p_user_id: ctx.userId,
    p_plan: {
      name: getString(input, "name"),
      goal: getOptionalString(input, "goal") ?? null,
      description: getOptionalString(input, "description") ?? null,
      source: "chatgpt",
      chatgpt_source: true,
      program_duration_weeks: getOptionalNumber(input, "duration_weeks") ?? getOptionalNumber(input, "desired_duration_weeks") ?? null,
      duration_weeks: getOptionalNumber(input, "duration_weeks") ?? getOptionalNumber(input, "desired_duration_weeks") ?? 1,
      days_per_week: getOptionalNumber(input, "days_per_week") ?? days.length,
      session_duration_minutes: getOptionalNumber(input, "session_duration_minutes") ?? getOptionalNumber(input, "workout_duration_minutes") ?? null,
      days: rpcDays
    },
    p_activate: activate,
    p_schedule_start_date: scheduleStartDate
  });
  if (error || !plan) throw new Error(error?.message ?? "Could not save workout plan.");
  const savedPlan = plan as Record<string, unknown>;
  return ok({ success: true, ok: true, plan_id: savedPlan.id, saved_days_count: rpcDays.length, saved_exercises_count: savedExercisesCount });
}

async function upsertTarget(ctx: McpContext, patch: Record<string, unknown>) {
  const { data, error } = await ctx.supabase.from("calorie_targets").upsert({ user_id: ctx.userId, ...patch }, { onConflict: "user_id" }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}


export async function executeMcpTool(ctx: McpContext, toolName: string, rawInput: unknown): Promise<McpToolResult> {
  const input = asObject(rawInput);

  try {
    switch (toolName) {
      case "get_plaivra_status":
        return ok({ ok: true, connected: true, user_id: ctx.userId, connection_id: ctx.connectionId, scopes: ctx.scopes, profile: ctx.profile });

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
        if (ambiguous.length) return fail("ambiguous_food", "Some foods are ambiguous. Ask the user to choose a candidate.", { ambiguous_items: ambiguous });
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
        const { data, error } = await ctx.supabase.from("food_logs").update(patch).eq("id", getString(input, "food_log_id")).eq("user_id", ctx.userId).eq("updated_at", getString(input, "expected_updated_at")).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return fail("version_conflict", "This food log changed after it was read. Fetch it again before updating.");
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
        return saveChatGptPlan(ctx, input);

      case "get_workout_plans": {
        const { data, error } = await ctx.supabase.from("user_workout_plans").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        return ok({ ok: true, plans: data ?? [] });
      }

      case "get_workout_plan_by_id":
        return ok({ ok: true, ...(await getFullPlan(ctx, getString(input, "plan_id"))) });


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
        const planId = getString(input, "plan_id");
        const { data, error } = await ctx.supabase.rpc("activate_workout_plan_atomic", {
          p_user_id: ctx.userId,
          p_plan_id: planId,
          p_schedule_start_date: cleanDate(input.schedule_start_date),
          p_expected_updated_at: getString(input, "expected_updated_at")
        });
        if (error) {
          if (error.code === "40001") return fail("version_conflict", "This workout plan changed after it was read. Fetch it again before activating.");
          throw new Error(error.message);
        }
        return ok({ ok: true, active_plan: data });
      }

      case "delete_workout_plan": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        const planId = getString(input, "plan_id");
        const { error } = await ctx.supabase.rpc("delete_workout_plan_atomic", {
          p_user_id: ctx.userId,
          p_plan_id: planId,
          p_confirmed: true,
          p_schedule_start_date: cleanDate(input.schedule_start_date)
        });
        if (error) throw new Error(error.message);
        return ok({ ok: true, deleted_plan_id: planId });
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
          const { data: scheduled, error: scheduledError } = await ctx.supabase.from("user_workout_sessions").select("id,plan_day_id").eq("id", scheduledId).eq("user_id", ctx.userId).maybeSingle();
          if (scheduledError || !scheduled) throw new Error(scheduledError?.message ?? "Scheduled workout not found.");
          if (!scheduled.plan_day_id) throw new Error("Scheduled workout is not linked to a workout plan day.");
          const { data, error } = await ctx.supabase.rpc("start_or_resume_workout_session_atomic", {
            p_user_id: ctx.userId,
            p_plan_day_id: scheduled.plan_day_id,
            p_scheduled_session_id: scheduled.id
          });
          if (error) throw new Error(error.message);
          return ok({ ok: true, session: (data as { session?: unknown } | null)?.session ?? data });
        }
        const planDayId = getOptionalString(input, "plan_day_id");
        if (planDayId) {
          await requireDay(ctx, planDayId);
          const { data, error } = await ctx.supabase.rpc("start_or_resume_workout_session_atomic", {
            p_user_id: ctx.userId,
            p_plan_day_id: planDayId,
            p_scheduled_session_id: null
          });
          if (error) throw new Error(error.message);
          return ok({ ok: true, session: (data as { session?: unknown } | null)?.session ?? data });
        }
        const { data, error } = await ctx.supabase.from("workout_sessions").insert({ user_id: ctx.userId, plan_day_id: planDayId ?? null, workout_name: "ChatGPT logged workout", status: "started" }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, session: data });
      }

      case "log_exercise_sets": {
        const sessionId = getString(input, "workout_session_id");
        const exerciseName = getString(input, "exercise_name");
        const sets = getArray<JsonObject>(input, "sets");
        await requireWorkoutSession(ctx, sessionId);
        const rows = sets.map((set) => ({
          plan_exercise_id: getOptionalString(input, "plan_exercise_id") ?? null,
          exercise_order: getOptionalNumber(input, "exercise_order") ?? null,
          exercise_name: exerciseName,
          set_number: getNumber(set, "set_number", 1),
          weight_kg: getOptionalNumber(set, "weight_kg") ?? null,
          reps: getOptionalNumber(set, "reps") ?? null,
          notes: getOptionalString(set, "notes") ?? null,
          completed_at: new Date().toISOString()
        }));
        const { data, error } = await ctx.supabase.rpc("upsert_workout_set_logs_atomic", {
          p_user_id: ctx.userId,
          p_session_id: sessionId,
          p_logs: rows
        });
        if (error) throw new Error(error.message);
        return ok({ ok: true, logs: data ?? [] });
      }

      case "complete_workout": {
        const sessionId = getString(input, "workout_session_id");
        await requireWorkoutSession(ctx, sessionId);
        const { data, error } = await ctx.supabase.rpc("complete_workout_session_atomic", {
          p_user_id: ctx.userId,
          p_session_id: sessionId,
          p_logs: "logs" in input ? getArray<JsonObject>(input, "logs") : null,
          p_duration_minutes: getOptionalNumber(input, "duration_minutes") ?? 0,
          p_notes: getOptionalString(input, "notes") ?? null
        });
        if (error) throw new Error(error.message);
        return ok({ ok: true, session: (data as { session?: unknown } | null)?.session ?? data });
      }

      case "skip_workout": {
        const scheduledId = getOptionalString(input, "scheduled_session_id");
        const performedId = getOptionalString(input, "workout_session_id");
        if (!scheduledId && !performedId) return fail("missing_required_input", "scheduled_session_id or workout_session_id is required.");
        const skippedAt = new Date().toISOString();
        const update = { status: "skipped", skipped_at: skippedAt, notes: getOptionalString(input, "reason") ?? null };
        if (performedId) {
          const ownedSession = await requireWorkoutSession(ctx, performedId);
          const { data, error } = await ctx.supabase.from("workout_sessions").update(update).eq("id", performedId).eq("user_id", ctx.userId).select("*").single();
          if (error) throw new Error(error.message);
          if (ownedSession.scheduled_session_id) await ctx.supabase.from("user_workout_sessions").update(update).eq("id", ownedSession.scheduled_session_id).eq("user_id", ctx.userId);
          return ok({ ok: true, session: data });
        }
        const { data: scheduled, error: scheduledError } = await ctx.supabase.from("user_workout_sessions").update(update).eq("id", scheduledId!).eq("user_id", ctx.userId).select("*").single();
        if (scheduledError || !scheduled) throw new Error(scheduledError?.message ?? "Scheduled workout not found.");
        const { data, error } = await ctx.supabase.from("workout_sessions").upsert({ user_id: ctx.userId, scheduled_session_id: scheduled.id, plan_id: scheduled.user_workout_plan_id, plan_day_id: scheduled.plan_day_id, workout_name: scheduled.day_title ?? "Scheduled workout", workout_day_name: scheduled.day_title ?? null, status: "skipped", skipped_at: skippedAt, notes: update.notes, source: "chatgpt" }, { onConflict: "scheduled_session_id" }).select("*").single();
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

      case "add_water_log": {
        const date = cleanDate(input.date);
        const amount = Math.round(getNumber(input, "amount_ml"));
        const { data, error } = await ctx.supabase.from("water_logs").insert({ user_id: ctx.userId, log_date: date, amount_ml: amount }).select("*").single();
        if (error) throw new Error(error.message);
        return ok({ ok: true, log: data, logged_ml: await waterLogged(ctx, date) });
      }

      case "get_water_summary": {
        const date = cleanDate(input.date);
        const target = await targets(ctx);
        const logged = await waterLogged(ctx, date);
        const targetMl = target ? num(target.water_ml) : null;
        return ok({ ok: true, date, target_ml: targetMl, logged_ml: logged, remaining_ml: targetMl === null ? null : Math.max(0, targetMl - logged), needs_target_setup: targetMl === null });
      }

      case "delete_water_log": {
        const confirmation = requireConfirmation(input);
        if (confirmation) return ok(confirmation);
        const { error } = await ctx.supabase.from("water_logs").delete().eq("id", getString(input, "water_log_id")).eq("user_id", ctx.userId);
        if (error) throw new Error(error.message);
        return ok({ ok: true, deleted_water_log_id: getString(input, "water_log_id") });
      }

      default:
        return fail("unknown_tool", `Unknown Plaivra MCP tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`Plaivra MCP tool execution failed for ${toolName}:`, error instanceof Error ? error.message : "Unknown error");
    return fail("tool_execution_failed", "Plaivra could not complete this tool. No change should be assumed; retry or review the affected record in Plaivra.");
  }
}
