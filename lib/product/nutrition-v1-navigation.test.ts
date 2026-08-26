import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getTrainNavigationTarget,
  isMobileRouteActive,
  MOBILE_NAV_ITEMS,
} from "@/lib/navigation/mobile-nav";

const source = (path: string) => readFileSync(path, "utf8");

function nutritionPeerGroup() {
  const appShell = source("components/layout/app-shell.tsx");
  const match = appShell.match(/labelKey: "nav\.eat",\s*items: \[(.*?)\]\s*\n\s*\}/s);
  if (!match) throw new Error("Nutrition navigation group was not found.");
  return match[1]!;
}

describe("Nutrition V1 navigation and route compatibility", () => {
  it("exposes exactly the four canonical Nutrition peer destinations", () => {
    const group = nutritionPeerGroup();
    const hrefs = [...group.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]);
    const labels = [...group.matchAll(/labelKey: "([^"]+)"/g)].map((match) => match[1]);

    expect(hrefs).toEqual([
      "/calories",
      "/my-meal-plan",
      "/calories/food-hub",
      "/my-recipes",
    ]);
    expect(labels).toEqual([
      "nav.diary",
      "nav.mealPlan",
      "nav.foodLibrary",
      "nav.myRecipes",
    ]);
    expect(group).toMatch(/href: "\/calories"[^\n]*exact: true/);

    const appShell = source("components/layout/app-shell.tsx");
    expect(appShell).not.toContain("nav.nutritionSummary");
    expect(appShell).not.toContain("/calories/weekly-overview");
  });

  it("keeps the retired weekly overview URL as a compatibility redirect to Diary", () => {
    const weeklyOverview = source("app/(private)/calories/weekly-overview/page.tsx");
    expect(weeklyOverview).toContain('redirect("/calories")');
    expect(weeklyOverview).not.toContain("WeeklyOverviewPage");
    expect(weeklyOverview).not.toContain("Fitness Reports");
  });

  it("preserves the approved mobile shell while treating every Nutrition peer as Eat", () => {
    expect(MOBILE_NAV_ITEMS.map((item) => item.id)).toEqual([
      "today",
      "train",
      "quick-log",
      "eat",
      "chatgpt",
    ]);
    expect(MOBILE_NAV_ITEMS.find((item) => item.id === "quick-log")?.kind).toBe("action");
    expect(MOBILE_NAV_ITEMS.find((item) => item.id === "chatgpt")?.kind).toBe("action");

    for (const pathname of [
      "/calories",
      "/calories/food-hub",
      "/my-meal-plan",
      "/my-recipes",
    ]) {
      expect(isMobileRouteActive(pathname, "eat"), pathname).toBe(true);
    }

    expect(getTrainNavigationTarget("/my-workout/plans")).toBe("train");
    expect(getTrainNavigationTarget("/workouts")).toBe("exercise-library");
    expect(getTrainNavigationTarget("/workout-history")).toBe("workout-history");
  });

  it("uses canonical localized labels and retires the Nutrition Summary key", () => {
    const types = source("lib/i18n/types.ts");
    const translations = source("lib/i18n/translations.ts");

    for (const key of ["nav.diary", "nav.foodLibrary", "nav.myRecipes"]) {
      expect(types).toContain(`| "${key}"`);
      expect(translations.match(new RegExp(`"${key}":`, "g"))?.length).toBe(3);
    }

    expect(types).not.toContain('"nav.nutritionSummary"');
    expect(translations).not.toContain('"nav.nutritionSummary"');
  });
});
