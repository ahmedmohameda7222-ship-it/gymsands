import { describe, expect, it } from "vitest";
import {
  MARKET_SCOPE_MEMBERSHIPS,
  MARKET_SCOPES,
  validateFoodMarketAssignment,
} from "./markets";

describe("Food market contracts", () => {
  it("exposes exactly the approved initial market scopes", () => {
    expect(MARKET_SCOPES).toEqual([
      { scopeCode: "GLOBAL", kind: "global" },
      { scopeCode: "US", kind: "country" },
      { scopeCode: "DE", kind: "country" },
      { scopeCode: "EG", kind: "country" },
      { scopeCode: "GB", kind: "country" },
      { scopeCode: "SA", kind: "country" },
      { scopeCode: "AE", kind: "country" },
      { scopeCode: "EU", kind: "region" },
      { scopeCode: "GCC", kind: "region" },
    ]);
  });

  it("exposes the approved region memberships", () => {
    expect(MARKET_SCOPE_MEMBERSHIPS).toEqual([
      { childScopeCode: "DE", parentScopeCode: "EU" },
      { childScopeCode: "SA", parentScopeCode: "GCC" },
      { childScopeCode: "AE", parentScopeCode: "GCC" },
    ]);
  });

  it("rejects invalid market append values at runtime", () => {
    const valid = {
      foodId: "food-1",
      scopeCode: "DE",
      relevance: "primary" as const,
      sourceRecordId: null,
      action: "assign" as const,
      policyVersion: "market-v1",
    };

    expect(() => validateFoodMarketAssignment({ ...valid, foodId: " " })).toThrow(/food id/i);
    expect(() => validateFoodMarketAssignment({ ...valid, scopeCode: " " })).toThrow(/scope code/i);
    expect(() => validateFoodMarketAssignment({ ...valid, relevance: "invalid" as never })).toThrow(/relevance/i);
    expect(() => validateFoodMarketAssignment({ ...valid, action: "invalid" as never })).toThrow(/action/i);
    expect(() => validateFoodMarketAssignment({ ...valid, policyVersion: " " })).toThrow(/policy version/i);
    expect(validateFoodMarketAssignment(valid)).toEqual(valid);
  });
});
