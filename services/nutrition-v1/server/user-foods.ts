import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "@/lib/utils";
import {
  resolveCurrentGenerationFoodForNewUse,
} from "@/services/food-catalog/server/current-generation-service";
import { createSupabaseFoodCatalogGenerationReadStore } from "@/services/food-catalog/server/supabase-generation-read-store";
import { listFoodLibrary, normalizeFoodSearchText } from "@/services/nutrition-v1/server/food-library";
import {
  readCurrentPersonalOverride,
  type CurrentPersonalOverride,
} from "@/services/nutrition-v1/server/personal-overrides";

export type UserFoodBasisUnit = "g" | "ml" | "serving" | "piece" | "custom";

export type UserFoodWriteInput = {
  id?: string;
  name: string;
  servingLabel: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  basisAmount: number | null;
  basisUnit: UserFoodBasisUnit | null;
  notes?: string | null;
  category?: string | null;
  createSeparately?: boolean;
};

export type PersonalCorrectionInput = {
  foodId: string;
  operationId: string;
  expectedRevisionId: string | null;
  expectedPointerRevision: number;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  saturatedFatG?: number | null;
  fiberG?: number | null;
  sugarsG?: number | null;
  sodiumMg?: number | null;
  servingLabel?: string | null;
  note?: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredNonNegative(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number.`);
  return number;
}

function nullableNonNegative(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  return requiredNonNegative(value, label);
}

function nullablePositive(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
  return number;
}

function checked<T>(result: { data: T | null; error: { message?: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message ?? "database error"}`);
  return result.data as T;
}

function normalizeWrite(input: UserFoodWriteInput) {
  const name = text(input.name);
  const servingLabel = text(input.servingLabel);
  if (!name) throw new Error("Food name is required.");
  if (!servingLabel) throw new Error("Serving basis is required.");
  const basisUnit = input.basisUnit;
  if (basisUnit !== null && !["g", "ml", "serving", "piece", "custom"].includes(basisUnit)) throw new Error("Serving basis is invalid.");
  return {
    food_name: name,
    serving_size: servingLabel,
    calories: requiredNonNegative(input.calories, "Calories"),
    protein_g: nullableNonNegative(input.proteinG, "Protein"),
    carbs_g: nullableNonNegative(input.carbsG, "Carbs"),
    fat_g: nullableNonNegative(input.fatG, "Fat"),
    nutrition_basis_amount: nullablePositive(input.basisAmount, "Basis amount"),
    nutrition_basis_unit: basisUnit,
    notes: text(input.notes) || null,
    category: text(input.category) || "Custom",
    deleted_at: null,
  };
}

async function resolveCorrectionFoodId(
  supabase: SupabaseClient,
  requestedFoodId: string,
): Promise<string> {
  if (!isUuid(requestedFoodId)) throw new Error("Food ID must be a valid ID.");
  const store = createSupabaseFoodCatalogGenerationReadStore(supabase);
  const view = await resolveCurrentGenerationFoodForNewUse(store, requestedFoodId);
  return view.resolvedFoodId;
}

export async function findPossibleFoodDuplicate(supabase: SupabaseClient, userId: string, name: string) {
  const clean = text(name);
  if (!clean) return null;
  const normalized = normalizeFoodSearchText(clean);
  if (!normalized) return null;

  const page = await listFoodLibrary(supabase, userId, {
    query: clean,
    locale: "en",
    marketScopeCode: null,
    limit: 20,
    scope: "all",
  });
  const strong = page.items.filter((candidate) => (
    (candidate.source === "catalog" || candidate.source === "my_food")
    && normalizeFoodSearchText(candidate.name) === normalized
  ));
  const candidate = strong.find((item) => item.source === "my_food")
    ?? strong.find((item) => item.source === "catalog")
    ?? null;
  if (!candidate) return null;

  return {
    id: candidate.id,
    source: candidate.source,
    food_name: candidate.name,
    serving_size: candidate.servingLabel ?? "",
  };
}

export async function createUserFood(supabase: SupabaseClient, userId: string, input: UserFoodWriteInput) {
  const payload = normalizeWrite(input);
  const duplicate = input.createSeparately ? null : await findPossibleFoodDuplicate(supabase, userId, payload.food_name);
  if (duplicate) return { food: null, duplicate };
  const result = await supabase.from("user_food_items")
    .insert({ user_id: userId, ...payload })
    .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,nutrition_basis_amount,nutrition_basis_unit,notes,category")
    .single();
  return { food: checked(result, "Custom Food create"), duplicate: null };
}

export async function updateUserFood(supabase: SupabaseClient, userId: string, input: UserFoodWriteInput) {
  if (!text(input.id)) throw new Error("Custom Food ID is required.");
  const payload = normalizeWrite(input);
  const result = await supabase.from("user_food_items")
    .update(payload)
    .eq("id", input.id as string)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,nutrition_basis_amount,nutrition_basis_unit,notes,category")
    .single();
  return checked(result, "Custom Food update");
}

export async function deleteUserFood(supabase: SupabaseClient, userId: string, foodId: string) {
  if (!text(foodId)) throw new Error("Custom Food ID is required.");
  const result = await supabase.from("user_food_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", foodId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .single();
  return { foodId: checked(result, "Custom Food delete").id, deleted: true };
}

export async function getFoodPersonalCorrectionState(
  supabase: SupabaseClient,
  userId: string,
  foodId: string,
): Promise<CurrentPersonalOverride> {
  if (!isUuid(userId)) throw new Error("Owner must be a valid ID.");
  const resolvedFoodId = await resolveCorrectionFoodId(supabase, foodId);
  return readCurrentPersonalOverride(supabase, resolvedFoodId);
}

export async function setFoodPersonalCorrection(
  supabase: SupabaseClient,
  userId: string,
  input: PersonalCorrectionInput,
) {
  if (!isUuid(userId)) throw new Error("Owner must be a valid ID.");
  if (!isUuid(input.operationId)) throw new Error("Personal correction operation ID must be a valid ID.");
  if (input.expectedRevisionId !== null && !isUuid(input.expectedRevisionId)) {
    throw new Error("Personal correction expected revision ID must be valid.");
  }
  if (!Number.isSafeInteger(input.expectedPointerRevision) || input.expectedPointerRevision < 0) {
    throw new Error("Personal correction expected pointer revision is invalid.");
  }
  if (
    (input.expectedRevisionId === null && input.expectedPointerRevision !== 0)
    || (input.expectedRevisionId !== null && input.expectedPointerRevision < 1)
  ) {
    throw new Error("Personal correction CAS authority is inconsistent.");
  }

  const foodId = await resolveCorrectionFoodId(supabase, input.foodId);
  const nutritionOverride = {
    calories: nullableNonNegative(input.calories, "Calories"),
    protein_g: nullableNonNegative(input.proteinG, "Protein"),
    carbs_g: nullableNonNegative(input.carbsG, "Carbs"),
    fat_g: nullableNonNegative(input.fatG, "Fat"),
    saturated_fat_g: nullableNonNegative(input.saturatedFatG, "Saturated fat"),
    fiber_g: nullableNonNegative(input.fiberG, "Fiber"),
    sugars_g: nullableNonNegative(input.sugarsG, "Sugars"),
    sodium_mg: nullableNonNegative(input.sodiumMg, "Sodium"),
  };
  const servingLabel = text(input.servingLabel) || null;
  const note = text(input.note) || null;
  if (
    Object.values(nutritionOverride).every((value) => value === null)
    && servingLabel === null
    && note === null
  ) {
    throw new Error("A personal correction must contain at least one value.");
  }

  const result = await supabase.rpc("food_catalog_set_personal_override", {
    p_operation_id: input.operationId,
    p_food_id: foodId,
    p_expected_revision_id: input.expectedRevisionId,
    p_expected_pointer_revision: input.expectedPointerRevision,
    p_nutrition_override: nutritionOverride,
    p_serving_label: servingLabel,
    p_note: note,
  });
  return checked(result, "Food personal correction write");
}
