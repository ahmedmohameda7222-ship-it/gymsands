import type { McpContext } from "@/lib/mcp/auth";
import { cleanDate } from "@/lib/mcp/schemas";
import { executeMcpTool as executeOriginalMcpTool, type McpToolResult } from "@/lib/mcp/tool-executor";

type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type DbRow = Record<string, unknown>;

function ok(structuredContent: Record<string, unknown>, message?: string): McpToolResult {
  return { structuredContent, content: [{ type: "text", text: message ?? JSON.stringify(structuredContent) }] };
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
