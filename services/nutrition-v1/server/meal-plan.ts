import type { SupabaseClient } from "@supabase/supabase-js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_TYPES = new Set(["food", "recipe", "saved_meal", "placeholder"] as const);
const OCCURRENCE_STATUSES = new Set(["planned", "completed", "completed_changed", "skipped"] as const);

type JsonObject = Record<string, unknown>;

export type MealPlanWeekRow = {
  id: string;
  user_id: string;
  week_start_date: string;
  revision: number;
  week_override_json: JsonObject;
  created_at?: string;
  updated_at?: string;
};

export type PlannedOccurrenceRow = {
  id: string;
  week_id?: string;
  user_id?: string;
  plan_date: string;
  meal_slot_key: string;
  position: number;
  source_type: "food" | "recipe" | "saved_meal" | "placeholder";
  source_id: string | null;
  source_version_id: string | null;
  resolved_quantity: number | null;
  resolved_serving_label: string | null;
  frozen_name: string;
  frozen_snapshot: JsonObject;
  status: "planned" | "completed" | "completed_changed" | "skipped";
  completed_at?: string | null;
  actual_log_group_id?: string | null;
};

export type MealPlanOccurrenceMutation = {
  id?: string;
  planDate: string;
  mealSlotKey: string;
  position?: number;
  sourceType: "food" | "recipe" | "saved_meal" | "placeholder";
  sourceId?: string | null;
  sourceVersionId?: string | null;
  resolvedQuantity?: number | null;
  resolvedServingLabel?: string | null;
  frozenName: string;
  frozenSnapshot: JsonObject;
  status?: "planned" | "skipped";
};

export type NormalizedOccurrenceMutation = {
  id?: string;
  planDate: string;
  mealSlotKey: string;
  position: number;
  sourceType: "food" | "recipe" | "saved_meal" | "placeholder";
  sourceId: string | null;
  sourceVersionId: string | null;
  resolvedQuantity: number | null;
  resolvedServingLabel: string | null;
  frozenName: string;
  frozenSnapshot: JsonObject;
  status: "planned" | "skipped";
};

export type MealPlanWeekMutation = {
  weekOverride?: JsonObject;
  deleteOccurrenceIds?: string[];
  upsertOccurrences?: MealPlanOccurrenceMutation[];
};

export type MealPlanWeekProjection = {
  week: MealPlanWeekRow | null;
  occurrences: PlannedOccurrenceRow[];
};

export type ShoppingNeed = {
  foodId: string;
  name: string;
  quantity: number;
  unit: string;
  qualifier: string | null;
  sourceOccurrenceIds: string[];
};

function requiredText(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`${field} is required.`);
  return result;
}

function requiredIsoDate(value: unknown, field: string) {
  const result = requiredText(value, field);
  if (!ISO_DATE.test(result)) throw new Error(`${field} must use YYYY-MM-DD.`);
  return result;
}

function positiveNumber(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${field} must be greater than zero.`);
  return result;
}

function nonNegativeInteger(value: unknown, field: string) {
  const result = value === undefined ? 0 : Number(value);
  if (!Number.isInteger(result) || result < 0) throw new Error(`${field} must be a non-negative integer.`);
  return result;
}

function asObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as JsonObject;
}

function sourceSnapshotText(snapshot: JsonObject, key: string) {
  const value = snapshot[key];
  return typeof value === "string" ? value.trim() : "";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapOccurrence(row: Record<string, unknown>): PlannedOccurrenceRow {
  const sourceType = row.source_type;
  const status = row.status;
  if (!SOURCE_TYPES.has(sourceType as any)) throw new Error("Persisted Meal Plan source type is invalid.");
  if (!OCCURRENCE_STATUSES.has(status as any)) throw new Error("Persisted Meal Plan status is invalid.");
  return {
    id: requiredText(row.id, "Occurrence ID"),
    week_id: typeof row.week_id === "string" ? row.week_id : undefined,
    user_id: typeof row.user_id === "string" ? row.user_id : undefined,
    plan_date: requiredIsoDate(row.plan_date, "Plan date"),
    meal_slot_key: requiredText(row.meal_slot_key, "Meal slot"),
    position: nonNegativeInteger(row.position, "Position"),
    source_type: sourceType as PlannedOccurrenceRow["source_type"],
    source_id: typeof row.source_id === "string" ? row.source_id : null,
    source_version_id: typeof row.source_version_id === "string" ? row.source_version_id : null,
    resolved_quantity: positiveNumber(row.resolved_quantity, "Resolved quantity"),
    resolved_serving_label: typeof row.resolved_serving_label === "string" ? row.resolved_serving_label : null,
    frozen_name: requiredText(row.frozen_name, "Frozen name"),
    frozen_snapshot: asObject(row.frozen_snapshot ?? {}, "Frozen snapshot"),
    status: status as PlannedOccurrenceRow["status"],
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    actual_log_group_id: typeof row.actual_log_group_id === "string" ? row.actual_log_group_id : null,
  };
}

export function normalizeOccurrenceForMutation(input: MealPlanOccurrenceMutation): NormalizedOccurrenceMutation {
  const sourceType = input.sourceType;
  if (!SOURCE_TYPES.has(sourceType)) throw new Error("Unsupported Meal Plan source type.");

  const frozenSnapshot = asObject(input.frozenSnapshot, "Frozen snapshot");
  const frozenName = requiredText(input.frozenName, "Frozen name");
  let sourceId = input.sourceId?.trim() || null;
  let sourceVersionId = input.sourceVersionId?.trim() || null;

  if (sourceType === "food") {
    if (!sourceId) throw new Error("Food source ID is required.");
    if (sourceVersionId) throw new Error("Food source cannot use a Recipe version.");
  }

  if (sourceType === "recipe") {
    if (!sourceId) throw new Error("Recipe source ID is required.");
    if (!sourceVersionId) throw new Error("Recipe source version is required.");
    const snapshotRecipeId = sourceSnapshotText(frozenSnapshot, "recipe_id");
    const snapshotVersionId = sourceSnapshotText(frozenSnapshot, "recipe_version_id");
    if (!snapshotRecipeId || !snapshotVersionId) throw new Error("Recipe frozen snapshot requires recipe and version lineage.");
    if (snapshotRecipeId !== sourceId || snapshotVersionId !== sourceVersionId) {
      throw new Error("Recipe frozen snapshot lineage does not match the planned source.");
    }
  }

  if (sourceType === "saved_meal") {
    if (!sourceId) throw new Error("Saved Meal source ID is required.");
    if (sourceVersionId) throw new Error("Saved Meal source cannot use a Recipe version ID.");
    if (!Array.isArray(frozenSnapshot.items) || frozenSnapshot.items.length === 0) {
      throw new Error("Saved Meal frozen snapshot requires items.");
    }
  }

  if (sourceType === "placeholder") {
    if (sourceId || sourceVersionId) throw new Error("Placeholder source must remain source-free.");
    sourceId = null;
    sourceVersionId = null;
  }

  const status = input.status ?? "planned";
  if (status !== "planned" && status !== "skipped") throw new Error("Only planned or skipped intent can be mutated directly.");

  return {
    ...(input.id ? { id: requiredText(input.id, "Occurrence ID") } : {}),
    planDate: requiredIsoDate(input.planDate, "Plan date"),
    mealSlotKey: requiredText(input.mealSlotKey, "Meal slot"),
    position: nonNegativeInteger(input.position, "Position"),
    sourceType,
    sourceId,
    sourceVersionId,
    resolvedQuantity: positiveNumber(input.resolvedQuantity, "Resolved quantity"),
    resolvedServingLabel: input.resolvedServingLabel?.trim() || null,
    frozenName,
    frozenSnapshot: cloneJson(frozenSnapshot),
    status,
  };
}

export async function getMealPlanWeek(
  supabase: SupabaseClient,
  userId: string,
  weekStartDate: string,
): Promise<MealPlanWeekProjection> {
  const normalizedWeekStart = requiredIsoDate(weekStartDate, "Week start");
  const { data: weekData, error: weekError } = await supabase
    .from("nutrition_meal_plan_weeks")
    .select("id,user_id,week_start_date,revision,week_override_json,created_at,updated_at")
    .eq("user_id", userId)
    .eq("week_start_date", normalizedWeekStart)
    .maybeSingle();
  if (weekError) throw weekError;
  if (!weekData) return { week: null, occurrences: [] };

  const week = weekData as unknown as MealPlanWeekRow;
  const { data: occurrenceData, error: occurrenceError } = await supabase
    .from("nutrition_planned_occurrences")
    .select("*")
    .eq("user_id", userId)
    .eq("week_id", week.id)
    .order("plan_date")
    .order("meal_slot_key")
    .order("position")
    .order("id");
  if (occurrenceError) throw occurrenceError;

  return {
    week,
    occurrences: ((occurrenceData ?? []) as Record<string, unknown>[]).map(mapOccurrence),
  };
}

export async function mutateMealPlanWeek(
  supabase: SupabaseClient,
  userId: string,
  input: {
    weekId: string | null;
    weekStartDate: string;
    baseRevision: number;
    operationId: string;
    mutation: MealPlanWeekMutation;
  },
) {
  const weekStartDate = requiredIsoDate(input.weekStartDate, "Week start");
  if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0) throw new Error("Base revision is invalid.");
  const operationId = requiredText(input.operationId, "Operation ID");

  let targetWeekId = input.weekId?.trim() || null;
  let baseRevision = input.baseRevision;
  if (!targetWeekId) {
    if (baseRevision !== 0) throw new Error("A new Meal Plan week must start at revision zero.");
    const { data, error } = await supabase
      .from("nutrition_meal_plan_weeks")
      .insert({ user_id: userId, week_start_date: weekStartDate })
      .select("id,revision")
      .single();
    if (error) throw error;
    const created = data as unknown as { id?: unknown; revision?: unknown };
    targetWeekId = requiredText(created.id, "Week ID");
    baseRevision = Number(created.revision ?? 0);
  }

  const normalizedMutation: Record<string, unknown> = { operationId };
  if (input.mutation.weekOverride !== undefined) normalizedMutation.weekOverride = asObject(input.mutation.weekOverride, "Week override");
  if (input.mutation.deleteOccurrenceIds !== undefined) {
    normalizedMutation.deleteOccurrenceIds = [...new Set(input.mutation.deleteOccurrenceIds.map((id) => requiredText(id, "Occurrence ID")))];
  }
  if (input.mutation.upsertOccurrences !== undefined) {
    normalizedMutation.upsertOccurrences = input.mutation.upsertOccurrences.map(normalizeOccurrenceForMutation);
  }

  const { data, error } = await supabase.rpc("mutate_nutrition_meal_plan_week", {
    p_week_id: targetWeekId,
    p_base_revision: baseRevision,
    p_mutation: normalizedMutation,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Meal Plan mutation returned an invalid result.");
  return data as { weekId: string; revision: number };
}

export function copyPlannedOccurrences(
  occurrences: Array<{
    id: string;
    planDate: string;
    mealSlotKey: string;
    position: number;
    sourceType: "food" | "recipe" | "saved_meal" | "placeholder";
    sourceId: string | null;
    sourceVersionId: string | null;
    resolvedQuantity: number | null;
    resolvedServingLabel: string | null;
    frozenName: string;
    frozenSnapshot: JsonObject;
    status: "planned" | "completed" | "completed_changed" | "skipped";
  }>,
  targetDates: string[],
  idFactory: () => string,
) {
  return targetDates.flatMap((targetDate) => {
    const planDate = requiredIsoDate(targetDate, "Target date");
    return occurrences.map((source) => ({
      id: requiredText(idFactory(), "Copied occurrence ID"),
      planDate,
      mealSlotKey: source.mealSlotKey,
      position: source.position,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceVersionId: source.sourceVersionId,
      resolvedQuantity: source.resolvedQuantity,
      resolvedServingLabel: source.resolvedServingLabel,
      frozenName: source.frozenName,
      frozenSnapshot: cloneJson(source.frozenSnapshot),
      status: "planned" as const,
    }));
  });
}

export function deriveShoppingNeeds(
  occurrences: Array<{ id: string; sourceType: string; frozenSnapshot: JsonObject }>,
): ShoppingNeed[] {
  const byKey = new Map<string, ShoppingNeed>();
  for (const occurrence of occurrences) {
    if (occurrence.sourceType === "placeholder") continue;
    const ingredients = occurrence.frozenSnapshot.shoppingIngredients;
    if (!Array.isArray(ingredients)) continue;
    for (const raw of ingredients) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const ingredient = raw as JsonObject;
      const foodId = typeof ingredient.foodId === "string" ? ingredient.foodId.trim() : "";
      const name = typeof ingredient.name === "string" ? ingredient.name.trim() : "";
      const unit = typeof ingredient.unit === "string" ? ingredient.unit.trim() : "";
      const qualifier = typeof ingredient.qualifier === "string" && ingredient.qualifier.trim() ? ingredient.qualifier.trim() : null;
      const quantity = Number(ingredient.quantity);
      if (!foodId || !name || !unit || !Number.isFinite(quantity) || quantity <= 0) continue;
      const key = `${foodId}\u0000${unit.toLowerCase()}\u0000${qualifier?.toLowerCase() ?? ""}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.quantity += quantity;
        if (!existing.sourceOccurrenceIds.includes(occurrence.id)) existing.sourceOccurrenceIds.push(occurrence.id);
      } else {
        byKey.set(key, { foodId, name, quantity, unit, qualifier, sourceOccurrenceIds: [occurrence.id] });
      }
    }
  }
  return [...byKey.values()];
}

export async function completeMealPlanOccurrence(
  supabase: SupabaseClient,
  input: { occurrenceId: string; operationId: string; executionSnapshot: JsonObject | null },
) {
  const { data, error } = await supabase.rpc("complete_nutrition_planned_occurrence", {
    p_occurrence_id: requiredText(input.occurrenceId, "Occurrence ID"),
    p_operation_id: requiredText(input.operationId, "Operation ID"),
    p_execution_snapshot: input.executionSnapshot,
  });
  if (error) throw error;
  return data;
}

export async function applyMealPlanChangeRequest(supabase: SupabaseClient, changeRequestId: string) {
  const { data, error } = await supabase.rpc("apply_nutrition_meal_plan_change_request", {
    p_request_id: requiredText(changeRequestId, "Change request ID"),
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Meal Plan change request returned an invalid result.");
  return data as { state: "applied" | "stale"; revision: number };
}
