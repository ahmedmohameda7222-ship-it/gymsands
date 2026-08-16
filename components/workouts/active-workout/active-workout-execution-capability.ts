import type { WorkoutSessionPrescriptionItem } from "@/types";

export type ActiveWorkoutExecutionCapability =
  | { supported: true; contract: "strength_reps_weight_v1"; source: "structured" | "legacy_compatibility" }
  | { supported: false; reason: "unsupported_non_strength_contract" };

const strengthMetrics = new Set([
  "repetitions",
  "external_load_kg",
  "bodyweight_kg",
  "assistance_load_kg"
]);
const nonStrengthMetrics = new Set(["duration_seconds", "distance_meters", "rounds"]);

export function resolveActiveWorkoutExecutionCapability(
  prescription: readonly WorkoutSessionPrescriptionItem[]
): ActiveWorkoutExecutionCapability {
  const structured = prescription.flatMap((item) =>
    item.prescriptionSets.flatMap((set) => set.targets.map((target) => target.metricKey))
  );
  // Current live execution supports only the Strength contract. If a frozen
  // structured prescription carries any explicit non-Strength execution semantic,
  // fail closed rather than silently discarding part of a mixed contract.
  if (structured.some((key) => nonStrengthMetrics.has(key))) {
    return { supported: false, reason: "unsupported_non_strength_contract" };
  }
  if (structured.some((key) => strengthMetrics.has(key))) {
    return { supported: true, contract: "strength_reps_weight_v1", source: "structured" };
  }

  // Frozen compatibility truth may predate normalized metric targets. Detect
  // explicit non-Strength prescription fields, but never infer capability from
  // an activity name/category string. Absence of explicit semantic fields keeps
  // the released Strength compatibility path available.
  const explicitNonStrength = prescription.some((item) => {
    const raw = item.rawCompatibilityPrescription;
    const hasNonStrength = raw.duration_seconds !== undefined
      || raw.durationSeconds !== undefined
      || raw.distance_meters !== undefined
      || raw.distanceMeters !== undefined
      || raw.rounds !== undefined;
    const hasStrength = raw.reps !== undefined || raw.sets !== undefined
      || raw.external_load_kg !== undefined || raw.externalLoadKg !== undefined
      || raw.bodyweight_kg !== undefined || raw.bodyweightKg !== undefined
      || raw.assistance_load_kg !== undefined || raw.assistanceLoadKg !== undefined;
    return hasNonStrength && !hasStrength;
  });
  if (explicitNonStrength) {
    return { supported: false, reason: "unsupported_non_strength_contract" };
  }
  return { supported: true, contract: "strength_reps_weight_v1", source: "legacy_compatibility" };
}
