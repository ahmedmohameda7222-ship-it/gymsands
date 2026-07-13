import { describe, expect, test } from "vitest";
import { mergeUserFacingExerciseNote, shouldShowRestDayPlanAction, userFacingExerciseNote } from "@/lib/workouts/train-visual";

describe("Train user-facing exercise notes", () => {
  test("hides the legacy source marker while keeping user notes", () => {
    expect(userFacingExerciseNote("Source: plaivra_legacy_workouts\nKeep two reps in reserve.")).toBe("Keep two reps in reserve.");
  });
  test("hides bracketed internal source metadata as well", () => {
    expect(userFacingExerciseNote("[source: plaivra_legacy_workouts]\nControlled tempo.")).toBe("Controlled tempo.");
  });
  test("preserves hidden metadata when the visible note is edited", () => {
    expect(mergeUserFacingExerciseNote("Source: plaivra_legacy_workouts\nOld note", "New note")).toBe("Source: plaivra_legacy_workouts\nNew note");
  });
  test("does not allow the internal source marker to be reintroduced as visible text", () => {
    expect(mergeUserFacingExerciseNote(null, "Source: plaivra_legacy_workouts\nUser note")).toBe("User note");
  });
});

describe("rest-day weekly-plan action", () => {
  const restDay = {
    resolutionState: "none" as const,
    hasOpenSession: false,
    hasWorkoutDay: false,
    hasPlan: true,
    statusState: "loaded" as const,
    statusError: null
  };
  test("shows only for a genuine loaded rest day with an active plan", () => {
    expect(shouldShowRestDayPlanAction(restDay)).toBe(true);
  });
  test.each(["active", "scheduled", "completed", "skipped"] as const)("does not replace the %s action", (resolutionState) => {
    expect(shouldShowRestDayPlanAction({ ...restDay, resolutionState })).toBe(false);
  });
  test("keeps an open session authoritative", () => {
    expect(shouldShowRestDayPlanAction({ ...restDay, hasOpenSession: true })).toBe(false);
  });
  test("does not show without a plan or when plan-day data exists", () => {
    expect(shouldShowRestDayPlanAction({ ...restDay, hasPlan: false })).toBe(false);
    expect(shouldShowRestDayPlanAction({ ...restDay, hasWorkoutDay: true })).toBe(false);
  });
  test("does not show during loading or after an activity failure", () => {
    expect(shouldShowRestDayPlanAction({ ...restDay, statusState: "loading" })).toBe(false);
    expect(shouldShowRestDayPlanAction({ ...restDay, statusState: "failed", statusError: "Unavailable" })).toBe(false);
  });
});
