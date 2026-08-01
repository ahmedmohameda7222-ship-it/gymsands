import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/types";
import type { CanonicalWorkoutSetWrite } from "@/lib/workouts/active-session-store/persistence-adapter";
import { fingerprintCanonicalExerciseLog, fingerprintCanonicalSetWrite } from "./contracts";

describe("durable set fingerprints", () => {
  it("matches canonical input to its hydrated database projection", () => {
    const write: CanonicalWorkoutSetWrite = {
      planExerciseId: "10000000-0000-4000-8000-000000000011",
      exerciseOrder: 1,
      exerciseName: "Barbell Squat",
      setNumber: 1,
      reps: 8,
      weightKg: 80,
      notes: null,
      completedAt: "2026-07-27T08:10:00.000Z",
      metricSource: "manual",
      metricSourceProvider: "plaivra",
      metricSourceVersion: "aw3c-v1",
      setDetails: {
        setType: "working",
        rpe: null,
        rir: null,
        notes: null,
        sideMode: "none",
        plannedTempo: null,
        performedTempo: null,
        tempoAdherence: "not_recorded",
        source: "manual",
        sourceProvider: "plaivra",
        sourceVersion: "aw3c-v1",
      },
    };
    const hydrated = {
      reps: 8,
      weight_kg: 80,
      notes: null,
      completed_at: write.completedAt,
      performance_metrics: [],
      segments: [],
      set_details: {
        exercise_log_id: "25000000-0000-4000-8000-000000000001",
        workout_session_id: "10000000-0000-4000-8000-000000000001",
        user_id: "00000000-0000-4000-8000-000000000001",
        schema_version: 1,
        set_type: "working",
        rpe: null,
        rir: null,
        notes: null,
        side_mode: "none",
        planned_tempo: null,
        performed_tempo: null,
        tempo_adherence: "not_recorded",
        source: "manual",
        source_provider: "plaivra",
        source_version: "aw3c-v1",
        created_at: write.completedAt,
        updated_at: write.completedAt,
      },
    } as unknown as ExerciseLog;
    expect(fingerprintCanonicalExerciseLog(hydrated)).toBe(
      fingerprintCanonicalSetWrite(write),
    );
  });
});
