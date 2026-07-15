import { describe, expect, it } from "vitest";
import { resolveActiveWorkoutRoute, type ActiveWorkoutState } from "./active-workout";

const stored: ActiveWorkoutState = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  route: "/workouts/session/55555555-5555-4555-8555-555555555555",
  label: "Squat",
  startedAtMs: 1,
  elapsedSeconds: 0,
  paused: false
};

describe("resolveActiveWorkoutRoute", () => {
  it("preserves a validated stored route for the same owner-validated session", () => {
    expect(resolveActiveWorkoutRoute({ id: stored.sessionId, workout_id: null }, stored)).toBe(stored.route);
  });

  it("does not preserve a stored route for another session", () => {
    expect(resolveActiveWorkoutRoute({ id: "22222222-2222-4222-8222-222222222222", workout_id: null }, stored)).toBe("/workout-history");
  });
});
