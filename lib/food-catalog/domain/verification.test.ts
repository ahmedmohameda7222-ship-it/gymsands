import { describe, expect, it } from "vitest";
import {
  validateFoodVerificationAssertion,
  type FoodVerificationAssertion,
  type FoodVerificationScope,
  type FoodVerificationState,
} from "./verification";

describe("Food verification contracts", () => {
  it("models verification as scoped assertions rather than a Food boolean", () => {
    const scope: FoodVerificationScope = "nutrition";
    const state: FoodVerificationState = "verified";
    const assertion: FoodVerificationAssertion = {
      foodId: "food-1",
      scope,
      state,
      policyVersion: "test-v1",
      sourceRecordId: null,
      supersedesAssertionId: null,
      reasonCode: "source_verified",
      authorityReference: "planner:test",
    };

    expect(assertion.scope).toBe("nutrition");
    expect(assertion.state).toBe("verified");
    expect("isVerified" in assertion).toBe(false);
  });

  it("rejects invalid verification scope and state at runtime", () => {
    const valid: FoodVerificationAssertion = {
      foodId: "food-1",
      scope: "nutrition",
      state: "verified",
      policyVersion: "verify-v1",
      sourceRecordId: null,
      supersedesAssertionId: null,
      reasonCode: "source_review",
      authorityReference: "planner:test",
    };

    expect(() => validateFoodVerificationAssertion({ ...valid, scope: "not-a-scope" as never })).toThrow(/scope/i);
    expect(() => validateFoodVerificationAssertion({ ...valid, state: "not-a-state" as never })).toThrow(/state/i);
  });

  it("rejects blank verification authority fields", () => {
    const valid: FoodVerificationAssertion = {
      foodId: "food-1",
      scope: "identity",
      state: "verified",
      policyVersion: "verify-v1",
      sourceRecordId: null,
      supersedesAssertionId: null,
      reasonCode: "source_review",
      authorityReference: "planner:test",
    };

    expect(() => validateFoodVerificationAssertion({ ...valid, foodId: " " })).toThrow(/food id/i);
    expect(() => validateFoodVerificationAssertion({ ...valid, policyVersion: " " })).toThrow(/policy version/i);
    expect(() => validateFoodVerificationAssertion({ ...valid, reasonCode: " " })).toThrow(/reason code/i);
    expect(() => validateFoodVerificationAssertion({ ...valid, authorityReference: " " })).toThrow(/authority reference/i);
    expect(validateFoodVerificationAssertion(valid)).toEqual(valid);
  });
});
