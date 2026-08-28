import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealRecipeItemSnapshot } from "@/lib/nutrition-v1/contracts";
import { isUuid } from "@/lib/utils";

export type ResolvedRecipeHandoff = {
  recipeId: string;
  recipeVersionId: string;
  name: string;
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
    foodItemId: null;
    userFoodItemId: null;
  };
  savedMealItem: SavedMealRecipeItemSnapshot;
  shoppingIngredients: Array<{ foodId: string; name: string; quantity: number; unit: string; qualifier: null }>;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nutritionNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function requiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

export async function resolveRecipeHandoff(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
  recipeVersionId: string,
): Promise<ResolvedRecipeHandoff> {
  if (!isUuid(userId)) throw new Error("Owner must be a valid ID.");
  if (!isUuid(recipeId)) throw new Error("Recipe must be a valid ID.");
  if (!isUuid(recipeVersionId)) throw new Error("Recipe version must be a valid ID.");

  const rootResult = await supabase
    .from("nutrition_recipes")
    .select("id,user_id,name,deleted_at")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (rootResult.error) throw new Error(`Recipe could not be resolved. ${rootResult.error.message ?? "Database request failed."}`);
  if (!rootResult.data) throw new Error("Recipe is unavailable.");

  const versionResult = await supabase
    .from("nutrition_recipe_versions")
    .select("id,recipe_id,user_id,name,servings,metadata")
    .eq("id", recipeVersionId)
    .eq("recipe_id", recipeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (versionResult.error) throw new Error(`Recipe version could not be resolved. ${versionResult.error.message ?? "Database request failed."}`);
  if (!versionResult.data) throw new Error("Published Recipe version is unavailable.");

  const version = record(versionResult.data);
  const servings = Number(version.servings);
  if (!Number.isFinite(servings) || servings <= 0) throw new Error("Published Recipe servings are invalid.");
  const name = requiredText(version.name, "Recipe name");
  const metadata = record(version.metadata);
  const rawNutrition = record(metadata.nutrition_per_serving ?? metadata.nutritionPerServing);
  const frozenNutrition = {
    calories: nutritionNumber(rawNutrition.calories),
    protein_g: nutritionNumber(rawNutrition.protein_g ?? rawNutrition.proteinG),
    carbs_g: nutritionNumber(rawNutrition.carbs_g ?? rawNutrition.carbsG),
    fat_g: nutritionNumber(rawNutrition.fat_g ?? rawNutrition.fatG),
    fiber_g: nutritionNumber(rawNutrition.fiber_g ?? rawNutrition.fiberG),
  };

  const ingredientResult = await supabase
    .from("nutrition_recipe_ingredients")
    .select("food_id,ingredient_name,quantity,unit,position")
    .eq("recipe_version_id", recipeVersionId)
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (ingredientResult.error) throw new Error(`Recipe ingredients could not be resolved. ${ingredientResult.error.message ?? "Database request failed."}`);
  const shoppingIngredients: ResolvedRecipeHandoff["shoppingIngredients"] = (ingredientResult.data ?? []).flatMap((raw) => {
    const item = record(raw);
    const quantity = Number(item.quantity);
    if (typeof item.food_id !== "string" || !isUuid(item.food_id) || !Number.isFinite(quantity) || quantity <= 0 || typeof item.unit !== "string" || !item.unit.trim()) return [];
    return [{
      foodId: item.food_id,
      name: typeof item.ingredient_name === "string" && item.ingredient_name.trim() ? item.ingredient_name.trim() : name,
      quantity: quantity / servings,
      unit: item.unit.trim(),
      qualifier: null,
    }];
  });

  const frozenSourceSnapshot = {
    recipe_id: recipeId,
    recipe_version_id: recipeVersionId,
    resolved_serving_quantity: 1,
    resolved_serving_label: "1 serving",
    frozen_recipe_name: name,
    frozen_nutrition: frozenNutrition,
  };
  const savedMealItem: SavedMealRecipeItemSnapshot = {
    kind: "recipe",
    recipe: frozenSourceSnapshot,
  };

  return {
    recipeId,
    recipeVersionId,
    name,
    frozenNutrition,
    frozenSourceSnapshot,
    diaryItem: {
      foodName: name,
      servingLabel: "1 serving",
      quantity: 1,
      nutrition: {
        caloriesKcal: frozenNutrition.calories,
        proteinG: frozenNutrition.protein_g,
        carbsG: frozenNutrition.carbs_g,
        fatG: frozenNutrition.fat_g,
      },
      foodItemId: null,
      userFoodItemId: null,
    },
    savedMealItem,
    shoppingIngredients,
  };
}
