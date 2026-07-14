import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/utils";
import { launchAgeSchema } from "@/lib/auth/eligibility";
import { isOnboardingComplete } from "@/lib/onboarding/adaptive-profile";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import type { OnboardingAnswers, Profile } from "@/types";

type ProfilePatch = {
  fullName?: string;
  targetWeightKg?: number | null;
  bodyGoal?: string | null;
};

const onboardingAnswerColumns = new Set([
  "user_id",
  "age",
  "age_range",
  "gender",
  "height_cm",
  "weight_kg",
  "goal_weight_kg",
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
  "allergies_limitations",
  "injuries_limitations",
  "training_preferences",
  "food_preferences",
  "lifestyle_notes",
  "workout_constraints",
  "coaching_notes",
  "setup_stage",
  "completed_at"
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
  const cleanAge = typeof age === "number" ? age : NaN;
  if (!Number.isFinite(cleanAge)) return undefined;
  if (cleanAge < 18) return "Under 18";
  if (cleanAge <= 24) return "18-24";
  if (cleanAge <= 34) return "25-34";
  if (cleanAge <= 44) return "35-44";
  if (cleanAge <= 54) return "45-54";
  return "55+";
}

export function buildOnboardingAnswersPayload(answers: OnboardingAnswers) {
  const age = launchAgeSchema.safeParse(answers.age);
  if (!age.success) throw new Error(age.message);
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(answers)) {
    if (value === undefined || !onboardingAnswerColumns.has(key)) continue;
    payload[key] = value;
  }
  payload.age = age.data;

  if (!payload.age_range) {
    const derivedAgeRange = ageToRange(answers.age);
    if (derivedAgeRange) payload.age_range = derivedAgeRange;
  }

  return payload;
}

// Mock data is isolated to NEXT_PUBLIC_USE_MOCK_AUTH and is never used as a
// production personal-data default.
function mockOnboarding(userId: string): OnboardingAnswers {
  return {
    user_id: userId,
    age: 25,
    age_range: "25-34",
    gender: "",
    height_cm: null,
    weight_kg: null,
    goal_weight_kg: null,
    goal: "improve_health",
    goals: ["improve_health"],
    training_cycle: null,
    training_level: "beginner",
    training_place: "mixed",
    training_days_per_week: 3,
    workout_duration_minutes: 45,
    min_workout_duration_minutes: 45,
    max_workout_duration_minutes: 45,
    desired_duration_weeks: 4,
    available_equipment: [],
    nutrition_preferences: ["no_preference"],
    allergies_limitations: null,
    injuries_limitations: null,
    training_preferences: null,
    food_preferences: null,
    lifestyle_notes: null,
    workout_constraints: null,
    coaching_notes: null,
    setup_stage: 6,
    completed_at: new Date(0).toISOString()
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
  const { data, error } = await supabase!
    .from("onboarding_answers")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  // Do not report success after dropping unsupported fields. A schema mismatch
  // must fail clearly so required onboarding data is never silently discarded.
  if (error) throw error;
  return data as OnboardingAnswers;
}

export async function getOnboarding(userId: string) {
  if (env.useMockAuth && isMockAuthUserId(userId)) return mockOnboarding(userId);
  if (!canUseUserData(userId)) return null;
  const { data, error } = await supabase!
    .from("onboarding_answers")
    .select("*")
    .match({ user_id: userId })
    .maybeSingle();
  if (error) throw error;
  const onboarding = data as OnboardingAnswers | null;
  return isOnboardingComplete(onboarding) ? onboarding : null;
}
