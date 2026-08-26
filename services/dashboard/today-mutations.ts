"use client";

import { supabase } from "@/lib/supabase/client";
import type {
  TodayMealPlanItemProjection,
  TodayShoppingItemProjection,
} from "@/lib/dashboard/today-projection-contract";
import { isUuid } from "@/lib/utils";

export type TodayMealCompletionResult = {
  item: TodayMealPlanItemProjection;
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

function nullableNonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return nonNegative(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function snapshotMetric(
  snapshot: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): number | null {
  const frozen = record(snapshot.frozen_nutrition);
  const nutrition = Object.keys(frozen).length ? frozen : record(snapshot.nutrition);
  const source = Object.keys(nutrition).length ? nutrition : snapshot;
  if (Object.prototype.hasOwnProperty.call(source, camelKey)) {
    return nullableNonNegative(source[camelKey]);
  }
  if (Object.prototype.hasOwnProperty.call(source, snakeKey)) {
    return nullableNonNegative(source[snakeKey]);
  }
  return null;
}

function meal(row: Record<string, unknown>): TodayMealPlanItemProjection {
  const status = row.status;
  if (
    status !== "planned" &&
    status !== "completed" &&
    status !== "completed_changed" &&
    status !== "skipped"
  ) {
    throw new Error("The saved meal status is invalid.");
  }
  const mealSlotKey = typeof row.meal_slot_key === "string" ? row.meal_slot_key.trim() : "";
  const name = typeof row.frozen_name === "string" ? row.frozen_name.trim() : "";
  if (!mealSlotKey || !name) throw new Error("The saved meal is invalid.");
  const snapshot = record(row.frozen_snapshot);
  return {
    id: String(row.id),
    mealSlotKey,
    name,
    calories: snapshotMetric(snapshot, "caloriesKcal", "calories"),
    proteinG: snapshotMetric(snapshot, "proteinG", "protein_g"),
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
  const operationId = crypto.randomUUID();
  const { data, error } = await supabase!.rpc("complete_nutrition_planned_occurrence", {
    p_occurrence_id: itemId,
    p_operation_id: operationId,
    p_execution_snapshot: null,
  });
  if (error) throw error;
  const result = data as {
    occurrence?: Record<string, unknown>;
    alreadyCompleted?: boolean;
  } | null;
  if (!result?.occurrence) {
    throw new Error("Meal completion returned an invalid result.");
  }
  if (String(result.occurrence.user_id) !== userId) {
    throw new Error("Meal completion ownership could not be verified.");
  }
  return {
    item: meal(result.occurrence),
    alreadyDone: Boolean(result.alreadyCompleted),
  };
}

export async function markTodayMealSkipped(
  userId: string,
  itemId: string,
): Promise<TodayMealPlanItemProjection> {
  requireIdentity(userId, itemId);
  const { data, error } = await supabase!
    .from("nutrition_planned_occurrences")
    .update({ status: "skipped", completed_at: null, actual_log_group_id: null })
    .eq("id", itemId)
    .eq("user_id", userId)
    .eq("status", "planned")
    .select("id,user_id,meal_slot_key,frozen_name,frozen_snapshot,status")
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
    .from("nutrition_planned_occurrences")
    .update({ status: "skipped", completed_at: null, actual_log_group_id: null })
    .eq("user_id", userId)
    .in("id", ids)
    .eq("status", "planned")
    .select("id,user_id,meal_slot_key,frozen_name,frozen_snapshot,status");
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
