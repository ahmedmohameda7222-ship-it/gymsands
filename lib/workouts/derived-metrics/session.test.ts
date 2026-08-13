import { describe, expect, it } from "vitest";

import {
  DERIVED_METRICS_FORMULA_VERSION,
  deriveSessionMetrics,
  estimateEligibleOneRepMax,
} from "./index";

const completedAt = "2026-07-31T10:00:00.000Z";

describe("AW-8 derived metrics", () => {
  it("uses structured metrics before compatibility columns and excludes drafts", () => {
    const metrics = deriveSessionMetrics([
      {
        id: "set-1",
        exercise_name: "Back Squat",
        plan_exercise_id: "exercise-1",
        reps: 99,
        weight_kg: 99,
        completed_at: completedAt,
        performance_metrics: [
          { metric_key: "repetitions", value: 8 },
          { metric_key: "external_load_kg", value: 80 },
        ],
        set_details: { set_type: "working", rpe: 8, rir: 2 },
      },
      {
        id: "draft",
        exercise_name: "Back Squat",
        reps: 10,
        weight_kg: 100,
        completed_at: null,
      },
    ]);

    expect(metrics.formulaVersion).toBe(DERIVED_METRICS_FORMULA_VERSION);
    expect(metrics.completedSetCount).toBe(1);
    expect(metrics.externalLoadVolume).toBe(640);
    expect(metrics.averageRpe).toBe(8);
    expect(metrics.averageRir).toBe(2);
  });

  it("uses direct structured values per key before segment and compatibility fallback", () => {
    const metrics = deriveSessionMetrics([
      {
        id: "mixed",
        exercise_name: "Row",
        reps: 99,
        weight_kg: 99,
        completed_at: completedAt,
        performance_metrics: [{ metric_key: "repetitions", value: 8 }],
        segments: [{
          metric_values: [
            { metric_key: "repetitions", value: 12 },
            { metric_key: "external_load_kg", value: 70 },
            { metric_key: "duration_seconds", value: 30 },
          ],
        }],
      },
    ]);

    expect(metrics.exercises[0].maxRepetitions).toBe(8);
    expect(metrics.exercises[0].heaviestExternalLoadKg).toBe(70);
    expect(metrics.durationSeconds).toBe(30);
    expect(metrics.externalLoadVolume).toBe(840);
  });

  it("deduplicates log identities and rejects invalid values", () => {
    const log = {
      id: "same-log",
      exercise_name: "Bench Press",
      reps: 5,
      weight_kg: 100,
      completed_at: completedAt,
    };
    const metrics = deriveSessionMetrics([
      log,
      { ...log },
      {
        id: "negative",
        exercise_name: "Bench Press",
        reps: -5,
        weight_kg: Number.NaN,
        completed_at: completedAt,
      },
    ]);
    expect(metrics.completedSetCount).toBe(2);
    expect(metrics.externalLoadVolume).toBe(500);
  });

  it("uses the frozen identity precedence before normalized names", () => {
    const metrics = deriveSessionMetrics([
      {
        id: "a",
        exercise_name: "Old label",
        plan_activity_id: "activity-1",
        reps: 5,
        weight_kg: 40,
        completed_at: completedAt,
      },
      {
        id: "b",
        exercise_name: "New label",
        plan_activity_id: "activity-1",
        reps: 5,
        weight_kg: 50,
        completed_at: completedAt,
      },
    ]);
    expect(metrics.completedExerciseCount).toBe(1);
    expect(metrics.exercises[0].heaviestExternalLoadKg).toBe(50);
  });

  it("applies the Epley eligibility boundary without presentation rounding", () => {
    expect(estimateEligibleOneRepMax(100, 10, "working")).toBeCloseTo(
      133.333333,
    );
    expect(estimateEligibleOneRepMax(100, 13, "working")).toBeNull();
    expect(estimateEligibleOneRepMax(100, 10, "warmup")).toBeNull();
    expect(estimateEligibleOneRepMax(0, 10, "working")).toBeNull();
  });

  it("keeps max-repetition records within comparable set type and load", () => {
    const current = [
      {
        id: "current",
        workout_session_id: "session-current",
        plan_exercise_id: "pull-up",
        exercise_name: "Pull-up",
        reps: 12,
        weight_kg: 0,
        set_type: "working",
        completed_at: completedAt,
      },
    ];
    const differentContextHistory = [
      {
        id: "history",
        workout_session_id: "session-history",
        plan_exercise_id: "pull-up",
        exercise_name: "Pull-up",
        reps: 20,
        weight_kg: 20,
        set_type: "working",
        completed_at: completedAt,
      },
    ];
    const metrics = deriveSessionMetrics(current, differentContextHistory);
    expect(
      metrics.personalRecords.some((record) => record.recordType === "same_load_max_repetitions"),
    ).toBe(true);
  });

  it("compares volume against the best historical session, not lifetime volume", () => {
    const history = [
      {
        id: "history-a",
        workout_session_id: "session-a",
        plan_exercise_id: "bench-press",
        exercise_name: "Bench Press",
        reps: 10,
        weight_kg: 50,
        completed_at: completedAt,
      },
      {
        id: "history-b",
        workout_session_id: "session-b",
        plan_exercise_id: "bench-press",
        exercise_name: "Bench Press",
        reps: 10,
        weight_kg: 50,
        completed_at: completedAt,
      },
    ];
    const current = [
      {
        id: "current-a",
        workout_session_id: "session-current",
        plan_exercise_id: "bench-press",
        exercise_name: "Bench Press",
        reps: 11,
        weight_kg: 50,
        completed_at: completedAt,
      },
    ];
    const metrics = deriveSessionMetrics(current, history);
    expect(
      metrics.personalRecords.some((record) =>
        record.recordType === "exercise_session_volume" && record.recordValue === 550
      ),
    ).toBe(true);
  });

  it("establishes Session Volume at the latest contributing set", () => {
    const metrics = deriveSessionMetrics([
      {
        id: "volume-first",
        workout_session_id: "session-volume",
        plan_exercise_id: "bench-press",
        exercise_name: "Bench Press",
        reps: 10,
        weight_kg: 50,
        completed_at: "2026-07-31T10:00:00.000Z",
      },
      {
        id: "volume-final",
        workout_session_id: "session-volume",
        plan_exercise_id: "bench-press",
        exercise_name: "Bench Press",
        reps: 8,
        weight_kg: 50,
        completed_at: "2026-07-31T10:05:00.000Z",
      },
    ]);
    const volume = metrics.personalRecords.find((record) => record.recordType === "exercise_session_volume");
    expect(volume).toMatchObject({
      exerciseLogId: "volume-final",
      achievedAt: "2026-07-31T10:05:00.000Z",
      eventSemanticsVersion: "wh6-session-volume-latest-set-v2",
    });
  });

  it("uses only eligible working sets for performance change", () => {
    const metrics = deriveSessionMetrics([
      {
        id: "working-1",
        exercise_name: "Bench Press",
        reps: 10,
        weight_kg: 100,
        set_type: "working",
        completed_at: completedAt,
      },
      {
        id: "drop",
        exercise_name: "Bench Press",
        reps: 12,
        weight_kg: 60,
        set_type: "drop",
        completed_at: completedAt,
      },
      {
        id: "working-2",
        exercise_name: "Bench Press",
        reps: 8,
        weight_kg: 100,
        set_type: "working",
        completed_at: completedAt,
      },
    ]);
    expect(metrics.exercises[0].performanceChangePercent).toBeCloseTo(-5);
  });

  it("derives pace only when duration and distance both exist", () => {
    const metrics = deriveSessionMetrics([
      {
        id: "run",
        exercise_name: "Run",
        completed_at: completedAt,
        performance_metrics: [
          { metric_key: "duration_seconds", value: 600 },
          { metric_key: "distance_meters", value: 2000 },
        ],
        set_type: "timed",
      },
    ]);
    expect(metrics.paceSecondsPerMeter).toBe(0.3);
    expect(metrics.exercises[0].bestEstimatedOneRepMaxKg).toBeNull();
  });
});
