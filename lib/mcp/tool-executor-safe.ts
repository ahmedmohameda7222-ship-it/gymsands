import { randomUUID } from "node:crypto";
import type { McpContext } from "@/lib/mcp/auth";
import { asObject, cleanDate, getArray, getOptionalNumber, getOptionalString, getString, requireConfirmation, type JsonObject } from "@/lib/mcp/schemas";
import { executeMcpTool as executeOriginalMcpTool } from "@/lib/mcp/tool-executor";
import { fail, num, ok, type DbRow, type McpToolResult } from "@/lib/mcp/tool-helpers";
import { ContextProjectionError, projectTaskContext, type ContextTask } from "@/lib/mcp/context-projections";
import { weekContainsDate } from "@/lib/nutrition-v1/week-start";
import {
  completeMealPlanOccurrence,
  deriveShoppingNeeds,
  mutateMealPlanWeek,
  type MealPlanOccurrenceMutation,
} from "@/services/nutrition-v1/server/meal-plan";

type MealKey = "breakfast" | "lunch" | "dinner" | "snack";
const mealKeys: MealKey[] = ["breakfast", "lunch", "dinner", "snack"];

function positive(value: unknown, fallback = 1) {
  const parsed = num(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("quantity must be greater than 0.");
  return parsed;
}

function nonNegative(value: unknown, field: string) {
  const parsed = num(value, 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a number >= 0.`);
  return parsed;
}

function nullableNonNegative(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a number >= 0.`);
  return parsed;
}

export function normalizeRecipeMcpDraftMutation(rawInput: unknown) {
  const input = asObject(rawInput);
  const target = String(input.target ?? "").trim();
  if (target !== "working_draft" && target !== "new_draft") {
    throw new Error("Recipe MCP writes may target only a Working Draft or create a new Draft; published Recipe versions are immutable.");
  }
  if (input.recipe_version_id !== undefined) {
    throw new Error("Recipe MCP writes cannot directly target a published Recipe version.");
  }
  const recipeId = typeof input.recipe_id === "string" && input.recipe_id.trim() ? input.recipe_id.trim() : undefined;
  if (target === "working_draft" && !recipeId) throw new Error("recipe_id is required for a Working Draft mutation.");

  const ingredients = getArray<JsonObject>(input, "ingredients").map((item) => ({
    ...(typeof item.food_id === "string" && item.food_id.trim() ? { food_id: item.food_id.trim() } : {}),
    ingredient_name: getString(item, "ingredient_name"),
    ...(item.quantity === undefined ? {} : { quantity: positive(item.quantity) }),
    ...(typeof item.unit === "string" && item.unit.trim() ? { unit: item.unit.trim() } : {}),
  }));
  const instructions = getArray<JsonObject>(input, "instructions").map((item) => ({
    instruction: getString(item, "instruction"),
    ...(Array.isArray(item.ingredient_refs) ? { ingredient_refs: item.ingredient_refs } : {}),
    ...(Array.isArray(item.equipment_refs) ? { equipment_refs: item.equipment_refs } : {}),
    ...(item.duration_seconds === undefined ? {} : { duration_seconds: nonNegative(item.duration_seconds, "duration_seconds") }),
    ...(typeof item.heat_or_temperature === "string" && item.heat_or_temperature.trim() ? { heat_or_temperature: item.heat_or_temperature.trim() } : {}),
    ...(typeof item.doneness_or_result_cue === "string" && item.doneness_or_result_cue.trim() ? { doneness_or_result_cue: item.doneness_or_result_cue.trim() } : {}),
    ...(typeof item.prep_ahead_cue === "string" && item.prep_ahead_cue.trim() ? { prep_ahead_cue: item.prep_ahead_cue.trim() } : {}),
    ...(typeof item.track_key === "string" && item.track_key.trim() ? { track_key: item.track_key.trim() } : {}),
    ...(Array.isArray(item.dependency_action_ids) ? { dependency_action_ids: item.dependency_action_ids.map(String) } : {}),
    ...(item.can_run_in_background === undefined ? {} : { can_run_in_background: Boolean(item.can_run_in_background) }),
  }));
  const equipment = getArray<JsonObject>(input, "equipment").map((item) => ({
    name: getString(item, "name"),
    ...(item.quantity === undefined ? {} : { quantity: positive(item.quantity) }),
    ...(typeof item.note === "string" && item.note.trim() ? { note: item.note.trim() } : {}),
  }));

  return {
    target: target as "working_draft" | "new_draft",
    ...(recipeId ? { recipe_id: recipeId } : {}),
    ...(typeof input.name === "string" ? { name: input.name.trim() } : {}),
    ...(input.servings === undefined ? {} : { servings: positive(input.servings) }),
    ...(input.total_cooked_weight_g === undefined ? {} : { total_cooked_weight_g: positive(input.total_cooked_weight_g) }),
    ...(input.total_time_minutes === undefined ? {} : { total_time_minutes: nonNegative(input.total_time_minutes, "total_time_minutes") }),
    ...(typeof input.notes === "string" ? { notes: input.notes.trim() } : {}),
    ingredients,
    instructions,
    equipment,
  };
}

function normalizeMealKey(value: unknown): MealKey {
  const clean = String(value ?? "").trim().toLowerCase();
  if (clean === "breakfast" || clean === "lunch" || clean === "dinner" || clean === "snack") return clean;
  if (clean === "snacks") return "snack";
  throw new Error("meal_type must be breakfast, lunch, dinner, or snack.");
}

function dbMealType(value: unknown) {
  const key = normalizeMealKey(value);
  return key === "breakfast" ? "Breakfast" : key === "lunch" ? "Lunch" : key === "dinner" ? "Dinner" : "Snack";
}

function readMacro(item: JsonObject, canonical: "protein" | "carbs" | "fat") {
  return item[canonical] ?? item[`${canonical}_g`] ?? 0;
}

function readNullableMacro(item: JsonObject, canonical: "protein" | "carbs" | "fat") {
  return item[canonical] ?? item[`${canonical}_g`] ?? null;
}

function shiftIsoDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function plannedPlaceholderMutation(input: JsonObject, position = 0): MealPlanOccurrenceMutation & { id: string } {
  const foodName = getString(input, "food_name");
  if (!foodName) throw new Error("food_name is required.");
  const servingLabel = getOptionalString(input, "serving_info") ?? getOptionalString(input, "serving_size") ?? "1 serving";
  const quantity = positive(input.quantity ?? 1);
  return {
    id: randomUUID(),
    planDate: cleanDate(input.date ?? input.plan_date ?? input.planned_date),
    mealSlotKey: dbMealType(input.meal_type),
    position,
    sourceType: "placeholder",
    sourceId: null,
    sourceVersionId: null,
    resolvedQuantity: quantity,
    resolvedServingLabel: servingLabel,
    frozenName: foodName,
    frozenSnapshot: {
      placeholder: true,
      estimatedNutrition: {
        calories: nullableNonNegative(input.calories, "calories"),
        proteinG: nullableNonNegative(readNullableMacro(input, "protein"), "protein"),
        carbsG: nullableNonNegative(readNullableMacro(input, "carbs"), "carbs"),
        fatG: nullableNonNegative(readNullableMacro(input, "fat"), "fat"),
      },
      quantity,
      servingLabel,
      note: getOptionalString(input, "notes") ?? null,
    },
    status: "planned",
  };
}

function dayMealItems(input: JsonObject): JsonObject[] {
  const date = cleanDate(input.date ?? input.plan_date ?? input.planned_date ?? "today");
  const flatMeals = getArray<JsonObject>(input, "meals");
  if (flatMeals.length) return flatMeals.map((meal) => ({ ...meal, date, meal_type: meal.meal_type ?? meal.type }));
  return mealKeys.flatMap((mealType) => getArray<JsonObject>(input, mealType).map((item) => ({ ...item, date, meal_type: mealType })));
}

function weekMealItems(input: JsonObject): JsonObject[] {
  const flatMeals = getArray<JsonObject>(input, "meals");
  if (flatMeals.length) return flatMeals.map((meal) => ({ ...meal, date: cleanDate(meal.date ?? meal.plan_date ?? input.start_date ?? "today") }));
  return getArray<JsonObject>(input, "days").flatMap((day) => {
    const date = cleanDate(day.date ?? day.plan_date ?? day.planned_date);
    const dayMeals = day.meals;
    if (dayMeals && typeof dayMeals === "object" && !Array.isArray(dayMeals)) {
      const mealObject = dayMeals as JsonObject;
      return mealKeys.flatMap((mealType) => getArray<JsonObject>(mealObject, mealType).map((item) => ({ ...item, date, meal_type: mealType })));
    }
    return getArray<JsonObject>(day, "meals").map((meal) => ({ ...meal, date, meal_type: meal.meal_type ?? meal.type }));
  });
}

async function readCanonicalWeek(ctx: McpContext, weekStartDate: string) {
  const { data, error } = await ctx.supabase
    .from("nutrition_meal_plan_weeks")
    .select("id,user_id,week_start_date,revision,week_override_json,created_at,updated_at")
    .eq("user_id", ctx.userId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbRow | null) ?? null;
}

async function readCanonicalWeekContainingDate(ctx: McpContext, date: string) {
  const { data, error } = await ctx.supabase
    .from("nutrition_meal_plan_weeks")
    .select("id,user_id,week_start_date,revision,week_override_json,created_at,updated_at")
    .eq("user_id", ctx.userId)
    .gte("week_start_date", shiftIsoDate(date, -6))
    .lte("week_start_date", date)
    .order("week_start_date", { ascending: false })
    .limit(7);
  if (error) throw new Error(error.message);
  const matches = ((data ?? []) as unknown as DbRow[]).filter((row) =>
    typeof row.week_start_date === "string" && weekContainsDate(row.week_start_date, date)
  );
  if (matches.length > 1) throw new Error("Meal Plan week authority is ambiguous for this date.");
  return matches[0] ?? null;
}

async function insertPlannedMeals(
  ctx: McpContext,
  items: JsonObject[],
  sourceTool: string,
  explicitWeekStart?: string,
): Promise<McpToolResult> {
  if (!items.length) return fail("missing_required_input", "Provide at least one planned meal item.");
  const positioned = new Map<string, number>();
  const occurrences = items.map((item) => {
    const date = cleanDate(item.date ?? item.plan_date ?? item.planned_date);
    const slot = dbMealType(item.meal_type);
    const positionKey = `${date}\u0000${slot}`;
    const position = positioned.get(positionKey) ?? 0;
    positioned.set(positionKey, position + 1);
    return plannedPlaceholderMutation({ ...item, date, meal_type: slot }, position);
  });

  const normalizedExplicitWeekStart = explicitWeekStart ? cleanDate(explicitWeekStart) : null;
  const occurrenceDate = occurrences[0]?.planDate;
  const week = normalizedExplicitWeekStart
    ? await readCanonicalWeek(ctx, normalizedExplicitWeekStart)
    : await readCanonicalWeekContainingDate(ctx, occurrenceDate);
  if (!normalizedExplicitWeekStart && !week) {
    return fail(
      "week_start_required",
      "A canonical Meal Plan week does not exist for this date. Create the week explicitly with create_week_meal_plan and start_date before adding a day plan.",
    );
  }
  const weekStartDate = normalizedExplicitWeekStart ?? String(week?.week_start_date ?? "");
  const mutationResult = await mutateMealPlanWeek(ctx.supabase, ctx.userId, {
    weekId: typeof week?.id === "string" ? week.id : null,
    weekStartDate,
    baseRevision: Number(week?.revision ?? 0),
    operationId: randomUUID(),
    mutation: { upsertOccurrences: occurrences },
  });
  const createdIds = occurrences.map((item) => item.id);
  return ok({
    ok: true,
    source_tool: sourceTool,
    week_id: mutationResult.weekId,
    revision: mutationResult.revision,
    created_count: createdIds.length,
    created_meal_plan_item_ids: createdIds,
    planned_meal_ids: createdIds,
    items: occurrences,
  });
}

function snapshotNutrition(row: DbRow) {
  const frozen = row.frozen_snapshot && typeof row.frozen_snapshot === "object" && !Array.isArray(row.frozen_snapshot)
    ? row.frozen_snapshot as JsonObject
    : {};
  const raw = frozen.estimatedNutrition ?? frozen.nutrition ?? frozen.nutritionSnapshot ?? {};
  const nutrition = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as JsonObject : {};
  return {
    calories: nutrition.calories ?? null,
    protein_g: nutrition.proteinG ?? nutrition.protein_g ?? null,
    carbs_g: nutrition.carbsG ?? nutrition.carbs_g ?? null,
    fat_g: nutrition.fatG ?? nutrition.fat_g ?? null,
  };
}

function canonicalOccurrenceAsMealItem(row: DbRow): DbRow {
  return {
    id: row.id,
    week_id: row.week_id,
    plan_date: row.plan_date,
    meal_type: row.meal_slot_key,
    food_name: row.frozen_name,
    serving_size: row.resolved_serving_label,
    quantity: row.resolved_quantity,
    ...snapshotNutrition(row),
    status: row.status,
    completed_at: row.completed_at ?? null,
    actual_log_group_id: row.actual_log_group_id ?? null,
    updated_at: row.updated_at ?? null,
    source_type: row.source_type,
    source_id: row.source_id ?? null,
    source_version_id: row.source_version_id ?? null,
  };
}

function groupMealPlanItems(items: DbRow[]) {
  return items.reduce<Record<MealKey, DbRow[]>>((grouped, item) => {
    grouped[normalizeMealKey(item.meal_type)].push(item);
    return grouped;
  }, { breakfast: [], lunch: [], dinner: [], snack: [] });
}

async function getMealPlanForDate(ctx: McpContext, dateInput: unknown) {
  const date = cleanDate(dateInput ?? "today");
  const { data, error } = await ctx.supabase
    .from("nutrition_planned_occurrences")
    .select("id,week_id,plan_date,meal_slot_key,position,source_type,source_id,source_version_id,resolved_quantity,resolved_serving_label,frozen_name,frozen_snapshot,status,completed_at,actual_log_group_id,updated_at")
    .eq("user_id", ctx.userId)
    .eq("plan_date", date)
    .order("meal_slot_key")
    .order("position")
    .order("id");
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as unknown as DbRow[]).map(canonicalOccurrenceAsMealItem);
  return ok({ ok: true, date, items, meals: groupMealPlanItems(items) });
}

async function getMealPlanForWeek(ctx: McpContext, input: JsonObject) {
  const startDate = cleanDate(input.start_date ?? "today");
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const endDate = end.toISOString().slice(0, 10);
  const { data, error } = await ctx.supabase
    .from("nutrition_planned_occurrences")
    .select("id,week_id,plan_date,meal_slot_key,position,source_type,source_id,source_version_id,resolved_quantity,resolved_serving_label,frozen_name,frozen_snapshot,status,completed_at,actual_log_group_id,updated_at")
    .eq("user_id", ctx.userId)
    .gte("plan_date", startDate)
    .lte("plan_date", endDate)
    .order("plan_date")
    .order("meal_slot_key")
    .order("position")
    .order("id");
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as unknown as DbRow[]).map(canonicalOccurrenceAsMealItem);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    return { date, meals: groupMealPlanItems(items.filter((item) => item.plan_date === date)) };
  });
  return ok({ ok: true, start_date: startDate, end_date: endDate, days });
}

async function generateShoppingList(ctx: McpContext, input: JsonObject) {
  const startDate = cleanDate(input.start_date ?? "today");
  const endDate = cleanDate(input.end_date ?? startDate);
  const { data, error } = await ctx.supabase
    .from("nutrition_planned_occurrences")
    .select("id,source_type,frozen_snapshot,plan_date,status")
    .eq("user_id", ctx.userId)
    .gte("plan_date", startDate)
    .lte("plan_date", endDate)
    .order("plan_date")
    .order("id");
  if (error) throw new Error(error.message);
  const occurrences = ((data ?? []) as unknown as DbRow[]).filter((row) => row.status !== "skipped");
  const needs = deriveShoppingNeeds(occurrences.map((row) => ({
    id: String(row.id),
    sourceType: String(row.source_type),
    frozenSnapshot: row.frozen_snapshot && typeof row.frozen_snapshot === "object" && !Array.isArray(row.frozen_snapshot)
      ? row.frozen_snapshot as JsonObject
      : {},
  })));
  return ok({
    ok: true,
    start_date: startDate,
    end_date: endDate,
    item_count: needs.length,
    shopping_list: needs.map((need) => ({
      food_id: need.foodId,
      food_name: need.name,
      quantity: need.quantity,
      unit: need.unit,
      qualifier: need.qualifier,
      source_occurrence_ids: need.sourceOccurrenceIds,
    })),
  });
}

async function createCustomMeal(ctx: McpContext, input: JsonObject) {
  const items = getArray<JsonObject>(input, "items");
  if (!items.length) return fail("missing_required_input", "Provide at least one custom meal item.");
  const { data: meal, error: mealError } = await ctx.supabase.from("saved_recipes").insert({ user_id: ctx.userId, name: getString(input, "meal_name"), saved_item_type: "meal", notes: getOptionalString(input, "notes") ?? null, is_favorite: Boolean(input.is_favorite) }).select("*").single();
  if (mealError) throw new Error(mealError.message);
  const rows = items.map((item) => ({ recipe_id: meal.id, user_id: ctx.userId, food_name: getString(item, "food_name"), serving_unit: getOptionalString(item, "serving_hint") ?? getOptionalString(item, "serving_size") ?? "serving", quantity: positive(item.quantity ?? 1), calories: nonNegative(item.calories, "calories"), protein_g: nonNegative(readMacro(item, "protein"), "protein"), carbs_g: nonNegative(readMacro(item, "carbs"), "carbs"), fat_g: nonNegative(readMacro(item, "fat"), "fat") }));
  const { data: mealItems, error: itemsError } = await ctx.supabase.from("saved_recipe_ingredients").insert(rows).select("*");
  if (itemsError) {
    await ctx.supabase.from("saved_recipes").delete().eq("id", meal.id).eq("user_id", ctx.userId);
    throw new Error(itemsError.message);
  }
  return ok({ ok: true, meal, items: mealItems ?? [] });
}

async function readOwnedOccurrence(ctx: McpContext, id: string) {
  const { data, error } = await ctx.supabase
    .from("nutrition_planned_occurrences")
    .select("id,week_id,user_id,plan_date,meal_slot_key,position,source_type,source_id,source_version_id,resolved_quantity,resolved_serving_label,frozen_name,frozen_snapshot,status,completed_at,actual_log_group_id,updated_at")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbRow | null) ?? null;
}

async function readOwnedWeekById(ctx: McpContext, weekId: string) {
  const { data, error } = await ctx.supabase
    .from("nutrition_meal_plan_weeks")
    .select("id,user_id,week_start_date,revision,week_override_json,updated_at")
    .eq("id", weekId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbRow | null) ?? null;
}

async function updateMealPlanItem(ctx: McpContext, input: JsonObject) {
  const id = getString(input, "meal_plan_item_id");
  const occurrence = await readOwnedOccurrence(ctx, id);
  if (!occurrence) throw new Error("Meal plan item not found.");
  const expectedUpdatedAt = getString(input, "expected_updated_at");
  if (String(occurrence.updated_at ?? "") !== expectedUpdatedAt) {
    return fail("version_conflict", "This meal-plan item changed after it was read. Fetch it again before updating.");
  }
  if (occurrence.source_type !== "placeholder") {
    return fail("canonical_source_requires_replacement", "Verified Food, Recipe, and Saved Meal occurrences must be replaced through their canonical source instead of rewriting frozen plan truth.");
  }
  const weekId = String(occurrence.week_id ?? "");
  const week = weekId ? await readOwnedWeekById(ctx, weekId) : null;
  if (!week) throw new Error("Meal plan week not found.");

  const frozen = occurrence.frozen_snapshot && typeof occurrence.frozen_snapshot === "object" && !Array.isArray(occurrence.frozen_snapshot)
    ? { ...(occurrence.frozen_snapshot as JsonObject) }
    : {};
  const previousNutritionRaw = frozen.estimatedNutrition;
  const previousNutrition = previousNutritionRaw && typeof previousNutritionRaw === "object" && !Array.isArray(previousNutritionRaw)
    ? previousNutritionRaw as JsonObject
    : {};
  const estimatedNutrition = {
    calories: input.calories === undefined ? previousNutrition.calories ?? null : nullableNonNegative(input.calories, "calories"),
    proteinG: input.protein === undefined && input.protein_g === undefined ? previousNutrition.proteinG ?? previousNutrition.protein_g ?? null : nullableNonNegative(readNullableMacro(input, "protein"), "protein"),
    carbsG: input.carbs === undefined && input.carbs_g === undefined ? previousNutrition.carbsG ?? previousNutrition.carbs_g ?? null : nullableNonNegative(readNullableMacro(input, "carbs"), "carbs"),
    fatG: input.fat === undefined && input.fat_g === undefined ? previousNutrition.fatG ?? previousNutrition.fat_g ?? null : nullableNonNegative(readNullableMacro(input, "fat"), "fat"),
  };
  const servingLabel = input.serving_info === undefined && input.serving_size === undefined
    ? typeof occurrence.resolved_serving_label === "string" ? occurrence.resolved_serving_label : null
    : getOptionalString(input, "serving_info") ?? getOptionalString(input, "serving_size") ?? null;
  const quantity = input.quantity === undefined ? Number(occurrence.resolved_quantity ?? 1) : positive(input.quantity);
  const mutation: MealPlanOccurrenceMutation = {
    id,
    planDate: input.date ?? input.plan_date ?? input.planned_date ? cleanDate(input.date ?? input.plan_date ?? input.planned_date) : String(occurrence.plan_date),
    mealSlotKey: input.meal_type === undefined ? String(occurrence.meal_slot_key) : dbMealType(input.meal_type),
    position: Number(occurrence.position ?? 0),
    sourceType: "placeholder",
    sourceId: null,
    sourceVersionId: null,
    resolvedQuantity: quantity,
    resolvedServingLabel: servingLabel,
    frozenName: input.food_name === undefined ? String(occurrence.frozen_name) : getString(input, "food_name"),
    frozenSnapshot: {
      ...frozen,
      placeholder: true,
      estimatedNutrition,
      quantity,
      servingLabel,
      note: input.notes === undefined ? frozen.note ?? null : getOptionalString(input, "notes") ?? null,
    },
    status: occurrence.status === "skipped" ? "skipped" : "planned",
  };
  const result = await mutateMealPlanWeek(ctx.supabase, ctx.userId, {
    weekId,
    weekStartDate: String(week.week_start_date),
    baseRevision: Number(week.revision ?? 0),
    operationId: randomUUID(),
    mutation: { upsertOccurrences: [mutation] },
  });
  return ok({ ok: true, item: canonicalOccurrenceAsMealItem({ ...occurrence, ...{
    plan_date: mutation.planDate,
    meal_slot_key: mutation.mealSlotKey,
    resolved_quantity: mutation.resolvedQuantity,
    resolved_serving_label: mutation.resolvedServingLabel,
    frozen_name: mutation.frozenName,
    frozen_snapshot: mutation.frozenSnapshot,
    status: mutation.status,
  } }), revision: result.revision });
}

async function deleteMealPlanItem(ctx: McpContext, input: JsonObject) {
  const confirmation = requireConfirmation(input);
  if (confirmation) return ok(confirmation);
  const id = getString(input, "meal_plan_item_id");
  const occurrence = await readOwnedOccurrence(ctx, id);
  if (!occurrence) throw new Error("Meal plan item not found.");
  if (occurrence.status === "completed" || occurrence.status === "completed_changed" || occurrence.actual_log_group_id) {
    return fail("completed_plan_history_retained", "Completed plan history cannot be destructively deleted through this tool.");
  }
  const weekId = String(occurrence.week_id ?? "");
  const week = weekId ? await readOwnedWeekById(ctx, weekId) : null;
  if (!week) throw new Error("Meal plan week not found.");
  const result = await mutateMealPlanWeek(ctx.supabase, ctx.userId, {
    weekId,
    weekStartDate: String(week.week_start_date),
    baseRevision: Number(week.revision ?? 0),
    operationId: randomUUID(),
    mutation: { deleteOccurrenceIds: [id] },
  });
  return ok({ ok: true, deleted_meal_plan_item_id: id, kept_linked_food_log: false, revision: result.revision });
}

async function markMealPlanItemDone(ctx: McpContext, input: JsonObject) {
  const id = getString(input, "meal_plan_item_id");
  const occurrence = await readOwnedOccurrence(ctx, id);
  if (!occurrence) throw new Error("Meal plan item not found.");
  if (occurrence.source_type === "placeholder") {
    return fail("placeholder_requires_confirmation", "Placeholder plan items require user confirmation or replacement with a canonical Food, Recipe, or Saved Meal before actual logging.");
  }
  const result = await completeMealPlanOccurrence(ctx.supabase, {
    occurrenceId: id,
    operationId: randomUUID(),
    executionSnapshot: null,
  });
  return ok({ ok: true, occurrence: result });
}

async function addSleepRecoveryLog(ctx: McpContext, input: JsonObject) {
  const { data, error } = await ctx.supabase.from("sleep_recovery_logs").insert({
    user_id: ctx.userId,
    log_date: cleanDate(input.date ?? input.log_date ?? "today"),
    hours_slept: getOptionalNumber(input, "hours_slept") ?? null,
    sleep_quality: getOptionalString(input, "sleep_quality") ?? null,
    recovery_level: getOptionalString(input, "recovery_level") ?? null,
    fatigue_level: getOptionalString(input, "fatigue_level") ?? null,
    soreness_level: getOptionalString(input, "soreness_level") ?? null,
    stress_level: getOptionalString(input, "stress_level") ?? null,
    notes: getOptionalString(input, "notes") ?? null
  }).select("*").single();
  if (error) throw new Error(error.message);
  return ok({ ok: true, log: data, guidance: "General fitness tracking only. Do not treat this as medical advice." });
}

async function getSafeActivePlan(ctx: McpContext) {
  const { data, error } = await ctx.supabase
    .from("user_workout_plans")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbRow | null) ?? null;
}

async function getOwnedPlanDay(ctx: McpContext, dayId: string, expectedPlanId?: string) {
  const dayResult = await ctx.supabase
    .from("user_workout_plan_days")
    .select("*")
    .eq("id", dayId)
    .limit(1)
    .maybeSingle();
  if (dayResult.error) throw new Error(dayResult.error.message);
  const day = (dayResult.data as DbRow | null) ?? null;
  if (!day?.plan_id) return null;

  const planId = String(day.plan_id);
  if (expectedPlanId && planId !== expectedPlanId) return null;
  const planResult = await ctx.supabase
    .from("user_workout_plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", ctx.userId)
    .limit(1)
    .maybeSingle();
  if (planResult.error) throw new Error(planResult.error.message);
  return planResult.data ? day : null;
}

async function getSafeTodayWorkout(ctx: McpContext, date: string) {
  const activePlan = await getSafeActivePlan(ctx);
  let request = ctx.supabase
    .from("user_workout_sessions")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("scheduled_date", date)
    .order("session_number", { ascending: true })
    .limit(1);
  if (activePlan?.id) request = request.eq("user_workout_plan_id", String(activePlan.id));
  const { data, error } = await request.maybeSingle();
  if (error) throw new Error(error.message);
  const workout = (data as DbRow | null) ?? null;
  let workoutDay: DbRow | null = null;
  let exercises: unknown[] = [];
  if (workout?.plan_day_id) {
    const expectedPlanId = activePlan?.id
      ? String(activePlan.id)
      : typeof workout.user_workout_plan_id === "string"
        ? workout.user_workout_plan_id
        : undefined;
    workoutDay = await getOwnedPlanDay(ctx, String(workout.plan_day_id), expectedPlanId);
    if (workoutDay?.id) {
      const exerciseResult = await ctx.supabase
        .from("user_workout_plan_exercises")
        .select("*")
        .eq("plan_day_id", String(workoutDay.id))
        .order("sort_order", { ascending: true });
      if (exerciseResult.error) throw new Error(exerciseResult.error.message);
      exercises = exerciseResult.data ?? [];
    }
  }
  return { active_plan: activePlan, workout, workout_day: workoutDay, exercises };
}

export async function executeMcpTool(ctx: McpContext, toolName: string, rawInput: unknown): Promise<McpToolResult> {
  const input = asObject(rawInput);
  const contextTaskByTool: Partial<Record<string, ContextTask>> = {
    get_training_planning_context: "training_planning",
    get_nutrition_planning_context: "nutrition_planning",
    get_daily_execution_context: "daily_execution",
    get_progress_context: "progress_review",
    get_workout_adjustment_context: "workout_adjustment"
  };
  const contextTask = contextTaskByTool[toolName];
  if (contextTask) {
    try {
      const projection = await projectTaskContext({ supabase: ctx.supabase, userId: ctx.userId, scopes: ctx.scopes, task: contextTask, input });
      return ok(projection as unknown as Record<string, unknown>);
    } catch (error) {
      if (error instanceof ContextProjectionError) return fail(error.code, error.message);
      throw error;
    }
  }

  if (toolName === "create_day_meal_plan") return insertPlannedMeals(ctx, dayMealItems(input), toolName);
  if (toolName === "create_week_meal_plan") return insertPlannedMeals(ctx, weekMealItems(input), toolName, cleanDate(input.start_date ?? "today"));
  if (toolName === "get_meal_plan_for_date") return getMealPlanForDate(ctx, input.date ?? input.plan_date ?? input.planned_date ?? "today");
  if (toolName === "get_meal_plan_for_week") return getMealPlanForWeek(ctx, input);
  if (toolName === "generate_shopping_list") return generateShoppingList(ctx, input);
  if (toolName === "update_meal_plan_item") return updateMealPlanItem(ctx, input);
  if (toolName === "delete_meal_plan_item") return deleteMealPlanItem(ctx, input);
  if (toolName === "mark_meal_plan_item_done") return markMealPlanItemDone(ctx, input);
  if (toolName === "create_custom_meal") return createCustomMeal(ctx, input);
  if (toolName === "add_sleep_recovery_log") return addSleepRecoveryLog(ctx, input);
  if (toolName === "get_today_workout") {
    const date = cleanDate(input.date ?? "today");
    return ok({ ok: true, date, ...(await getSafeTodayWorkout(ctx, date)) });
  }
  return executeOriginalMcpTool(ctx, toolName, rawInput);
}

export type { McpToolResult };