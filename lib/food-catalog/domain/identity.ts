export type CanonicalDecision =
  | { kind: "match"; foodId: string }
  | { kind: "create" }
  | { kind: "possible_duplicate"; candidateFoodIds: string[] }
  | { kind: "reject"; reasonCodes: string[] };

export type FoodMergeEvent = {
  sourceFoodId: string;
  targetFoodId: string;
  policyVersion: string;
  reasonCode: string;
  evidenceReference: string | null;
  authorityReference: string;
};

export function validateFoodMergeEvent(value: FoodMergeEvent): FoodMergeEvent {
  if (!value.sourceFoodId.trim() || !value.targetFoodId.trim()) {
    throw new Error("Food merge source and target IDs must be nonblank.");
  }
  if (value.sourceFoodId === value.targetFoodId) {
    throw new Error("Food merge cannot self-merge.");
  }
  if (!value.policyVersion.trim()) throw new Error("Food merge policy version must be nonblank.");
  if (!value.reasonCode.trim()) throw new Error("Food merge reason code must be nonblank.");
  if (!value.authorityReference.trim()) throw new Error("Food merge authority reference must be nonblank.");
  return value;
}
