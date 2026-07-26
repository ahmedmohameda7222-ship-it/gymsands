import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const surfaces = [
  "components/workouts/workout-day-focus-session.tsx",
  "components/workouts/workout-session-form.tsx",
  "components/workouts/active-workout-indicator.tsx"
] as const;

describe("AW-4 Active Workout surface ownership", () => {
  it("routes every reachable session surface through the official store and shared clock", () => {
    for (const file of surfaces) {
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
    const source = readFileSync(surfaces[0], "utf8");
    expect(source).not.toMatch(/executionWriteQueue|switch\s*\(\s*commandType/);
    expect(source).not.toContain("replaceWorkoutSessionExercise");
    expect(source).toContain("completeCanonicalSet");
    expect(source).toContain("completeSession");
    expect(source).toContain("store.replaceExercise");
  });
});
