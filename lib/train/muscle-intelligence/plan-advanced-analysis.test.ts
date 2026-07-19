import { describe, expect, it } from "vitest";

import { REVIEWED_ADVANCED_EXERCISE_MAPPINGS } from "./advanced-mapping-registry";
import {
  calculateExerciseAdvancedMusclePreview,
  calculatePlanAdvancedMuscleExposure
} from "./plan-advanced-analysis";

const bench = REVIEWED_ADVANCED_EXERCISE_MAPPINGS.find((mapping) => mapping.slug === "barbell-bench-press")!;
const squat = REVIEWED_ADVANCED_EXERCISE_MAPPINGS.find((mapping) => mapping.slug === "barbell-back-squat")!;

describe("Phase 4B plan and exercise preview analysis", () => {
  it("recalculates current-day exposure directly from the supplied unsaved draft", () => {
    const days = [
      { clientKey: "day-a", dayName: "Push", exercises: [{ id: bench.reference.targetId, sets: 3, name: "Bench" }] },
      { clientKey: "day-b", dayName: "Legs", exercises: [{ id: squat.reference.targetId, sets: 5, name: "Squat" }] }
    ];
    const current = calculatePlanAdvancedMuscleExposure({ days, scope: "current_day", activeDayIndex: 0 });
    const changed = calculatePlanAdvancedMuscleExposure({
      days: [{ ...days[0], exercises: [{ ...days[0].exercises[0], sets: 4 }] }, days[1]],
      scope: "current_day",
      activeDayIndex: 0
    });
    expect(current.scope).toBe("single_session");
    expect(current.coverage).toEqual({ totalItemCount: 1, includedItemCount: 1, unmappedItemCount: 0 });
    expect(changed.targets.find((target) => target.targetId === "pectoralis.middle")!.rawExposure)
      .toBeGreaterThan(current.targets.find((target) => target.targetId === "pectoralis.middle")!.rawExposure);
    expect(current.targets.find((target) => target.targetId === "quadriceps.vastus_lateralis")!.rawExposure).toBe(0);
  });

  it("analyzes the entire plan with one shared deterministic engine", () => {
    const result = calculatePlanAdvancedMuscleExposure({
      scope: "entire_plan",
      days: [
        { id: "push", exercises: [{ workoutId: bench.reference.targetId, sets: 3 }] },
        { id: "legs", exercises: [{ sourceWorkoutId: squat.reference.targetId, sets: 4 }] }
      ]
    });
    expect(result.scope).toBe("plan_cycle");
    expect(result.completeness).toBe("complete");
    expect(result.coverage).toEqual({ totalItemCount: 2, includedItemCount: 2, unmappedItemCount: 0 });
    expect(result.mappingVersionsUsed).toHaveLength(2);
  });

  it("reports partial coverage instead of guessing an unmapped exercise", () => {
    const result = calculatePlanAdvancedMuscleExposure({
      scope: "entire_plan",
      days: [{
        id: "mixed",
        exercises: [
          { id: bench.reference.targetId, sets: 3 },
          { id: "not-a-canonical-exercise", exercise_name: "Barbell Bench Press", sets: 3 }
        ]
      }]
    });
    expect(result.completeness).toBe("partial");
    expect(result.coverage).toEqual({ totalItemCount: 2, includedItemCount: 1, unmappedItemCount: 1 });
    expect(result.warnings).toContain("unmapped_items");
  });

  it("builds a single focused exercise preview and leaves unknown identity unavailable", () => {
    const preview = calculateExerciseAdvancedMusclePreview({ id: bench.reference.targetId });
    expect(preview?.scope).toBe("exercise_preview");
    expect(preview?.targets.some((target) => target.previewRole === "primary")).toBe(true);
    expect(calculateExerciseAdvancedMusclePreview({ id: "Barbell Bench Press" })).toBeNull();
  });
});
