import { describe, expect, it } from "vitest";
import {
  validateActivationSetMemberDraft,
  type ActivationSetMemberDraft,
} from "./activation";

const SHA256 = "a".repeat(64);

function eligibleMember(overrides: Partial<ActivationSetMemberDraft> = {}): ActivationSetMemberDraft {
  return {
    foodId: "10000000-0000-4000-8000-000000000001",
    expectedPreconditionLifecycle: "draft",
    evidenceReference: "evidence:food-1",
    evidenceChecksumSha256: SHA256,
    sourceLegalAccepted: true,
    identityResolved: true,
    nutritionBasisValid: true,
    displayIdentityValid: true,
    blockingConditionCount: 0,
    eligibility: "eligible",
    memberChecksumSha256: SHA256,
    ...overrides,
  };
}

describe("Plan 3 activation contracts", () => {
  it("accepts a fully specified eligible activation member", () => {
    const member = eligibleMember();
    expect(validateActivationSetMemberDraft(member)).toEqual(member);
  });

  it("rejects runtime-invalid activation enums", () => {
    expect(() =>
      validateActivationSetMemberDraft(
        eligibleMember({ eligibility: "unknown" as never }),
      ),
    ).toThrow(/eligibility/i);
    expect(() =>
      validateActivationSetMemberDraft(
        eligibleMember({ expectedPreconditionLifecycle: "merged" as never }),
      ),
    ).toThrow(/precondition|lifecycle/i);
  });

  it("rejects blank IDs, policy evidence, invalid checksums, and invalid counts", () => {
    expect(() => validateActivationSetMemberDraft(eligibleMember({ foodId: " " }))).toThrow(/food id/i);
    expect(() =>
      validateActivationSetMemberDraft(eligibleMember({ evidenceReference: " " })),
    ).toThrow(/evidence reference/i);
    expect(() =>
      validateActivationSetMemberDraft(eligibleMember({ evidenceChecksumSha256: "abc" })),
    ).toThrow(/checksum/i);
    expect(() =>
      validateActivationSetMemberDraft(eligibleMember({ memberChecksumSha256: "abc" })),
    ).toThrow(/checksum/i);
    expect(() =>
      validateActivationSetMemberDraft(eligibleMember({ blockingConditionCount: -1 })),
    ).toThrow(/blocking/i);
  });
});
