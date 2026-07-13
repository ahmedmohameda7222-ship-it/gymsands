"use client";

import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/utils";
import type {
  DailyCheckinType,
  ExerciseAlternativeReason,
  GroceryStoreSection,
  NutritionTargetProfileType,
  UserDailyCheckin,
  UserExerciseAlternative,
  UserGroceryItem,
  UserNutritionPreferenceProfile,
  UserNutritionTargetProfile,
  UserProgressionTarget
} from "@/types";

function requireUser(userId: string) {
  if (!supabase || !isUuid(userId)) throw new Error("Please refresh, sign in again, and retry.");
}

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

export type FitnessConstraintInput = {
  injury_or_limitation_labels: string[];
  areas_to_protect: string[];
  movement_restrictions: string | null;
  nutrition_restrictions: string | null;
  legacy_context_notes: string | null;
};

const emptyFitnessConstraints: FitnessConstraintInput = {
  injury_or_limitation_labels: [],
  areas_to_protect: [],
  movement_restrictions: null,
  nutrition_restrictions: null,
  legacy_context_notes: null
};

function mapFitnessConstraints(data: Record<string, unknown> | null): FitnessConstraintInput | null {
  if (!data) return null;
  return {
    injury_or_limitation_labels: cleanStringArray(data.injury_or_limitation_labels),
    areas_to_protect: cleanStringArray(data.areas_to_protect),
    movement_restrictions: cleanText(typeof data.movement_restrictions === "string" ? data.movement_restrictions : null),
    nutrition_restrictions: cleanText(typeof data.nutrition_restrictions === "string" ? data.nutrition_restrictions : null),
    legacy_context_notes: cleanText(typeof data.legacy_context_notes === "string" ? data.legacy_context_notes : null)
  };
}

export async function getFitnessConstraints(userId: string): Promise<FitnessConstraintInput | null> {
  if (env.useMockAuth && userId === "mock-user") return emptyFitnessConstraints;
  requireUser(userId);
  const { data, error } = await supabase!
    .from("user_fitness_constraints")
    .select("injury_or_limitation_labels,areas_to_protect,movement_restrictions,nutrition_restrictions,legacy_context_notes")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return mapFitnessConstraints(data as Record<string, unknown> | null);
}

export async function upsertFitnessConstraints(userId: string, input: FitnessConstraintInput): Promise<FitnessConstraintInput> {
  if (env.useMockAuth && userId === "mock-user") return mapFitnessConstraints(input as unknown as Record<string, unknown>) ?? emptyFitnessConstraints;
  requireUser(userId);
  const payload = {
    user_id: userId,
    injury_or_limitation_labels: cleanStringArray(input.injury_or_limitation_labels),
    areas_to_protect: cleanStringArray(input.areas_to_protect),
    movement_restrictions: cleanText(input.movement_restrictions),
    nutrition_restrictions: cleanText(input.nutrition_restrictions),
    legacy_context_notes: cleanText(input.legacy_context_notes)
  };
  const { data, error } = await supabase!
    .from("user_fitness_constraints")
    .upsert(payload, { onConflict: "user_id" })
    .select("injury_or_limitation_labels,areas_to_protect,movement_restrictions,nutrition_restrictions,legacy_context_notes")
    .single();
  if (error) throw error;
  return mapFitnessConstraints(data as Record<string, unknown>) ?? emptyFitnessConstraints;
}

export type NutritionPreferenceInput = Omit<UserNutritionPreferenceProfile, "id" | "user_id" | "created_at" | "updated_at">;

export function mapNutritionPreferenceRowToInput(row: UserNutritionPreferenceProfile | null): NutritionPreferenceInput | null {
  if (!row) return null;
  return {
    weekly_food_budget: row.weekly_food_budget,
    budget_currency: cleanText(row.budget_currency),
    max_cooking_time_minutes: row.max_cooking_time_minutes,
    meal_prep_days: cleanStringArray(row.meal_prep_days),
    cooking_skill: cleanText(row.cooking_skill),
    kitchen_equipment: cleanStringArray(row.kitchen_equipment),
    preferred_cuisines: cleanStringArray(row.preferred_cuisines),
    disliked_foods: cleanStringArray(row.disliked_foods),
    allergies: cleanText(row.allergies),
    repeat_tolerance: cleanText(row.repeat_tolerance),
    meals_per_day: row.meals_per_day,
    ingredient_reuse_preference: cleanText(row.ingredient_reuse_preference),
    grocery_style_preference: cleanText(row.grocery_style_preference)
  };
}

function sanitizeNutritionPreferenceInput(input: NutritionPreferenceInput): NutritionPreferenceInput {
  return {
    weekly_food_budget: input.weekly_food_budget,
    budget_currency: cleanText(input.budget_currency),
    max_cooking_time_minutes: input.max_cooking_time_minutes,
    meal_prep_days: cleanStringArray(input.meal_prep_days),
    cooking_skill: cleanText(input.cooking_skill),
    kitchen_equipment: cleanStringArray(input.kitchen_equipment),
    preferred_cuisines: cleanStringArray(input.preferred_cuisines),
    disliked_foods: cleanStringArray(input.disliked_foods),
    allergies: cleanText(input.allergies),
    repeat_tolerance: cleanText(input.repeat_tolerance),
    meals_per_day: input.meals_per_day,
    ingredient_reuse_preference: cleanText(input.ingredient_reuse_preference),
    grocery_style_preference: cleanText(input.grocery_style_preference)
  };
}

export async function getNutritionPreferenceProfile(userId: string): Promise<NutritionPreferenceInput | null> {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_nutrition_preference_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return mapNutritionPreferenceRowToInput(data as UserNutritionPreferenceProfile | null);
}

export async function upsertNutritionPreferenceProfile(userId: string, input: NutritionPreferenceInput): Promise<NutritionPreferenceInput> {
  requireUser(userId);
  const payload = sanitizeNutritionPreferenceInput(input);
  const { data, error } = await supabase!.from("user_nutrition_preference_profiles").upsert({ user_id: userId, ...payload }, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  const saved = mapNutritionPreferenceRowToInput(data as UserNutritionPreferenceProfile);
  if (!saved) throw new Error("Food preferences could not be normalized after saving.");
  return saved;
}

export async function getProgressionTargets(userId: string, planExerciseIds?: string[]) {
  requireUser(userId);
  let query = supabase!.from("user_progression_targets").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
  if (planExerciseIds?.length) query = query.in("plan_exercise_id", planExerciseIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UserProgressionTarget[];
}

export async function upsertProgressionTarget(userId: string, input: Omit<UserProgressionTarget, "id" | "user_id" | "created_at" | "updated_at">) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_progression_targets").upsert({ user_id: userId, ...input }, { onConflict: "user_id,plan_exercise_id" }).select("*").single();
  if (error) throw error;
  return data as UserProgressionTarget;
}

export async function getExerciseAlternatives(userId: string, planExerciseId?: string) {
  requireUser(userId);
  let query = supabase!.from("user_exercise_alternatives").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (planExerciseId) query = query.eq("plan_exercise_id", planExerciseId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UserExerciseAlternative[];
}

export async function createExerciseAlternative(userId: string, input: {
  plan_exercise_id: string;
  original_exercise_name: string;
  alternative_exercise_name: string;
  reason: ExerciseAlternativeReason;
  target_muscle?: string | null;
  equipment?: string | null;
  pain_friendly_note?: string | null;
  created_by?: "user" | "chatgpt";
}) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_exercise_alternatives").insert({ user_id: userId, ...input }).select("*").single();
  if (error) throw error;
  return data as UserExerciseAlternative;
}

export async function getGroceryItems(userId: string, weekStart: string) {
  if (env.useMockAuth && userId === "mock-user") return [];
  requireUser(userId);
  const { data, error } = await supabase!.from("user_grocery_items").select("*").eq("user_id", userId).eq("week_start", weekStart).order("store_section").order("item_name");
  if (error) throw error;
  return (data ?? []) as UserGroceryItem[];
}

export async function upsertGroceryItem(userId: string, input: {
  id?: string;
  week_start: string;
  source_meal_plan_item_id?: string | null;
  item_name: string;
  quantity?: number | null;
  unit?: string | null;
  store_section?: GroceryStoreSection;
  checked?: boolean;
  already_have?: boolean;
  notes?: string | null;
  created_by?: "manual" | "meal_plan" | "chatgpt";
}) {
  requireUser(userId);
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    user_id: userId,
    week_start: input.week_start,
    source_meal_plan_item_id: input.source_meal_plan_item_id ?? null,
    item_name: input.item_name.trim(),
    quantity: input.quantity ?? null,
    unit: cleanText(input.unit),
    store_section: input.store_section ?? "Other",
    checked: input.checked ?? false,
    already_have: input.already_have ?? false,
    notes: cleanText(input.notes),
    created_by: input.created_by ?? "manual"
  };
  const query = input.id
    ? supabase!.from("user_grocery_items").update(payload).eq("id", input.id).eq("user_id", userId)
    : supabase!.from("user_grocery_items").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as UserGroceryItem;
}

export async function deleteGroceryItem(userId: string, itemId: string) {
  requireUser(userId);
  const { error } = await supabase!.from("user_grocery_items").delete().eq("id", itemId).eq("user_id", userId);
  if (error) throw error;
}

export async function getDailyCheckins(userId: string, startDate: string, endDate = startDate) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_daily_checkins").select("*").eq("user_id", userId).gte("checkin_date", startDate).lte("checkin_date", endDate).order("checkin_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserDailyCheckin[];
}

export async function upsertDailyCheckin(userId: string, input: Partial<Omit<UserDailyCheckin, "id" | "user_id" | "created_at" | "updated_at">> & { checkin_date: string; checkin_type: DailyCheckinType }) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_daily_checkins").upsert({ user_id: userId, ...input }, { onConflict: "user_id,checkin_date,checkin_type" }).select("*").single();
  if (error) throw error;
  return data as UserDailyCheckin;
}

export async function getNutritionTargetProfiles(userId: string) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_nutrition_target_profiles").select("*").eq("user_id", userId).order("target_type");
  if (error) throw error;
  return (data ?? []) as UserNutritionTargetProfile[];
}

export async function upsertNutritionTargetProfile(userId: string, input: {
  target_type: NutritionTargetProfileType;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  water_ml: number | null;
  notes: string | null;
}) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_nutrition_target_profiles").upsert({ user_id: userId, ...input }, { onConflict: "user_id,target_type" }).select("*").single();
  if (error) throw error;
  return data as UserNutritionTargetProfile;
}
