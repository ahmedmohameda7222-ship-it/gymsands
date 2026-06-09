"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid, todayIso } from "@/lib/utils";
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

function mockDelay<T>(value: T) {
  return Promise.resolve(value);
}

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && userId && isUuid(userId));
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegative(value: unknown, fallback = 0) {
  return Math.max(0, toNumber(value, fallback));
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Date must be YYYY-MM-DD.");
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

function normalizeMealPlanItem(row: Record<string, unknown>): MealPlanItem {
  const now = new Date().toISOString();
  return {
    id: String(row.id || crypto.randomUUID()),
    user_id: String(row.user_id || ""),
    plan_date: normalizeDate(String(row.plan_date || row.planned_date || todayIso())),
    meal_type: normalizeMealPlanType(String(row.meal_type || "Breakfast")),
    food_item_id: typeof row.food_item_id === "string" ? row.food_item_id : null,
    user_food_item_id: typeof row.user_food_item_id === "string" ? row.user_food_item_id : null,
    food_name: String(row.food_name || "Planned food"),
    serving_size: String(row.serving_size || row.serving_info || "1 serving"),
    quantity: Math.max(0.1, toNumber(row.quantity, 1)),
    calories: nonNegative(row.calories),
    protein_g: nonNegative(row.protein_g ?? row.protein),
    carbs_g: nonNegative(row.carbs_g ?? row.carbs),
    fat_g: nonNegative(row.fat_g ?? row.fat),
    status: row.status === "done" || row.completed_at ? "done" : "planned",
    food_log_id: typeof row.food_log_id === "string" ? row.food_log_id : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: typeof row.created_at === "string" ? row.created_at : now,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : now
  };
}

function validateDirectMeal(input: DirectMealInput) {
  const date = normalizeDate(input.date);
  const mealType = normalizeMealPlanType(String(input.mealType));
  const foodName = input.foodName.trim();
  if (!foodName) throw new Error("Food name is required.");
  const quantity = Math.max(0.1, toNumber(input.quantity, 1));
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be greater than zero.");
  return {
    user_id: input.userId,
    plan_date: date,
    meal_type: mealType,
    food_item_id: null,
    user_food_item_id: null,
    food_name: foodName,
    serving_size: input.servingInfo?.trim() || "1 serving",
    quantity,
    calories: nonNegative(input.calories),
    protein_g: nonNegative(input.protein),
    carbs_g: nonNegative(input.carbs),
    fat_g: nonNegative(input.fat),
    status: "planned",
    food_log_id: null,
    completed_at: null,
    notes: input.notes?.trim() || null
  };
}

export async function getMealPlanItemsForDate(userId: string, date: string) {
  const safeDate = normalizeDate(date);
  if (!canUseUserData(userId)) return mockDelay<MealPlanItem[]>([]);

  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", safeDate)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeMealPlanItem);
}

export async function getMealPlanItemsForRange(userId: string, startDate: string, endDate: string) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!canUseUserData(userId)) return mockDelay<MealPlanItem[]>([]);

  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .select("*")
    .eq("user_id", userId)
    .gte("plan_date", start)
    .lte("plan_date", end)
    .order("plan_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeMealPlanItem);
}

export async function getMealPlanDatesWithItems(userId: string, startDate: string, endDate: string) {
  const items = await getMealPlanItemsForRange(userId, startDate, endDate);
  return Array.from(new Set(items.map((item) => item.plan_date)));
}

export async function createDirectMealPlanItem(input: DirectMealInput) {
  const payload = validateDirectMeal(input);
  if (!canUseUserData(input.userId)) {
    return mockDelay({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as MealPlanItem);
  }

  const { data, error } = await supabase!.from("user_meal_plan_items").insert(payload).select("*").single();
  if (error) throw error;
  return normalizeMealPlanItem(data as unknown as Record<string, unknown>);
}

export async function updateDirectMealPlanItem(userId: string, itemId: string, patch: MealPlanPatch) {
  if (!isUuid(itemId)) throw new Error("Invalid meal plan item ID.");
  const payload: Record<string, unknown> = {};

  if (patch.date !== undefined) payload.plan_date = normalizeDate(patch.date);
  if (patch.mealType !== undefined) payload.meal_type = normalizeMealPlanType(String(patch.mealType));
  if (patch.foodName !== undefined) {
    const foodName = patch.foodName.trim();
    if (!foodName) throw new Error("Food name is required.");
    payload.food_name = foodName;
  }
  if (patch.quantity !== undefined) {
    if (!Number.isFinite(Number(patch.quantity)) || Number(patch.quantity) <= 0) throw new Error("Quantity must be greater than zero.");
    payload.quantity = Number(patch.quantity);
  }
  if (patch.servingInfo !== undefined) payload.serving_size = patch.servingInfo?.trim() || "1 serving";
  if (patch.calories !== undefined) payload.calories = nonNegative(patch.calories);
  if (patch.protein !== undefined) payload.protein_g = nonNegative(patch.protein);
  if (patch.carbs !== undefined) payload.carbs_g = nonNegative(patch.carbs);
  if (patch.fat !== undefined) payload.fat_g = nonNegative(patch.fat);
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;

  if (!Object.keys(payload).length) throw new Error("No meal plan changes provided.");

  if (!canUseUserData(userId)) return mockDelay({ id: itemId, user_id: userId, ...payload } as MealPlanItem);

  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .update(payload)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return normalizeMealPlanItem(data as unknown as Record<string, unknown>);
}

export async function markDirectMealPlanItemDone(item: MealPlanItem) {
  if (!canUseUserData(item.user_id)) {
    return {
      item: { ...item, status: "done", completed_at: item.completed_at ?? new Date().toISOString(), food_log_id: item.food_log_id ?? crypto.randomUUID() } as MealPlanItem,
      log: null as FoodLog | null,
      already_done: item.status === "done" || Boolean(item.food_log_id)
    };
  }

  const latestResult = await supabase!
    .from("user_meal_plan_items")
    .select("*")
    .eq("id", item.id)
    .eq("user_id", item.user_id)
    .limit(1)
    .maybeSingle();
  if (latestResult.error) throw latestResult.error;
  if (!latestResult.data) throw new Error("Meal plan item not found.");

  const latest = normalizeMealPlanItem(latestResult.data as unknown as Record<string, unknown>);
  if (latest.status === "done" || latest.food_log_id) {
    return { item: latest, log: null as FoodLog | null, already_done: true };
  }

  const logPayload = {
    user_id: latest.user_id,
    food_item_id: latest.food_item_id,
    user_food_item_id: latest.user_food_item_id,
    log_date: latest.plan_date,
    meal_type: latest.meal_type,
    food_name: latest.food_name,
    serving_size: latest.serving_size,
    quantity: latest.quantity,
    calories: latest.calories,
    protein_g: latest.protein_g,
    carbs_g: latest.carbs_g,
    fat_g: latest.fat_g,
    notes: latest.notes
  };

  const inserted = await supabase!.from("food_logs").insert(logPayload).select("*").single();
  if (inserted.error) throw inserted.error;

  const updated = await supabase!
    .from("user_meal_plan_items")
    .update({ status: "done", food_log_id: inserted.data.id, completed_at: new Date().toISOString() })
    .eq("id", latest.id)
    .eq("user_id", latest.user_id)
    .select("*")
    .single();
  if (updated.error) throw updated.error;

  return { item: normalizeMealPlanItem(updated.data as unknown as Record<string, unknown>), log: inserted.data as FoodLog, already_done: false };
}

export async function deleteDirectMealPlanItem(item: MealPlanItem) {
  if (!canUseUserData(item.user_id)) return mockDelay(true);
  const { error } = await supabase!.from("user_meal_plan_items").delete().eq("id", item.id).eq("user_id", item.user_id);
  if (error) throw error;
  return true;
}
