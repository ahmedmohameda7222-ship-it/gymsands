export type FoodVerificationScope = "identity" | "nutrition" | "serving" | "barcode" | "localization";
export type FoodVerificationState = "verified" | "revoked";

export type FoodVerificationAssertion = {
  foodId: string;
  scope: FoodVerificationScope;
  state: FoodVerificationState;
  policyVersion: string;
  sourceRecordId: string | null;
  supersedesAssertionId: string | null;
  reasonCode: string;
  authorityReference: string;
};

const VERIFICATION_SCOPES = new Set<FoodVerificationScope>([
  "identity",
  "nutrition",
  "serving",
  "barcode",
  "localization",
]);
const VERIFICATION_STATES = new Set<FoodVerificationState>(["verified", "revoked"]);

export function validateFoodVerificationAssertion(
  value: FoodVerificationAssertion,
): FoodVerificationAssertion {
  if (!value.foodId.trim()) throw new Error("Food verification food ID must be nonblank.");
  if (!VERIFICATION_SCOPES.has(value.scope)) throw new Error("Food verification scope is invalid.");
  if (!VERIFICATION_STATES.has(value.state)) throw new Error("Food verification state is invalid.");
  if (!value.policyVersion.trim()) {
    throw new Error("Food verification policy version must be nonblank.");
  }
  if (!value.reasonCode.trim()) throw new Error("Food verification reason code must be nonblank.");
  if (!value.authorityReference.trim()) {
    throw new Error("Food verification authority reference must be nonblank.");
  }
  return value;
}
