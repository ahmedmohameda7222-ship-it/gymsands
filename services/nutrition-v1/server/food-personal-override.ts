import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "@/lib/utils";

export const FOOD_PERSONAL_OVERRIDE_NUTRIENT_KEYS = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "saturated_fat_g",
  "fiber_g",
  "sugars_g",
  "sodium_mg",
] as const;

export type FoodPersonalOverrideNutrientKey = typeof FOOD_PERSONAL_OVERRIDE_NUTRIENT_KEYS[number];
export type FoodPersonalNutritionOverride = Partial<Record<FoodPersonalOverrideNutrientKey, number | null>>;

export type CurrentFoodPersonalOverride = {
  foodId: string;
  hasOverride: boolean;
  revisionId: string | null;
  pointerRevision: number;
  isDeleted: boolean;
  nutritionOverride: FoodPersonalNutritionOverride | null;
  servingLabel: string | null;
  note: string | null;
};

function record(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " returned an invalid record.");
  }
  return value as Record<string, unknown>;
}

function nullableText(value: unknown, label: string) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(label + " is invalid.");
  const text = value.trim();
  return text || null;
}

function parseNutritionOverride(value: unknown): FoodPersonalNutritionOverride | null {
  if (value === null || value === undefined) return null;
  const row = record(value, "Personal Override nutrition");
  const allowed = new Set<string>(FOOD_PERSONAL_OVERRIDE_NUTRIENT_KEYS);
  const result: FoodPersonalNutritionOverride = {};
  for (const [key, raw] of Object.entries(row)) {
    if (!allowed.has(key)) throw new Error("Personal Override nutrition contains an unsupported nutrient.");
    if (raw === null) {
      result[key as FoodPersonalOverrideNutrientKey] = null;
      continue;
    }
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      throw new Error("Personal Override nutrition contains an invalid nutrient value.");
    }
    result[key as FoodPersonalOverrideNutrientKey] = raw;
  }
  return result;
}

export async function getCurrentFoodPersonalOverride(
  supabase: SupabaseClient,
  foodId: string,
): Promise<CurrentFoodPersonalOverride> {
  if (!isUuid(foodId)) throw new Error("Personal Override Food must be a valid ID.");
  const result = await supabase.rpc("food_catalog_get_current_personal_override_v1", {
    p_food_id: foodId,
  });
  if (result.error) {
    throw new Error(
      "Personal Override could not be resolved. " + (result.error.message ?? "Database request failed."),
    );
  }

  const row = record(result.data, "Personal Override authority");
  if (row.foodId !== foodId) throw new Error("Personal Override authority returned the wrong Food.");
  if (typeof row.hasOverride !== "boolean") throw new Error("Personal Override authority is malformed.");
  if (!Number.isInteger(row.pointerRevision) || Number(row.pointerRevision) < 0) {
    throw new Error("Personal Override pointer revision is malformed.");
  }
  if (typeof row.isDeleted !== "boolean") throw new Error("Personal Override tombstone state is malformed.");

  let revisionId: string | null = null;
  if (row.revisionId !== null) {
    if (typeof row.revisionId !== "string" || !isUuid(row.revisionId)) {
      throw new Error("Personal Override revision identity is malformed.");
    }
    revisionId = row.revisionId;
  }

  const pointerRevision = Number(row.pointerRevision);
  if (!row.hasOverride) {
    if (revisionId !== null || pointerRevision !== 0) {
      throw new Error("Personal Override empty pointer state is malformed.");
    }
  } else if (revisionId === null || pointerRevision <= 0) {
    throw new Error("Personal Override current pointer state is malformed.");
  }

  return {
    foodId,
    hasOverride: row.hasOverride,
    revisionId,
    pointerRevision,
    isDeleted: row.isDeleted,
    nutritionOverride: parseNutritionOverride(row.nutritionOverride),
    servingLabel: nullableText(row.servingLabel, "Personal Override serving label"),
    note: nullableText(row.note, "Personal Override note"),
  };
}
