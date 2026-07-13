import { describe, expect, test } from "vitest";
import { mergeUserFacingExerciseNote, userFacingExerciseNote } from "@/lib/workouts/train-visual";

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
