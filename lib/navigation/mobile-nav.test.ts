import { describe, expect, it } from "vitest";
import { getTrainNavigationTarget, MOBILE_NAV_ITEMS, isMobileRouteActive } from "@/lib/navigation/mobile-nav";

describe("mobile navigation", () => {
  it("has the approved order and no Progress route", () => {
    const ids: string[] = MOBILE_NAV_ITEMS.map((item) => item.id);
    expect(ids).toEqual(["today", "train", "quick-log", "eat", "chatgpt"]);
    expect(ids).not.toContain("progress");
  });

  it("uses route-active state only for navigation destinations", () => {
    expect(isMobileRouteActive("/dashboard", "today")).toBe(true);
    expect(isMobileRouteActive("/workouts/session/1", "train")).toBe(true);
    expect(isMobileRouteActive("/my-meal-plan", "eat")).toBe(true);
    expect(MOBILE_NAV_ITEMS.find((item) => item.id === "quick-log")?.kind).toBe("action");
    expect(MOBILE_NAV_ITEMS.find((item) => item.id === "chatgpt")?.kind).toBe("action");
  });

  it("keeps Train, Exercise Library, and Workout History mutually exclusive", () => {
    expect(getTrainNavigationTarget("/my-workout/plans")).toBe("train");
    expect(getTrainNavigationTarget("/workouts/session/day/day-1")).toBe("train");
    expect(getTrainNavigationTarget("/workouts")).toBe("exercise-library");
    expect(getTrainNavigationTarget("/workouts/exercise-1")).toBe("exercise-library");
    expect(getTrainNavigationTarget("/workout-history")).toBe("workout-history");
    expect(isMobileRouteActive("/workouts", "train")).toBe(false);
    expect(isMobileRouteActive("/workout-history", "train")).toBe(false);
  });
});
