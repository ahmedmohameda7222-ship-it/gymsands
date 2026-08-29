import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealItemInput } from "@/services/nutrition-v1/server/saved-meals";
import { resolveFoodHandoff } from "@/services/nutrition-v1/server/food-handoff";
import { resolveRecipeHandoff } from "@/services/nutrition-v1/server/recipe-handoff";

async function detectFoodSource(supabase: SupabaseClient, userId: string, foodId: string) {
  const own = await supabase
    .from("user_food_items")
    .select("id")
    .eq("id", foodId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (own.error) throw new Error(`Personal Food identity could not be validated. ${own.error.message ?? "Database request failed."}`);
  return own.data ? "my_food" as const : "catalog" as const;
}

export async function canonicalizeSavedMealItems(
  supabase: SupabaseClient,
  userId: string,
  items: SavedMealItemInput[],
): Promise<SavedMealItemInput[]> {
  const output: SavedMealItemInput[] = [];
  for (const item of items) {
    if (item.kind === "food") {
      const source = await detectFoodSource(supabase, userId, item.food_id);
      const resolved = await resolveFoodHandoff(supabase, userId, {
        foodId: item.food_id,
        source,
        quantity: item.resolved_quantity,
        serving: item.resolved_serving_label,
      });
      output.push(resolved.savedMealItem);
      continue;
    }
    if (item.kind === "recipe") {
      const resolved = await resolveRecipeHandoff(
        supabase,
        userId,
        item.recipe.recipe_id,
        item.recipe.recipe_version_id,
      );
      if (item.recipe.resolved_serving_quantity !== 1 || item.recipe.resolved_serving_label !== "1 serving") {
        throw new Error("Recipe serving must be re-resolved before saving this meal.");
      }
      output.push(resolved.savedMealItem);
      continue;
    }
    throw new Error("Saved Meal items must be canonical Food or Recipe snapshots.");
  }
  return output;
}
