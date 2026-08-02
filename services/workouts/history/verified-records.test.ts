import { describe, expect, it } from "vitest";

import {
  buildPersonalRecordCandidates,
  DERIVED_METRICS_FORMULA_VERSION,
  estimateEligibleOneRepMax,
  type DerivedMetricLog,
} from "@/lib/workouts/derived-metrics";

const achievedAt = "2026-08-01T10:00:00.000Z";

function log(overrides: Partial<DerivedMetricLog> = {}): DerivedMetricLog {
  return {
    id: crypto.randomUUID(),
    workout_session_id: crypto.randomUUID(),
    exercise_name: "Bench press",
    plan_exercise_id: "11111111-1111-4111-8111-111111111111",
    reps: 8,
    weight_kg: 80,
    set_type: "working",
    completed_at: achievedAt,
    ...overrides,
  };
}

describe("WH-6 verified record calculation", () => {
  it("normalizes pounds to canonical kilograms", () => {
    const [record] = buildPersonalRecordCandidates([log({ weight_kg: 176.369809744, weightUnit: "lb" })])
      .filter((candidate) => candidate.recordType === "highest_load");
    expect(record.recordValue).toBeCloseTo(80, 5);
    expect(record.recordUnit).toBe("kg");
  });

  it("recognizes more reps only at the same compatible load and context", () => {
    const identity = "22222222-2222-4222-8222-222222222222";
    const history = log({ workout_session_id: "33333333-3333-4333-8333-333333333333", plan_exercise_id: identity, reps: 8, weight_kg: 80 });
    const records = buildPersonalRecordCandidates([
      log({ plan_exercise_id: identity, reps: 9, weight_kg: 80 }),
      log({ plan_exercise_id: identity, reps: 6, weight_kg: 90 }),
    ], [history]);
    expect(records.some((record) => record.recordType === "same_load_max_repetitions" && record.recordValue === 9)).toBe(true);
    expect(records.some((record) => record.recordType === "highest_load" && record.recordValue === 90)).toBe(true);
  });

  it("excludes warmups, equal records, and degraded name-only identities", () => {
    const stable = "44444444-4444-4444-8444-444444444444";
    expect(buildPersonalRecordCandidates([log({ plan_exercise_id: stable, set_type: "warmup" })])).toEqual([]);
    expect(buildPersonalRecordCandidates(
      [log({ plan_exercise_id: stable })],
      [log({ workout_session_id: "55555555-5555-4555-8555-555555555555", plan_exercise_id: stable })],
    )).toEqual([]);
    expect(buildPersonalRecordCandidates([log({ plan_exercise_id: null })])).toEqual([]);
  });

  it("separates bodyweight, added-load, assisted, and unilateral comparisons", () => {
    const identity = "66666666-6666-4666-8666-666666666666";
    const records = buildPersonalRecordCandidates([
      log({ plan_exercise_id: identity, resistanceMode: "bodyweight", weight_kg: 0, reps: 12 }),
      log({ plan_exercise_id: identity, resistanceMode: "bodyweight_added", weight_kg: 20, reps: 8 }),
      log({ plan_exercise_id: identity, resistanceMode: "assisted", weight_kg: 30, reps: 10 }),
      log({
        plan_exercise_id: identity,
        performance_metrics: [
          { metric_key: "repetitions", value: 8, side: "left" },
          { metric_key: "external_load_kg", value: 20, side: "left" },
        ],
      }),
    ]);
    expect(records.some((record) => record.recordType === "highest_load" && record.comparisonContextKey.includes("resistance:assisted"))).toBe(false);
    expect(new Set(records.map((record) => record.comparisonContextKey)).size).toBeGreaterThan(2);
    expect(records.some((record) => record.comparisonContextKey.includes("side:left"))).toBe(true);
  });

  it("keeps e1RM bounded, explicitly versioned, and unrounded", () => {
    expect(estimateEligibleOneRepMax(100, 12, "working")).toBe(140);
    expect(estimateEligibleOneRepMax(100, 13, "working")).toBeNull();
    const estimated = buildPersonalRecordCandidates([log()])
      .find((record) => record.recordType === "estimated_one_rep_max");
    expect(estimated?.formulaVersion).toBe(DERIVED_METRICS_FORMULA_VERSION);
    expect(estimated?.recordValue).toBeCloseTo(101.333333, 5);
  });
});
