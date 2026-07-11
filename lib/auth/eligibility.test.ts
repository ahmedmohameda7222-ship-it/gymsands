import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAXIMUM_PROFILE_AGE,
  MINIMUM_LAUNCH_AGE,
  checkUserLaunchEligibility,
  launchAgeSchema
} from "./eligibility";
import { buildOnboardingAnswersPayload } from "@/services/database/profile";
import type { OnboardingAnswers } from "@/types";

function queryResult(data: unknown, error: unknown = null) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data, error }));
  return query;
}

describe("initial launch age eligibility", () => {
  it("rejects 15 and accepts the 16 boundary", () => {
    expect(launchAgeSchema.safeParse(MINIMUM_LAUNCH_AGE - 1)).toMatchObject({
      success: false,
      code: "age_ineligible"
    });
    expect(launchAgeSchema.safeParse(MINIMUM_LAUNCH_AGE)).toEqual({
      success: true,
      data: MINIMUM_LAUNCH_AGE
    });
  });

  it("rejects missing, string, fractional, NaN, and out-of-range ages", () => {
    for (const value of [undefined, null, "16", 16.5, Number.NaN, -1, MAXIMUM_PROFILE_AGE + 1]) {
      expect(launchAgeSchema.safeParse(value).success, String(value)).toBe(false);
    }
  });

  it("requires a current age confirmation and rejects conflicting saved age", async () => {
    const eligibleClient = {
      from: vi.fn((table: string) => table === "user_consents"
        ? queryResult({ granted: true, revoked_at: null })
        : queryResult({ age: 16 }))
    } as unknown as SupabaseClient;
    await expect(checkUserLaunchEligibility(eligibleClient, "user-a")).resolves.toEqual({ eligible: true });

    const conflictClient = {
      from: vi.fn((table: string) => table === "user_consents"
        ? queryResult({ granted: true, revoked_at: null })
        : queryResult({ age: 15 }))
    } as unknown as SupabaseClient;
    await expect(checkUserLaunchEligibility(conflictClient, "user-a")).resolves.toMatchObject({
      eligible: false,
      code: "age_review_required"
    });

    const missingConsentClient = {
      from: vi.fn((table: string) => table === "user_consents" ? queryResult(null) : queryResult({ age: null }))
    } as unknown as SupabaseClient;
    await expect(checkUserLaunchEligibility(missingConsentClient, "user-a")).resolves.toMatchObject({
      eligible: false,
      code: "age_review_required"
    });
  });

  it("fails closed when eligibility evidence cannot be read", async () => {
    const client = {
      from: vi.fn((table: string) => table === "user_consents"
        ? queryResult(null, { message: "read failed" })
        : queryResult(null))
    } as unknown as SupabaseClient;
    await expect(checkUserLaunchEligibility(client, "user-a")).resolves.toMatchObject({
      eligible: false,
      code: "age_verification_failed"
    });
  });

  it("rejects an onboarding-service bypass at 15 and persists 16", () => {
    const answers = { user_id: "11111111-1111-4111-8111-111111111111", age: 16 } as OnboardingAnswers;
    expect(buildOnboardingAnswersPayload(answers)).toMatchObject({ age: 16 });
    expect(() => buildOnboardingAnswersPayload({ ...answers, age: 15 })).toThrow(/16 or older/i);
  });
});
