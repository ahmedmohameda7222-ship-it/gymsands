import type { GenerationLifecycle } from "./generations";
import type { FoodVerificationScope } from "./verification";

export type FoodTrustVerificationState = "verified" | "revoked" | "missing";

export type FoodTrustVerification = Record<FoodVerificationScope, FoodTrustVerificationState>;

export type FoodTrustCompleteness = {
  nutritionKnownFields: number;
  nutritionTotalFields: number;
  hasHouseholdServing: boolean;
  hasPreferredDisplayName: boolean;
};

export type FoodTrustProfileInput = {
  generationId: string;
  foodId: string;
  lifecycle: GenerationLifecycle;
  verification: FoodTrustVerification;
  activationAccepted: boolean;
  blockingConditionCount: number;
  completeness: FoodTrustCompleteness;
  trustPolicyVersion: string;
};

export type FoodTrustProfile = FoodTrustProfileInput & {
  verified: boolean;
};

export function deriveFoodTrustProfile(input: FoodTrustProfileInput): FoodTrustProfile {
  const verified =
    input.lifecycle === "active"
    && input.verification.identity === "verified"
    && input.verification.nutrition === "verified"
    && input.activationAccepted
    && input.blockingConditionCount === 0;

  return {
    ...input,
    verification: { ...input.verification },
    completeness: { ...input.completeness },
    verified,
  };
}
