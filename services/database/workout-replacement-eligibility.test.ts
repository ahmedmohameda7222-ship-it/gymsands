import { describe, expect, it } from "vitest";
import {
  isReplacementCandidateActionable,
  replacementEligibilityMessage,
  shouldClosePickerAfterAdd
} from "./workout-replacement-eligibility";

describe("replacement eligibility UI contract", () => {
  it("keeps linked candidates actionable and unlinked candidates disabled", () => {
    expect(isReplacementCandidateActionable({ eligible: true, reason: null }, false, "")).toBe(true);
    expect(isReplacementCandidateActionable({ eligible: false, reason: "provider_bridge_unavailable" }, false, "")).toBe(false);
    expect(replacementEligibilityMessage("provider_bridge_unavailable")).toContain("not yet linked");
  });

  it("does not allow submission while eligibility is unresolved or failed", () => {
    expect(isReplacementCandidateActionable(undefined, true, "")).toBe(false);
    expect(isReplacementCandidateActionable({ eligible: true, reason: null }, false, "RPC failed")).toBe(false);
  });

  it("keeps replacement mode open until the parent confirms RPC success", () => {
    expect(shouldClosePickerAfterAdd(true)).toBe(false);
    expect(shouldClosePickerAfterAdd(false)).toBe(true);
  });
});
