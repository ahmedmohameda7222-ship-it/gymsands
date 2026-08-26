import type { SupabaseClient } from "@supabase/supabase-js";

import { isIsoDate } from "@/lib/date-utils";
import { isUuid } from "@/lib/utils";
import type { NutritionTargetValues } from "@/lib/nutrition-v1/targets";
import { NutritionRequestError } from "@/services/nutrition-v1/server/errors";
import { getEffectiveNutritionTarget } from "@/services/nutrition-v1/server/targets";

export type DiaryNutritionFacts = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type DiaryLogItem = {
  foodName: string;
  servingLabel: string;
  quantity: number;
  nutrition: DiaryNutritionFacts;
  foodItemId?: string | null;
  userFoodItemId?: string | null;
  notes?: string | null;
  source?: unknown;
  [key: string]: unknown;
};

export type LogMealSource =
  | { type: "food"; id?: string | null; frozenSnapshot: Record<string, unknown> }
  | { type: "recipe"; id: string; versionId: string; frozenSnapshot: Record<string, unknown> }
  | { type: "saved_meal"; id: string; frozenSnapshot: Record<string, unknown> }
  | { type: "quick_add"; frozenSnapshot: Record<string, unknown> }
  | { type: "planned_occurrence"; id: string; frozenSnapshot: Record<string, unknown> };

export type LogMealCommand = {
  operationId: string;
  date: string;
  meal: string;
  source: LogMealSource;
  items: DiaryLogItem[];
  plannedOccurrenceId?: string | null;
};

export type DiaryActualLog = {
  id: string;
  mealType: string;
  foodName: string;
  servingLabel: string;
  quantity: number;
  nutrition: DiaryNutritionFacts;
  notes: string | null;
  foodItemId: string | null;
  userFoodItemId: string | null;
  createdAt: string | null;
};

export type DiaryWaterLog = {
  id: string;
  amountMl: number;
  createdAt: string | null;
};

export type DiaryPlannedOccurrence = {
  id: string;
  mealType: string;
  name: string;
  status: "planned" | "completed" | "completed_changed" | "skipped";
  sourceType: string;
  frozenSnapshot: Record<string, unknown>;
};

export type DiarySavedMealChoice = {
  id: string;
  name: string;
  bundle: {
    saved_meal_id: string;
    frozen_name: string;
    items: Record<string, unknown>[];
  };
};

export type DiaryDomain<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable"; data: null; message: string };

export type DiaryProjection = {
  date: string;
  position: ReturnType<typeof deriveDiaryNutritionPosition>;
  domains: {
    actual: DiaryDomain<{ logs: DiaryActualLog[]; nutrition: DiaryNutritionFacts }>;
    target: DiaryDomain<Awaited<ReturnType<typeof getEffectiveNutritionTarget>>>;
    hydration: DiaryDomain<{ logs: DiaryWaterLog[]; totalMl: number }>;
    planned: DiaryDomain<DiaryPlannedOccurrence[]>;
    savedMeals: DiaryDomain<DiarySavedMealChoice[]>;
  };
};

type DbError = { message?: string } | null;

type RpcResult = { data: unknown; error: DbError };

const emptyUnknownFacts = (): DiaryNutritionFacts => ({
  caloriesKcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
});

function publicDbError(action: string, error: DbError) {
  return new Error(`${action} ${error?.message?.trim() || "Database request failed."}`);
}

function requiredText(value: unknown, label: string, maxLength = 160) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new NutritionRequestError(`${label} is required.`);
  if (text.length > maxLength) throw new NutritionRequestError(`${label} is too long.`);
  return text;
}

function requiredId(value: unknown, label: string) {
  const text = requiredText(value, label, 80);
  if (!isUuid(text)) throw new NutritionRequestError(`${label} must be a valid ID.`);
  return text;
}

function optionalId(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  return requiredId(value, label);
}

function requireDate(value: unknown) {
  const date = requiredText(value, "Diary date", 10);
  if (!isIsoDate(date)) throw new NutritionRequestError("Diary date must use YYYY-MM-DD.");
  return date;
}

function record(value: unknown, label = "Frozen snapshot") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NutritionRequestError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nullableNutrition(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new NutritionRequestError(`${label} must be a non-negative number or unknown.`);
  }
  return number;
}

function positive(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new NutritionRequestError(`${label} must be greater than zero.`);
  }
  return number;
}

function validateFacts(value: DiaryNutritionFacts) {
  nullableNutrition(value.caloriesKcal, "Calories");
  nullableNutrition(value.proteinG, "Protein");
  nullableNutrition(value.carbsG, "Carbohydrates");
  nullableNutrition(value.fatG, "Fat");
  return value;
}

function normalizeSource(source: LogMealSource) {
  if (!source || typeof source !== "object") throw new NutritionRequestError("Log source is required.");
  const frozenSnapshot = record(source.frozenSnapshot);
  if (source.type === "recipe") {
    return { type: source.type, id: requiredId(source.id, "Recipe"), versionId: requiredId(source.versionId, "Recipe version"), frozenSnapshot } as const;
  }
  if (source.type === "saved_meal") {
    return { type: source.type, id: requiredId(source.id, "Saved Meal"), versionId: null, frozenSnapshot } as const;
  }
  if (source.type === "planned_occurrence") {
    return { type: source.type, id: requiredId(source.id, "Planned occurrence"), versionId: null, frozenSnapshot } as const;
  }
  if (source.type === "food") {
    return { type: source.type, id: optionalId(source.id, "Food"), versionId: null, frozenSnapshot } as const;
  }
  if (source.type === "quick_add") {
    return { type: source.type, id: null, versionId: null, frozenSnapshot } as const;
  }
  throw new NutritionRequestError("Unsupported Diary source.");
}

function validateItems(items: DiaryLogItem[]) {
  if (!Array.isArray(items) || !items.length) throw new NutritionRequestError("At least one Plate item is required.");
  if (items.length > 100) throw new NutritionRequestError("A Plate cannot contain more than 100 items.");
  for (const item of items) {
    if (!item || typeof item !== "object") throw new NutritionRequestError("Plate items are invalid.");
    requiredText(item.foodName, "Food name", 300);
    requiredText(item.servingLabel, "Serving label", 120);
    positive(item.quantity, "Quantity");
    validateFacts(item.nutrition);
    optionalId(item.foodItemId, "Food");
    optionalId(item.userFoodItemId, "Personal Food");
  }
  return items;
}

function targetFacts(target: NutritionTargetValues | null): DiaryNutritionFacts {
  if (!target) return emptyUnknownFacts();
  return {
    caloriesKcal: target.calories,
    proteinG: target.protein_g,
    carbsG: target.carbs_g,
    fatG: target.fat_g,
  };
}

function difference(target: number | null, actual: number | null) {
  return target === null || actual === null ? null : target - actual;
}

export function deriveDiaryNutritionPosition(
  actual: DiaryNutritionFacts,
  target: NutritionTargetValues | null,
) {
  validateFacts(actual);
  const normalizedTarget = targetFacts(target);
  return {
    actual: { ...actual },
    target: normalizedTarget,
    remaining: {
      caloriesKcal: difference(normalizedTarget.caloriesKcal, actual.caloriesKcal),
      proteinG: difference(normalizedTarget.proteinG, actual.proteinG),
      carbsG: difference(normalizedTarget.carbsG, actual.carbsG),
      fatG: difference(normalizedTarget.fatG, actual.fatG),
    } satisfies DiaryNutritionFacts,
  };
}

export async function logDiaryMeal(
  supabase: SupabaseClient,
  command: LogMealCommand,
) {
  const operationId = requiredId(command.operationId, "Operation ID");
  const date = requireDate(command.date);
  const meal = requiredText(command.meal, "Meal", 80);
  const source = normalizeSource(command.source);
  const items = validateItems(command.items);
  const plannedOccurrenceId = optionalId(command.plannedOccurrenceId, "Planned occurrence");

  const result = await supabase.rpc("log_nutrition_group", {
    p_operation_id: operationId,
    p_log_date: date,
    p_meal_type: meal,
    p_source_type: source.type,
    p_source_id: source.id,
    p_source_version_id: source.type === "recipe" ? source.versionId : null,
    p_frozen_snapshot: source.frozenSnapshot,
    p_items: items,
    p_planned_occurrence_id: plannedOccurrenceId,
  });
  const { data, error } = result as unknown as RpcResult;
  if (error) throw publicDbError("Diary meal could not be logged.", error);
  if (!data || typeof data !== "object") throw new Error("Diary logging returned an invalid result.");
  return data as { group: Record<string, unknown>; alreadyLogged: boolean };
}

export async function completeDiaryPlannedOccurrence(
  supabase: SupabaseClient,
  input: { occurrenceId: string; operationId: string; executionSnapshot?: Record<string, unknown> | null },
) {
  const occurrenceId = requiredId(input.occurrenceId, "Planned occurrence");
  const operationId = requiredId(input.operationId, "Operation ID");
  const executionSnapshot = input.executionSnapshot == null ? null : record(input.executionSnapshot, "Execution snapshot");
  const result = await supabase.rpc("complete_nutrition_planned_occurrence", {
    p_occurrence_id: occurrenceId,
    p_operation_id: operationId,
    p_execution_snapshot: executionSnapshot,
  });
  const { data, error } = result as unknown as RpcResult;
  if (error) throw publicDbError("Planned meal could not be completed.", error);
  if (!data || typeof data !== "object") throw new Error("Planned meal completion returned an invalid result.");
  return data as { occurrence: Record<string, unknown>; alreadyCompleted: boolean };
}

export async function addDiaryWater(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  amountMl: number,
) {
  const owner = requiredId(userId, "Owner");
  const logDate = requireDate(date);
  const amount = Math.round(positive(amountMl, "Water amount"));
  const result = await supabase
    .from("water_logs")
    .insert({ user_id: owner, log_date: logDate, amount_ml: amount })
    .select("id,amount_ml,created_at")
    .single();
  if (result.error || !result.data) throw publicDbError("Water could not be logged.", result.error);
  return result.data;
}

function rawNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function rawText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sumActualNutrition(logs: DiaryActualLog[]): DiaryNutritionFacts {
  if (!logs.length) return { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const keys = ["caloriesKcal", "proteinG", "carbsG", "fatG"] as const;
  const output = emptyUnknownFacts();
  for (const key of keys) {
    if (logs.some((log) => log.nutrition[key] === null)) {
      output[key] = null;
    } else {
      output[key] = logs.reduce((total, log) => total + (log.nutrition[key] as number), 0);
    }
  }
  return output;
}

async function readActual(supabase: SupabaseClient, userId: string, date: string) {
  const result = await supabase
    .from("food_logs")
    .select("id,meal_type,food_name,serving_size,quantity,calories,protein_g,carbs_g,fat_g,notes,food_item_id,user_food_item_id,created_at")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (result.error) throw publicDbError("Diary actual intake could not be loaded.", result.error);
  const logs = (result.data ?? []).map((raw) => {
    const row = rawRecord(raw);
    return {
      id: String(row.id ?? ""),
      mealType: rawText(row.meal_type) ?? "Other",
      foodName: rawText(row.food_name) ?? "Food",
      servingLabel: rawText(row.serving_size) ?? "Serving",
      quantity: rawNumber(row.quantity) ?? 1,
      nutrition: {
        caloriesKcal: rawNumber(row.calories),
        proteinG: rawNumber(row.protein_g),
        carbsG: rawNumber(row.carbs_g),
        fatG: rawNumber(row.fat_g),
      },
      notes: rawText(row.notes),
      foodItemId: rawText(row.food_item_id),
      userFoodItemId: rawText(row.user_food_item_id),
      createdAt: rawText(row.created_at),
    } satisfies DiaryActualLog;
  });
  return { logs, nutrition: sumActualNutrition(logs) };
}

async function readHydration(supabase: SupabaseClient, userId: string, date: string) {
  const result = await supabase
    .from("water_logs")
    .select("id,amount_ml,created_at")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (result.error) throw publicDbError("Diary hydration could not be loaded.", result.error);
  const logs = (result.data ?? []).map((raw) => {
    const row = rawRecord(raw);
    return {
      id: String(row.id ?? ""),
      amountMl: rawNumber(row.amount_ml) ?? 0,
      createdAt: rawText(row.created_at),
    } satisfies DiaryWaterLog;
  });
  return { logs, totalMl: logs.reduce((total, log) => total + log.amountMl, 0) };
}

async function readPlanned(supabase: SupabaseClient, userId: string, date: string) {
  const result = await supabase
    .from("nutrition_planned_occurrences")
    .select("id,meal_slot_key,frozen_name,status,source_type,frozen_snapshot,position")
    .eq("user_id", userId)
    .eq("plan_date", date)
    .order("meal_slot_key", { ascending: true })
    .order("position", { ascending: true });
  if (result.error) throw publicDbError("Diary planned context could not be loaded.", result.error);
  return (result.data ?? []).map((raw) => {
    const row = rawRecord(raw);
    const status = row.status === "completed" || row.status === "completed_changed" || row.status === "skipped" ? row.status : "planned";
    return {
      id: String(row.id ?? ""),
      mealType: rawText(row.meal_slot_key) ?? "Meal",
      name: rawText(row.frozen_name) ?? "Planned item",
      status,
      sourceType: rawText(row.source_type) ?? "placeholder",
      frozenSnapshot: rawRecord(row.frozen_snapshot),
    } satisfies DiaryPlannedOccurrence;
  });
}

async function readSavedMeals(supabase: SupabaseClient, userId: string): Promise<DiarySavedMealChoice[]> {
  const rootsResult = await supabase
    .from("nutrition_saved_meals")
    .select("id,name,updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (rootsResult.error) throw publicDbError("Saved Meals could not be loaded.", rootsResult.error);
  const roots = (rootsResult.data ?? []).map((raw) => rawRecord(raw));
  const ids = roots.map((row) => String(row.id ?? "")).filter(Boolean);
  if (!ids.length) return [];
  const itemsResult = await supabase
    .from("nutrition_saved_meal_items")
    .select("saved_meal_id,position,frozen_snapshot")
    .eq("user_id", userId)
    .in("saved_meal_id", ids)
    .order("position", { ascending: true });
  if (itemsResult.error) throw publicDbError("Saved Meal items could not be loaded.", itemsResult.error);
  const byMeal = new Map<string, Record<string, unknown>[]>();
  for (const raw of itemsResult.data ?? []) {
    const row = rawRecord(raw);
    const id = rawText(row.saved_meal_id);
    if (!id) continue;
    byMeal.set(id, [...(byMeal.get(id) ?? []), rawRecord(row.frozen_snapshot)]);
  }
  return roots.map((row) => {
    const id = String(row.id ?? "");
    const name = rawText(row.name) ?? "Saved Meal";
    return {
      id,
      name,
      bundle: { saved_meal_id: id, frozen_name: name, items: byMeal.get(id) ?? [] },
    };
  });
}

async function domain<T>(reader: () => Promise<T>): Promise<DiaryDomain<T>> {
  try {
    return { status: "ready", data: await reader() };
  } catch (error) {
    return {
      status: "unavailable",
      data: null,
      message: error instanceof Error ? error.message : "Nutrition data is temporarily unavailable.",
    };
  }
}

export async function getDiaryProjection(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<DiaryProjection> {
  const owner = requiredId(userId, "Owner");
  const logDate = requireDate(date);
  const [actual, target, hydration, planned, savedMeals] = await Promise.all([
    domain(() => readActual(supabase, owner, logDate)),
    domain(() => getEffectiveNutritionTarget(supabase, owner, logDate)),
    domain(() => readHydration(supabase, owner, logDate)),
    domain(() => readPlanned(supabase, owner, logDate)),
    domain(() => readSavedMeals(supabase, owner)),
  ]);
  const actualFacts = actual.status === "ready" ? actual.data.nutrition : emptyUnknownFacts();
  const targetValues = target.status === "ready" && target.data.available ? target.data.values : null;
  return {
    date: logDate,
    position: deriveDiaryNutritionPosition(actualFacts, targetValues),
    domains: { actual, target, hydration, planned, savedMeals },
  };
}
