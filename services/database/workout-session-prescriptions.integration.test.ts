import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("AW-3C effective runtime source contract", () => {
  it("uses one frozen projection service and canonical direct snake_case writes", () => {
    const execution = read("services/database/workout-session-execution.ts");
    const direct = read("services/database/direct-workout-sessions.ts");
    const controller = read(
      "components/workouts/active-workout/active-workout-core-session-implementation.tsx",
    );
    const runtimeModel = [
      read("components/workouts/active-workout/active-workout-runtime-model.ts"),
      read("components/workouts/active-workout/active-workout-runtime-model-core.ts")
    ].join("\n");
    const sharedRuntime = `${controller}\n${runtimeModel}`;

    expect(execution).toContain("getWorkoutSessionPrescriptionItems");
    expect(direct).toContain("rest_seconds");
    expect(direct).not.toContain("restSeconds: workout.rest_seconds");
    expect(sharedRuntime).toContain("makeFrozenExerciseState");
    expect(runtimeModel).toContain("frozenLogCompatibility");
    expect(controller).toContain("store.hydrate");
    expect(sharedRuntime).not.toContain("function firstNumber");
    expect(sharedRuntime).not.toContain("function plannedSetCount");
    expect(sharedRuntime).not.toContain("day.exercises.map(makeExerciseState)");
    expect(sharedRuntime).not.toContain("hydrateDirectPrescriptionSets");
  });

  it("exports and deletes both owner-scoped AW-3C tables", () => {
    const privacy = read("lib/privacy/data-export.ts");
    const migration = read("supabase/migrations/20260725013000_active_workout_aw3c_immutable_prescription_snapshots.sql");
    expect(privacy).toContain("workout_session_prescription_sets");
    expect(privacy).toContain("workout_session_prescription_metric_targets");
    expect(privacy).toContain("prescription_sets");
    expect(privacy).toContain("prescription_metric_targets");
    expect(migration).toContain("prescription_sets_deleted");
    expect(migration).toContain("prescription_metric_targets_deleted");
  });
});
