import { NextResponse } from "next/server";

import { isIsoDate } from "@/lib/date-utils";
import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import {
  applyMealPlanChangeRequest,
  completeMealPlanOccurrence,
  deriveShoppingNeeds,
  getMealPlanWeek,
  mutateMealPlanWeek,
  type MealPlanWeekMutation,
} from "@/services/nutrition-v1/server/meal-plan";
import { getEffectiveNutritionTarget } from "@/services/nutrition-v1/server/targets";

function requireDate(value: unknown, label: string) {
  if (typeof value !== "string" || !isIsoDate(value)) throw new NutritionRequestError(`${label} must use YYYY-MM-DD.`);
  return value;
}

function object(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NutritionRequestError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function shoppingExcludedOccurrenceIds(weekOverride: Record<string, unknown> | null | undefined) {
  const raw = weekOverride?.shoppingExcludedOccurrenceIds;
  return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && id.length > 0) : []);
}

export async function GET(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const url = new URL(request.url);
    const weekStart = requireDate(url.searchParams.get("weekStart"), "Week start");
    const selectedDate = requireDate(url.searchParams.get("date") ?? weekStart, "Selected date");
    const projection = await getMealPlanWeek(context.supabase, context.user.id, weekStart);
    const target = await getEffectiveNutritionTarget(context.supabase, context.user.id, selectedDate);
    let pendingChangeRequests: Array<Record<string, unknown>> = [];
    if (projection.week) {
      const result = await context.supabase
        .from("nutrition_meal_plan_change_requests")
        .select("id,week_id,base_revision,proposal_json,state,created_at")
        .eq("user_id", context.user.id)
        .eq("week_id", projection.week.id)
        .eq("state", "pending")
        .order("created_at", { ascending: true });
      if (result.error) throw result.error;
      pendingChangeRequests = (result.data ?? []) as Array<Record<string, unknown>>;
    }
    const excludedOccurrenceIds = shoppingExcludedOccurrenceIds(projection.week?.week_override_json);
    const shoppingNeeds = deriveShoppingNeeds(projection.occurrences
      .filter((item) => !excludedOccurrenceIds.has(item.id))
      .map((item) => ({
        id: item.id,
        sourceType: item.source_type,
        frozenSnapshot: item.frozen_snapshot,
      })));
    return nutritionJson({ ...projection, target, pendingChangeRequests, shoppingNeeds });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const body = object(await request.json().catch(() => ({})), "Meal Plan command");
    if (body.kind === "mutate") {
      const mutation = object(body.mutation ?? {}, "Meal Plan mutation") as MealPlanWeekMutation;
      const baseRevision = Number(body.baseRevision);
      if (!Number.isInteger(baseRevision) || baseRevision < 0) throw new NutritionRequestError("Base revision is invalid.");
      if (typeof body.operationId !== "string") throw new NutritionRequestError("Operation ID is required.");
      const result = await mutateMealPlanWeek(context.supabase, context.user.id, {
        weekId: typeof body.weekId === "string" ? body.weekId : null,
        weekStartDate: requireDate(body.weekStartDate, "Week start"),
        baseRevision,
        operationId: body.operationId,
        mutation,
      });
      return nutritionJson(result);
    }
    if (body.kind === "complete") {
      if (typeof body.occurrenceId !== "string" || typeof body.operationId !== "string") {
        throw new NutritionRequestError("Occurrence and operation IDs are required.");
      }
      const executionSnapshot = body.executionSnapshot === null || body.executionSnapshot === undefined
        ? null
        : object(body.executionSnapshot, "Execution snapshot");
      return nutritionJson(await completeMealPlanOccurrence(context.supabase, {
        occurrenceId: body.occurrenceId,
        operationId: body.operationId,
        executionSnapshot,
      }));
    }
    if (body.kind === "apply_change_request") {
      if (typeof body.changeRequestId !== "string") throw new NutritionRequestError("Change request ID is required.");
      return nutritionJson(await applyMealPlanChangeRequest(context.supabase, body.changeRequestId));
    }
    if (body.kind === "cancel_change_request") {
      if (typeof body.changeRequestId !== "string") throw new NutritionRequestError("Change request ID is required.");
      const result = await context.supabase
        .from("nutrition_meal_plan_change_requests")
        .update({ state: "cancelled", resolved_at: new Date().toISOString() })
        .eq("id", body.changeRequestId)
        .eq("user_id", context.user.id)
        .eq("state", "pending")
        .select("id,state")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new NutritionRequestError("Pending Meal Plan change request was not found.", 404);
      return nutritionJson(result.data);
    }
    throw new NutritionRequestError("Unsupported Meal Plan command.");
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
