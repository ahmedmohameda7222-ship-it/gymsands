import { describe, expect, it } from "vitest";
import { MARKET_SCOPE_MEMBERSHIPS, MARKET_SCOPES } from "./markets";

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
});
