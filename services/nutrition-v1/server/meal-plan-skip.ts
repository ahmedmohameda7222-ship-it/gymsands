import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mutateMealPlanWeek,
  type MealPlanOccurrenceMutation,
  type PlannedOccurrenceRow,
} from "@/services/nutrition-v1/server/meal-plan";

type MealPlanWeekIdentity = {
  id: string;
  user_id: string;
  week_start_date: string;
  revision: number;
};

function requiredText(value: unknown, field: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function mutationFromRow(row: PlannedOccurrenceRow): MealPlanOccurrenceMutation {
  return {
    id: row.id,
    planDate: row.plan_date,
    mealSlotKey: row.meal_slot_key,
    position: row.position,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceVersionId: row.source_version_id,
    resolvedQuantity: row.resolved_quantity,
    resolvedServingLabel: row.resolved_serving_label,
    frozenName: row.frozen_name,
    frozenSnapshot: row.frozen_snapshot,
    status: "skipped",
  };
}

export async function skipMealPlanOccurrences(
  supabase: SupabaseClient,
  userId: string,
  input: { occurrenceIds: string[]; operationId: string },
) {
  requiredText(userId, "User ID");
  const operationId = requiredText(input.operationId, "Operation ID");
  const occurrenceIds = [...new Set(input.occurrenceIds.map((id) => requiredText(id, "Occurrence ID")))];
  if (!occurrenceIds.length) throw new Error("At least one Meal Plan occurrence is required.");

  const occurrenceResult = await supabase
    .from("nutrition_planned_occurrences")
    .select("id,week_id,user_id,plan_date,meal_slot_key,position,source_type,source_id,source_version_id,resolved_quantity,resolved_serving_label,frozen_name,frozen_snapshot,status,completed_at,actual_log_group_id")
    .eq("user_id", userId)
    .in("id", occurrenceIds);
  if (occurrenceResult.error) throw occurrenceResult.error;

  const found = (occurrenceResult.data ?? []) as unknown as PlannedOccurrenceRow[];
  const byId = new Map(found.map((row) => [row.id, row]));
  const rows = occurrenceIds.map((id) => byId.get(id)).filter((row): row is PlannedOccurrenceRow => Boolean(row));
  if (rows.length !== occurrenceIds.length) throw new Error("One or more Meal Plan occurrences were not found.");
  if (rows.some((row) => row.status !== "planned" && row.status !== "skipped")) {
    throw new Error("Only planned or already-skipped Meal Plan occurrences can be skipped.");
  }

  const weekIds = new Set(rows.map((row) => requiredText(row.week_id, "Meal Plan week ID")));
  if (weekIds.size !== 1) throw new Error("Meal Plan occurrences must belong to one week command.");
  const weekId = [...weekIds][0]!;

  const weekResult = await supabase
    .from("nutrition_meal_plan_weeks")
    .select("id,user_id,week_start_date,revision")
    .eq("id", weekId)
    .eq("user_id", userId)
    .maybeSingle();
  if (weekResult.error) throw weekResult.error;
  if (!weekResult.data) throw new Error("Meal Plan week was not found.");
  const week = weekResult.data as unknown as MealPlanWeekIdentity;

  const mutationResult = await mutateMealPlanWeek(supabase, userId, {
    weekId: week.id,
    weekStartDate: week.week_start_date,
    baseRevision: Number(week.revision),
    operationId,
    mutation: { upsertOccurrences: rows.map(mutationFromRow) },
  });

  return {
    weekId: mutationResult.weekId,
    revision: mutationResult.revision,
    occurrences: rows.map((row) => ({
      ...row,
      status: "skipped" as const,
      completed_at: null,
      actual_log_group_id: null,
    })),
  };
}
