import { describe, expect, it } from "vitest";

import {
  activeWorkoutExerciseDetailHref,
  resolveActiveWorkoutExerciseDetailId,
  validatedActiveWorkoutReturnTo,
} from "./active-workout-detail-navigation";

describe("Active Workout canonical Exercise Detail navigation", () => {
  it("resolves stable identity without display-name matching", () => {
    expect(resolveActiveWorkoutExerciseDetailId({ sourceWorkoutId: " catalog-id ", workoutId: "legacy-id", sourcePlanActivityId: "activity-id" })).toBe("catalog-id");
    expect(resolveActiveWorkoutExerciseDetailId({ sourceWorkoutId: null, workoutId: "legacy-id", sourcePlanActivityId: "activity-id" })).toBe("legacy-id");
    expect(resolveActiveWorkoutExerciseDetailId({ sourceWorkoutId: null, workoutId: null, sourcePlanActivityId: "activity-id" })).toBe("activity-id");
    expect(resolveActiveWorkoutExerciseDetailId({})).toBeNull();
  });

  it("builds the canonical library route with a validated workout return boundary", () => {
    const href = activeWorkoutExerciseDetailHref("exercise/one", "/workouts/session/day/day-1");
    expect(href).toBe("/workouts/exercise%2Fone?returnTo=%2Fworkouts%2Fsession%2Fday%2Fday-1");
    expect(validatedActiveWorkoutReturnTo("/workouts/session/day/day-1")).toBe("/workouts/session/day/day-1");
    expect(validatedActiveWorkoutReturnTo("https://evil.example/workouts/session/day/day-1")).toBeNull();
    expect(validatedActiveWorkoutReturnTo("//evil.example")).toBeNull();
  });
});
