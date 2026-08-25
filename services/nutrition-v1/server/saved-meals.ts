import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SavedMealBundleSnapshot,
  SavedMealFoodItemSnapshot,
  SavedMealRecipeItemSnapshot,
} from "@/lib/nutrition-v1/contracts";
import { scaleNutritionFacts } from "@/lib/nutrition-v1/nutrition-value";
import { isUuid } from "@/lib/utils";

export type SavedMealItemInput =
  | SavedMealFoodItemSnapshot
  | SavedMealRecipeItemSnapshot;

export type SavedMealWriteInput = {
  name: string;
  note?: string | null;
  isFavorite?: boolean;
  items: SavedMealItemInput[];
};

export type SavedMealRecord = {
  id: string;
  user_id: string;
  name: string;
  note: string | null;
  is_favorite: boolean;
  deleted_at?: string | null;
  purge_after?: string | null;
};

const ROOT_COLUMNS =
  "id,user_id,name,note,is_favorite,deleted_at,purge_after,created_at,updated_at";
const ITEM_COLUMNS =
  "id,saved_meal_id,user_id,position,item_type,food_id,recipe_id,recipe_version_id,resolved_quantity,resolved_serving_label,frozen_name,frozen_snapshot,created_at,updated_at";
const MAX_SAVED_MEAL_ITEMS = 100;

function requiredUuid(value: unknown, label: string) {
  if (typeof value !== "string" || !isUuid(value)) {
    throw new Error(`${label} must be a valid ID.`);
  }
  return value;
}

function requiredText(value: unknown, label: string, maxLength = 300) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > maxLength) throw new Error(`${label} is too long.`);
  return text;
}

function positive(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return number;
}

function cloneFoodSnapshot(value: SavedMealFoodItemSnapshot): SavedMealFoodItemSnapshot {
  return {
    kind: "food",
    food_id: requiredUuid(value.food_id, "Food"),
    frozen_name: requiredText(value.frozen_name, "Food name"),
    resolved_quantity: positive(value.resolved_quantity, "Food quantity"),
    resolved_serving_label: requiredText(value.resolved_serving_label, "Food serving label"),
    frozen_nutrition: scaleNutritionFacts(value.frozen_nutrition, 1),
  };
}

function cloneRecipeSnapshot(value: SavedMealRecipeItemSnapshot): SavedMealRecipeItemSnapshot {
  const recipe = value.recipe;
  return {
    kind: "recipe",
    recipe: {
      recipe_id: requiredUuid(recipe?.recipe_id, "Recipe"),
      recipe_version_id: requiredUuid(recipe?.recipe_version_id, "Recipe version"),
      resolved_serving_quantity: positive(
        recipe?.resolved_serving_quantity,
        "Recipe serving quantity",
      ),
      resolved_serving_label: requiredText(
        recipe?.resolved_serving_label,
        "Recipe serving label",
      ),
      frozen_recipe_name: requiredText(recipe?.frozen_recipe_name, "Recipe name"),
      frozen_nutrition: scaleNutritionFacts(recipe?.frozen_nutrition, 1),
    },
  };
}

function normalizeItem(value: SavedMealItemInput): SavedMealItemInput {
  if (!value || typeof value !== "object") {
    throw new Error("Saved Meal items must be Food or Recipe snapshots.");
  }
  if (value.kind === "food") return cloneFoodSnapshot(value);
  if (value.kind === "recipe") return cloneRecipeSnapshot(value);
  throw new Error("Saved Meal nesting is not supported; items must be Food or Recipe snapshots.");
}

function normalizeWriteInput(input: SavedMealWriteInput) {
  const name = requiredText(input.name, "Saved Meal name", 200);
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Saved Meal requires at least one Food or Recipe item.");
  }
  if (input.items.length > MAX_SAVED_MEAL_ITEMS) {
    throw new Error(`Saved Meal cannot contain more than ${MAX_SAVED_MEAL_ITEMS} items.`);
  }
  return {
    name,
    note: input.note?.trim() || null,
    isFavorite: Boolean(input.isFavorite),
    items: input.items.map(normalizeItem),
  };
}

function itemRows(
  userId: string,
  savedMealId: string,
  items: SavedMealItemInput[],
) {
  return items.map((item, position) => {
    if (item.kind === "food") {
      return {
        saved_meal_id: savedMealId,
        user_id: userId,
        position,
        item_type: "food",
        food_id: item.food_id,
        recipe_id: null,
        recipe_version_id: null,
        resolved_quantity: item.resolved_quantity,
        resolved_serving_label: item.resolved_serving_label,
        frozen_name: item.frozen_name,
        frozen_snapshot: item,
      };
    }
    return {
      saved_meal_id: savedMealId,
      user_id: userId,
      position,
      item_type: "recipe",
      food_id: null,
      recipe_id: item.recipe.recipe_id,
      recipe_version_id: item.recipe.recipe_version_id,
      resolved_quantity: item.recipe.resolved_serving_quantity,
      resolved_serving_label: item.recipe.resolved_serving_label,
      frozen_name: item.recipe.frozen_recipe_name,
      frozen_snapshot: item,
    };
  });
}

function databaseError(action: string, error: { message?: string } | null | undefined) {
  return new Error(`${action} ${error?.message || "Database request failed."}`);
}

async function rollbackCreatedSavedMeal(
  supabase: SupabaseClient,
  savedMealId: string,
) {
  const soft = await supabase.rpc("soft_delete_nutrition_saved_meal", {
    p_saved_meal_id: savedMealId,
  });
  if (soft.error) return;
  await supabase.rpc("purge_nutrition_saved_meal_now", {
    p_saved_meal_id: savedMealId,
  });
}

export async function createSavedMeal(
  supabase: SupabaseClient,
  userId: string,
  input: SavedMealWriteInput,
): Promise<SavedMealRecord> {
  requiredUuid(userId, "Owner");
  const normalized = normalizeWriteInput(input);
  const rootResult = await supabase
    .from("nutrition_saved_meals")
    .insert({
      user_id: userId,
      name: normalized.name,
      note: normalized.note,
      is_favorite: normalized.isFavorite,
    })
    .select(ROOT_COLUMNS)
    .single();
  if (rootResult.error || !rootResult.data) {
    throw databaseError("Saved Meal could not be created.", rootResult.error);
  }

  const root = rootResult.data as SavedMealRecord;
  requiredUuid(root.id, "Saved Meal");
  const itemResult = await supabase
    .from("nutrition_saved_meal_items")
    .insert(itemRows(userId, root.id, normalized.items));
  if (itemResult.error) {
    await rollbackCreatedSavedMeal(supabase, root.id);
    throw databaseError("Saved Meal items could not be saved.", itemResult.error);
  }
  return root;
}

export async function updateSavedMeal(
  supabase: SupabaseClient,
  userId: string,
  savedMealId: string,
  input: SavedMealWriteInput,
): Promise<SavedMealRecord> {
  requiredUuid(userId, "Owner");
  requiredUuid(savedMealId, "Saved Meal");
  const normalized = normalizeWriteInput(input);

  const currentRoot = await supabase
    .from("nutrition_saved_meals")
    .select("id,name,note,is_favorite,deleted_at")
    .eq("id", savedMealId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (currentRoot.error || !currentRoot.data) {
    throw databaseError("Saved Meal could not be loaded for editing.", currentRoot.error);
  }

  const currentItems = await supabase
    .from("nutrition_saved_meal_items")
    .select("id")
    .eq("saved_meal_id", savedMealId)
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (currentItems.error) {
    throw databaseError("Saved Meal items could not be loaded for editing.", currentItems.error);
  }
  const oldItemIds = (currentItems.data ?? [])
    .map((row) => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string" && isUuid(id));

  const insertResult = await supabase
    .from("nutrition_saved_meal_items")
    .insert(itemRows(userId, savedMealId, normalized.items));
  if (insertResult.error) {
    throw databaseError("Updated Saved Meal items could not be saved.", insertResult.error);
  }

  const rootResult = await supabase
    .from("nutrition_saved_meals")
    .update({
      name: normalized.name,
      note: normalized.note,
      is_favorite: normalized.isFavorite,
    })
    .eq("id", savedMealId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select(ROOT_COLUMNS)
    .single();
  if (rootResult.error || !rootResult.data) {
    throw databaseError("Saved Meal could not be updated.", rootResult.error);
  }

  if (oldItemIds.length) {
    const deleteResult = await supabase
      .from("nutrition_saved_meal_items")
      .delete()
      .eq("saved_meal_id", savedMealId)
      .eq("user_id", userId)
      .in("id", oldItemIds);
    if (deleteResult.error) {
      throw databaseError("Previous Saved Meal items could not be retired.", deleteResult.error);
    }
  }

  return rootResult.data as SavedMealRecord;
}

function persistedSnapshot(
  row: Record<string, unknown>,
): SavedMealItemInput {
  const frozen = row.frozen_snapshot;
  if (!frozen || typeof frozen !== "object" || Array.isArray(frozen)) {
    throw new Error("Saved Meal contains an invalid frozen item snapshot.");
  }
  const normalized = normalizeItem(frozen as SavedMealItemInput);
  if (row.item_type === "food" && normalized.kind === "food") {
    if (
      normalized.food_id !== row.food_id ||
      normalized.resolved_quantity !== Number(row.resolved_quantity) ||
      normalized.resolved_serving_label !== row.resolved_serving_label ||
      normalized.frozen_name !== row.frozen_name
    ) {
      throw new Error("Saved Meal Food snapshot lineage is inconsistent.");
    }
    return normalized;
  }
  if (row.item_type === "recipe" && normalized.kind === "recipe") {
    if (
      normalized.recipe.recipe_id !== row.recipe_id ||
      normalized.recipe.recipe_version_id !== row.recipe_version_id ||
      normalized.recipe.resolved_serving_quantity !== Number(row.resolved_quantity) ||
      normalized.recipe.resolved_serving_label !== row.resolved_serving_label ||
      normalized.recipe.frozen_recipe_name !== row.frozen_name
    ) {
      throw new Error("Saved Meal Recipe snapshot lineage is inconsistent.");
    }
    return normalized;
  }
  throw new Error("Saved Meal item type does not match its frozen snapshot.");
}

export async function resolveSavedMealBundleSnapshot(
  supabase: SupabaseClient,
  userId: string,
  savedMealId: string,
): Promise<SavedMealBundleSnapshot> {
  requiredUuid(userId, "Owner");
  requiredUuid(savedMealId, "Saved Meal");

  const rootResult = await supabase
    .from("nutrition_saved_meals")
    .select("id,name,deleted_at")
    .eq("id", savedMealId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (rootResult.error || !rootResult.data) {
    throw databaseError("Saved Meal is unavailable.", rootResult.error);
  }

  const itemResult = await supabase
    .from("nutrition_saved_meal_items")
    .select(ITEM_COLUMNS)
    .eq("saved_meal_id", savedMealId)
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (itemResult.error) {
    throw databaseError("Saved Meal items are unavailable.", itemResult.error);
  }
  const items = (itemResult.data ?? []).map((row) =>
    persistedSnapshot(row as Record<string, unknown>),
  );
  if (!items.length) throw new Error("Saved Meal has no reusable items.");

  return {
    saved_meal_id: savedMealId,
    frozen_name: requiredText(
      (rootResult.data as { name?: unknown }).name,
      "Saved Meal name",
      200,
    ),
    items,
  };
}

async function lifecycle(
  supabase: SupabaseClient,
  rpcName:
    | "soft_delete_nutrition_saved_meal"
    | "restore_nutrition_saved_meal"
    | "purge_nutrition_saved_meal_now",
  savedMealId: string,
) {
  requiredUuid(savedMealId, "Saved Meal");
  const result = await supabase.rpc(rpcName, {
    p_saved_meal_id: savedMealId,
  });
  if (result.error || !result.data || typeof result.data !== "object") {
    throw databaseError("Saved Meal lifecycle action failed.", result.error);
  }
  const data = result.data as Record<string, unknown>;
  if (data.id !== savedMealId) {
    throw new Error("Saved Meal lifecycle returned an unexpected identity.");
  }
  return data as { id: string } & Record<string, unknown>;
}

export function softDeleteSavedMeal(
  supabase: SupabaseClient,
  savedMealId: string,
) {
  return lifecycle(supabase, "soft_delete_nutrition_saved_meal", savedMealId);
}

export function restoreSavedMeal(
  supabase: SupabaseClient,
  savedMealId: string,
) {
  return lifecycle(supabase, "restore_nutrition_saved_meal", savedMealId);
}

export function purgeSavedMealNow(
  supabase: SupabaseClient,
  savedMealId: string,
) {
  return lifecycle(supabase, "purge_nutrition_saved_meal_now", savedMealId);
}
