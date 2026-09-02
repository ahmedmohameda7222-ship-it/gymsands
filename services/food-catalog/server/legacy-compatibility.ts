import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "@/lib/utils";
import type { CatalogFoodNutrition, ResolvedCatalogFood } from "./contracts";

// Transitional Nutrition V1 compatibility boundary. This legacy projection remains
// until a later authorized plan cuts member consumers over to selected V2 facts.
type DbError = { message?: string } | null;
type CatalogRow = Record<string, unknown>;

const MAX_MERGE_REDIRECT_DEPTH = 8;
const BASIS_UNITS = new Set<NonNullable<CatalogFoodNutrition["basis_unit"]>>(["g", "ml", "serving", "piece", "custom"]);

function errorMessage(error: DbError) {
  return error?.message?.trim() || "database error";
}

function record(value: unknown): CatalogRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as CatalogRow
    : {};
}

function requiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is unavailable.`);
  return text;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function basisUnit(value: unknown): CatalogFoodNutrition["basis_unit"] {
  return typeof value === "string" && BASIS_UNITS.has(value as NonNullable<CatalogFoodNutrition["basis_unit"]>)
    ? value as NonNullable<CatalogFoodNutrition["basis_unit"]>
    : null;
}

function nutritionFromRow(row: CatalogRow): CatalogFoodNutrition {
  return {
    calories: numberOrNull(row.calories),
    protein_g: numberOrNull(row.protein_g),
    carbs_g: numberOrNull(row.carbs_g),
    fat_g: numberOrNull(row.fat_g),
    saturated_fat_g: numberOrNull(row.saturated_fat_g),
    fiber_g: numberOrNull(row.fiber_g),
    sugars_g: numberOrNull(row.sugars_g),
    sodium_mg: numberOrNull(row.sodium_mg),
    basis_amount: numberOrNull(row.nutrition_basis_amount),
    basis_unit: basisUnit(row.nutrition_basis_unit),
  };
}

export async function resolveCatalogFood(
  supabase: SupabaseClient,
  foodId: string,
): Promise<ResolvedCatalogFood> {
  let currentFoodId = foodId;
  for (let depth = 0; depth < MAX_MERGE_REDIRECT_DEPTH; depth += 1) {
    const result = await supabase
      .from("food_items")
      .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,saturated_fat_g,fiber_g,sugars_g,sodium_mg,nutrition_basis_amount,nutrition_basis_unit,lifecycle_status,merged_into_food_id,is_verified")
      .eq("id", currentFoodId)
      .maybeSingle();
    if (result.error) throw new Error(`Food Catalog resolve: ${errorMessage(result.error)}`);
    if (!result.data) throw new Error("Food is unavailable.");

    const row = record(result.data);
    const status = typeof row.lifecycle_status === "string" ? row.lifecycle_status.toLowerCase() : "active";
    const mergedInto = typeof row.merged_into_food_id === "string" ? row.merged_into_food_id : null;
    if (status === "merged") {
      if (!mergedInto || !isUuid(mergedInto)) throw new Error("Food merge lineage could not be resolved safely.");
      currentFoodId = mergedInto;
      continue;
    }
    if (status !== "active") throw new Error("Food is unavailable for new Nutrition writes.");

    return {
      id: currentFoodId,
      name: requiredText(row.food_name, "Food name"),
      servingLabel: requiredText(row.serving_size, "Food serving"),
      nutrition: nutritionFromRow(row),
      verified: row.is_verified === true,
    };
  }
  throw new Error("Food merge lineage could not be resolved safely.");
}

export async function getCatalogVerificationStates(
  supabase: SupabaseClient,
  foodIds: readonly string[],
): Promise<Map<string, boolean>> {
  const requested = Array.from(new Set(foodIds));
  if (!requested.length) return new Map();

  const result = await supabase
    .from("food_items")
    .select("id,is_verified")
    .in("id", requested);
  if (result.error) throw new Error(`Food Catalog verification read: ${errorMessage(result.error)}`);

  const requestedIds = new Set(requested);
  const states = new Map<string, boolean>();
  for (const raw of (result.data ?? []) as Array<Record<string, unknown>>) {
    const id = typeof raw.id === "string" ? raw.id : null;
    if (id && requestedIds.has(id)) states.set(id, raw.is_verified === true);
  }
  return states;
}

export async function searchCatalogFoodsByName(
  supabase: SupabaseClient,
  query: string,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const result = await supabase
    .from("food_items")
    .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,lifecycle_status,merged_into_food_id")
    .eq("is_global", true)
    .ilike("food_name", `%${query}%`)
    .limit(limit);
  if (result.error) throw new Error(errorMessage(result.error));

  const canonical = new Map<string, Record<string, unknown>>();
  for (const raw of (result.data ?? []) as Array<Record<string, unknown>>) {
    const row = record(raw);
    const status = typeof row.lifecycle_status === "string" ? row.lifecycle_status.toLowerCase() : "active";
    if (status !== "active" && status !== "merged") continue;
    const foodId = requiredText(row.id, "Catalog Food ID");
    const resolved = await resolveCatalogFood(supabase, foodId);
    if (canonical.has(resolved.id)) continue;
    canonical.set(resolved.id, {
      id: resolved.id,
      food_name: resolved.name,
      serving_size: resolved.servingLabel,
      calories: resolved.nutrition.calories,
      protein_g: resolved.nutrition.protein_g,
      carbs_g: resolved.nutrition.carbs_g,
      fat_g: resolved.nutrition.fat_g,
    });
  }
  return Array.from(canonical.values()).slice(0, limit);
}

export async function findCatalogDuplicateByName(
  supabase: SupabaseClient,
  name: string,
): Promise<{ id: string; food_name: string; serving_size: string } | null> {
  const clean = name.trim();
  if (!clean) return null;

  const result = await supabase
    .from("food_items")
    .select("id,food_name,serving_size")
    .eq("is_global", true)
    .eq("lifecycle_status", "active")
    .ilike("food_name", clean)
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(`Catalog duplicate read: ${errorMessage(result.error)}`);
  if (!result.data) return null;

  const row = record(result.data);
  return {
    id: requiredText(row.id, "Catalog Food ID"),
    food_name: requiredText(row.food_name, "Catalog Food name"),
    serving_size: requiredText(row.serving_size, "Catalog Food serving"),
  };
}
