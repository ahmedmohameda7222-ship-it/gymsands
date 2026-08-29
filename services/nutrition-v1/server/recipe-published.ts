import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipeNutritionPerServing } from "@/lib/nutrition-v1/recipe-cache";
import { getCatalogVerificationStates } from "@/services/nutrition-v1/server/food-catalog";

function fail(error: unknown) {
  if (!error) return;
  throw new Error(error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message) : "Published Recipe could not be loaded.");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nutrition(value: unknown): RecipeNutritionPerServing | null {
  const meta = record(value);
  const raw = record(meta.nutrition_per_serving ?? meta.nutritionPerServing);
  const out: RecipeNutritionPerServing = { calories: null, protein_g: null, carbs_g: null, fat_g: null };
  let known = false;
  for (const key of Object.keys(out) as Array<keyof RecipeNutritionPerServing>) {
    const item = raw[key];
    if (item === null || item === undefined) continue;
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0) return null;
    out[key] = item;
    known = true;
  }
  return known ? out : null;
}

export async function getPublishedRecipeDetail(supabase: SupabaseClient, userId: string, recipeId: string) {
  const rootResult = await supabase.from("nutrition_recipes").select("*").eq("id", recipeId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  fail(rootResult.error);
  if (!rootResult.data) throw new Error("Recipe not found.");

  const versionResult = await supabase.from("nutrition_recipe_versions").select("*").eq("recipe_id", recipeId).eq("user_id", userId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  fail(versionResult.error);
  if (!versionResult.data) return { root: rootResult.data, latestVersion: null, ingredients: [], instructions: [], equipment: [], nutritionPerServing: null, cuisine: null };
  const versionId = String(versionResult.data.id);

  const [ingredientsResult, instructionsResult, equipmentResult, draftResult] = await Promise.all([
    supabase.from("nutrition_recipe_ingredients").select("*").eq("user_id", userId).eq("recipe_version_id", versionId).order("position", { ascending: true }),
    supabase.from("nutrition_recipe_actions").select("*").eq("user_id", userId).eq("recipe_version_id", versionId).order("position", { ascending: true }),
    supabase.from("nutrition_recipe_equipment").select("*").eq("user_id", userId).eq("recipe_version_id", versionId).order("position", { ascending: true }),
    supabase.from("nutrition_recipe_drafts").select("id,updated_at").eq("user_id", userId).eq("recipe_id", recipeId).maybeSingle(),
  ]);
  fail(ingredientsResult.error); fail(instructionsResult.error); fail(equipmentResult.error); fail(draftResult.error);

  const ingredientRows = (ingredientsResult.data ?? []) as Array<Record<string, unknown>>;
  const foodIds = Array.from(new Set(ingredientRows.map((row) => typeof row.food_id === "string" ? row.food_id : null).filter((id): id is string => Boolean(id))));
  const verified = await getCatalogVerificationStates(supabase, foodIds);

  const metadata = record(versionResult.data.metadata);
  return {
    root: rootResult.data,
    latestVersion: versionResult.data,
    hasWorkingDraft: Boolean(draftResult.data?.id),
    ingredients: ingredientRows.map((row) => ({ ...row, verified: typeof row.food_id === "string" && verified.get(row.food_id) === true })),
    instructions: instructionsResult.data ?? [],
    equipment: equipmentResult.data ?? [],
    nutritionPerServing: nutrition(metadata),
    cuisine: typeof metadata.cuisine === "string" && metadata.cuisine.trim() ? metadata.cuisine.trim() : null,
  };
}
