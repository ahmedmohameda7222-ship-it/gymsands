import { describe, expect, it } from "vitest";

import type { PrivateAppBootstrap } from "@/lib/auth/private-app-bootstrap";
import { resolvePrivateRouteGate } from "@/lib/auth/private-route-gate";

const userId = "11111111-1111-4111-8111-111111111111";

function bootstrap(
  overrides: Partial<PrivateAppBootstrap> = {},
): PrivateAppBootstrap {
  return {
    contractVersion: 1,
    userId,
    profile: {
      id: userId,
      email: "member@example.test",
      full_name: "Member",
      role: "member",
      avatar_url: null,
      created_at: "2026-08-03T00:00:00.000Z",
      updated_at: "2026-08-03T00:00:00.000Z",
    },
    accountAccessState: "active",
    consentRecords: [],
    hasRequiredConsents: true,
    onboardingAge: 25,
    onboardingComplete: true,
    eligibility: { eligible: true },
    settings: {
      userId,
      themeId: "olive",
      theme: "system",
      accentColor: "olive",
      language: "en",
      weightUnit: "kg",
      heightUnit: "cm",
      distanceUnit: "km",
      liquidUnit: "ml",
      energyUnit: "kcal",
      bodyMeasurementUnit: "cm",
      weekStartsOn: "monday",
      defaultStartPage: "today",
      compactMode: false,
      reduceAnimations: false,
      largeTextMode: false,
      daysPerWeek: null,
      workoutDuration: null,
      preferredSplit: null,
      dailyCalories: null,
      proteinTarget: null,
      carbsTarget: null,
      fatTarget: null,
      dailyWaterGoal: null,
      trackBodyWeight: false,
      trackBodyMeasurements: false,
      trackProgressPhotos: false,
      sleepTarget: null,
      trackSleepQuality: false,
      stepTarget: null,
      trackSteps: false,
      trackHabits: false,
      workoutReminders: false,
      workoutTime: null,
      mealReminders: false,
      remindBeforeMeals: false,
      hydrationReminders: false,
      hydrationInterval: null,
      bedtimeReminder: false,
      bedtime: null,
      supplementReminders: false,
      weighInReminder: false,
      weighInDay: null,
      photoReminder: false,
      photoFrequency: null,
      habitReminders: false,
      quietHours: false,
      quietStart: null,
      quietEnd: null,
      hideBodyWeightOnDashboard: false,
      hideCaloriesOnDashboard: false,
      hideProgressPhotos: false,
      hideProfileDetails: false,
      privateProfileMode: false,
      quickLogSections: [],
    },
    ...overrides,
  };
}

function resolve(
  pathname: string,
  overrides: Partial<Parameters<typeof resolvePrivateRouteGate>[0]> = {},
) {
  return resolvePrivateRouteGate({
    authLoading: false,
    userId,
    pathname,
    bootstrapStatus: "ready",
    bootstrap: bootstrap(),
    ...overrides,
  });
}

describe("private route gate precedence", () => {
  it("loads auth first and redirects unauthenticated users with next", () => {
    expect(resolve("/dashboard", { authLoading: true })).toEqual({ kind: "loading" });
    expect(resolve("/dashboard", { userId: null, bootstrap: null })).toEqual({
      kind: "redirect",
      destination: "/login?next=%2Fdashboard",
    });
  });

  it("keeps account-control paths available when bootstrap verification fails", () => {
    for (const pathname of [
      "/settings/account",
      "/settings/data-privacy/export",
      "/settings/connections/chatgpt",
    ]) {
      expect(
        resolve(pathname, { bootstrapStatus: "error", bootstrap: null }),
      ).toEqual({ kind: "render" });
    }
  });

  it("fails member features closed on bootstrap errors and restricted accounts", () => {
    expect(
      resolve("/dashboard", { bootstrapStatus: "error", bootstrap: null }),
    ).toEqual({ kind: "bootstrap-error" });
    expect(
      resolve("/dashboard", {
        bootstrap: bootstrap({ accountAccessState: "legal_hold" }),
      }),
    ).toEqual({ kind: "account-restricted", state: "legal_hold" });
  });

  it("applies consent, eligibility, and onboarding redirects in order", () => {
    expect(
      resolve("/dashboard", {
        bootstrap: bootstrap({ hasRequiredConsents: false }),
      }),
    ).toEqual({
      kind: "redirect",
      destination: "/auth/consent-completion?next=%2Fdashboard",
    });
    expect(
      resolve("/dashboard", {
        bootstrap: bootstrap({
          eligibility: {
            eligible: false,
            code: "age_review_required",
            message: "Review age",
          },
        }),
      }),
    ).toEqual({ kind: "eligibility-review", message: "Review age" });
    expect(
      resolve("/dashboard", {
        bootstrap: bootstrap({ onboardingComplete: false }),
      }),
    ).toEqual({ kind: "redirect", destination: "/onboarding" });
  });

  it("allows onboarding before age completion but still requires consents", () => {
    expect(
      resolve("/onboarding", {
        bootstrap: bootstrap({
          onboardingAge: null,
          onboardingComplete: false,
          eligibility: {
            eligible: false,
            code: "age_review_required",
            message: "Confirm age",
          },
        }),
      }),
    ).toEqual({ kind: "render" });
    expect(
      resolve("/onboarding", {
        bootstrap: bootstrap({ hasRequiredConsents: false }),
      }),
    ).toMatchObject({ kind: "redirect" });
  });

  it("authorizes admin routes only from ready profile authority", () => {
    expect(resolve("/admin/users")).toEqual({ kind: "admin-denied" });
    expect(
      resolve("/admin/users", {
        bootstrap: bootstrap({
          profile: { ...bootstrap().profile!, role: "admin" },
        }),
      }),
    ).toEqual({ kind: "render" });
    expect(
      resolve("/admin/users", { bootstrapStatus: "error", bootstrap: null }),
    ).toEqual({ kind: "bootstrap-error" });
  });
});
