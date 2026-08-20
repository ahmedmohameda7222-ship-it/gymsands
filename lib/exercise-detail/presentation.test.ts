import { describe, expect, it } from "vitest";

import { isCanonicalExerciseDetailRoute } from "./presentation";

describe("focused Exercise Detail route boundary", () => {
  it.each([
    "/workouts/activity",
    "/workouts/activity/anatomy",
    "/workouts/activity/technique",
    "/workouts/activity/performance",
    "/workouts/activity/alternatives",
    "/workouts/activity/details",
  ])("focuses canonical Detail route %s", (pathname) => {
    expect(isCanonicalExerciseDetailRoute(pathname)).toBe(true);
  });

  it.each([
    "/workouts",
    "/workouts/session/activity",
    "/workouts/activity/unknown",
    "/workout-history/session",
    "/my-workout/exercises/item",
  ])("does not leak focused shell semantics to %s", (pathname) => {
    expect(isCanonicalExerciseDetailRoute(pathname)).toBe(false);
  });
});
