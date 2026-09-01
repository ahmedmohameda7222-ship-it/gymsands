import { describe, expect, it } from "vitest";
import { validateFoodMergeEvent, type CanonicalDecision } from "./identity";

describe("Food identity contracts", () => {
  it("represents the approved canonical reconciliation outcomes", () => {
    const decisions: CanonicalDecision[] = [
      { kind: "match", foodId: "food-1" },
      { kind: "create" },
      { kind: "possible_duplicate", candidateFoodIds: ["food-1", "food-2"] },
      { kind: "reject", reasonCodes: ["identity_conflict"] },
    ];
    expect(decisions.map((decision) => decision.kind)).toEqual([
      "match",
      "create",
      "possible_duplicate",
      "reject",
    ]);
  });

  it("rejects self merge", () => {
    expect(() => validateFoodMergeEvent({
      sourceFoodId: "food-1",
      targetFoodId: "food-1",
      policyVersion: "test-v1",
      reasonCode: "duplicate",
      evidenceReference: null,
      authorityReference: "planner:test",
    })).toThrow(/self/i);
  });

  it("requires nonblank merge authority fields", () => {
    expect(() => validateFoodMergeEvent({
      sourceFoodId: "food-1",
      targetFoodId: "food-2",
      policyVersion: " ",
      reasonCode: "duplicate",
      evidenceReference: null,
      authorityReference: "planner:test",
    })).toThrow(/policy/i);
  });
});
