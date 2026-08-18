import { describe, expect, it } from "vitest";
import type { UserWorkoutPlanExercise } from "@/types";
import type { WorkoutSessionPrescriptionItem } from "@/types/workout-prescription";
import { frozenExercise } from "./active-workout-runtime-model-core";

describe("Active Workout replacement hydration", () => {
  it("keeps the source plan command id while projecting the actual replacement identity for detail/navigation", () => {
    const replacementId = "11111111-1111-4111-8111-111111111121";
    const item = {
      id: "snapshot-item", snapshotId: "snapshot", workoutSessionId: "session", userId: "user", itemOrder: 1,
      sourcePlanExerciseId: "plan-exercise", sourcePlanActivityId: "original-activity",
      activityName: "Dumbbell Goblet Squat", originalActivityName: "Barbell Squat",
      actualTargetType: "global_exercise", actualGlobalExerciseId: replacementId, actualCustomExerciseId: null,
      actualProvider: null, actualProviderActivityId: null, rawCompatibilityPrescription: { sets: 2, reps: "8-10" },
      plannedSets: 2, executionState: "replaced", normalizationStatus: "partial", prescriptionSets: []
    } satisfies WorkoutSessionPrescriptionItem;
    const live = [{
      id: "plan-exercise", plan_day_id: "day", workout_id: "original-activity", source_workout_id: "original-activity",
      exercise_name: "Barbell Squat", category: "strength", target_muscle: "Quadriceps", equipment: "Barbell",
      sets: 2, reps: "8-10", rest_seconds: 90, instructions: null, exercise_url: null, video_url: null, custom_video_url: null, sort_order: 1, notes: null
    }] as unknown as UserWorkoutPlanExercise[];
    const projected = frozenExercise(item, live);
    expect(projected.id).toBe("plan-exercise");
    expect(projected.exercise_name).toBe("Dumbbell Goblet Squat");
    expect(projected.workout_id).toBe(replacementId);
    expect(projected.source_workout_id).toBe(replacementId);
  });
});
