import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOOD_GOVERNANCE_CAPABILITIES,
  assertFoodGovernanceCapability,
  capabilitySnapshot,
  type FoodGovernancePrincipal,
} from "./principals";

const owner: FoodGovernancePrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  principalType: "human",
  subjectId: "owner-user",
  roleClass: "owner",
  capabilities: DEFAULT_FOOD_GOVERNANCE_CAPABILITIES.owner,
};

const curator: FoodGovernancePrincipal = {
  ...owner,
  id: "22222222-2222-4222-8222-222222222222",
  subjectId: "curator-user",
  roleClass: "curator",
  capabilities: ["food.correction.review", "food.nutrition.correct"],
};

const service: FoodGovernancePrincipal = {
  ...owner,
  id: "33333333-3333-4333-8333-333333333333",
  principalType: "service",
  subjectId: "usda-adapter",
  roleClass: "service",
  capabilities: DEFAULT_FOOD_GOVERNANCE_CAPABILITIES.service,
};

describe("Food Catalog Plan 6 governance principals", () => {
  it("uses exact capabilities as authority for Owner and Curator", () => {
    expect(() => assertFoodGovernanceCapability(owner, "food.lifecycle.withdraw")).not.toThrow();
    expect(() => assertFoodGovernanceCapability(curator, "food.nutrition.correct")).not.toThrow();
    expect(() => assertFoodGovernanceCapability(curator, "food.identity.merge")).toThrow(/capability denied/i);
  });

  it("keeps Service principals ingestion-oriented and unable to self-escalate", () => {
    expect(() => assertFoodGovernanceCapability(service, "food.ingestion.propose")).not.toThrow();
    expect(() => assertFoodGovernanceCapability(service, "food.correction.approve")).toThrow(/capability denied/i);
    expect(() => assertFoodGovernanceCapability(service, "food.break_glass")).toThrow(/capability denied/i);
  });

  it("respects revocation when deriving an immutable capability snapshot", () => {
    const snapshot = capabilitySnapshot([
      { capability: "food.correction.review", revokedAt: null },
      { capability: "food.identity.merge", revokedAt: "2026-09-08T00:00:00Z" },
    ]);
    expect(snapshot).toEqual(["food.correction.review"]);
  });

  it("rejects role/principal-type escalation shapes", () => {
    expect(() => assertFoodGovernanceCapability({ ...service, roleClass: "owner" }, "food.ingestion.propose")).toThrow(/service principal/i);
    expect(() => assertFoodGovernanceCapability({ ...owner, roleClass: "service" }, "food.correction.review")).toThrow(/human principal/i);
  });
});
