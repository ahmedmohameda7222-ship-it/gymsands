import { describe, expect, it } from "vitest";

import {
  deriveFoodTrustProfile,
  type FoodTrustProfileInput,
} from "./trust";

const GENERATION_ID = "81000000-0000-4000-8000-000000000001";
const FOOD_ID = "82000000-0000-4000-8000-000000000001";

function verifiedInput(): FoodTrustProfileInput {
  return {
    generationId: GENERATION_ID,
    foodId: FOOD_ID,
    lifecycle: "active",
    verification: {
      identity: "verified",
      nutrition: "verified",
      serving: "missing",
      barcode: "missing",
      localization: "missing",
    },
    activationAccepted: true,
    blockingConditionCount: 0,
    completeness: {
      nutritionKnownFields: 4,
      nutritionTotalFields: 8,
      hasHouseholdServing: false,
      hasPreferredDisplayName: true,
    },
    trustPolicyVersion: "food-trust-v1",
  };
}

describe("Food Catalog Plan 3 structured Trust Profile", () => {
  it("marks the binding active + identity + nutrition + activation + zero-blocker formula Verified", () => {
    const input = verifiedInput();
    const profile = deriveFoodTrustProfile(input);

    expect(profile).toEqual({
      ...input,
      verified: true,
    });
  });

  it.each([
    ["non-active lifecycle", { lifecycle: "deprecated" as const }],
    ["identity missing", { verification: { ...verifiedInput().verification, identity: "missing" as const } }],
    ["identity revoked", { verification: { ...verifiedInput().verification, identity: "revoked" as const } }],
    ["nutrition missing", { verification: { ...verifiedInput().verification, nutrition: "missing" as const } }],
    ["nutrition revoked", { verification: { ...verifiedInput().verification, nutrition: "revoked" as const } }],
    ["activation rejected", { activationAccepted: false }],
    ["blocking validation evidence", { blockingConditionCount: 1 }],
  ])("is not Verified when %s", (_label, override) => {
    const profile = deriveFoodTrustProfile({ ...verifiedInput(), ...override });
    expect(profile.verified).toBe(false);
  });

  it("does not require serving verification for overall Verified", () => {
    const missing = deriveFoodTrustProfile(verifiedInput());
    const revoked = deriveFoodTrustProfile({
      ...verifiedInput(),
      verification: { ...verifiedInput().verification, serving: "revoked" },
    });

    expect(missing.verified).toBe(true);
    expect(revoked.verified).toBe(true);
  });

  it("keeps completeness separate from verification semantics", () => {
    const sparse = deriveFoodTrustProfile({
      ...verifiedInput(),
      completeness: {
        nutritionKnownFields: 0,
        nutritionTotalFields: 8,
        hasHouseholdServing: false,
        hasPreferredDisplayName: true,
      },
    });
    const complete = deriveFoodTrustProfile({
      ...verifiedInput(),
      completeness: {
        nutritionKnownFields: 8,
        nutritionTotalFields: 8,
        hasHouseholdServing: true,
        hasPreferredDisplayName: true,
      },
    });

    expect(sparse.verified).toBe(true);
    expect(complete.verified).toBe(true);
    expect(sparse.completeness.nutritionKnownFields).toBe(0);
    expect(complete.completeness.nutritionKnownFields).toBe(8);
  });

  it("preserves structured verification states and does not expose a numeric trust score", () => {
    const profile = deriveFoodTrustProfile({
      ...verifiedInput(),
      verification: {
        identity: "verified",
        nutrition: "verified",
        serving: "missing",
        barcode: "revoked",
        localization: "missing",
      },
    });

    expect(profile.verification).toEqual({
      identity: "verified",
      nutrition: "verified",
      serving: "missing",
      barcode: "revoked",
      localization: "missing",
    });
    expect("score" in profile).toBe(false);
    expect("trustScore" in profile).toBe(false);
  });

  it("preserves trust policy identity and does not mutate completeness inputs", () => {
    const input = verifiedInput();
    const before = structuredClone(input);
    const profile = deriveFoodTrustProfile(input);

    expect(profile.trustPolicyVersion).toBe("food-trust-v1");
    expect(input).toEqual(before);
  });
});
