import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  projectCurrentGenerationCompatibility,
  resolveCurrentGenerationFoodForNewUse,
  type CurrentGenerationFoodView,
} from "@/services/food-catalog/server";
import type { FoodCatalogGenerationReadStore } from "@/services/food-catalog/server/generation-store";
import { createSupabaseFoodCatalogGenerationReadStore } from "@/services/food-catalog/server/supabase-generation-read-store";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { SavedMealFoodItemSnapshot } from "@/lib/nutrition-v1/contracts";
import { isUuid } from "@/lib/utils";
import {
  FOOD_PERSONAL_OVERRIDE_NUTRIENT_KEYS,
  getCurrentFoodPersonalOverride,
  type CurrentFoodPersonalOverride,
} from "@/services/nutrition-v1/server/food-personal-override";
import type {
  FoodLibraryNutrition,
  FoodLibrarySource,
} from "@/services/nutrition-v1/server/food-library";

type FoodHandoffBase = {
  foodId: string;
  quantity: number;
  serving: string;
};

export type FoodHandoffInput =
  | (FoodHandoffBase & {
      source: "catalog";
      selectedName: string;
      languageTag: string | null;
    })
  | (FoodHandoffBase & {
      source: "my_food";
    });

export type FoodHandoffDependencies = {
  generationStore?: FoodCatalogGenerationReadStore;
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
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(label + " must be greater than zero.");
  return parsed;
}

function requiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(label + " is required.");
  return text;
}

function scale(value: number | null, quantity: number) {
  return value === null ? null : Math.round(value * quantity * 1000) / 1000;
}

function activeOverride(value: CurrentFoodPersonalOverride) {
  return value.hasOverride && !value.isDeleted ? value : null;
}

function selectExactName(view: CurrentGenerationFoodView, selectedName: string, languageTag: string | null) {
  const selectedIds = new Set(view.selections.nameFactIds);
  const matches = view.names.filter((fact) =>
    selectedIds.has(fact.id)
    && fact.foodId === view.resolvedFoodId
    && fact.text.trim() === selectedName
    && (languageTag === null || fact.languageTag === languageTag));
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "The selected Food name is not an exact current-generation selection."
        : "The selected Food name is ambiguous inside the current generation.",
    );
  }
  return matches[0]!;
}

function selectExactServing(view: CurrentGenerationFoodView, requestedServing: string) {
  const selectedIds = new Set(view.selections.servingOptionIds);
  const matches = view.servingOptions.filter((fact) =>
    selectedIds.has(fact.id)
    && fact.foodId === view.resolvedFoodId
    && fact.label.trim() === requestedServing);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "The selected Food serving is not an exact current-generation selection."
        : "The selected Food serving is ambiguous inside the current generation.",
    );
  }
  return matches[0]!;
}

function withPersonalNutrition(
  view: CurrentGenerationFoodView,
  ownerOverride: CurrentFoodPersonalOverride | null,
): CurrentGenerationFoodView {
  if (!ownerOverride?.nutritionOverride || !view.nutritionRevision) return view;
  const nutritionRevision = { ...view.nutritionRevision };
  for (const key of FOOD_PERSONAL_OVERRIDE_NUTRIENT_KEYS) {
    const value = ownerOverride.nutritionOverride[key];
    if (typeof value === "number") nutritionRevision[key] = value;
  }
  return { ...view, nutritionRevision };
}

function defaultGenerationStore() {
  return createSupabaseFoodCatalogGenerationReadStore(createSupabaseAdminClient());
}

export async function resolveFoodHandoff(
  supabase: SupabaseClient,
  userId: string,
  input: FoodHandoffInput,
  dependencies: FoodHandoffDependencies = {},
): Promise<ResolvedFoodHandoff> {
  if (!isUuid(userId)) throw new Error("Owner must be a valid ID.");
  if (!isUuid(input.foodId)) throw new Error("Food must be a valid ID.");
  const quantity = positive(input.quantity, "Food quantity");
  const requestedServing = requiredText(input.serving, "Food serving");

  let foodId = input.foodId;
  let name: string;
  let serving: string;
  let effectiveNutrition: FoodLibraryNutrition;

  if (input.source === "catalog") {
    const selectedName = requiredText(input.selectedName, "Selected Food name");
    const languageTag = input.languageTag === null ? null : requiredText(input.languageTag, "Selected Food language");
    const generationStore = dependencies.generationStore ?? defaultGenerationStore();
    const currentView = await resolveCurrentGenerationFoodForNewUse(generationStore, input.foodId);
    foodId = currentView.resolvedFoodId;

    const selectedNameFact = selectExactName(currentView, selectedName, languageTag);
    const ownerState = await getCurrentFoodPersonalOverride(supabase, foodId);
    const ownerOverride = activeOverride(ownerState);

    let servingOptionId: string | null = null;
    if (ownerOverride?.servingLabel) {
      serving = requiredText(ownerOverride.servingLabel, "Personal Override serving");
      if (serving !== requestedServing) {
        throw new Error("The resolved Food serving no longer matches the selected serving. Re-select the serving before adding it.");
      }
    } else {
      const selectedServingFact = selectExactServing(currentView, requestedServing);
      serving = selectedServingFact.label.trim();
      servingOptionId = selectedServingFact.id;
    }

    const projected = projectCurrentGenerationCompatibility(
      withPersonalNutrition(currentView, ownerOverride),
      {
        nameFactId: selectedNameFact.id,
        servingOptionId,
      },
    );
    name = requiredText(projected.name, "Food name");
    effectiveNutrition = projected.nutrition;
  } else {
    const result = await supabase
      .from("user_food_items")
      .select("id,user_id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,nutrition_basis_amount,nutrition_basis_unit,deleted_at")
      .eq("id", foodId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (result.error) throw new Error("Personal Food could not be resolved. " + (result.error.message ?? "Database request failed."));
    if (!result.data) throw new Error("Personal Food is unavailable.");
    const row = record(result.data);
    name = requiredText(row.food_name, "Food name");
    serving = requiredText(row.serving_size, "Food serving");
    if (requestedServing !== serving) {
      throw new Error("The resolved Food serving no longer matches the selected serving. Re-select the serving before adding it.");
    }
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
