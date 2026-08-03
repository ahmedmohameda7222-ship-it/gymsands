"use client";

import { supabase } from "@/lib/supabase/client";
import type {
  TodayMealPlanItemProjection,
  TodayShoppingItemProjection,
} from "@/lib/dashboard/today-projection-contract";
import { isUuid } from "@/lib/utils";

export type TodayMealCompletionResult = {
  item: TodayMealPlanItemProjection;
  log: {
    id: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  alreadyDone: boolean;
};

function requireIdentity(userId: string, id?: string) {
  if (!supabase || !isUuid(userId) || (id !== undefined && !isUuid(id))) {
    throw new Error("Please refresh, sign in again, and retry.");
  }
}

function nonNegative(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("The saved Today result is invalid.");
  }
  return parsed;
}

function meal(row: Record<string, unknown>): TodayMealPlanItemProjection {
  const mealType = row.meal_type;
  const status = row.status;
  if (
    mealType !== "Breakfast" &&
    mealType !== "Lunch" &&
    mealType !== "Dinner" &&
    mealType !== "Snack"
  ) {
    throw new Error("The saved meal type is invalid.");
  }
  if (status !== "planned" && status !== "done" && status !== "skipped") {
    throw new Error("The saved meal status is invalid.");
  }
  return {
    id: String(row.id),
    mealType,
    name: String(row.food_name ?? ""),
    calories: nonNegative(row.calories),
    proteinG: nonNegative(row.protein_g),
    status,
  };
}

function shopping(row: Record<string, unknown>): TodayShoppingItemProjection {
  return {
    id: String(row.id),
    weekStart: String(row.week_start),
    itemName: String(row.item_name ?? ""),
    quantity:
      row.quantity === null || row.quantity === undefined
        ? null
        : nonNegative(row.quantity),
    unit: typeof row.unit === "string" ? row.unit : null,
    storeSection:
      typeof row.store_section === "string" ? row.store_section : "Other",
    checked: Boolean(row.checked),
    alreadyHave: Boolean(row.already_have),
  };
}

export async function markTodayMealDone(
  userId: string,
  itemId: string,
): Promise<TodayMealCompletionResult> {
  requireIdentity(userId, itemId);
  const { data, error } = await supabase!.rpc("complete_meal_plan_item", {
    p_item_id: itemId,
  });
  if (error) throw error;
  const result = data as {
    item?: Record<string, unknown>;
    log?: Record<string, unknown>;
    already_done?: boolean;
  } | null;
  if (!result?.item || !result.log) {
    throw new Error("Meal completion returned an invalid result.");
  }
  if (String(result.item.user_id) !== userId || String(result.log.user_id) !== userId) {
    throw new Error("Meal completion ownership could not be verified.");
  }
  return {
    item: meal(result.item),
    log: {
      id: String(result.log.id),
      calories: nonNegative(result.log.calories),
      proteinG: nonNegative(result.log.protein_g),
      carbsG: nonNegative(result.log.carbs_g),
      fatG: nonNegative(result.log.fat_g),
    },
    alreadyDone: Boolean(result.already_done),
  };
}

export async function markTodayMealSkipped(
  userId: string,
  itemId: string,
): Promise<TodayMealPlanItemProjection> {
  requireIdentity(userId, itemId);
  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .update({ status: "skipped", completed_at: null, food_log_id: null })
    .eq("id", itemId)
    .eq("user_id", userId)
    .eq("status", "planned")
    .select("id,user_id,meal_type,food_name,calories,protein_g,status")
    .single();
  if (error) throw error;
  return meal(data as Record<string, unknown>);
}

export async function markTodayMealsSkipped(
  userId: string,
  itemIds: string[],
): Promise<TodayMealPlanItemProjection[]> {
  const ids = [...new Set(itemIds)].filter(isUuid);
  if (!ids.length) return [];
  requireIdentity(userId);
  const { data, error } = await supabase!
    .from("user_meal_plan_items")
    .update({ status: "skipped", completed_at: null, food_log_id: null })
    .eq("user_id", userId)
    .in("id", ids)
    .eq("status", "planned")
    .select("id,user_id,meal_type,food_name,calories,protein_g,status");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(meal);
}

export async function toggleTodayShoppingItem(
  userId: string,
  item: TodayShoppingItemProjection,
): Promise<TodayShoppingItemProjection> {
  requireIdentity(userId, item.id);
  const { data, error } = await supabase!
    .from("user_grocery_items")
    .update({ checked: !item.checked })
    .eq("id", item.id)
    .eq("user_id", userId)
    .select("id,week_start,item_name,quantity,unit,store_section,checked,already_have")
    .single();
  if (error) throw error;
  return shopping(data as Record<string, unknown>);
}
