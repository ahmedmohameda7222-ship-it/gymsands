import { env } from "@/lib/env";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import {
  sanitizeAdaptiveOnboarding,
  type AdaptiveFitnessConstraints,
  type AdaptiveNutritionRow,
  type AdaptiveOnboardingAnswers,
  type AdaptiveOnboardingRow
} from "@/lib/onboarding/adaptive-profile";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { configToScopes, type AiPermissionConfig } from "@/services/database/ai-permissions";

function requireUserData(userId: string) {
  if (!supabase || !isUuid(userId)) throw new Error("Please refresh, sign in again, and retry.");
}
function cleanText(value: string | null | undefined) { return value?.trim() || null; }
function cleanArray(value: string[]) { return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean))); }
function ageToRange(age: number) { if (age < 18) return "Under 18"; if (age <= 24) return "18-24"; if (age <= 34) return "25-34"; if (age <= 44) return "35-44"; if (age <= 54) return "45-54"; return "55+"; }
function sportArray(value: unknown) { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []; }

export function buildAdaptiveOnboardingPayload(userId: string, rawAnswers: AdaptiveOnboardingAnswers, setupStage: number, completedAt: string | null) {
  const answers = sanitizeAdaptiveOnboarding(rawAnswers);
  const availableEquipment = sportArray(answers.sport_details.available_equipment);
  return {
    user_id: userId,
    age: answers.age,
    age_range: answers.age === null ? null : ageToRange(answers.age),
    gender: cleanText(answers.gender),
    height_cm: answers.height_cm,
    weight_kg: answers.weight_kg,
    goal_weight_kg: answers.goal_weight_kg,
    goal: answers.goals.join(", "),
    goals: answers.goals,
    primary_goal: answers.primary_goal,
    primary_sport: answers.primary_sport,
    primary_sport_other: cleanText(answers.primary_sport_other),
    secondary_sports: answers.secondary_sports,
    training_level: cleanText(answers.training_level),
    training_place: cleanText(answers.training_place),
    activity_level: cleanText(answers.activity_level),
    training_days_per_week: answers.training_days_per_week,
    available_days: answers.available_days,
    workout_duration_minutes: answers.workout_duration_minutes,
    min_workout_duration_minutes: answers.workout_duration_minutes,
    max_workout_duration_minutes: answers.workout_duration_minutes,
    preferred_workout_time: cleanText(answers.preferred_workout_time),
    liked_activities: answers.liked_activities,
    disliked_activities: answers.disliked_activities,
    sport_details: answers.sport_details,
    available_equipment: availableEquipment,
    nutrition_preferences: answers.nutrition.preferred_cuisines,
    setup_stage: Math.max(0, Math.min(6, setupStage)),
    completed_at: completedAt
  };
}

export function buildAdaptiveNutritionPayload(userId: string, rawAnswers: AdaptiveOnboardingAnswers) {
  const nutrition = sanitizeAdaptiveOnboarding(rawAnswers).nutrition;
  return {
    user_id: userId,
    nutrition_goal: cleanText(nutrition.nutrition_goal),
    meals_per_day: nutrition.meals_per_day,
    preferred_cuisines: cleanArray(nutrition.preferred_cuisines),
    liked_foods: cleanArray(nutrition.liked_foods),
    disliked_foods: cleanArray(nutrition.disliked_foods),
    allergy_items: cleanArray(nutrition.allergies),
    dietary_restrictions: cleanArray(nutrition.dietary_restrictions),
    cooking_skill: cleanText(nutrition.cooking_skill),
    max_cooking_time_minutes: nutrition.max_cooking_time_minutes,
    meal_prep_preference: cleanText(nutrition.meal_prep_preference),
    weekly_food_budget: nutrition.weekly_food_budget,
    budget_currency: cleanText(nutrition.budget_currency),
    eating_schedule: cleanText(nutrition.eating_schedule),
    supplements: cleanArray(nutrition.supplements),
    tracks_calories_or_macros: nutrition.tracks_calories_or_macros
  };
}

export function buildAdaptiveConstraintPayload(userId: string, input: AdaptiveFitnessConstraints) {
  return {
    user_id: userId,
    injury_or_limitation_labels: cleanArray(input.injury_or_limitation_labels),
    areas_to_protect: cleanArray(input.pain_sensitive_areas),
    pain_sensitive_areas: cleanArray(input.pain_sensitive_areas),
    movement_restrictions: cleanText(input.movements_to_avoid),
    movements_to_avoid: cleanText(input.movements_to_avoid),
    discomfort_exercises: cleanArray(input.discomfort_exercises),
    mobility_limitations: cleanText(input.mobility_limitations),
    professional_restrictions: cleanText(input.professional_restrictions),
    legacy_context_notes: cleanText(input.legacy_context_notes)
  };
}

export function buildAdaptivePermissionPayload(config: AiPermissionConfig) { return { access_mode: config.accessMode, scopes: configToScopes(config) }; }

export async function getAdaptiveOnboardingDraft(userId: string): Promise<AdaptiveOnboardingRow | null> {
  if (env.useMockAuth && isMockAuthUserId(userId)) return null;
  requireUserData(userId);
  const { data, error } = await supabase!.from("onboarding_answers").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as AdaptiveOnboardingRow | null) ?? null;
}

export async function getAdaptiveNutritionProfile(userId: string): Promise<AdaptiveNutritionRow | null> {
  if (env.useMockAuth && isMockAuthUserId(userId)) return null;
  requireUserData(userId);
  const { data, error } = await supabase!.from("user_nutrition_preference_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as AdaptiveNutritionRow | null) ?? null;
}

export async function getAdaptiveFitnessConstraints(userId: string): Promise<AdaptiveFitnessConstraints | null> {
  if (env.useMockAuth && isMockAuthUserId(userId)) return null;
  requireUserData(userId);
  const { data, error } = await supabase!.from("user_fitness_constraints").select("injury_or_limitation_labels,areas_to_protect,pain_sensitive_areas,movement_restrictions,movements_to_avoid,discomfort_exercises,mobility_limitations,professional_restrictions,legacy_context_notes").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    injury_or_limitation_labels: sportArray(row.injury_or_limitation_labels),
    pain_sensitive_areas: sportArray(row.pain_sensitive_areas ?? row.areas_to_protect),
    movements_to_avoid: cleanText(String(row.movements_to_avoid ?? row.movement_restrictions ?? "")),
    discomfort_exercises: sportArray(row.discomfort_exercises),
    mobility_limitations: cleanText(String(row.mobility_limitations ?? "")),
    professional_restrictions: cleanText(String(row.professional_restrictions ?? "")),
    legacy_context_notes: cleanText(String(row.legacy_context_notes ?? ""))
  };
}

export async function saveAdaptiveOnboardingDraft(userId: string, answers: AdaptiveOnboardingAnswers, setupStage: number, existingCompletedAt: string | null) {
  if (env.useMockAuth && isMockAuthUserId(userId)) return buildAdaptiveOnboardingPayload(userId, answers, setupStage, existingCompletedAt);
  requireUserData(userId);
  const payload = buildAdaptiveOnboardingPayload(userId, answers, setupStage, existingCompletedAt);
  const { data, error } = await supabase!.from("onboarding_answers").upsert(payload, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  return data as AdaptiveOnboardingRow;
}

export async function saveAdaptiveNutritionDraft(userId: string, answers: AdaptiveOnboardingAnswers) {
  if (env.useMockAuth && isMockAuthUserId(userId)) return buildAdaptiveNutritionPayload(userId, answers);
  requireUserData(userId);
  const payload = buildAdaptiveNutritionPayload(userId, answers);
  const { data, error } = await supabase!.from("user_nutrition_preference_profiles").upsert(payload, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  return data as AdaptiveNutritionRow;
}

export async function saveAdaptiveConstraintDraft(userId: string, constraints: AdaptiveFitnessConstraints) {
  if (env.useMockAuth && isMockAuthUserId(userId)) return buildAdaptiveConstraintPayload(userId, constraints);
  requireUserData(userId);
  const payload = buildAdaptiveConstraintPayload(userId, constraints);
  const { data, error } = await supabase!.from("user_fitness_constraints").upsert(payload, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function completeAdaptiveOnboarding(userId: string, rawAnswers: AdaptiveOnboardingAnswers, permissions: AiPermissionConfig) {
  const answers = sanitizeAdaptiveOnboarding(rawAnswers);
  if (env.useMockAuth && isMockAuthUserId(userId)) return { completed_at: new Date().toISOString() };
  requireUserData(userId);
  const { data, error } = await supabase!.rpc("complete_adaptive_onboarding_v2", {
    p_onboarding: buildAdaptiveOnboardingPayload(userId, answers, 6, null),
    p_nutrition: buildAdaptiveNutritionPayload(userId, answers),
    p_constraints: buildAdaptiveConstraintPayload(userId, answers.constraints),
    p_permissions: buildAdaptivePermissionPayload(permissions)
  });
  if (error) throw error;
  const result = data as { completed_at?: string; user_id?: string } | null;
  if (!result?.completed_at) throw new Error("Plaivra did not confirm onboarding completion.");
  return result;
}
