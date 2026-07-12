"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { addIsoDays, foodLogDuplicateKey, startOfEatWeek, type EatWeekTargetDay } from "@/lib/eat/eat-model";
import { getCalorieTargets } from "@/services/database/nutrition";
import { getNutritionTargetProfiles } from "@/services/database/execution-layer";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { resolveEatTargetForDate, type ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { DailyNutritionSummary, FoodLog, MealPlanItem, MealType, WaterLog } from "@/types";

export const EAT_LINKED_EDIT_CRITICAL_CODE = "EAT_LINKED_EDIT_CRITICAL";

export class EatLinkedEditConsistencyError extends Error {
  readonly code = EAT_LINKED_EDIT_CRITICAL_CODE;
  readonly requiresReload = true;
  readonly debugDetail: string;

  constructor(debugDetail: string) {
    super("Linked food-log consistency could not be guaranteed.");
    this.name = "EatLinkedEditConsistencyError";
    this.debugDetail = debugDetail;
  }
}

export function isEatLinkedEditConsistencyError(error: unknown): error is EatLinkedEditConsistencyError {
  return error instanceof EatLinkedEditConsistencyError || (
    typeof error === "object" && error !== null && "code" in error && error.code === EAT_LINKED_EDIT_CRITICAL_CODE
  );
}

function canUseUserData(userId: string | null | undefined): userId is string {
  return Boolean(supabase && userId && isUuid(userId));
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requirePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
}

function requireNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or higher.`);
}

export async function getEatFoodLogs(userId: string, date: string) {
  if (!canUseUserData(userId)) return [] as FoodLog[];
  const { data, error } = await supabase!
    .from("food_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load food logs. ${error.message}`);
  return (data ?? []) as FoodLog[];
}

export async function getEatWaterLogs(userId: string, date: string) {
  if (!canUseUserData(userId)) return [] as WaterLog[];
  const { data, error } = await supabase!
    .from("water_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load water logs. ${error.message}`);
  return (data ?? []) as WaterLog[];
}

export async function getEatMealPlanItems(userId: string, date: string) {
  if (!canUseUserData(userId)) return [] as MealPlanItem[];
  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", date)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load planned meals. ${error.message}`);
  return (data ?? []) as MealPlanItem[];
}

export async function getEatRecentFoodLogs(userId: string, limit = 100) {
  if (!canUseUserData(userId)) return [] as FoodLog[];
  const { data, error } = await supabase!
    .from("food_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load repeat foods. ${error.message}`);
  return (data ?? []) as FoodLog[];
}

export async function getEatWeek(userId: string, selectedDate: string) {
  const weekStart = startOfEatWeek(selectedDate);
  const weekEnd = addIsoDays(weekStart, 6);
  const dates = Array.from({ length: 7 }, (_, index) => addIsoDays(weekStart, index));
  if (!canUseUserData(userId)) {
    return dates.map((date) => ({ date, planned_calories: 0, has_targets: false, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, water_ml: 0, logs: [] })) as DailyNutritionSummary[];
  }
  const { data, error } = await supabase!
    .from("food_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("log_date", weekStart)
    .lte("log_date", weekEnd)
    .order("log_date", { ascending: true });
  if (error) throw new Error(`Could not load week data. ${error.message}`);
  const byDate = ((data ?? []) as FoodLog[]).reduce<Record<string, FoodLog[]>>((result, log) => {
    result[log.log_date] = [...(result[log.log_date] ?? []), log];
    return result;
  }, {});
  return dates.map((date) => {
    const logs = byDate[date] ?? [];
    const totals = logs.reduce((sum, log) => ({
      calories: sum.calories + number(log.calories),
      protein_g: Math.round((sum.protein_g + number(log.protein_g)) * 10) / 10,
      carbs_g: Math.round((sum.carbs_g + number(log.carbs_g)) * 10) / 10,
      fat_g: Math.round((sum.fat_g + number(log.fat_g)) * 10) / 10
    }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    return { date, planned_calories: 0, has_targets: false, ...totals, water_ml: 0, logs } satisfies DailyNutritionSummary;
  });
}

async function loadTargetSources(userId: string) {
  const [baseTarget, profiles, plan] = await Promise.all([
    getCalorieTargets(userId, { throwOnError: true }),
    getNutritionTargetProfiles(userId),
    getDefaultUserWorkoutPlan(userId)
  ]);
  return { baseTarget, profiles, plan };
}

export async function getEatTargetForDate(userId: string, date: string): Promise<ActiveNutritionTarget> {
  if (!canUseUserData(userId)) {
    return resolveEatTargetForDate({ userId, date, profiles: [], baseTarget: null, plan: null, override: "auto" });
  }
  const sources = await loadTargetSources(userId);
  return resolveEatTargetForDate({ userId, date, ...sources });
}

export async function getEatWeekTargets(userId: string, selectedDate: string): Promise<EatWeekTargetDay[]> {
  const weekStart = startOfEatWeek(selectedDate);
  const dates = Array.from({ length: 7 }, (_, index) => addIsoDays(weekStart, index));
  if (!canUseUserData(userId)) return dates.map((date) => ({ date, planned_calories: 0, has_targets: false }));
  const sources = await loadTargetSources(userId);
  return dates.map((date) => {
    const active = resolveEatTargetForDate({ userId, date, ...sources });
    const plannedCalories = number(active.values.daily_calories);
    return {
      date,
      planned_calories: active.hasTarget && plannedCalories > 0 ? plannedCalories : 0,
      has_targets: active.hasTarget && plannedCalories > 0
    };
  });
}

export type EatFoodLogPatch = {
  foodName: string;
  quantity: number;
  servingSize: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes: string | null;
};

export type UpdateEatFoodLogResult = {
  log: FoodLog;
  linkedMeal: MealPlanItem | null;
};

type EditableNutritionPayload = {
  food_name: string;
  quantity: number;
  serving_size: string;
  meal_type: MealType;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string | null;
};

function validateFoodPatch(patch: EatFoodLogPatch) {
  if (!patch.foodName.trim()) throw new Error("Food name is required.");
  if (!patch.servingSize.trim()) throw new Error("Serving is required.");
  requirePositive(patch.quantity, "Quantity");
  requireNonNegative(patch.calories, "Calories");
  requireNonNegative(patch.proteinG, "Protein");
  requireNonNegative(patch.carbsG, "Carbs");
  requireNonNegative(patch.fatG, "Fat");
}

function payloadFromPatch(patch: EatFoodLogPatch): EditableNutritionPayload {
  return {
    food_name: patch.foodName.trim(),
    quantity: patch.quantity,
    serving_size: patch.servingSize.trim(),
    meal_type: patch.mealType,
    calories: patch.calories,
    protein_g: patch.proteinG,
    carbs_g: patch.carbsG,
    fat_g: patch.fatG,
    notes: patch.notes?.trim() || null
  };
}

function payloadFromRow(row: FoodLog | MealPlanItem): EditableNutritionPayload {
  return {
    food_name: row.food_name,
    quantity: number(row.quantity),
    serving_size: row.serving_size,
    meal_type: row.meal_type as MealType,
    calories: number(row.calories),
    protein_g: number(row.protein_g),
    carbs_g: number(row.carbs_g),
    fat_g: number(row.fat_g),
    notes: row.notes ?? null
  };
}

function editableValuesMatch(row: FoodLog | MealPlanItem | null, expected: EditableNutritionPayload) {
  if (!row) return false;
  return row.food_name === expected.food_name
    && number(row.quantity) === expected.quantity
    && row.serving_size === expected.serving_size
    && row.meal_type === expected.meal_type
    && number(row.calories) === expected.calories
    && number(row.protein_g) === expected.protein_g
    && number(row.carbs_g) === expected.carbs_g
    && number(row.fat_g) === expected.fat_g
    && (row.notes ?? null) === expected.notes;
}

function terminalValuesMatch(current: MealPlanItem, original: MealPlanItem) {
  return current.status === original.status
    && current.food_log_id === original.food_log_id
    && current.completed_at === original.completed_at;
}

async function readFoodLog(userId: string, logId: string) {
  const result = await supabase!
    .from("food_logs")
    .select("*")
    .eq("id", logId)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as FoodLog | null;
}

async function readLinkedMeal(userId: string, logId: string) {
  const result = await supabase!
    .from("user_meal_plan_items")
    .select("*")
    .eq("food_log_id", logId)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as MealPlanItem | null;
}

async function restoreLinkedEdit({
  userId,
  originalLog,
  originalLinked
}: {
  userId: string;
  originalLog: FoodLog;
  originalLinked: MealPlanItem | null;
}) {
  const errors: string[] = [];
  const restoredLog = await supabase!
    .from("food_logs")
    .update(payloadFromRow(originalLog))
    .eq("id", originalLog.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (restoredLog.error) errors.push(`food_log_restore:${restoredLog.error.message}`);

  if (originalLinked) {
    const restoredMeal = await supabase!
      .from("user_meal_plan_items")
      .update(payloadFromRow(originalLinked))
      .eq("id", originalLinked.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (restoredMeal.error) errors.push(`meal_restore:${restoredMeal.error.message}`);
  }

  let verifiedLog: FoodLog | null = null;
  let verifiedMeal: MealPlanItem | null = null;
  try {
    [verifiedLog, verifiedMeal] = await Promise.all([
      readFoodLog(userId, originalLog.id),
      originalLinked ? readLinkedMeal(userId, originalLog.id) : Promise.resolve(null)
    ]);
  } catch (error) {
    errors.push(`restore_verify:${error instanceof Error ? error.message : "unknown"}`);
  }

  const logRestored = editableValuesMatch(verifiedLog, payloadFromRow(originalLog));
  const mealRestored = !originalLinked || (
    editableValuesMatch(verifiedMeal, payloadFromRow(originalLinked))
    && Boolean(verifiedMeal)
    && terminalValuesMatch(verifiedMeal!, originalLinked)
  );
  if (!logRestored) errors.push("food_log_restore_mismatch");
  if (!mealRestored) errors.push("meal_restore_mismatch");
  return { ok: errors.length === 0, errors, log: verifiedLog, linkedMeal: verifiedMeal };
}

export async function updateEatFoodLog(userId: string, logId: string, patch: EatFoodLogPatch): Promise<UpdateEatFoodLogResult> {
  validateFoodPatch(patch);
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const requested = payloadFromPatch(patch);
  const originalLog = await readFoodLog(userId, logId);
  if (!originalLog) throw new Error("Food log not found.");
  const originalLinked = await readLinkedMeal(userId, logId);

  const firstWrite = await supabase!
    .from("food_logs")
    .update(requested)
    .eq("id", logId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (firstWrite.error) throw firstWrite.error;

  if (!originalLinked) {
    const verifiedLog = await readFoodLog(userId, logId);
    if (!editableValuesMatch(verifiedLog, requested)) {
      const compensation = await restoreLinkedEdit({ userId, originalLog, originalLinked: null });
      if (!compensation.ok) throw new EatLinkedEditConsistencyError(compensation.errors.join(";"));
      throw new Error("Food log verification failed and the original values were restored.");
    }
    return { log: verifiedLog!, linkedMeal: null };
  }

  const secondWrite = await supabase!
    .from("user_meal_plan_items")
    .update(requested)
    .eq("id", originalLinked.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (secondWrite.error) {
    const compensation = await restoreLinkedEdit({ userId, originalLog, originalLinked });
    if (!compensation.ok) throw new EatLinkedEditConsistencyError(`linked_write:${secondWrite.error.message};${compensation.errors.join(";")}`);
    throw new Error("The linked meal update failed and the food log was restored.");
  }

  let verifiedLog: FoodLog | null;
  let verifiedMeal: MealPlanItem | null;
  try {
    [verifiedLog, verifiedMeal] = await Promise.all([readFoodLog(userId, logId), readLinkedMeal(userId, logId)]);
  } catch (error) {
    const compensation = await restoreLinkedEdit({ userId, originalLog, originalLinked });
    if (!compensation.ok) throw new EatLinkedEditConsistencyError(`success_verify_read:${error instanceof Error ? error.message : "unknown"};${compensation.errors.join(";")}`);
    throw new Error("The linked edit could not be verified and the original values were restored.");
  }

  const success = editableValuesMatch(verifiedLog, requested)
    && editableValuesMatch(verifiedMeal, requested)
    && Boolean(verifiedMeal)
    && terminalValuesMatch(verifiedMeal!, originalLinked);
  if (!success) {
    const compensation = await restoreLinkedEdit({ userId, originalLog, originalLinked });
    if (!compensation.ok) throw new EatLinkedEditConsistencyError(`success_verify_mismatch;${compensation.errors.join(";")}`);
    throw new Error("The linked edit did not persist consistently and the original values were restored.");
  }

  return { log: verifiedLog!, linkedMeal: verifiedMeal! };
}

export async function deleteEatFoodLog(userId: string, logId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const linked = await supabase!
    .from("user_meal_plan_items")
    .select("id,status")
    .eq("user_id", userId)
    .eq("food_log_id", logId)
    .maybeSingle();
  if (linked.error) throw linked.error;
  if (linked.data) {
    throw new Error("This food log completes a planned meal and cannot be deleted because completed meal states are permanent. Edit the food log instead.");
  }
  const deleted = await supabase!.from("food_logs").delete().eq("id", logId).eq("user_id", userId);
  if (deleted.error) throw deleted.error;
  return { linkedMealRestored: false };
}

export async function logRepeatFood(userId: string, source: FoodLog, targetDate: string, mealType: MealType, quantity = source.quantity) {
  requirePositive(quantity, "Quantity");
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const sourceQuantity = Math.max(0.1, number(source.quantity, 1));
  const ratio = quantity / sourceQuantity;
  const payload = {
    user_id: userId, food_item_id: source.food_item_id, user_food_item_id: source.user_food_item_id,
    log_date: targetDate, meal_type: mealType, food_name: source.food_name, serving_size: source.serving_size, quantity,
    calories: Math.round(number(source.calories) * ratio),
    protein_g: Math.round(number(source.protein_g) * ratio * 10) / 10,
    carbs_g: Math.round(number(source.carbs_g) * ratio * 10) / 10,
    fat_g: Math.round(number(source.fat_g) * ratio * 10) / 10,
    notes: source.notes
  };
  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return data as FoodLog;
}

export async function copyEatFoodLogs({
  userId, sourceDate, targetDate, selectedIds
}: { userId: string; sourceDate: string; targetDate: string; selectedIds: string[] }) {
  if (!selectedIds.length) return [] as FoodLog[];
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const [sourceResult, targetResult] = await Promise.all([
    supabase!.from("food_logs").select("*").eq("user_id", userId).eq("log_date", sourceDate).in("id", selectedIds),
    supabase!.from("food_logs").select("*").eq("user_id", userId).eq("log_date", targetDate)
  ]);
  if (sourceResult.error) throw new Error(`Could not load source food logs. ${sourceResult.error.message}`);
  if (targetResult.error) throw new Error(`Could not check target food logs. ${targetResult.error.message}`);
  const target = (targetResult.data ?? []) as FoodLog[];
  const duplicateKeys = new Set(target.map(foodLogDuplicateKey));
  const markers = new Set(target.map((log) => log.notes ?? "").filter((note) => note.startsWith("Copied from ")));
  const copies = ((sourceResult.data ?? []) as FoodLog[]).filter((log) => {
    const marker = `Copied from ${sourceDate}:${log.id}`;
    return !duplicateKeys.has(foodLogDuplicateKey(log)) && !markers.has(marker);
  }).map((log) => ({
    user_id: userId, food_item_id: log.food_item_id, user_food_item_id: log.user_food_item_id,
    log_date: targetDate, meal_type: log.meal_type, food_name: log.food_name, serving_size: log.serving_size,
    quantity: log.quantity, calories: log.calories, protein_g: log.protein_g, carbs_g: log.carbs_g, fat_g: log.fat_g,
    notes: `Copied from ${sourceDate}:${log.id}`
  }));
  if (!copies.length) return [] as FoodLog[];
  const inserted = await supabase!.from("food_logs").insert(copies).select("*");
  if (inserted.error) throw inserted.error;
  return (inserted.data ?? []) as FoodLog[];
}

export async function completeMealPlanItemWithDraft({
  item, patch, updateSavedPlan
}: { item: MealPlanItem; patch: EatFoodLogPatch; updateSavedPlan: boolean }) {
  validateFoodPatch(patch);
  if (item.status === "skipped") throw new Error("A skipped meal cannot be marked eaten.");
  if (!canUseUserData(item.user_id)) throw new Error("User session invalid");
  const latest = await supabase!
    .from("user_meal_plan_items")
    .select("*")
    .eq("id", item.id)
    .eq("user_id", item.user_id)
    .maybeSingle();
  if (latest.error) throw latest.error;
  if (!latest.data) throw new Error("Planned meal not found.");
  const current = latest.data as MealPlanItem;
  if (current.status === "skipped") throw new Error("A skipped meal cannot be marked eaten.");
  if (current.status === "done" || current.food_log_id) return { item: current, log: null as FoodLog | null, alreadyDone: true };

  const completedAt = new Date().toISOString();
  const logPayload = {
    user_id: current.user_id, food_item_id: current.food_item_id, user_food_item_id: current.user_food_item_id,
    log_date: current.plan_date, meal_type: patch.mealType, food_name: patch.foodName.trim(), serving_size: patch.servingSize.trim(),
    quantity: patch.quantity, calories: patch.calories, protein_g: patch.proteinG, carbs_g: patch.carbsG, fat_g: patch.fatG,
    notes: patch.notes?.trim() || null
  };
  const inserted = await supabase!.from("food_logs").insert(logPayload).select("*").single();
  if (inserted.error) throw inserted.error;

  const planPatch = updateSavedPlan ? {
    food_name: logPayload.food_name, serving_size: logPayload.serving_size, quantity: logPayload.quantity, meal_type: logPayload.meal_type,
    calories: logPayload.calories, protein_g: logPayload.protein_g, carbs_g: logPayload.carbs_g, fat_g: logPayload.fat_g, notes: logPayload.notes
  } : {};
  const completed = await supabase!
    .from("user_meal_plan_items")
    .update({ ...planPatch, status: "done", food_log_id: inserted.data.id, completed_at: completedAt })
    .eq("id", current.id)
    .eq("user_id", current.user_id)
    .eq("status", "planned")
    .is("food_log_id", null)
    .select("*")
    .maybeSingle();
  if (completed.error) {
    await supabase!.from("food_logs").delete().eq("id", inserted.data.id).eq("user_id", current.user_id);
    throw completed.error;
  }
  if (!completed.data) {
    await supabase!.from("food_logs").delete().eq("id", inserted.data.id).eq("user_id", current.user_id);
    const reread = await supabase!
      .from("user_meal_plan_items")
      .select("*")
      .eq("id", current.id)
      .eq("user_id", current.user_id)
      .maybeSingle();
    if (reread.error) throw reread.error;
    return { item: (reread.data as MealPlanItem | null) ?? current, log: null as FoodLog | null, alreadyDone: true };
  }
  return { item: completed.data as MealPlanItem, log: inserted.data as FoodLog, alreadyDone: false };
}
