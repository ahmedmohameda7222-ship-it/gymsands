import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealFoodItemSnapshot } from "@/lib/nutrition-v1/contracts";
import { isUuid } from "@/lib/utils";
import {
  projectCurrentGenerationCompatibility,
  resolveCurrentGenerationFoodForNewUseFromSupabase,
  type CurrentGenerationFoodView,
} from "@/services/food-catalog/server/current-generation-service";
import type {
  FoodLibraryNutrition,
  FoodLibrarySource,
} from "@/services/nutrition-v1/server/food-library";
import {
  mergePersonalOverrideNutrition,
  readCurrentPersonalOverride,
} from "@/services/nutrition-v1/server/personal-overrides";

export type FoodHandoffInput = {
  foodId: string;
  source: FoodLibrarySource;
  quantity: number;
  serving: string;
  displayName?: string;
  languageTag?: string | null;
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

function optionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  return requiredText(value, "Food language");
}

function scale(value: number | null, quantity: number) {
  return value === null ? null : Math.round(value * quantity * 1000) / 1000;
}

function nutritionFromView(view: CurrentGenerationFoodView): FoodLibraryNutrition {
  const nutrition = view.nutritionRevision;
  if (nutrition === null) {
    throw new Error("Current-generation Food has no selected nutrition revision.");
  }
  return {
    calories: nutrition.calories,
    protein_g: nutrition.protein_g,
    carbs_g: nutrition.carbs_g,
    fat_g: nutrition.fat_g,
    saturated_fat_g: nutrition.saturated_fat_g,
    fiber_g: nutrition.fiber_g,
    sugars_g: nutrition.sugars_g,
    sodium_mg: nutrition.sodium_mg,
    basis_amount: nutrition.basisAmount,
    basis_unit: nutrition.basisUnit,
  };
}

function viewWithNutrition(
  view: CurrentGenerationFoodView,
  nutrition: FoodLibraryNutrition,
): CurrentGenerationFoodView {
  if (view.nutritionRevision === null) {
    throw new Error("Current-generation Food has no selected nutrition revision.");
  }
  return {
    ...view,
    nutritionRevision: {
      ...view.nutritionRevision,
      calories: nutrition.calories,
      protein_g: nutrition.protein_g,
      carbs_g: nutrition.carbs_g,
      fat_g: nutrition.fat_g,
      saturated_fat_g: nutrition.saturated_fat_g,
      fiber_g: nutrition.fiber_g,
      sugars_g: nutrition.sugars_g,
      sodium_mg: nutrition.sodium_mg,
    },
  };
}

function exactSelectedName(
  view: CurrentGenerationFoodView,
  displayName: string,
  languageTag: string | null,
) {
  const selectedIds = new Set(view.selections.nameFactIds);
  const matches = view.names.filter((name) => (
    selectedIds.has(name.id)
    && name.text.trim() === displayName
    && (languageTag === null || name.languageTag === languageTag)
  ));
  if (matches.length !== 1) {
    throw new Error("The selected Food name does not resolve to exactly one current-generation Name fact.");
  }
  return matches[0]!;
}

function exactSelectedServing(
  view: CurrentGenerationFoodView,
  servingLabel: string,
) {
  const selectedIds = new Set(view.selections.servingOptionIds);
  const matches = view.servingOptions.filter((serving) => (
    selectedIds.has(serving.id)
    && serving.label.trim() === servingLabel
  ));
  if (matches.length !== 1) {
    throw new Error("The selected Food serving does not resolve to exactly one current-generation Serving fact.");
  }
  return matches[0]!;
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
  let name: string;
  let serving: string;
  let effectiveNutrition: FoodLibraryNutrition;

  if (input.source === "catalog") {
    const selectedDisplayName = requiredText(input.displayName, "Food display name");
    const languageTag = optionalText(input.languageTag);
    const view = await resolveCurrentGenerationFoodForNewUseFromSupabase(supabase, input.foodId);
    foodId = view.resolvedFoodId;

    const selectedName = exactSelectedName(view, selectedDisplayName, languageTag);
    const personalOverride = await readCurrentPersonalOverride(supabase, foodId);
    const canonicalNutrition = nutritionFromView(view);
    const mergedBasisNutrition = mergePersonalOverrideNutrition(canonicalNutrition, personalOverride);
    const effectiveView = viewWithNutrition(view, mergedBasisNutrition);

    name = selectedName.text.trim();
    const personalServing = personalOverride.hasOverride && !personalOverride.isDeleted
      ? personalOverride.servingLabel
      : null;

    if (personalServing !== null) {
      if (requestedServing !== personalServing) {
        throw new Error("The resolved Food serving no longer matches the selected serving. Re-select the serving before adding it.");
      }
      const projected = projectCurrentGenerationCompatibility(effectiveView, {
        nameFactId: selectedName.id,
        servingOptionId: null,
      });
      serving = personalServing;
      effectiveNutrition = projected.nutrition;
    } else {
      const selectedServing = exactSelectedServing(view, requestedServing);
      const projected = projectCurrentGenerationCompatibility(effectiveView, {
        nameFactId: selectedName.id,
        servingOptionId: selectedServing.id,
      });
      serving = projected.servingLabel;
      effectiveNutrition = projected.nutrition;
    }
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
    const row = record(result.data);
    name = requiredText(row.food_name, "Food name");
    serving = requiredText(row.serving_size, "Food serving");
    effectiveNutrition = {
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
    if (requestedServing !== serving) {
      throw new Error("The resolved Food serving no longer matches the selected serving. Re-select the serving before adding it.");
    }
  }

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
