import { describe, expect, it } from "vitest";
import { clampOnboardingStep, permissionsForFirstJob } from "./progressive-setup";

describe("progressive onboarding", () => {
  it("limits a training first job to profile and workout permissions", () => {
    const permissions = permissionsForFirstJob("training_plan");

    expect(permissions.accessMode).toBe("custom");
    expect(permissions.sections.profile).toEqual({ read: true, write: false });
    expect(permissions.sections.workouts).toEqual({ read: true, write: true });
    expect(permissions.sections.nutrition).toEqual({ read: false, write: false });
    expect(permissions.sections.settings).toEqual({ read: false, write: false });
  });

  it("grants only the sections needed for a nutrition first job", () => {
    const permissions = permissionsForFirstJob("nutrition_plan");

    expect(permissions.sections.nutrition).toEqual({ read: true, write: false });
    expect(permissions.sections.meal_plans).toEqual({ read: true, write: true });
    expect(permissions.sections.progress).toEqual({ read: false, write: false });
  });

  it("clamps persisted resume stages", () => {
    expect(clampOnboardingStep(-4)).toBe(0);
    expect(clampOnboardingStep("3")).toBe(3);
    expect(clampOnboardingStep(99)).toBe(4);
    expect(clampOnboardingStep("invalid")).toBe(0);
  });
});
