import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealFoodItemSnapshot } from "@/lib/nutrition-v1/contracts";
import { isUuid } from "@/lib/utils";
import {
  resolveEffectiveFoodNutrition,
  type FoodLibraryCorrection,
  type FoodLibraryNutrition,
  type FoodLibrarySource,
} from "@/services/nutrition-v1/server/food-library";

export type FoodHandoffInput = {
  foodId: string;
  source: FoodLibrarySource;
  quantity: number;
  serving: string;
};

export type ResolvedFoodHandoff = {
  foodId: string;
  source: FoodLibrarySource;
  name: string;
  serving: string;
  quantity: number;
  frozenNutrition: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
  };
  frozenSourceSnapshot: Record<string, unknown>;
  diaryItem: {
    foodName: string;
    servingLabel: string;
    quantity: number;
    nutrition: { caloriesKcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };
    foodItemId: string | null;
    userFoodItemId: string | null;
  };
  savedMealItem: SavedMealFoodItemSnapshot;
  recipeIngredient: {
    food_id: string;
    ingredient_name: string;
    quantity: number;
    unit: string;
    frozen_nutrition: ResolvedFoodHandoff["frozenNutrition"];
  };
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function positive(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

function requiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function scale(value: number | null, quantity: number) {
  return value === null ? null : Math.round(value * quantity * 1000) / 1000;
}

function nutritionFromCatalog(row: Record<string, unknown>): FoodLibraryNutrition {
  return {
    calories: numberOrNull(row.calories),
    protein_g: numberOrNull(row.protein_g),
    carbs_g: numberOrNull(row.carbs_g),
    fat_g: numberOrNull(row.fat_g),
    saturated_fat_g: numberOrNull(row.saturated_fat_g),
    fiber_g: numberOrNull(row.fiber_g),
    sugars_g: numberOrNull(row.sugars_g),
    sodium_mg: numberOrNull(row.sodium_mg),
    basis_amount: numberOrNull(row.nutrition_basis_amount),
    basis_unit: typeof row.nutrition_basis_unit === "string" ? row.nutrition_basis_unit as FoodLibraryNutrition["basis_unit"] : null,
  };
}

function correctionFromRow(row: Record<string, unknown>): FoodLibraryCorrection {
  return {
    calories: numberOrNull(row.calories),
    protein_g: numberOrNull(row.protein_g),
    carbs_g: numberOrNull(row.carbs_g),
    fat_g: numberOrNull(row.fat_g),
    saturated_fat_g: numberOrNull(row.saturated_fat_g),
    fiber_g: numberOrNull(row.fiber_g),
    sugars_g: numberOrNull(row.sugars_g),
    sodium_mg: numberOrNull(row.sodium_mg),
    basis_amount: numberOrNull(row.basis_amount),
    basis_unit: typeof row.basis_unit === "string" ? row.basis_unit as FoodLibraryCorrection["basis_unit"] : null,
  };
}

async function resolveCatalogRow(supabase: SupabaseClient, initialFoodId: string) {
  let foodId = initialFoodId;
  for (let depth = 0; depth < 8; depth += 1) {
    const result = await supabase
      .from("food_items")
      .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,saturated_fat_g,fiber_g,sugars_g,sodium_mg,nutrition_basis_amount,nutrition_basis_unit,lifecycle_status,merged_into_food_id")
      .eq("id", foodId)
      .maybeSingle();
    if (result.error) throw new Error(`Food could not be resolved. ${result.error.message ?? "Database request failed."}`);
    if (!result.data) throw new Error("Food is unavailable.");
    const row = record(result.data);
    const status = String(row.lifecycle_status ?? "active");
    const mergedInto = typeof row.merged_into_food_id === "string" ? row.merged_into_food_id : null;
    if (status === "merged" && mergedInto && isUuid(mergedInto)) {
      foodId = mergedInto;
      continue;
    }
    if (status !== "active") throw new Error("Food is unavailable for new Nutrition writes.");
    return { foodId, row };
  }
  throw new Error("Food merge lineage could not be resolved safely.");
}

export async function resolveFoodHandoff(
  supabase: SupabaseClient,
  userId: string,
  input: FoodHandoffInput,
): Promise<ResolvedFoodHandoff> {
  if (!isUuid(userId)) throw new Error("Owner must be a valid ID.");
  if (!isUuid(input.foodId)) throw new Error("Food must be a valid ID.");
  if (input.source !== "catalog" && input.source !== "my_food") throw new Error("Food source is invalid.");
  const quantity = positive(input.quantity, "Food quantity");
  const requestedServing = requiredText(input.serving, "Food serving");

  let foodId = input.foodId;
  let row: Record<string, unknown>;
  let canonicalNutrition: FoodLibraryNutrition;
  let effectiveNutrition: FoodLibraryNutrition;

  if (input.source === "catalog") {
    const resolved = await resolveCatalogRow(supabase, input.foodId);
    foodId = resolved.foodId;
    row = resolved.row;
    canonicalNutrition = nutritionFromCatalog(row);
    const correctionResult = await supabase
      .from("food_personal_corrections")
      .select("calories,protein_g,carbs_g,fat_g,saturated_fat_g,fiber_g,sugars_g,sodium_mg,basis_amount,basis_unit")
      .eq("user_id", userId)
      .eq("food_id", foodId)
      .eq("is_active", true)
      .maybeSingle();
    if (correctionResult.error) throw new Error(`Personal Food correction could not be resolved. ${correctionResult.error.message ?? "Database request failed."}`);
    const correction = correctionResult.data ? correctionFromRow(record(correctionResult.data)) : null;
    effectiveNutrition = resolveEffectiveFoodNutrition(canonicalNutrition, correction);
  } else {
    const result = await supabase
      .from("user_food_items")
      .select("id,user_id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,nutrition_basis_amount,nutrition_basis_unit,deleted_at")
      .eq("id", foodId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (result.error) throw new Error(`Personal Food could not be resolved. ${result.error.message ?? "Database request failed."}`);
    if (!result.data) throw new Error("Personal Food is unavailable.");
    row = record(result.data);
    canonicalNutrition = {
      calories: numberOrNull(row.calories),
      protein_g: numberOrNull(row.protein_g),
      carbs_g: numberOrNull(row.carbs_g),
      fat_g: numberOrNull(row.fat_g),
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: numberOrNull(row.nutrition_basis_amount),
      basis_unit: typeof row.nutrition_basis_unit === "string" ? row.nutrition_basis_unit as FoodLibraryNutrition["basis_unit"] : null,
    };
    effectiveNutrition = canonicalNutrition;
  }

  const name = requiredText(row.food_name, "Food name");
  const serving = requiredText(row.serving_size, "Food serving");
  if (requestedServing !== serving) throw new Error("The resolved Food serving no longer matches the selected serving. Re-select the serving before adding it.");

  const frozenNutrition = {
    calories: scale(effectiveNutrition.calories, quantity),
    protein_g: scale(effectiveNutrition.protein_g, quantity),
    carbs_g: scale(effectiveNutrition.carbs_g, quantity),
    fat_g: scale(effectiveNutrition.fat_g, quantity),
    fiber_g: scale(effectiveNutrition.fiber_g, quantity),
  };
  const frozenSourceSnapshot = {
    food_id: foodId,
    source: input.source,
    frozen_name: name,
    resolved_quantity: quantity,
    resolved_serving_label: serving,
    frozen_nutrition: frozenNutrition,
  };
  const savedMealItem: SavedMealFoodItemSnapshot = {
    kind: "food",
    food_id: foodId,
    frozen_name: name,
    resolved_quantity: quantity,
    resolved_serving_label: serving,
    frozen_nutrition: frozenNutrition,
  };

  return {
    foodId,
    source: input.source,
    name,
    serving,
    quantity,
    frozenNutrition,
    frozenSourceSnapshot,
    diaryItem: {
      foodName: name,
      servingLabel: serving,
      quantity,
      nutrition: {
        caloriesKcal: frozenNutrition.calories,
        proteinG: frozenNutrition.protein_g,
        carbsG: frozenNutrition.carbs_g,
        fatG: frozenNutrition.fat_g,
      },
      foodItemId: input.source === "catalog" ? foodId : null,
      userFoodItemId: input.source === "my_food" ? foodId : null,
    },
    savedMealItem,
    recipeIngredient: {
      food_id: foodId,
      ingredient_name: name,
      quantity,
      unit: serving,
      frozen_nutrition: frozenNutrition,
    },
  };
}
