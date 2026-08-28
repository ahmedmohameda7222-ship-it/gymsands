"use client";

import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
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

async function postMealPlanCommand(body: Record<string, unknown>) {
  if (!supabase) throw new Error("Please refresh, sign in again, and retry.");
  const renderedQa = env.useMockAuth && env.productionQaBuild;
  let authorization: string | null = null;
  if (!renderedQa) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Please sign in before updating Meal Plan.");
    authorization = `Bearer ${data.session.access_token}`;
  }

  const response = await fetch("/api/nutrition/v1/meal-plan/week", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(renderedQa ? { "x-plaivra-rendered-qa": "mock-auth" } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Meal Plan update could not be completed.");
  return payload;
}

function verifiedSkippedMeals(payload: Record<string, unknown>, userId: string) {
  const raw = Array.isArray(payload.occurrences) ? payload.occurrences : [];
  const rows = raw.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)));
  if (!rows.length || rows.some((row) => String(row.user_id) !== userId)) {
    throw new Error("Meal Plan skip ownership could not be verified.");
  }
  return rows.map(meal);
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
  const payload = await postMealPlanCommand({
    kind: "skip",
    occurrenceIds: [itemId],
    operationId: crypto.randomUUID(),
  });
  const [item] = verifiedSkippedMeals(payload, userId);
  if (!item || item.id !== itemId) throw new Error("Meal Plan skip returned an invalid result.");
  return item;
}

export async function markTodayMealsSkipped(
  userId: string,
  itemIds: string[],
): Promise<TodayMealPlanItemProjection[]> {
  const ids = [...new Set(itemIds)].filter(isUuid);
  if (!ids.length) return [];
  requireIdentity(userId);
  const payload = await postMealPlanCommand({
    kind: "skip",
    occurrenceIds: ids,
    operationId: crypto.randomUUID(),
  });
  const items = verifiedSkippedMeals(payload, userId);
  const byId = new Map(items.map((item) => [item.id, item]));
  if (ids.some((id) => !byId.has(id))) throw new Error("Meal Plan skip returned an incomplete result.");
  return ids.map((id) => byId.get(id)!);
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
