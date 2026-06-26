"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid, todayIso } from "@/lib/utils";
import type { FoodItem, FoodLog, MealType } from "@/types";

export type FoodFavoriteKey = string;
export type ServingUnit = "grams" | "pieces" | "cups" | "tablespoons" | "serving" | "portion";

export type QuickAddInput = {
  userId: string;
  date?: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG?: number;
  fatG?: number;
  notes?: string | null;
};

export type RecipeIngredient = {
  id: string;
  foodName: string;
  quantity: number;
  servingUnit: ServingUnit;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type SavedRecipe = {
  id: string;
  user_id: string;
  name: string;
  portions: number;
  ingredients: RecipeIngredient[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const favoritePrefix = "plaivra-food-favorites";
const recipePrefix = "plaivra-recipes";

function storageKey(prefix: string, userId: string | null | undefined) {
  return `${prefix}:${userId || "anonymous"}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson<T>(key: string, fallback: T): T {
  // TODO(migration): Move favorite foods and recipes to Supabase
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(key.replace("plaivra-", "fitlife-"));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.localStorage.removeItem(key.replace("plaivra-", "fitlife-"));
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMealType(value: string | null | undefined): MealType {
  const clean = String(value ?? "Breakfast").toLowerCase();
  if (clean === "breakfast") return "Breakfast";
  if (clean === "lunch") return "Lunch";
  if (clean === "dinner") return "Dinner";
  if (clean === "snack" || clean === "snacks") return "Snack";
  return "Breakfast";
}

function canUseUserData(userId: string | null | undefined): userId is string {
  return Boolean(supabase && userId && isUuid(userId));
}

function normalizeFoodLog(row: Record<string, unknown>): FoodLog {
  return {
    id: String(row.id || crypto.randomUUID()),
    user_id: String(row.user_id || ""),
    food_item_id: typeof row.food_item_id === "string" ? row.food_item_id : null,
    user_food_item_id: typeof row.user_food_item_id === "string" ? row.user_food_item_id : null,
    log_date: String(row.log_date || todayIso()),
    meal_type: String(row.meal_type || "Breakfast"),
    food_name: String(row.food_name || "Food"),
    serving_size: String(row.serving_size || "1 serving"),
    quantity: toNumber(row.quantity) || 1,
    calories: toNumber(row.calories),
    protein_g: toNumber(row.protein_g),
    carbs_g: toNumber(row.carbs_g),
    fat_g: toNumber(row.fat_g),
    notes: typeof row.notes === "string" ? row.notes : null
  };
}

export async function getRecentFoodLogs(userId: string, limit = 80) {
  if (!canUseUserData(userId)) return [] as FoodLog[];
  const { data, error } = await supabase!
    .from("food_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Plaivra could not load recent food logs.", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeFoodLog);
}

export async function logFoodFromPreviousLog(userId: string, source: FoodLog, date = todayIso(), mealType?: MealType) {
  const payload = {
    user_id: userId,
    food_item_id: source.food_item_id,
    user_food_item_id: source.user_food_item_id,
    log_date: date,
    meal_type: normalizeMealType(mealType ?? source.meal_type),
    food_name: source.food_name,
    serving_size: source.serving_size,
    quantity: Math.max(0.1, toNumber(source.quantity) || 1),
    calories: Math.max(0, toNumber(source.calories)),
    protein_g: Math.max(0, toNumber(source.protein_g)),
    carbs_g: Math.max(0, toNumber(source.carbs_g)),
    fat_g: Math.max(0, toNumber(source.fat_g)),
    notes: source.notes || "Logged again from a real previous food log."
  };
  if (!canUseUserData(userId)) return { ...payload, id: crypto.randomUUID() } as FoodLog;
  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return normalizeFoodLog(data as Record<string, unknown>);
}

export async function quickAddManualFoodLog(input: QuickAddInput) {
  const calories = Math.max(0, toNumber(input.calories));
  const proteinG = Math.max(0, toNumber(input.proteinG));
  const carbsG = Math.max(0, toNumber(input.carbsG ?? 0));
  const fatG = Math.max(0, toNumber(input.fatG ?? 0));
  if (calories <= 0 && proteinG <= 0 && carbsG <= 0 && fatG <= 0) throw new Error("Enter calories or macros before quick adding.");
  const payload = {
    user_id: input.userId,
    food_item_id: null,
    user_food_item_id: null,
    log_date: input.date ?? todayIso(),
    meal_type: normalizeMealType(input.mealType),
    food_name: "Quick manual entry",
    serving_size: "manual quick entry",
    quantity: 1,
    calories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    notes: ["Quick/manual entry. Estimated, not verified nutrition data.", input.notes?.trim()].filter(Boolean).join(" ")
  };
  if (!canUseUserData(input.userId)) return { ...payload, id: crypto.randomUUID() } as FoodLog;
  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return normalizeFoodLog(data as Record<string, unknown>);
}

export function favoriteKeyForFood(food: Pick<FoodItem, "id" | "food_name" | "serving_size">): FoodFavoriteKey {
  return food.id || `${food.food_name}|${food.serving_size}`.toLowerCase();
}

export function favoriteKeyForLog(log: FoodLog): FoodFavoriteKey {
  return log.food_item_id || log.user_food_item_id || `${log.food_name}|${log.serving_size}`.toLowerCase();
}

export function getFavoriteFoodKeys(userId: string | null | undefined) {
  return readJson<FoodFavoriteKey[]>(storageKey(favoritePrefix, userId), []);
}

export function setFavoriteFood(userId: string | null | undefined, key: FoodFavoriteKey, favorite: boolean) {
  const current = new Set(getFavoriteFoodKeys(userId));
  if (favorite) current.add(key);
  else current.delete(key);
  const next = Array.from(current);
  writeJson(storageKey(favoritePrefix, userId), next);
  return next;
}

let migratedFavoriteUsers = new Set<string>();

export async function getFavoriteFoodKeysAsync(userId: string | null | undefined) {
  const local = getFavoriteFoodKeys(userId);
  if (!canUseUserData(userId)) return local;

  if (!migratedFavoriteUsers.has(userId)) {
    migratedFavoriteUsers = new Set([...migratedFavoriteUsers, userId]);
    if (local.length) {
      await Promise.all(
        local.map((foodKey) =>
          supabase!
            .from("user_food_favorites")
            .upsert({ user_id: userId, food_key: foodKey }, { onConflict: "user_id,food_key" })
        )
      );
      if (canUseStorage()) window.localStorage.removeItem(storageKey(favoritePrefix, userId));
    }
  }

  const { data, error } = await supabase!
    .from("user_food_favorites")
    .select("food_key")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Plaivra could not load synced food favorites.", error.message);
    return local;
  }
  return (data ?? []).map((item) => String(item.food_key));
}

export async function setFavoriteFoodAsync(userId: string | null | undefined, key: FoodFavoriteKey, favorite: boolean, label?: string) {
  if (!canUseUserData(userId)) return setFavoriteFood(userId, key, favorite);

  const result = favorite
    ? await supabase!
        .from("user_food_favorites")
        .upsert({ user_id: userId, food_key: key, label: label ?? null }, { onConflict: "user_id,food_key" })
    : await supabase!.from("user_food_favorites").delete().eq("user_id", userId).eq("food_key", key);

  if (result.error) {
    console.warn("Plaivra could not update synced food favorite.", result.error.message);
    return setFavoriteFood(userId, key, favorite);
  }
  return getFavoriteFoodKeysAsync(userId);
}

export function getSavedRecipes(userId: string | null | undefined) {
  return readJson<SavedRecipe[]>(storageKey(recipePrefix, userId), []);
}

let migratedRecipeUsers = new Set<string>();

function buildRecipe(userId: string | null | undefined, input: Omit<SavedRecipe, "id" | "user_id" | "created_at" | "updated_at">): SavedRecipe {
  const name = input.name.trim();
  if (!name) throw new Error("Recipe name is required.");
  const portions = Math.max(1, Math.round(toNumber(input.portions)));
  if (!input.ingredients.length) throw new Error("Add at least one ingredient.");
  const now = new Date().toISOString();
  return {
    id: `recipe-${crypto.randomUUID()}`,
    user_id: userId || "anonymous",
    name,
    portions,
    ingredients: input.ingredients.map((ingredient) => ({
      ...ingredient,
      foodName: ingredient.foodName.trim() || "Ingredient",
      quantity: Math.max(0.1, toNumber(ingredient.quantity) || 1),
      calories: Math.max(0, toNumber(ingredient.calories)),
      proteinG: Math.max(0, toNumber(ingredient.proteinG)),
      carbsG: Math.max(0, toNumber(ingredient.carbsG)),
      fatG: Math.max(0, toNumber(ingredient.fatG))
    })),
    notes: input.notes?.trim() || null,
    created_at: now,
    updated_at: now
  };
}

function normalizeRecipeRow(recipe: Record<string, unknown>, ingredients: Record<string, unknown>[]): SavedRecipe {
  return {
    id: String(recipe.id),
    user_id: String(recipe.user_id),
    name: String(recipe.name),
    portions: Math.max(1, Math.round(toNumber(recipe.portions) || 1)),
    notes: typeof recipe.notes === "string" ? recipe.notes : null,
    created_at: String(recipe.created_at || new Date().toISOString()),
    updated_at: String(recipe.updated_at || recipe.created_at || new Date().toISOString()),
    ingredients: ingredients.map((ingredient) => ({
      id: String(ingredient.id),
      foodName: String(ingredient.food_name || "Ingredient"),
      quantity: Math.max(0.1, toNumber(ingredient.quantity) || 1),
      servingUnit: (String(ingredient.serving_unit || "serving") as ServingUnit),
      calories: Math.max(0, toNumber(ingredient.calories)),
      proteinG: Math.max(0, toNumber(ingredient.protein_g)),
      carbsG: Math.max(0, toNumber(ingredient.carbs_g)),
      fatG: Math.max(0, toNumber(ingredient.fat_g))
    }))
  };
}

async function migrateLocalRecipes(userId: string, local: SavedRecipe[]) {
  if (!local.length) return;
  for (const recipe of local) {
    const { data: savedRecipe, error } = await supabase!
      .from("saved_recipes")
      .insert({
        user_id: userId,
        name: recipe.name,
        portions: recipe.portions,
        notes: recipe.notes,
        created_at: recipe.created_at,
        updated_at: recipe.updated_at
      })
      .select("id")
      .single();
    if (error || !savedRecipe) {
      console.warn("Plaivra could not migrate a saved recipe.", error?.message);
      continue;
    }

    const rows = recipe.ingredients.map((ingredient) => ({
      recipe_id: savedRecipe.id,
      user_id: userId,
      food_name: ingredient.foodName,
      quantity: Math.max(0.1, toNumber(ingredient.quantity) || 1),
      serving_unit: ingredient.servingUnit,
      calories: Math.max(0, toNumber(ingredient.calories)),
      protein_g: Math.max(0, toNumber(ingredient.proteinG)),
      carbs_g: Math.max(0, toNumber(ingredient.carbsG)),
      fat_g: Math.max(0, toNumber(ingredient.fatG))
    }));
    if (rows.length) {
      const ingredientResult = await supabase!.from("saved_recipe_ingredients").insert(rows);
      if (ingredientResult.error) console.warn("Plaivra could not migrate recipe ingredients.", ingredientResult.error.message);
    }
  }
  if (canUseStorage()) window.localStorage.removeItem(storageKey(recipePrefix, userId));
}

export async function getSavedRecipesAsync(userId: string | null | undefined) {
  const local = getSavedRecipes(userId);
  if (!canUseUserData(userId)) return local;

  if (!migratedRecipeUsers.has(userId)) {
    migratedRecipeUsers = new Set([...migratedRecipeUsers, userId]);
    await migrateLocalRecipes(userId, local);
  }

  const { data: recipes, error } = await supabase!
    .from("saved_recipes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Plaivra could not load synced recipes.", error.message);
    return local;
  }

  const recipeIds = (recipes ?? []).map((recipe) => recipe.id);
  const ingredientsResult = recipeIds.length
    ? await supabase!.from("saved_recipe_ingredients").select("*").in("recipe_id", recipeIds)
    : { data: [], error: null };
  if (ingredientsResult.error) {
    console.warn("Plaivra could not load synced recipe ingredients.", ingredientsResult.error.message);
    return local;
  }

  return ((recipes ?? []) as Record<string, unknown>[]).map((recipe) =>
    normalizeRecipeRow(
      recipe,
      ((ingredientsResult.data ?? []) as Record<string, unknown>[]).filter((ingredient) => ingredient.recipe_id === recipe.id)
    )
  );
}

export function saveRecipe(userId: string | null | undefined, input: Omit<SavedRecipe, "id" | "user_id" | "created_at" | "updated_at">) {
  const recipe = buildRecipe(userId, input);
  const key = storageKey(recipePrefix, userId);
  writeJson(key, [recipe, ...getSavedRecipes(userId)]);
  return recipe;
}

export async function saveRecipeAsync(userId: string | null | undefined, input: Omit<SavedRecipe, "id" | "user_id" | "created_at" | "updated_at">) {
  if (!canUseUserData(userId)) return saveRecipe(userId, input);

  const recipe = buildRecipe(userId, input);
  const { data, error } = await supabase!
    .from("saved_recipes")
    .insert({
      user_id: userId,
      name: recipe.name,
      portions: recipe.portions,
      notes: recipe.notes
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Recipe could not be saved.");

  const rows = recipe.ingredients.map((ingredient) => ({
    recipe_id: data.id,
    user_id: userId,
    food_name: ingredient.foodName,
    quantity: ingredient.quantity,
    serving_unit: ingredient.servingUnit,
    calories: ingredient.calories,
    protein_g: ingredient.proteinG,
    carbs_g: ingredient.carbsG,
    fat_g: ingredient.fatG
  }));
  const ingredientsResult = rows.length
    ? await supabase!.from("saved_recipe_ingredients").insert(rows).select("*")
    : { data: [], error: null };
  if (ingredientsResult.error) throw new Error(ingredientsResult.error.message);

  return normalizeRecipeRow(data as Record<string, unknown>, (ingredientsResult.data ?? []) as Record<string, unknown>[]);
}

export function deleteRecipe(userId: string | null | undefined, recipeId: string) {
  const key = storageKey(recipePrefix, userId);
  writeJson(key, getSavedRecipes(userId).filter((recipe) => recipe.id !== recipeId));
}

export async function deleteRecipeAsync(userId: string | null | undefined, recipeId: string) {
  if (!canUseUserData(userId)) {
    deleteRecipe(userId, recipeId);
    return;
  }
  const { error } = await supabase!.from("saved_recipes").delete().eq("user_id", userId).eq("id", recipeId);
  if (error) throw new Error(error.message);
}

export function recipeTotals(recipe: Pick<SavedRecipe, "ingredients" | "portions">) {
  const total = recipe.ingredients.reduce(
    (sum, ingredient) => ({
      calories: sum.calories + toNumber(ingredient.calories),
      protein_g: Math.round((sum.protein_g + toNumber(ingredient.proteinG)) * 10) / 10,
      carbs_g: Math.round((sum.carbs_g + toNumber(ingredient.carbsG)) * 10) / 10,
      fat_g: Math.round((sum.fat_g + toNumber(ingredient.fatG)) * 10) / 10
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
  const portions = Math.max(1, toNumber(recipe.portions) || 1);
  return {
    total,
    perPortion: {
      calories: Math.round(total.calories / portions),
      protein_g: Math.round((total.protein_g / portions) * 10) / 10,
      carbs_g: Math.round((total.carbs_g / portions) * 10) / 10,
      fat_g: Math.round((total.fat_g / portions) * 10) / 10
    }
  };
}

export async function logRecipePortion(userId: string, recipe: SavedRecipe, date = todayIso(), mealType: MealType = "Breakfast") {
  const { perPortion } = recipeTotals(recipe);
  const payload = {
    user_id: userId,
    food_item_id: null,
    user_food_item_id: null,
    log_date: date,
    meal_type: normalizeMealType(mealType),
    food_name: recipe.name,
    serving_size: "1 recipe portion",
    quantity: 1,
    calories: perPortion.calories,
    protein_g: perPortion.protein_g,
    carbs_g: perPortion.carbs_g,
    fat_g: perPortion.fat_g,
    notes: ["Recipe portion from saved recipe.", recipe.notes].filter(Boolean).join(" ")
  };
  if (!canUseUserData(userId)) return { ...payload, id: crypto.randomUUID() } as FoodLog;
  const { data, error } = await supabase!.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return normalizeFoodLog(data as Record<string, unknown>);
}
