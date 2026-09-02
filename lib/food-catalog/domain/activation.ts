export type ActivationEligibility = "eligible" | "rejected";
export type ActivationEventType = "created" | "grant" | "invalidate";
export type ActivationPreconditionLifecycle = "draft" | "active" | "deprecated" | "withdrawn";

export type ActivationSetMemberDraft = {
  foodId: string;
  expectedPreconditionLifecycle: ActivationPreconditionLifecycle;
  evidenceReference: string;
  evidenceChecksumSha256: string;
  sourceLegalAccepted: boolean;
  identityResolved: boolean;
  nutritionBasisValid: boolean;
  displayIdentityValid: boolean;
  blockingConditionCount: number;
  eligibility: ActivationEligibility;
  memberChecksumSha256: string;
};

const ACTIVATION_ELIGIBILITIES = new Set<ActivationEligibility>(["eligible", "rejected"]);
const ACTIVATION_PRECONDITION_LIFECYCLES = new Set<ActivationPreconditionLifecycle>([
  "draft",
  "active",
  "deprecated",
  "withdrawn",
]);
const SHA256_HEX = /^[0-9a-f]{64}$/i;

function requireNonblank(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be nonblank.`);
  }
}

function requireSha256(value: string, label: string): void {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    throw new Error(`${label} checksum must be a 64-character SHA-256 hex value.`);
  }
}

export function validateActivationSetMemberDraft(
  value: ActivationSetMemberDraft,
): ActivationSetMemberDraft {
  requireNonblank(value.foodId, "Activation Food ID");
  if (!ACTIVATION_PRECONDITION_LIFECYCLES.has(value.expectedPreconditionLifecycle)) {
    throw new Error("Activation expected precondition lifecycle is invalid.");
  }
  requireNonblank(value.evidenceReference, "Activation evidence reference");
  requireSha256(value.evidenceChecksumSha256, "Activation evidence");
  requireSha256(value.memberChecksumSha256, "Activation member");

  if (!Number.isInteger(value.blockingConditionCount) || value.blockingConditionCount < 0) {
    throw new Error("Activation blocking condition count must be a non-negative integer.");
  }
  if (!ACTIVATION_ELIGIBILITIES.has(value.eligibility)) {
    throw new Error("Activation eligibility is invalid.");
  }

  return value;
}
