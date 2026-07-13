import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Train final visual correction contracts", () => {
  test("uses one shell-aware bottom stack", () => {
    const shell = source("components/layout/app-shell.tsx");
    const controller = source("components/workouts/active-workout-indicator.tsx");
    const mobileNav = source("components/layout/mobile-floating-nav.tsx");
    expect(shell).toContain("--app-bottom-reserved-space");
    expect(shell).toContain("--train-sticky-footer-bottom");
    expect(shell).toContain("--active-workout-controller-height, 0px");
    expect(shell).toContain("--desktop-train-sticky-footer-bottom");
    expect(shell).toContain("lg:pb-[var(--desktop-app-bottom-reserved-space)]");
    expect(controller).toContain("ResizeObserver");
    expect(controller).toContain("data-active-workout-controller");
    expect(controller).toContain("activeWorkoutControllerState");
    expect(controller).not.toContain("dataset.activeWorkoutController =");
    expect(mobileNav).toContain("data-mobile-floating-nav");
  });
  test("builder and editor footers consume the shared offset", () => {
    for (const file of ["components/workouts/workout-plan-builder.tsx", "components/workouts/workout-plan-editor.tsx"]) {
      const content = source(file);
      expect(content).toContain("bottom-[var(--train-sticky-footer-bottom)]");
      expect(content).toContain("data-train-sticky-footer");
      expect(content).not.toContain("sticky bottom-0");
      expect(content).not.toContain("fixed inset-x-0 bottom-0");
    }
  });
  test("rest days expose the localized active-plan route without weakening Today precedence", () => {
    const overview = source("components/workouts/my-workout-plans.tsx");
    const translations = source("lib/i18n/train.ts");
    expect(overview).toContain("shouldShowRestDayPlanAction");
    expect(overview).toContain("data-rest-day-weekly-plan");
    expect(overview).toContain("/my-workout/plans/${plan!.id}");
    expect(translations.match(/viewWeeklyPlan:/g)?.length).toBe(3);
  });
});
