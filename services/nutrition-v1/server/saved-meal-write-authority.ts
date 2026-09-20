import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealItemInput, SavedMealItemWriteIntent } from "@/services/nutrition-v1/server/saved-meals";
import { resolveFoodHandoffWithAuthorities } from "@/services/nutrition-v1/server/food-handoff";
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
  ownerSupabase: SupabaseClient,
  catalogSupabase: SupabaseClient,
  userId: string,
  items: SavedMealItemWriteIntent[],
  writeLanguageTag: string | null = null,
): Promise<SavedMealItemInput[]> {
  const output: SavedMealItemInput[] = [];
  const normalizedWriteLanguageTag = typeof writeLanguageTag === "string" && writeLanguageTag.trim()
    ? writeLanguageTag.trim()
    : null;

  for (const item of items) {
    if (item.kind === "food") {
      const source = await detectFoodSource(ownerSupabase, userId, item.food_id);
      const itemLanguageTag = typeof item.languageTag === "string" && item.languageTag.trim()
        ? item.languageTag.trim()
        : null;
      const catalogSelectionIdentity = source === "catalog"
        ? {
            displayName: item.frozen_name,
            languageTag: itemLanguageTag ?? normalizedWriteLanguageTag,
          }
        : {};
      const resolved = await resolveFoodHandoffWithAuthorities(ownerSupabase, catalogSupabase, userId, {
        foodId: item.food_id,
        source,
        quantity: item.resolved_quantity,
        serving: item.resolved_serving_label,
        ...catalogSelectionIdentity,
      });
      const frozen = resolved.savedMealItem;
      output.push({
        kind: "food",
        food_id: frozen.food_id,
        frozen_name: frozen.frozen_name,
        resolved_quantity: frozen.resolved_quantity,
        resolved_serving_label: frozen.resolved_serving_label,
        frozen_nutrition: frozen.frozen_nutrition,
      });
      continue;
    }
    if (item.kind === "recipe") {
      const resolved = await resolveRecipeHandoff(
        ownerSupabase,
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
