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
