"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { addIsoDays, foodLogDuplicateKey, startOfEatWeek } from "@/lib/eat/eat-model";
import type { DailyNutritionSummary, FoodLog, MealPlanItem, MealType, WaterLog } from "@/types";

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

function validateFoodPatch(patch: EatFoodLogPatch) {
  if (!patch.foodName.trim()) throw new Error("Food name is required.");
  if (!patch.servingSize.trim()) throw new Error("Serving is required.");
  requirePositive(patch.quantity, "Quantity");
  requireNonNegative(patch.calories, "Calories");
  requireNonNegative(patch.proteinG, "Protein");
  requireNonNegative(patch.carbsG, "Carbs");
  requireNonNegative(patch.fatG, "Fat");
}

export async function updateEatFoodLog(userId: string, logId: string, patch: EatFoodLogPatch) {
  validateFoodPatch(patch);
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const payload = {
    food_name: patch.foodName.trim(), quantity: patch.quantity, serving_size: patch.servingSize.trim(), meal_type: patch.mealType,
    calories: patch.calories, protein_g: patch.proteinG, carbs_g: patch.carbsG, fat_g: patch.fatG, notes: patch.notes?.trim() || null
  };
  const { data, error } = await supabase!
    .from("food_logs")
    .update(payload)
    .eq("id", logId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;

  const linked = await supabase!
    .from("user_meal_plan_items")
    .select("id")
    .eq("user_id", userId)
    .eq("food_log_id", logId)
    .maybeSingle();
  if (linked.error) throw linked.error;
  if (linked.data) {
    const sync = await supabase!
      .from("user_meal_plan_items")
      .update(payload)
      .eq("id", linked.data.id)
      .eq("user_id", userId);
    if (sync.error) throw sync.error;
  }
  return data as FoodLog;
}

export async function deleteEatFoodLog(userId: string, logId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const linked = await supabase!
    .from("user_meal_plan_items")
    .select("id")
    .eq("user_id", userId)
    .eq("food_log_id", logId)
    .maybeSingle();
  if (linked.error) throw linked.error;
  const deleted = await supabase!.from("food_logs").delete().eq("id", logId).eq("user_id", userId);
  if (deleted.error) throw deleted.error;
  if (linked.data) {
    const restored = await supabase!
      .from("user_meal_plan_items")
      .update({ status: "planned", food_log_id: null, completed_at: null })
      .eq("id", linked.data.id)
      .eq("user_id", userId);
    if (restored.error) throw restored.error;
  }
  return { linkedMealRestored: Boolean(linked.data) };
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
  const claim = await supabase!
    .from("user_meal_plan_items")
    .update({ status: "done", completed_at: completedAt })
    .eq("id", current.id)
    .eq("user_id", current.user_id)
    .eq("status", "planned")
    .is("food_log_id", null)
    .select("*")
    .maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) return { item: current, log: null as FoodLog | null, alreadyDone: true };

  const logPayload = {
    user_id: current.user_id, food_item_id: current.food_item_id, user_food_item_id: current.user_food_item_id,
    log_date: current.plan_date, meal_type: patch.mealType, food_name: patch.foodName.trim(), serving_size: patch.servingSize.trim(),
    quantity: patch.quantity, calories: patch.calories, protein_g: patch.proteinG, carbs_g: patch.carbsG, fat_g: patch.fatG,
    notes: patch.notes?.trim() || null
  };
  const inserted = await supabase!.from("food_logs").insert(logPayload).select("*").single();
  if (inserted.error) {
    await supabase!.from("user_meal_plan_items").update({ status: "planned", completed_at: null }).eq("id", current.id).eq("user_id", current.user_id);
    throw inserted.error;
  }
  const planPatch = updateSavedPlan ? {
    food_name: logPayload.food_name, serving_size: logPayload.serving_size, quantity: logPayload.quantity, meal_type: logPayload.meal_type,
    calories: logPayload.calories, protein_g: logPayload.protein_g, carbs_g: logPayload.carbs_g, fat_g: logPayload.fat_g, notes: logPayload.notes
  } : {};
  const linked = await supabase!
    .from("user_meal_plan_items")
    .update({ ...planPatch, food_log_id: inserted.data.id, completed_at: completedAt })
    .eq("id", current.id)
    .eq("user_id", current.user_id)
    .select("*")
    .single();
  if (linked.error) {
    await supabase!.from("food_logs").delete().eq("id", inserted.data.id).eq("user_id", current.user_id);
    await supabase!.from("user_meal_plan_items").update({ status: "planned", completed_at: null, food_log_id: null }).eq("id", current.id).eq("user_id", current.user_id);
    throw linked.error;
  }
  return { item: linked.data as MealPlanItem, log: inserted.data as FoodLog, alreadyDone: false };
}
