import type { FoodItem, NullableCoreNutrition } from "@/types";
import { scaleFoodMacros, sumFoodLogs } from "@/services/nutrition/calculations";

type SavedMealDraftIngredient = {
  food: FoodItem;
  quantity: number;
};

export function calculateSavedMealDraftTotals(items: SavedMealDraftIngredient[]): NullableCoreNutrition {
  return sumFoodLogs(items.map(({ food, quantity }) => scaleFoodMacros(food, quantity)));
}

export function formatSavedMealNutrition(value: number | null, suffix: string) {
  return value === null ? "—" : `${value}${suffix}`;
}
