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
