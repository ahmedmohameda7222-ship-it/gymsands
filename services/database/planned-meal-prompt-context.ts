"use client";

import { supabase } from "@/lib/supabase/client";
import { buildPlannedMealPromptContext, ingredientsFromFoodMetadata, type PlannedMealPromptContext } from "@/lib/ai/planned-meal-context";
import { isUuid } from "@/lib/utils";
import type { MealPlanItem } from "@/types";

type FoodMetadata = { food_name?: string | null; tags?: string[] | null; notes?: string | null };

function structuredAllergens(tags: string[]) {
  return tags.filter((tag) => {
    const normalized = tag.trim().toLocaleLowerCase("en-US").replace(/[_-]+/g, " ");
    return ["dairy", "milk", "casein", "whey", "gluten", "wheat", "barley", "rye", "dairy free", "gluten free"].includes(normalized);
  });
}

export async function getPlannedMealPromptContext(item: MealPlanItem): Promise<PlannedMealPromptContext> {
  if (!supabase || !isUuid(item.user_id)) return buildPlannedMealPromptContext(item);

  if (item.user_food_item_id && isUuid(item.user_food_item_id)) {
    const result = await supabase
      .from("user_food_items")
      .select("food_name,tags,notes")
      .eq("id", item.user_food_item_id)
      .eq("user_id", item.user_id)
      .maybeSingle();
    if (!result.error && result.data) {
      const metadata = result.data as FoodMetadata;
      const tags = metadata.tags ?? [];
      return buildPlannedMealPromptContext(item, {
        ingredients: ingredientsFromFoodMetadata({
          foodName: metadata.food_name?.trim() || item.food_name,
          tags,
          notes: metadata.notes
        }),
        structuredAllergens: structuredAllergens(tags)
      });
    }
  }

  // Catalog-backed Meal Plan rows are historical frozen snapshots. Do not enrich
  // them from legacy flat food_items metadata: current catalog facts must come
  // from current-generation/domain authority, and unavailable metadata stays unknown.
  return buildPlannedMealPromptContext(item);
}
