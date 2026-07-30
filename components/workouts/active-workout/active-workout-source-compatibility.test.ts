import { describe, expect, it } from "vitest";

import { activeWorkoutStorageIdentities } from "./active-workout-source-compatibility";

describe("activeWorkoutStorageIdentities", () => {
  it("preserves the exact plan-day cache keys", () => {
    expect(activeWorkoutStorageIdentities({
      sourceKind: "plan-day",
      sourceId: "day-1",
      userId: "user-1"
    })).toEqual({
      workoutTimerKey: "ss-gym:workout-day-session:user-1:day-1",
      restTimerKey: "ss-gym:workout-day-rest-timer:user-1:day-1"
    });
  });

  it("restores the exact direct-workout legacy cache keys", () => {
    expect(activeWorkoutStorageIdentities({
      sourceKind: "direct",
      sourceId: "workout-1",
      userId: "user-1"
    })).toEqual({
      workoutTimerKey: "ss-gym:single-workout-session:user-1:workout-1",
      restTimerKey: "ss-gym:single-workout-rest:user-1:workout-1"
    });
  });

  it("is stable for the same primitive identity", () => {
    const first = activeWorkoutStorageIdentities({
      sourceKind: "direct",
      sourceId: "workout-1",
      userId: "user-1"
    });
    const second = activeWorkoutStorageIdentities({
      sourceKind: "direct",
      sourceId: "workout-1",
      userId: "user-1"
    });
    expect(second).toEqual(first);
  });

  it("cannot collide when the source type changes", () => {
    const planDay = activeWorkoutStorageIdentities({
      sourceKind: "plan-day",
      sourceId: "same-id",
      userId: "same-user"
    });
    const direct = activeWorkoutStorageIdentities({
      sourceKind: "direct",
      sourceId: "same-id",
      userId: "same-user"
    });
    expect(direct.workoutTimerKey).not.toBe(planDay.workoutTimerKey);
    expect(direct.restTimerKey).not.toBe(planDay.restTimerKey);
  });
});
