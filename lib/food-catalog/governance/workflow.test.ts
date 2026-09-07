import { describe, expect, it } from "vitest";
import { DEFAULT_FOOD_GOVERNANCE_CAPABILITIES, type FoodGovernancePrincipal } from "./principals";
import { authorizeCorrectionTransition } from "./workflow";

const owner: FoodGovernancePrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  principalType: "human",
  subjectId: "owner-user",
  roleClass: "owner",
  capabilities: DEFAULT_FOOD_GOVERNANCE_CAPABILITIES.owner,
};

describe("Food Catalog Plan 6 controlled correction workflow", () => {
  it("allows the solo Owner to review and approve without inventing a second approver", () => {
    expect(authorizeCorrectionTransition({ principal: owner, from: "reported", to: "under_review", expectedRevision: 0, actualRevision: 0, evidenceRequired: false, evidenceCount: 0, viaCanonicalApplyCommand: false }).nextRevision).toBe(1);
    expect(authorizeCorrectionTransition({ principal: owner, from: "under_review", to: "approved", expectedRevision: 1, actualRevision: 1, evidenceRequired: true, evidenceCount: 1, viaCanonicalApplyCommand: false }).nextRevision).toBe(2);
  });

  it("requires evidence before approval when the category policy requires it", () => {
    expect(() => authorizeCorrectionTransition({ principal: owner, from: "under_review", to: "approved", expectedRevision: 2, actualRevision: 2, evidenceRequired: true, evidenceCount: 0, viaCanonicalApplyCommand: false })).toThrow(/evidence/i);
  });

  it("uses compare-and-swap revision authority", () => {
    expect(() => authorizeCorrectionTransition({ principal: owner, from: "reported", to: "under_review", expectedRevision: 2, actualRevision: 3, evidenceRequired: false, evidenceCount: 0, viaCanonicalApplyCommand: false })).toThrow(/cas/i);
  });

  it("allows approved -> applied only inside the canonical apply command", () => {
    expect(() => authorizeCorrectionTransition({ principal: owner, from: "approved", to: "applied", expectedRevision: 3, actualRevision: 3, evidenceRequired: true, evidenceCount: 1, viaCanonicalApplyCommand: false })).toThrow(/canonical apply/i);
    expect(authorizeCorrectionTransition({ principal: owner, from: "approved", to: "applied", expectedRevision: 3, actualRevision: 3, evidenceRequired: true, evidenceCount: 1, viaCanonicalApplyCommand: true }).nextRevision).toBe(4);
  });

  it("requires the precise transition capability", () => {
    const reporter: FoodGovernancePrincipal = { ...owner, capabilities: ["food.correction.report"] };
    expect(() => authorizeCorrectionTransition({ principal: reporter, from: "under_review", to: "approved", expectedRevision: 1, actualRevision: 1, evidenceRequired: false, evidenceCount: 0, viaCanonicalApplyCommand: false })).toThrow(/capability denied/i);
  });
});
