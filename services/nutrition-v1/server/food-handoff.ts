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
  servingOptionId?: string | null;
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

export type CatalogServingChoice = {
  servingOptionId: string | null;
  label: string;
  source: "generation" | "owner_override";
  nutrition?: FoodLibraryNutrition;
};

export type CatalogNewUseSelection = {
  foodId: string;
  name: string;
  languageTag: string;
  servingChoices: CatalogServingChoice[];
};

function selectedGenerationServingChoices(view: CurrentGenerationFoodView): CatalogServingChoice[] {
  const selectionIds = view.selections.servingOptionIds;
  if (new Set(selectionIds).size !== selectionIds.length) {
    throw new Error("Current-generation Food contains duplicate selected Serving identities.");
  }
  return selectionIds.map((id) => {
    const matches = view.servingOptions.filter((serving) => serving.id === id);
    if (matches.length !== 1 || matches[0]!.foodId !== view.resolvedFoodId) {
      throw new Error("Current-generation selected Serving authority is malformed.");
    }
    return {
      servingOptionId: id,
      label: requiredText(matches[0]!.label, "Food serving"),
      source: "generation" as const,
    };
  });
}

function exactSelectedServing(
  view: CurrentGenerationFoodView,
  servingLabel: string,
  servingOptionId: string | null,
) {
  const selectedIds = new Set(view.selections.servingOptionIds);
  if (servingOptionId !== null && !selectedIds.has(servingOptionId)) {
    throw new Error("The selected Food serving identity is not selected by the current generation.");
  }
  const matches = view.servingOptions.filter((serving) => (
    selectedIds.has(serving.id)
    && serving.foodId === view.resolvedFoodId
    && serving.label.trim() === servingLabel
    && (servingOptionId === null || serving.id === servingOptionId)
  ));
  if (matches.length !== 1) {
    throw new Error("The selected Food serving does not resolve to exactly one current-generation Serving fact.");
  }
  return matches[0]!;
}

export async function resolveCatalogNewUseSelectionFromView(
  ownerSupabase: SupabaseClient,
  view: CurrentGenerationFoodView,
  selectedName: CurrentGenerationFoodView["names"][number],
): Promise<CatalogNewUseSelection> {
  if (selectedName.foodId !== view.resolvedFoodId || !view.selections.nameFactIds.includes(selectedName.id)) {
    throw new Error("The selected Food name is not selected by the current generation.");
  }
  const personalOverride = await readCurrentPersonalOverride(ownerSupabase, view.resolvedFoodId);
  const personalServing = personalOverride.hasOverride && !personalOverride.isDeleted
    ? personalOverride.servingLabel
    : null;

  let effectiveView: CurrentGenerationFoodView | null = null;
  if (view.nutritionRevision) {
    const canonicalNutrition = nutritionFromView(view);
    const effectiveNutrition = mergePersonalOverrideNutrition(canonicalNutrition, personalOverride);
    effectiveView = viewWithNutrition(view, effectiveNutrition);
  }
  const withProjectedNutrition = (
    choice: Omit<CatalogServingChoice, "nutrition">,
  ): CatalogServingChoice => {
    if (!effectiveView) return choice;
    try {
      const projection = projectCurrentGenerationCompatibility(effectiveView, {
        nameFactId: selectedName.id,
        servingOptionId: choice.servingOptionId,
      });
      return { ...choice, nutrition: projection.nutrition };
    } catch {
      // An authoritative serving can remain selectable even when no safe
      // nutrition conversion exists. The handoff boundary remains the final
      // fail-closed conversion authority for writes.
      return choice;
    }
  };

  const servingChoices = personalServing !== null
    ? [withProjectedNutrition({ servingOptionId: null, label: personalServing, source: "owner_override" })]
    : selectedGenerationServingChoices(view).map(withProjectedNutrition);

  return {
    foodId: view.resolvedFoodId,
    name: requiredText(selectedName.text, "Food display name"),
    languageTag: requiredText(selectedName.languageTag, "Food language"),
    servingChoices,
  };
}

export async function resolveCatalogNewUseSelectionWithAuthorities(
  ownerSupabase: SupabaseClient,
  catalogSupabase: SupabaseClient,
  userId: string,
  input: { foodId: string; displayName: string; languageTag?: string | null },
): Promise<CatalogNewUseSelection> {
  if (!isUuid(userId)) throw new Error("Owner must be a valid ID.");
  if (!isUuid(input.foodId)) throw new Error("Food must be a valid ID.");
  const displayName = requiredText(input.displayName, "Food display name");
  const languageTag = optionalText(input.languageTag);
  const view = await resolveCurrentGenerationFoodForNewUseFromSupabase(catalogSupabase, input.foodId);
  const selectedName = exactSelectedName(view, displayName, languageTag);
  return resolveCatalogNewUseSelectionFromView(ownerSupabase, view, selectedName);
}

function requestedServingOptionId(input: FoodHandoffInput) {
  const servingOptionId = input.servingOptionId === undefined || input.servingOptionId === null
    ? null
    : requiredText(input.servingOptionId, "Food serving identity");
  if (servingOptionId !== null && !isUuid(servingOptionId)) {
    throw new Error("Food serving identity must be a valid ID.");
  }
  return servingOptionId;
}

function buildResolvedFoodHandoff(
  foodId: string,
  source: FoodLibrarySource,
  name: string,
  serving: string,
  quantity: number,
  effectiveNutrition: FoodLibraryNutrition,
): ResolvedFoodHandoff {
  const frozenNutrition = {
    calories: scale(effectiveNutrition.calories, quantity),
    protein_g: scale(effectiveNutrition.protein_g, quantity),
    carbs_g: scale(effectiveNutrition.carbs_g, quantity),
    fat_g: scale(effectiveNutrition.fat_g, quantity),
    fiber_g: scale(effectiveNutrition.fiber_g, quantity),
  };
  const frozenSourceSnapshot = {
    food_id: foodId,
    source,
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
    source,
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
      foodItemId: source === "catalog" ? foodId : null,
      userFoodItemId: source === "my_food" ? foodId : null,
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

export async function resolveFoodHandoffFromResolvedCatalogAuthority(
  ownerSupabase: SupabaseClient,
  userId: string,
  view: CurrentGenerationFoodView,
  input: FoodHandoffInput & { source: "catalog" },
): Promise<ResolvedFoodHandoff> {
  if (!isUuid(userId)) throw new Error("Owner must be a valid ID.");
  if (!isUuid(input.foodId)) throw new Error("Food must be a valid ID.");
  if (view.requestedFoodId !== input.foodId) {
    throw new Error("Resolved current-generation Food authority does not match the requested Food.");
  }
  if (
    view.food.lifecycle !== "active"
    || view.food.foodId !== view.resolvedFoodId
    || view.food.generationId !== view.generation.id
  ) {
    throw new Error("Resolved current-generation Food authority is not active or internally consistent.");
  }

  const quantity = positive(input.quantity, "Food quantity");
  const requestedServing = requiredText(input.serving, "Food serving");
  const servingOptionId = requestedServingOptionId(input);
  const selectedDisplayName = requiredText(input.displayName, "Food display name");
  const languageTag = optionalText(input.languageTag);
  const selectedName = exactSelectedName(view, selectedDisplayName, languageTag);
  const foodId = view.resolvedFoodId;
  const personalOverride = await readCurrentPersonalOverride(ownerSupabase, foodId);
  const canonicalNutrition = nutritionFromView(view);
  const mergedBasisNutrition = mergePersonalOverrideNutrition(canonicalNutrition, personalOverride);
  const effectiveView = viewWithNutrition(view, mergedBasisNutrition);

  const name = selectedName.text.trim();
  const personalServing = personalOverride.hasOverride && !personalOverride.isDeleted
    ? personalOverride.servingLabel
    : null;

  let serving: string;
  let effectiveNutrition: FoodLibraryNutrition;
  if (personalServing !== null) {
    if (servingOptionId !== null) {
      throw new Error("An owner Personal Override serving must not carry a generation Serving identity.");
    }
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
    const selectedServing = exactSelectedServing(view, requestedServing, servingOptionId);
    const projected = projectCurrentGenerationCompatibility(effectiveView, {
      nameFactId: selectedName.id,
      servingOptionId: selectedServing.id,
    });
    serving = projected.servingLabel;
    effectiveNutrition = projected.nutrition;
  }

  return buildResolvedFoodHandoff(
    foodId,
    "catalog",
    name,
    serving,
    quantity,
    effectiveNutrition,
  );
}

export async function resolveFoodHandoffWithAuthorities(
  ownerSupabase: SupabaseClient,
  catalogSupabase: SupabaseClient,
  userId: string,
  input: FoodHandoffInput,
): Promise<ResolvedFoodHandoff> {
  if (!isUuid(userId)) throw new Error("Owner must be a valid ID.");
  if (!isUuid(input.foodId)) throw new Error("Food must be a valid ID.");
  if (input.source !== "catalog" && input.source !== "my_food") throw new Error("Food source is invalid.");

  if (input.source === "catalog") {
    const view = await resolveCurrentGenerationFoodForNewUseFromSupabase(catalogSupabase, input.foodId);
    return resolveFoodHandoffFromResolvedCatalogAuthority(ownerSupabase, userId, view, {
      ...input,
      source: "catalog",
    });
  }

  const quantity = positive(input.quantity, "Food quantity");
  const requestedServing = requiredText(input.serving, "Food serving");
  if (requestedServingOptionId(input) !== null) {
    throw new Error("My Food serving must not carry a Catalog Serving identity.");
  }

  const result = await ownerSupabase
    .from("user_food_items")
    .select("id,user_id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,nutrition_basis_amount,nutrition_basis_unit,deleted_at")
    .eq("id", input.foodId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) throw new Error(`Personal Food could not be resolved. ${result.error.message ?? "Database request failed."}`);
  if (!result.data) throw new Error("Personal Food is unavailable.");

  const row = record(result.data);
  const name = requiredText(row.food_name, "Food name");
  const serving = requiredText(row.serving_size, "Food serving");
  if (requestedServing !== serving) {
    throw new Error("The resolved Food serving no longer matches the selected serving. Re-select the serving before adding it.");
  }
  const effectiveNutrition: FoodLibraryNutrition = {
    calories: numberOrNull(row.calories),
    protein_g: numberOrNull(row.protein_g),
    carbs_g: numberOrNull(row.carbs_g),
    fat_g: numberOrNull(row.fat_g),
    saturated_fat_g: null,
    fiber_g: null,
    sugars_g: null,
    sodium_mg: null,
    basis_amount: numberOrNull(row.nutrition_basis_amount),
    basis_unit: typeof row.nutrition_basis_unit === "string"
      ? row.nutrition_basis_unit as FoodLibraryNutrition["basis_unit"]
      : null,
  };

  return buildResolvedFoodHandoff(
    input.foodId,
    "my_food",
    name,
    serving,
    quantity,
    effectiveNutrition,
  );
}


/**
 * Legacy single-client compatibility for the MCP authority bridge that remains
 * an explicit PR B / Task 14 prerequisite. Product/server routes in PR A must
 * use resolveFoodHandoffWithAuthorities so owner and catalog trust domains do
 * not collapse.
 */
export async function resolveFoodHandoff(
  supabase: SupabaseClient,
  userId: string,
  input: FoodHandoffInput,
): Promise<ResolvedFoodHandoff> {
  return resolveFoodHandoffWithAuthorities(supabase, supabase, userId, input);
}
