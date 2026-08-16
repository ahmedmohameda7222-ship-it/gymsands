import { describe, expect, it } from "vitest";
import type { WorkoutSessionPrescriptionItem } from "@/types";

import { resolveActiveWorkoutExecutionCapability } from "./active-workout-execution-capability";

function prescription(input: {
  metrics?: string[];
  raw?: Record<string, unknown>;
}): WorkoutSessionPrescriptionItem[] {
  return [{
    rawCompatibilityPrescription: input.raw ?? {},
    prescriptionSets: [{
      targets: (input.metrics ?? []).map((metricKey) => ({ metricKey }))
    }]
  }] as unknown as WorkoutSessionPrescriptionItem[];
}

describe("Active Workout execution capability", () => {
  it("accepts normalized Strength metrics", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({
      metrics: ["repetitions", "external_load_kg"]
    }))).toEqual({
      supported: true,
      contract: "strength_reps_weight_v1",
      source: "structured"
    });
  });

  it("fails closed for explicit non-Strength structured metrics", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({
      metrics: ["distance_meters", "duration_seconds"]
    }))).toEqual({ supported: false, reason: "unsupported_non_strength_contract" });
  });

  it("fails closed for a mixed structured contract instead of discarding non-Strength semantics", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({
      metrics: ["repetitions", "distance_meters"]
    }))).toEqual({ supported: false, reason: "unsupported_non_strength_contract" });
  });

  it("fails closed for legacy non-Strength semantic fields", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({
      raw: { distance_meters: 5000, duration_seconds: 1200 }
    }))).toEqual({ supported: false, reason: "unsupported_non_strength_contract" });
  });

  it("keeps released legacy Strength compatibility without name/category heuristics", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({
      raw: { sets: 3, reps: "8-10" }
    }))).toEqual({
      supported: true,
      contract: "strength_reps_weight_v1",
      source: "legacy_compatibility"
    });
  });
});
