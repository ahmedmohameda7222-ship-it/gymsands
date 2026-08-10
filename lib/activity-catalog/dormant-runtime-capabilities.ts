export const DURATION_EXPOSURE_MODEL = Object.freeze({
  modelKey: "duration_exposure",
  modelVersion: "v1",
  mainRuntimeConstant: "duration_exposure_v1",
  engineVersion: "muscle_exposure_duration_v1"
} as const);

export const DORMANT_LONGEST_DURATION_FORMULA = Object.freeze({
  formulaKey: "longest_duration",
  formulaVersion: "v1",
  sourceMetricKey: "duration_seconds",
  comparisonDirection: "higher_better"
} as const);

export const DORMANT_LONGEST_DISTANCE_FORMULA = Object.freeze({
  formulaKey: "longest_distance",
  formulaVersion: "v1",
  sourceMetricKey: "distance_meters",
  comparisonDirection: "higher_better"
} as const);

export type DurationExposureMapping = Readonly<{
  muscleId: string;
  role: "primary" | "secondary" | "stabilizer";
  sideScope: "bilateral" | "left" | "right";
  mappingContribution: number;
}>;

export type MuscleExposure = Readonly<{
  muscleId: string;
  role: DurationExposureMapping["role"];
  sideScope: DurationExposureMapping["sideScope"];
  mappingContribution: number;
  exposureSeconds: number;
}>;

function requireCanonicalDuration(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new Error("duration_seconds must be finite and non-negative");
  }
  return durationSeconds;
}

function requireMappingContribution(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("mapping contribution must be finite and between 0 and 1");
  }
  return value;
}

/**
 * Dormant Catalog-provider engine. This is anatomical time exposure only:
 * duration_seconds × mapping_contribution. It is deliberately not imported by
 * the current legacy Heat Map/runtime path.
 */
export function calculateMuscleExposureDuration(
  durationSeconds: number,
  mappings: readonly DurationExposureMapping[]
): MuscleExposure[] {
  const duration = requireCanonicalDuration(durationSeconds);
  return mappings.map((mapping) => {
    const contribution = requireMappingContribution(mapping.mappingContribution);
    return Object.freeze({
      muscleId: mapping.muscleId,
      role: mapping.role,
      sideScope: mapping.sideScope,
      mappingContribution: contribution,
      exposureSeconds: duration * contribution
    });
  });
}

function eligiblePositiveMetric(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function evaluateLongestDuration(durationSeconds: number): number | null {
  return eligiblePositiveMetric(durationSeconds);
}

export function evaluateLongestDistance(distanceMeters: number): number | null {
  return eligiblePositiveMetric(distanceMeters);
}

export type DormantRecordCandidate = Readonly<{
  immutableActivityIdentity: string;
  comparisonContextKey: string;
  value: number;
}>;

/**
 * Higher-is-better comparison constrained to one immutable activity identity
 * and one already-canonicalized compatible comparison context.
 */
export function compareDormantHigherBetterRecord(
  current: DormantRecordCandidate | null,
  candidate: DormantRecordCandidate
): DormantRecordCandidate {
  if (!Number.isFinite(candidate.value) || candidate.value <= 0) {
    throw new Error("record candidate value must be finite and positive");
  }
  if (!current) return candidate;
  if (
    current.immutableActivityIdentity !== candidate.immutableActivityIdentity ||
    current.comparisonContextKey !== candidate.comparisonContextKey
  ) {
    throw new Error("record candidates must share immutable activity identity and comparison context");
  }
  return candidate.value > current.value ? candidate : current;
}
