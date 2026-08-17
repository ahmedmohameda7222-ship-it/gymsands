import type { WorkoutSessionPrescriptionItem } from "@/types";

export type ActiveWorkoutExecutionCapability =
  | { supported: true; contract: "strength_reps_weight_v1"; source: "structured" | "legacy_compatibility" }
  | { supported: false; reason: "unsupported_non_strength_contract" | "unknown_execution_contract" };

const strengthMetrics = new Set([
  "repetitions",
  "external_load_kg",
  "bodyweight_kg",
  "assistance_load_kg"
]);

const legacyNeutralKeys = new Set([
  "sets",
  "rest_seconds",
  "restSeconds"
]);

const legacyStrengthKeys = new Set([
  "reps",
  "repetitions",
  "weights",
  "external_load_kg",
  "externalLoadKg",
  "bodyweight_kg",
  "bodyweightKg",
  "assistance_load_kg",
  "assistanceLoadKg"
]);

const legacyNonStrengthKeys = new Set([
  "duration_seconds",
  "durationSeconds",
  "distance_meters",
  "distanceMeters",
  "rounds"
]);

function hasMeaningfulLegacyStrengthValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

export function resolveActiveWorkoutExecutionCapability(
  prescription: readonly WorkoutSessionPrescriptionItem[]
): ActiveWorkoutExecutionCapability {
  const structured = prescription.flatMap((item) =>
    item.prescriptionSets.flatMap((set) => set.targets.map((target) => target.metricKey))
  );

  // Active Workout currently executes one contract only: Strength Reps/Weight.
  // Any structured metric outside that contract makes the frozen prescription
  // unsupported rather than allowing the runtime to discard unknown semantics.
  if (structured.length > 0) {
    if (structured.some((key) => !strengthMetrics.has(key))) {
      return { supported: false, reason: "unsupported_non_strength_contract" };
    }
    return { supported: true, contract: "strength_reps_weight_v1", source: "structured" };
  }

  let hasAffirmativeLegacyStrengthEvidence = false;
  for (const item of prescription) {
    const raw = item.rawCompatibilityPrescription ?? {};
    const keys = Object.keys(raw);

    if (keys.some((key) => legacyNonStrengthKeys.has(key))) {
      return { supported: false, reason: "unsupported_non_strength_contract" };
    }

    // Unknown compatibility fields are not evidence of Strength execution. Fail
    // closed instead of inferring execution capability from route/catalog context.
    if (keys.some((key) => !legacyNeutralKeys.has(key) && !legacyStrengthKeys.has(key))) {
      return { supported: false, reason: "unknown_execution_contract" };
    }

    if (keys.some((key) => legacyStrengthKeys.has(key) && hasMeaningfulLegacyStrengthValue(raw[key]))) {
      hasAffirmativeLegacyStrengthEvidence = true;
    }
  }

  if (hasAffirmativeLegacyStrengthEvidence) {
    return { supported: true, contract: "strength_reps_weight_v1", source: "legacy_compatibility" };
  }

  return { supported: false, reason: "unknown_execution_contract" };
}
