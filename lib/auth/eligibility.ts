import type { SupabaseClient } from "@supabase/supabase-js";
import { AGE_CONFIRMATION_VERSION } from "@/lib/legal/versions";

export const MINIMUM_LAUNCH_AGE = 16;
export const MAXIMUM_PROFILE_AGE = 100;
export const PENDING_ELIGIBILITY_STORAGE_KEY = "plaivra.pending-eligibility.v1";

export const ELIGIBILITY_ERROR_CODES = {
  required: "age_required",
  invalid: "age_invalid",
  ineligible: "age_ineligible",
  reviewRequired: "age_review_required",
  verificationFailed: "age_verification_failed"
} as const;

export type EligibilityErrorCode = (typeof ELIGIBILITY_ERROR_CODES)[keyof typeof ELIGIBILITY_ERROR_CODES];

export type LaunchAgeResult =
  | { success: true; data: number }
  | { success: false; code: EligibilityErrorCode; message: string };

export const launchAgeSchema = {
  safeParse(value: unknown): LaunchAgeResult {
    if (value === null || value === undefined || value === "") {
      return { success: false, code: ELIGIBILITY_ERROR_CODES.required, message: "Enter your age to continue." };
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value > MAXIMUM_PROFILE_AGE || value < 0) {
      return {
        success: false,
        code: ELIGIBILITY_ERROR_CODES.invalid,
        message: `Age must be a whole number between ${MINIMUM_LAUNCH_AGE} and ${MAXIMUM_PROFILE_AGE}.`
      };
    }
    if (value < MINIMUM_LAUNCH_AGE) {
      return {
        success: false,
        code: ELIGIBILITY_ERROR_CODES.ineligible,
        message: `Plaivra is available only to people age ${MINIMUM_LAUNCH_AGE} or older for the initial launch.`
      };
    }
    return { success: true, data: value };
  }
} as const;

export type EligibilityStatus =
  | { eligible: true }
  | { eligible: false; code: "age_review_required" | "age_verification_failed"; message: string };

export async function checkUserLaunchEligibility(
  supabase: SupabaseClient,
  userId: string
): Promise<EligibilityStatus> {
  const [consentResult, onboardingResult] = await Promise.all([
    supabase
      .from("user_consents")
      .select("granted,revoked_at")
      .eq("user_id", userId)
      .eq("consent_type", "age_16")
      .eq("version", AGE_CONFIRMATION_VERSION)
      .maybeSingle(),
    supabase
      .from("onboarding_answers")
      .select("age")
      .eq("user_id", userId)
      .maybeSingle()
  ]);

  if (consentResult.error || onboardingResult.error) {
    return {
      eligible: false,
      code: ELIGIBILITY_ERROR_CODES.verificationFailed,
      message: "Plaivra could not verify age eligibility. Please try again."
    };
  }

  const consent = consentResult.data as { granted?: boolean; revoked_at?: string | null } | null;
  const onboarding = onboardingResult.data as { age?: number | null } | null;
  if (!consent?.granted || consent.revoked_at) {
    return {
      eligible: false,
      code: ELIGIBILITY_ERROR_CODES.reviewRequired,
      message: "Confirm the current 16+ launch eligibility requirement before using this feature."
    };
  }

  if (typeof onboarding?.age === "number" && onboarding.age < MINIMUM_LAUNCH_AGE) {
    return {
      eligible: false,
      code: ELIGIBILITY_ERROR_CODES.reviewRequired,
      message: "Your saved age needs review before this feature can be used. Your account and privacy controls remain available."
    };
  }

  return { eligible: true };
}
