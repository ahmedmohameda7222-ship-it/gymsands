import { describe, expect, it } from "vitest";
import type { Workout, WorkoutSessionPrescriptionItem } from "@/types";
import { plannedPrescriptionForDirectWorkout } from "@/services/database/direct-workout-sessions";

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

function directProviderWorkout(): Workout {
  return {
    id: "provider-activity-without-execution-contract",
    name: "Catalog activity",
    category: "Strength",
    target_muscle: "Chest",
    equipment: "None",
    difficulty: "Beginner",
    sets: null,
    reps: null,
    rest_seconds: null,
    instructions: "",
    notes: null,
    is_global: true,
    catalog_source: "external",
    catalog_slug: "catalog-activity",
    catalog_version: "v2"
  };
}

describe("Active Workout execution capability", () => {
  it("A: accepts an explicit structured Strength target", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({
      metrics: ["repetitions", "external_load_kg"]
    }))).toEqual({
      supported: true,
      contract: "strength_reps_weight_v1",
      source: "structured"
    });
  });

  it.each([
    ["B: duration", "duration_seconds"],
    ["C: distance", "distance_meters"],
    ["D: rounds", "rounds"]
  ])("%s structured target fails closed", (_label, metric) => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({ metrics: [metric] })))
      .toEqual({ supported: false, reason: "unsupported_non_strength_contract" });
  });

  it("E: unknown empty semantic prescription cannot silently become Strength", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({ raw: {} })))
      .toEqual({ supported: false, reason: "unknown_execution_contract" });
    expect(resolveActiveWorkoutExecutionCapability(prescription({ raw: { sets: 3, rest_seconds: 90 } })))
      .toEqual({ supported: false, reason: "unknown_execution_contract" });
  });

  it("F: keeps valid legacy Strength compatibility only with affirmative Strength evidence", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({
      raw: { sets: 3, reps: "8-10", rest_seconds: 90, weights: null }
    }))).toEqual({
      supported: true,
      contract: "strength_reps_weight_v1",
      source: "legacy_compatibility"
    });
  });

  it("G: mixed structured Strength and non-Strength semantics fail closed", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({
      metrics: ["repetitions", "distance_meters"]
    }))).toEqual({ supported: false, reason: "unsupported_non_strength_contract" });
  });

  it("also fails closed for mixed legacy Strength and non-Strength fields", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({
      raw: { sets: 3, reps: "8", duration_seconds: 1200 }
    }))).toEqual({ supported: false, reason: "unsupported_non_strength_contract" });
  });

  it("fails closed for unknown structured or compatibility semantics", () => {
    expect(resolveActiveWorkoutExecutionCapability(prescription({ metrics: ["unknown_metric"] })))
      .toEqual({ supported: false, reason: "unsupported_non_strength_contract" });
    expect(resolveActiveWorkoutExecutionCapability(prescription({ raw: { custom_metric: 12 } })))
      .toEqual({ supported: false, reason: "unknown_execution_contract" });
  });

  it("H: a direct provider/catalog workout without execution evidence cannot reach Reps/Weight", () => {
    const raw = plannedPrescriptionForDirectWorkout(directProviderWorkout());
    expect(raw).toEqual({});
    expect(resolveActiveWorkoutExecutionCapability(prescription({ raw })))
      .toEqual({ supported: false, reason: "unknown_execution_contract" });
  });
});
