export type MarketScopeKind = "global" | "country" | "region" | "group";
export type FoodMarketRelevance = "primary" | "secondary";
export type FoodMarketAssignmentAction = "assign" | "remove";

export const MARKET_SCOPES = [
  { scopeCode: "GLOBAL", kind: "global" },
  { scopeCode: "US", kind: "country" },
  { scopeCode: "DE", kind: "country" },
  { scopeCode: "EG", kind: "country" },
  { scopeCode: "GB", kind: "country" },
  { scopeCode: "SA", kind: "country" },
  { scopeCode: "AE", kind: "country" },
  { scopeCode: "EU", kind: "region" },
  { scopeCode: "GCC", kind: "region" },
] as const satisfies readonly { scopeCode: string; kind: MarketScopeKind }[];

export const MARKET_SCOPE_MEMBERSHIPS = [
  { childScopeCode: "DE", parentScopeCode: "EU" },
  { childScopeCode: "SA", parentScopeCode: "GCC" },
  { childScopeCode: "AE", parentScopeCode: "GCC" },
] as const;

export type FoodMarketAssignment = {
  foodId: string;
  scopeCode: string;
  relevance: FoodMarketRelevance;
  sourceRecordId: string | null;
  action: FoodMarketAssignmentAction;
  policyVersion: string;
};

export function validateFoodMarketAssignment(value: FoodMarketAssignment): FoodMarketAssignment {
  if (!value.foodId.trim()) throw new Error("Food market assignment food ID must be nonblank.");
  if (!value.scopeCode.trim()) throw new Error("Food market assignment scope code must be nonblank.");
  if (value.relevance !== "primary" && value.relevance !== "secondary") {
    throw new Error("Food market relevance is invalid.");
  }
  if (value.action !== "assign" && value.action !== "remove") {
    throw new Error("Food market assignment action is invalid.");
  }
  if (!value.policyVersion.trim()) {
    throw new Error("Food market assignment policy version must be nonblank.");
  }
  return value;
}
