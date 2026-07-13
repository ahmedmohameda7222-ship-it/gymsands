"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { FoodLog, MealPlanItem, MealType } from "@/types";

const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

type DirectMealInput = {
  userId: string;
  date: string;
  mealType: MealType | string;
  foodName: string;
  quantity?: number;
  servingInfo?: string | null;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  notes?: string | null;
};

type MealPlanPatch = Partial<{
  date: string;
  mealType: MealType | string;
  foodName: string;
  quantity: number;
  servingInfo: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes: string | null;
}>;

function requireClient(userId: string | null | undefined) {
  if (!supabase || !userId || !isUuid(userId)) throw new Error("User session invalid.");
}

function requiredUuid(value: unknown, field: string) {
  const result = typeof value === "string" ? value : "";
  if (!isUuid(result)) throw new Error(`Invalid persisted meal-plan ${field}.`);
  return result;
}

function requiredText(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`Invalid persisted meal-plan ${field}.`);
  return result;
}

function finiteNonNegative(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid persisted meal-plan ${field}.`);
  return parsed;
}

function positive(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be greater than zero.`);
  return parsed;
}

function normalizeDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Date must be YYYY-MM-DD.");
  return value;
}

export function normalizeMealPlanType(value: string | null | undefined): MealType {
  const clean = String(value ?? "").trim().toLowerCase();
  if (clean === "breakfast") return "Breakfast";
  if (clean === "lunch") return "Lunch";
  if (clean === "dinner") return "Dinner";
  if (clean === "snack" || clean === "snacks") return "Snack";
  if (mealTypes.includes(value as MealType)) return value as MealType;
  throw new Error("Meal type must be breakfast, lunch, dinner, or snack.");
}

export function mealTypeKey(value: string | null | undefined) {
  const normalized = normalizeMealPlanType(value);
  return normalized === "Snack" ? "snack" : normalized.toLowerCase();
}

export function normalizePersistedMealPlanItem(row: Record<string, unknown>): MealPlanItem {
  const status = row.status === "planned" || row.status === "done" || row.status === "skipped" ? row.status : null;
  if (!status) throw new Error("Invalid persisted meal-plan status.");
  const completedAt = typeof row.completed_at === "string" ? row.completed_at : null;
  const foodLogId = row.food_log_id === null || row.food_log_id === undefined ? null : requiredUuid(row.food_log_id, "food log ID");
  return {
    id: requiredUuid(row.id, "item ID"), user_id: requiredUuid(row.user_id, "owner ID"),
    plan_date: normalizeDate(String(row.plan_date ?? "")), meal_type: normalizeMealPlanType(String(row.meal_type ?? "")),
    food_item_id: typeof row.food_item_id === "string" && isUuid(row.food_item_id) ? row.food_item_id : null,
    user_food_item_id: typeof row.user_food_item_id === "string" && isUuid(row.user_food_item_id) ? row.user_food_item_id : null,
    food_name: requiredText(row.food_name, "food name"), serving_size: requiredText(row.serving_size, "serving"),
    quantity: positive(row.quantity, "Quantity"), calories: finiteNonNegative(row.calories, "calories"),
    protein_g: finiteNonNegative(row.protein_g, "protein"), carbs_g: finiteNonNegative(row.carbs_g, "carbs"), fat_g: finiteNonNegative(row.fat_g, "fat"),
    status, food_log_id: foodLogId, completed_at: completedAt,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: requiredText(row.created_at, "created timestamp"), updated_at: requiredText(row.updated_at, "updated timestamp")
  };
}

function normalizeFoodLog(row: Record<string, unknown>): FoodLog {
  return {
    id: requiredUuid(row.id, "food log ID"), user_id: requiredUuid(row.user_id, "food log owner ID"),
    food_item_id: typeof row.food_item_id === "string" && isUuid(row.food_item_id) ? row.food_item_id : null,
    user_food_item_id: typeof row.user_food_item_id === "string" && isUuid(row.user_food_item_id) ? row.user_food_item_id : null,
    log_date: normalizeDate(String(row.log_date ?? "")), meal_type: requiredText(row.meal_type, "food log meal type"),
    food_name: requiredText(row.food_name, "food log name"), serving_size: requiredText(row.serving_size, "food log serving"),
    quantity: positive(row.quantity, "Quantity"), calories: finiteNonNegative(row.calories, "food log calories"),
    protein_g: finiteNonNegative(row.protein_g, "food log protein"), carbs_g: finiteNonNegative(row.carbs_g, "food log carbs"), fat_g: finiteNonNegative(row.fat_g, "food log fat"),
    notes: typeof row.notes === "string" ? row.notes : null
  };
}

function validatedPayload(input: DirectMealInput) {
  const foodName = input.foodName.trim();
  const serving = input.servingInfo?.trim() ?? "";
  if (!foodName) throw new Error("Food name is required.");
  if (!serving) throw new Error("Serving is required.");
  return {
    user_id: input.userId, plan_date: normalizeDate(input.date), meal_type: normalizeMealPlanType(String(input.mealType)),
    food_item_id: null, user_food_item_id: null, food_name: foodName, serving_size: serving,
    quantity: positive(input.quantity, "Quantity"), calories: finiteNonNegative(input.calories, "calories"),
    protein_g: finiteNonNegative(input.protein, "protein"), carbs_g: finiteNonNegative(input.carbs, "carbs"), fat_g: finiteNonNegative(input.fat, "fat"),
    status: "planned", food_log_id: null, completed_at: null, notes: input.notes?.trim() || null
  };
}

export async function getMealPlanItemsForDate(userId: string, date: string) {
  requireClient(userId);
  const { data, error } = await supabase!.from("user_meal_plan_items").select("*").eq("user_id", userId).eq("plan_date", normalizeDate(date)).order("created_at");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizePersistedMealPlanItem);
}

export async function getMealPlanItemsForRange(userId: string, startDate: string, endDate: string) {
  requireClient(userId);
  const { data, error } = await supabase!.from("user_meal_plan_items").select("*").eq("user_id", userId).gte("plan_date", normalizeDate(startDate)).lte("plan_date", normalizeDate(endDate)).order("plan_date").order("created_at");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizePersistedMealPlanItem);
}

export async function getMealPlanDatesWithItems(userId: string, startDate: string, endDate: string) {
  const items = await getMealPlanItemsForRange(userId, startDate, endDate);
  return Array.from(new Set(items.map((item) => item.plan_date)));
}

export async function createDirectMealPlanItem(input: DirectMealInput) {
  requireClient(input.userId);
  const { data, error } = await supabase!.from("user_meal_plan_items").insert(validatedPayload(input)).select("*").single();
  if (error) throw error;
  return normalizePersistedMealPlanItem(data as Record<string, unknown>);
}

function mergedInput(item: MealPlanItem, patch: MealPlanPatch): DirectMealInput {
  return {
    userId: item.user_id, date: patch.date ?? item.plan_date, mealType: patch.mealType ?? item.meal_type,
    foodName: patch.foodName ?? item.food_name, quantity: patch.quantity ?? item.quantity,
    servingInfo: patch.servingInfo ?? item.serving_size, calories: patch.calories ?? item.calories,
    protein: patch.protein ?? item.protein_g, carbs: patch.carbs ?? item.carbs_g, fat: patch.fat ?? item.fat_g,
    notes: patch.notes === undefined ? item.notes : patch.notes
  };
}

export async function correctCompletedMealPlanItem(item: MealPlanItem, patch: MealPlanPatch) {
  requireClient(item.user_id);
  const payload = validatedPayload(mergedInput(item, patch));
  const { data, error } = await supabase!.rpc("correct_completed_meal_plan_item", {
    p_item_id: item.id, p_plan_date: payload.plan_date, p_meal_type: payload.meal_type,
    p_food_name: payload.food_name, p_serving_size: payload.serving_size, p_quantity: payload.quantity,
    p_calories: payload.calories, p_protein_g: payload.protein_g, p_carbs_g: payload.carbs_g,
    p_fat_g: payload.fat_g, p_notes: payload.notes
  });
  if (error) throw error;
  const result = data as { item?: Record<string, unknown>; log?: Record<string, unknown> } | null;
  if (!result?.item || !result.log) throw new Error("Completed meal correction returned an invalid result.");
  return { item: normalizePersistedMealPlanItem(result.item), log: normalizeFoodLog(result.log) };
}

export async function updateDirectMealPlanItem(userId: string, itemId: string, patch: MealPlanPatch) {
  requireClient(userId);
  if (!isUuid(itemId)) throw new Error("Invalid meal plan item ID.");
  const { data: currentData, error: currentError } = await supabase!.from("user_meal_plan_items").select("*").eq("id", itemId).eq("user_id", userId).single();
  if (currentError) throw currentError;
  const current = normalizePersistedMealPlanItem(currentData as Record<string, unknown>);
  if (current.status === "done") return (await correctCompletedMealPlanItem(current, patch)).item;
  const payload = validatedPayload(mergedInput(current, patch));
  const { data, error } = await supabase!.from("user_meal_plan_items").update({
    plan_date: payload.plan_date, meal_type: payload.meal_type, food_name: payload.food_name,
    serving_size: payload.serving_size, quantity: payload.quantity, calories: payload.calories,
    protein_g: payload.protein_g, carbs_g: payload.carbs_g, fat_g: payload.fat_g, notes: payload.notes
  }).eq("id", itemId).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return normalizePersistedMealPlanItem(data as Record<string, unknown>);
}

export async function markDirectMealPlanItemSkipped(item: MealPlanItem) {
  if (item.status !== "planned") throw new Error("Only a planned meal can be skipped.");
  requireClient(item.user_id);
  const { data, error } = await supabase!.from("user_meal_plan_items").update({ status: "skipped", completed_at: null, food_log_id: null }).eq("id", item.id).eq("user_id", item.user_id).eq("status", "planned").select("*").single();
  if (error) throw error;
  return normalizePersistedMealPlanItem(data as Record<string, unknown>);
}

export async function markDirectMealPlanItemsSkipped(userId: string, itemIds: string[]) {
  const ids = [...new Set(itemIds)].filter(isUuid);
  if (!ids.length) return [];
  requireClient(userId);
  const { data, error } = await supabase!.from("user_meal_plan_items").update({ status: "skipped", completed_at: null, food_log_id: null }).eq("user_id", userId).in("id", ids).eq("status", "planned").select("*");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizePersistedMealPlanItem);
}

export async function markDirectMealPlanItemDone(item: MealPlanItem) {
  if (item.status === "skipped") throw new Error("A skipped meal cannot be marked done.");
  requireClient(item.user_id);
  const { data, error } = await supabase!.rpc("complete_meal_plan_item", { p_item_id: item.id });
  if (error) throw error;
  const result = data as { item?: Record<string, unknown>; log?: Record<string, unknown>; already_done?: boolean } | null;
  if (!result?.item || !result.log) throw new Error("Meal completion returned an invalid result.");
  return { item: normalizePersistedMealPlanItem(result.item), log: normalizeFoodLog(result.log), already_done: Boolean(result.already_done) };
}

export async function deleteDirectMealPlanItem(item: MealPlanItem) {
  requireClient(item.user_id);
  const { error } = await supabase!.from("user_meal_plan_items").delete().eq("id", item.id).eq("user_id", item.user_id);
  if (error) throw error;
  return true;
}
