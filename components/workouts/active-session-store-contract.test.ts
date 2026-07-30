import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSurfaces = [
  "components/workouts/workout-day-focus-session.tsx",
  "components/workouts/workout-session-form.tsx",
] as const;

const authoritySurfaces = [
  "components/workouts/active-workout/active-workout-core-session.tsx",
  "components/workouts/active-workout-indicator.tsx"
] as const;

describe("AW-4 Active Workout surface ownership", () => {
  it("routes every reachable session surface through the official store and shared clock", () => {
    for (const file of routeSurfaces) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("ActiveWorkoutCoreSession");
    }
    for (const file of authoritySurfaces) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("getActiveSessionStore");
      expect(source).toContain("activeSessionClock");
      expect(source).not.toContain("window.setInterval");
      expect(source).not.toContain("createWorkoutSessionExecutionWriteQueue");
      expect(source).not.toContain("persistWorkoutSessionPause");
      expect(source).not.toContain("persistWorkoutSessionResume");
      expect(source).not.toContain("persistWorkoutSessionRestTimer");
      expect(source).not.toContain("persistWorkoutSessionTimerReset");
    }
  });

  it("keeps the day-session monolith free of a second command reducer or write queue", () => {
    const source = readFileSync(authoritySurfaces[0], "utf8");
    const compatibilitySource = readFileSync(
      "lib/workouts/workout-session-execution.ts",
      "utf8"
    );
    expect(source).not.toMatch(/executionWriteQueue|switch\s*\(\s*commandType/);
    expect(source).not.toContain("replaceWorkoutSessionExercise");
    expect(source).toContain("completeCanonicalSet");
    expect(source).toContain("completeSession");
    expect(source).toContain("store.replaceExercise");
    expect(source).toContain("planSessionAfterSetCompletion");
    expect(compatibilitySource).not.toContain(
      "function planWorkoutSessionAfterSetCompletion"
    );
    expect(compatibilitySource).toContain(
      "planSessionAfterSetCompletion as planWorkoutSessionAfterSetCompletion"
    );
  });
});
