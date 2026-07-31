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
        exercise_name: "Pull-up",
        reps: 20,
        weight_kg: 20,
        set_type: "working",
        completed_at: completedAt,
      },
    ];
    const metrics = deriveSessionMetrics(current, differentContextHistory);
    expect(
      metrics.personalRecords.some((record) => record.type === "max_repetitions"),
    ).toBe(true);
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
