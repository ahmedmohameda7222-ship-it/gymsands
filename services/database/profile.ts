import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/utils";
import type { OnboardingAnswers, Profile } from "@/types";

type ProfilePatch = {
  fullName?: string;
  targetWeightKg?: number | null;
  bodyGoal?: string | null;
};

const onboardingAnswerColumns = new Set([
  "user_id",
  "age_range",
  "gender",
  "height_cm",
  "weight_kg",
  "goal",
  "goals",
  "training_cycle",
  "training_level",
  "training_place",
  "training_days_per_week",
  "workout_duration_minutes",
  "min_workout_duration_minutes",
  "max_workout_duration_minutes",
  "desired_duration_weeks",
  "onboarding_duration",
  "barcode_scan_enabled",
  "available_equipment",
  "nutrition_preferences",
  "allergies_limitations"
]);

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function cleanNumber(value: number | null | undefined) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return Number.isFinite(value) ? value : undefined;
}

function ageToRange(age: number | null | undefined) {
  if (!Number.isFinite(age)) return undefined;
  if (age < 18) return "Under 18";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  return "55+";
}

export function buildOnboardingAnswersPayload(answers: OnboardingAnswers) {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(answers)) {
    if (value === undefined || !onboardingAnswerColumns.has(key)) continue;
    payload[key] = value;
  }

  if (!payload.age_range) {
    const derivedAgeRange = ageToRange(answers.age);
    if (derivedAgeRange) payload.age_range = derivedAgeRange;
  }

  return payload;
}

function mockOnboarding(userId: string): OnboardingAnswers {
  return {
    user_id: userId,
    age_range: "25-34",
    gender: "Prefer not to say",
    height_cm: null,
    weight_kg: null,
    goal: "General fitness",
    goals: ["General fitness"],
    training_cycle: null,
    training_level: "Beginner",
    training_place: "Gym",
    training_days_per_week: 3,
    workout_duration_minutes: 45,
    min_workout_duration_minutes: 30,
    max_workout_duration_minutes: 60,
    desired_duration_weeks: 4,
    available_equipment: [],
    nutrition_preferences: [],
    allergies_limitations: null
  };
}

export async function updateProfile(userId: string, patch: ProfilePatch) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.fullName !== undefined) {
    const fullName = patch.fullName.trim();
    if (!fullName) throw new Error("Enter your name before saving.");
    payload.full_name = fullName;
  }

  if (patch.targetWeightKg !== undefined) {
    const targetWeightKg = cleanNumber(patch.targetWeightKg);
    if (targetWeightKg !== undefined) payload.target_weight_kg = targetWeightKg;
  }

  if (patch.bodyGoal !== undefined) {
    payload.body_goal = patch.bodyGoal?.trim() || null;
  }

  if (Object.keys(payload).length <= 1) throw new Error("No profile changes provided.");

  if (!canUseUserData(userId)) return { id: userId, ...payload } as Profile;

  const { data, error } = await supabase!
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function saveOnboarding(answers: OnboardingAnswers) {
  if (!canUseUserData(answers.user_id)) return answers;

  const payload = buildOnboardingAnswersPayload(answers);
  let { data, error } = await supabase!.from("onboarding_answers").upsert(payload, { onConflict: "user_id" }).select("*").single();

  if (
    error &&
    (
      error.message.toLowerCase().includes("available_equipment") ||
      error.message.toLowerCase().includes("desired_duration_weeks") ||
      error.message.toLowerCase().includes("goals") ||
      error.message.toLowerCase().includes("training_cycle") ||
      error.message.toLowerCase().includes("min_workout_duration_minutes") ||
      error.message.toLowerCase().includes("max_workout_duration_minutes")
    )
  ) {
    const {
      available_equipment: _availableEquipment,
      desired_duration_weeks: _desiredDurationWeeks,
      goals: _goals,
      training_cycle: _trainingCycle,
      min_workout_duration_minutes: _minWorkoutDuration,
      max_workout_duration_minutes: _maxWorkoutDuration,
      ...compatiblePayload
    } = payload;
    const compatible = await supabase!.from("onboarding_answers").upsert(compatiblePayload, { onConflict: "user_id" }).select("*").single();
    data = compatible.data;
    error = compatible.error;
  }
  if (error) throw error;
  return data as OnboardingAnswers;
}

export async function getOnboarding(userId: string) {
  if (env.useMockAuth && userId === "mock-user") return mockOnboarding(userId);
  if (!canUseUserData(userId)) return null;
  const { data, error } = await supabase!.from("onboarding_answers").select("*").match({ user_id: userId }).maybeSingle();
  if (error) throw error;
  return data as OnboardingAnswers | null;
}
