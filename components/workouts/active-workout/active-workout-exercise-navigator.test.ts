import { describe, expect, it } from "vitest";

import { buildActiveWorkoutExerciseNavigatorRows } from "./active-workout-exercise-navigator";

describe("Active Workout Exercise Navigator model", () => {
  it("targets the first incomplete set and preserves completed, skipped, and replacement state", () => {
    const rows = buildActiveWorkoutExerciseNavigatorRows({
      activeExerciseIndex: 1,
      originalNamesByPlanExerciseId: new Map([["plan-2", "Original Row"]]),
      exercises: [
        { exercise: { exercise_name: "Completed" }, prescriptionItem: { executionState: "completed", sourcePlanExerciseId: "plan-1" }, sets: [{ completedAt: "done" }, { completedAt: "done" }] },
        { exercise: { exercise_name: "Replacement Row" }, prescriptionItem: { executionState: "planned", sourcePlanExerciseId: "plan-2" }, sets: [{ completedAt: "done" }, { completedAt: null }, { completedAt: null }] },
        { exercise: { exercise_name: "Skipped" }, prescriptionItem: { executionState: "skipped", sourcePlanExerciseId: "plan-3" }, sets: [{ completedAt: null }] },
      ],
    });
    expect(rows[0]).toMatchObject({ completedSets: 2, totalSets: 2, targetSetIndex: 1, current: false });
    expect(rows[1]).toMatchObject({ completedSets: 1, totalSets: 3, targetSetIndex: 1, current: true, replacedFrom: "Original Row" });
    expect(rows[2]).toMatchObject({ skipped: true, targetSetIndex: 0 });
  });
});
