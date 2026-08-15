import { describe, expect, it } from "vitest";

import { resolveWorkoutHistoryResultKind } from "@/lib/workouts/history/result-kind";

describe("Workout History result-kind authority", () => {
  it("keeps the understood resistance workload authoritative", () => {
    expect(resolveWorkoutHistoryResultKind({
      authoritativeWorkloadModelVersion: "resistance_sets_v1",
      hasSupportedStructuredMetrics: true,
      hasLegacyStrengthValues: false,
    })).toBe("strength_sets");
  });

  it("does not let legacy reps or weight override a non-Strength workload", () => {
    expect(resolveWorkoutHistoryResultKind({
      authoritativeWorkloadModelVersion: "endurance_distance_v1",
      hasSupportedStructuredMetrics: true,
      hasLegacyStrengthValues: true,
    })).toBe("semantic_metrics");
  });

  it("fails unknown authoritative semantics closed even when legacy Strength values exist", () => {
    expect(resolveWorkoutHistoryResultKind({
      authoritativeWorkloadModelVersion: "future_unknown_v9",
      hasSupportedStructuredMetrics: false,
      hasLegacyStrengthValues: true,
    })).toBe("limited");
  });

  it("uses legacy Strength inference only when no stronger authority exists", () => {
    expect(resolveWorkoutHistoryResultKind({
      authoritativeWorkloadModelVersion: null,
      hasSupportedStructuredMetrics: false,
      hasLegacyStrengthValues: true,
    })).toBe("strength_sets");
  });
});
