import type { SupabaseClient } from "@supabase/supabase-js";

import { findCatalogDuplicateByName } from "@/services/nutrition-v1/server/food-catalog";

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
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  basisAmount: number | null;
  basisUnit: "g" | "ml" | null;
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

export async function findPossibleFoodDuplicate(supabase: SupabaseClient, userId: string, name: string) {
  const clean = text(name);
  if (!clean) return null;
  const [personal, catalog] = await Promise.all([
    supabase.from("user_food_items")
      .select("id,food_name,serving_size")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .ilike("food_name", clean)
      .limit(1)
      .maybeSingle(),
    findCatalogDuplicateByName(supabase, clean),
  ]);
  if (personal.error) throw new Error(`Custom Food duplicate read: ${personal.error.message ?? "database error"}`);
  if (personal.data) return { source: "my_food" as const, ...personal.data };
  if (catalog) return { source: "catalog" as const, ...catalog };
  return null;
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

export async function setFoodPersonalCorrection(supabase: SupabaseClient, userId: string, input: PersonalCorrectionInput) {
  if (!text(input.foodId)) throw new Error("Food ID is required.");
  const payload = {
    user_id: userId,
    food_id: input.foodId,
    calories: nullableNonNegative(input.calories, "Calories"),
    protein_g: nullableNonNegative(input.proteinG, "Protein"),
    carbs_g: nullableNonNegative(input.carbsG, "Carbs"),
    fat_g: nullableNonNegative(input.fatG, "Fat"),
    basis_amount: nullablePositive(input.basisAmount, "Basis amount"),
    basis_unit: input.basisUnit === "g" || input.basisUnit === "ml" ? input.basisUnit : null,
    note: text(input.note) || null,
    is_active: true,
  };
  if ([payload.calories, payload.protein_g, payload.carbs_g, payload.fat_g, payload.basis_amount, payload.basis_unit].every((value) => value === null)) {
    throw new Error("A personal correction must contain at least one value.");
  }
  const result = await supabase.from("food_personal_corrections")
    .upsert(payload, { onConflict: "user_id,food_id" })
    .select("food_id,calories,protein_g,carbs_g,fat_g,basis_amount,basis_unit,note,is_active")
    .single();
  return checked(result, "Food personal correction write");
}
