export type NutritionFacts = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
};

export type FrozenNutritionSnapshot = NutritionFacts;

export type RecipeConsumerSnapshot = {
  recipe_id: string;
  recipe_version_id: string;
  resolved_serving_quantity: number;
  resolved_serving_label: string;
  frozen_recipe_name: string;
  frozen_nutrition: FrozenNutritionSnapshot;
};

export type SavedMealFoodItemSnapshot = {
  kind: "food";
  food_id: string;
  frozen_name: string;
  resolved_quantity: number;
  resolved_serving_label: string;
  frozen_nutrition: FrozenNutritionSnapshot;
};

export type SavedMealRecipeItemSnapshot = {
  kind: "recipe";
  recipe: RecipeConsumerSnapshot;
};

export type SavedMealBundleSnapshot = {
  saved_meal_id: string;
  frozen_name: string;
  items: Array<SavedMealFoodItemSnapshot | SavedMealRecipeItemSnapshot>;
};

export type PlannedOccurrenceSource =
  | { kind: "food"; food_id: string }
  | { kind: "recipe"; recipe: RecipeConsumerSnapshot }
  | { kind: "saved_meal"; saved_meal: SavedMealBundleSnapshot }
  | { kind: "placeholder"; frozen_name: string };

export type DiaryEntrySource =
  | { kind: "food"; food_id: string | null }
  | { kind: "recipe"; recipe: RecipeConsumerSnapshot }
  | { kind: "saved_meal"; saved_meal: SavedMealBundleSnapshot }
  | { kind: "quick_add"; frozen_name: string };

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function positiveFinite(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be greater than zero.`);
  }
  return value;
}

export function recipeConsumerSnapshot({
  recipeId,
  recipeVersionId,
  servingQuantity,
  servingLabel,
  recipeName,
  nutrition,
}: {
  recipeId: string;
  recipeVersionId: string;
  servingQuantity: number;
  servingLabel: string;
  recipeName: string;
  nutrition: FrozenNutritionSnapshot;
}): RecipeConsumerSnapshot {
  return {
    recipe_id: requiredText(recipeId, "Recipe ID"),
    recipe_version_id: requiredText(recipeVersionId, "Recipe version"),
    resolved_serving_quantity: positiveFinite(servingQuantity, "Serving quantity"),
    resolved_serving_label: requiredText(servingLabel, "Serving label"),
    frozen_recipe_name: requiredText(recipeName, "Recipe name"),
    frozen_nutrition: nutrition,
  };
}
