import { describe, expect, it } from "vitest";
import type { FoodVerificationAssertion, FoodVerificationScope, FoodVerificationState } from "./verification";

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
});
