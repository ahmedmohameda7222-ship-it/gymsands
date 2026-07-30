import { describe, expect, it } from "vitest";

import {
  buildActiveWorkoutSetPath,
  clampWorkoutProgress,
  nextIncompleteSetCursor,
  parseWorkoutNumericDraft,
  validateActiveWorkoutSetDraft
} from "./active-workout-ui-model";

describe("AW-5 Active Workout UI model", () => {
  it("clamps completed-set progress to the inclusive unit interval", () => {
    expect(clampWorkoutProgress(3, 9)).toBeCloseTo(1 / 3);
    expect(clampWorkoutProgress(-1, 9)).toBe(0);
    expect(clampWorkoutProgress(12, 9)).toBe(1);
    expect(clampWorkoutProgress(0, 0)).toBe(0);
  });

  it("parses localized decimal drafts without accepting non-finite values", () => {
    expect(parseWorkoutNumericDraft(" 12,5 ")).toBe(12.5);
    expect(parseWorkoutNumericDraft("")).toBeNull();
    expect(parseWorkoutNumericDraft("Infinity")).toBeNull();
  });

  it("requires positive whole reps while allowing zero weight", () => {
    expect(validateActiveWorkoutSetDraft("8", "0")).toMatchObject({
      reps: 8,
      weightKg: 0,
      complete: true
    });
    expect(validateActiveWorkoutSetDraft("0", "20").complete).toBe(false);
    expect(validateActiveWorkoutSetDraft("8.5", "20").repsError).toBe("invalid");
    expect(validateActiveWorkoutSetDraft("8", "-1").weightError).toBe("invalid");
  });

  it("projects completed, active, and available set steps without color-only state", () => {
    expect(buildActiveWorkoutSetPath([
      { setNumber: 1, completed: true },
      { setNumber: 2, completed: false },
      { setNumber: 3, completed: false }
    ], 2)).toEqual([
      { number: 1, state: "completed" },
      { number: 2, state: "active" },
      { number: 3, state: "available" }
    ]);
  });

  it("advances a stale completed cursor to the next incomplete canonical set", () => {
    const sets = [
      { exerciseIndex: 0, setIndex: 0, completed: true },
      { exerciseIndex: 0, setIndex: 1, completed: false },
      { exerciseIndex: 1, setIndex: 0, completed: false }
    ];

    expect(nextIncompleteSetCursor(sets, { exerciseIndex: 0, setIndex: 0 })).toMatchObject({
      exerciseIndex: 0,
      setIndex: 1
    });
    expect(nextIncompleteSetCursor(sets, { exerciseIndex: 1, setIndex: 0 })).toEqual({
      exerciseIndex: 1,
      setIndex: 0
    });
  });
});
