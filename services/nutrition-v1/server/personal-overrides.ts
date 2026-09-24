import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FoodLibraryNutrition } from "@/services/nutrition-v1/server/food-library";
import { isUuid } from "@/lib/utils";

const NUTRIENT_KEYS = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "saturated_fat_g",
  "fiber_g",
  "sugars_g",
  "sodium_mg",
] as const;

type NutrientKey = typeof NUTRIENT_KEYS[number];

export type PersonalOverrideNutrition = Partial<Record<NutrientKey, number | null>>;

export type CurrentPersonalOverride = {
  foodId: string;
  hasOverride: boolean;
  revisionId: string | null;
  pointerRevision: number;
  isDeleted: boolean;
  nutritionOverride: PersonalOverrideNutrition | null;
  servingLabel: string | null;
  note: string | null;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid object.`);
  }
  return value as Record<string, unknown>;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const clean = value.trim();
  return clean || null;
}

function parseNutritionOverride(value: unknown): PersonalOverrideNutrition | null {
  if (value === null) return null;
  const raw = record(value, "Personal Override nutrition");
  const supported = new Set<string>(NUTRIENT_KEYS);
  for (const key of Object.keys(raw)) {
    if (!supported.has(key)) throw new Error(`Personal Override nutrition contains unsupported key ${key}.`);
  }

  const output: PersonalOverrideNutrition = {};
  for (const key of NUTRIENT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const nutrient = raw[key];
    if (nutrient === null) {
      output[key] = null;
      continue;
    }
    if (typeof nutrient !== "number" || !Number.isFinite(nutrient) || nutrient < 0) {
      throw new Error(`Personal Override nutrition ${key} is invalid.`);
    }
    output[key] = nutrient;
  }
  return output;
}

export async function readCurrentPersonalOverride(
  supabase: SupabaseClient,
  foodId: string,
): Promise<CurrentPersonalOverride> {
  if (!isUuid(foodId)) throw new Error("Personal Override Food must be a valid ID.");
  const result = await supabase.rpc("food_catalog_get_current_personal_override_v1", {
    p_food_id: foodId,
  });
  if (result.error) {
    throw new Error(`Personal Override could not be resolved. ${result.error.message ?? "Database request failed."}`);
  }

  const raw = record(result.data, "Personal Override read");
  if (raw.foodId !== foodId) throw new Error("Personal Override read returned the wrong Food identity.");
  if (typeof raw.hasOverride !== "boolean" || typeof raw.isDeleted !== "boolean") {
    throw new Error("Personal Override read returned invalid state flags.");
  }

  const pointerRevision = Number(raw.pointerRevision);
  if (!Number.isSafeInteger(pointerRevision) || pointerRevision < 0) {
    throw new Error("Personal Override read returned an invalid pointer revision.");
  }

  const revisionId = raw.revisionId === null ? null : String(raw.revisionId);
  if (revisionId !== null && !isUuid(revisionId)) {
    throw new Error("Personal Override read returned an invalid revision ID.");
  }

  if (!raw.hasOverride) {
    if (revisionId !== null || pointerRevision !== 0 || raw.isDeleted) {
      throw new Error("Personal Override no-pointer state is inconsistent.");
    }
  } else if (revisionId === null || pointerRevision < 1) {
    throw new Error("Personal Override pointer state is incomplete.");
  }

  return {
    foodId,
    hasOverride: raw.hasOverride,
    revisionId,
    pointerRevision,
    isDeleted: raw.isDeleted,
    nutritionOverride: parseNutritionOverride(raw.nutritionOverride ?? null),
    servingLabel: nullableText(raw.servingLabel ?? null, "Personal Override serving label"),
    note: nullableText(raw.note ?? null, "Personal Override note"),
  };
}

export function mergePersonalOverrideNutrition(
  canonical: FoodLibraryNutrition,
  override: CurrentPersonalOverride,
): FoodLibraryNutrition {
  if (!override.hasOverride || override.isDeleted || override.nutritionOverride === null) {
    return { ...canonical };
  }
  const values = override.nutritionOverride;
  return {
    calories: values.calories ?? canonical.calories,
    protein_g: values.protein_g ?? canonical.protein_g,
    carbs_g: values.carbs_g ?? canonical.carbs_g,
    fat_g: values.fat_g ?? canonical.fat_g,
    saturated_fat_g: values.saturated_fat_g ?? canonical.saturated_fat_g,
    fiber_g: values.fiber_g ?? canonical.fiber_g,
    sugars_g: values.sugars_g ?? canonical.sugars_g,
    sodium_mg: values.sodium_mg ?? canonical.sodium_mg,
    basis_amount: canonical.basis_amount,
    basis_unit: canonical.basis_unit,
  };
}
