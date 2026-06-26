import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/utils";
import type { OnboardingAnswers, Profile } from "@/types";

type ProfilePatch = {
  fullName?: string;
  targetWeightKg?: number | null;
  bodyGoal?: string | null;
};

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function cleanNumber(value: number | null | undefined) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return Number.isFinite(value) ? value : undefined;
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
  let { data, error } = await supabase!.from("onboarding_answers").upsert(answers, { onConflict: "user_id" }).select("*").single();
  if (
    error &&
    (
      error.message.toLowerCase().includes("age") ||
      error.message.toLowerCase().includes("available_equipment") ||
      error.message.toLowerCase().includes("desired_duration_weeks") ||
      error.message.toLowerCase().includes("goals") ||
      error.message.toLowerCase().includes("training_cycle") ||
      error.message.toLowerCase().includes("min_workout_duration_minutes") ||
      error.message.toLowerCase().includes("max_workout_duration_minutes")
    )
  ) {
    const {
      age: _age,
      available_equipment: _availableEquipment,
      desired_duration_weeks: _desiredDurationWeeks,
      goals: _goals,
      training_cycle: _trainingCycle,
      min_workout_duration_minutes: _minWorkoutDuration,
      max_workout_duration_minutes: _maxWorkoutDuration,
      ...compatibleAnswers
    } = answers;
    const compatible = await supabase!.from("onboarding_answers").upsert(compatibleAnswers, { onConflict: "user_id" }).select("*").single();
    data = compatible.data;
    error = compatible.error;
  }
  if (error) throw error;
  return data as OnboardingAnswers;
}

export async function getOnboarding(userId: string) {
  if (env.useMockAuth && userId === "mock-user") return mockOnboarding(userId);
  if (!canUseUserData(userId)) return null;
  const { data, error } = await supabase!.from("onboarding_answers").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as OnboardingAnswers | null;
}
