import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, clampOnboardingStep } from "./progressive-setup";

describe("progressive onboarding", () => {
  it("uses exactly the seven approved onboarding sections", () => {
    expect(ONBOARDING_STEPS).toEqual([
      "Basic Profile",
      "Main Goals",
      "Training Profile",
      "Nutrition Profile",
      "Health and Physical Constraints",
      "ChatGPT Access",
      "Review & Finish"
    ]);
  });

  it("clamps persisted resume stages to the seven-section range", () => {
    expect(clampOnboardingStep(-4)).toBe(0);
    expect(clampOnboardingStep("3")).toBe(3);
    expect(clampOnboardingStep(99)).toBe(6);
    expect(clampOnboardingStep("invalid")).toBe(0);
  });
});
