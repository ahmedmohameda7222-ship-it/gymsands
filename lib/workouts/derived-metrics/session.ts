import type {
  DerivedExerciseMetrics,
  DerivedMetricLog,
  DerivedMetricValue,
  DerivedPersonalRecord,
  DerivedPersonalRecordType,
  DerivedSessionMetrics,
} from "./contracts";
import {
  DERIVED_METRICS_FORMULA_VERSION,
  DERIVED_METRICS_SCHEMA_VERSION,
} from "./contracts";
import {
  derivedExerciseIdentity,
  derivedExerciseName,
  derivedLogIdentity,
} from "./identity";

type CanonicalSet = {
  workoutSessionIdentity: string;
  exerciseIdentity: string;
  exerciseName: string;
  setType: string;
  repetitions: number | null;
  externalLoadKg: number | null;
  durationSeconds: number;
  distanceMeters: number;
  rounds: number;
  volume: number;
  rpe: number | null;
  rir: number | null;
  eligibleEstimatedOneRepMaxKg: number | null;
};

const workingPerformanceSetTypes = new Set(["working", "normal", "failure"]);
const comparableRepetitionSetTypes = new Set([
  "working",
  "normal",
  "failure",
  "amrap",
]);

function finiteNonNegative(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function finiteInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  const parsed = finiteNonNegative(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function average(values: readonly number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function metricKey(metric: DerivedMetricValue): string {
  return String(metric.metricKey ?? metric.metric_key ?? "");
}

function directMetricValues(log: DerivedMetricLog): DerivedMetricValue[] {
  return [...(log.performanceMetrics ?? log.performance_metrics ?? [])];
}

function segmentMetricValues(log: DerivedMetricLog): DerivedMetricValue[][] {
  return (log.segments ?? [])
    .map((segment) => [
      ...("metricValues" in segment
        ? (segment.metricValues ?? [])
        : "metric_values" in segment
          ? (segment.metric_values ?? [])
          : []),
    ])
    .filter((segment) => segment.length > 0);
}

function reduceMetricValues(
  metrics: readonly DerivedMetricValue[],
  key: string,
  reducer: "sum" | "max",
): number | null {
  const values = metrics
    .filter((metric) => metricKey(metric) === key)
    .map((metric) => finiteNonNegative(metric.value))
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return reducer === "sum"
    ? values.reduce((sum, value) => sum + value, 0)
    : Math.max(...values);
}

function compatibilityMetric(log: DerivedMetricLog, key: string): number | null {
  if (key === "repetitions") return finiteNonNegative(log.reps);
  if (key === "external_load_kg")
    return finiteNonNegative(log.weightKg ?? log.weight_kg);
  return null;
}

function canonicalMetric(
  log: DerivedMetricLog,
  direct: readonly DerivedMetricValue[],
  segments: readonly DerivedMetricValue[][],
  key: string,
  reducer: "sum" | "max",
): number | null {
  const directValue = reduceMetricValues(direct, key, reducer);
  if (directValue !== null) return directValue;

  const segmentValues = segments
    .map((segment) => reduceMetricValues(segment, key, reducer))
    .filter((value): value is number => value !== null);
  if (segmentValues.length)
    return reducer === "sum"
      ? segmentValues.reduce((sum, value) => sum + value, 0)
      : Math.max(...segmentValues);

  return compatibilityMetric(log, key);
}

function pairedStructuredVolume(
  direct: readonly DerivedMetricValue[],
  segments: readonly DerivedMetricValue[][],
): number | null {
  const directRepetitions = reduceMetricValues(direct, "repetitions", "sum");
  const directLoad = reduceMetricValues(direct, "external_load_kg", "max");
  if (directRepetitions !== null && directLoad !== null)
    return directRepetitions * directLoad;

  let foundPair = false;
  const segmentVolume = segments.reduce((sum, segment) => {
    const repetitions = reduceMetricValues(segment, "repetitions", "sum");
    const load = reduceMetricValues(segment, "external_load_kg", "max");
    if (repetitions === null || load === null) return sum;
    foundPair = true;
    return sum + repetitions * load;
  }, 0);
  return foundPair ? segmentVolume : null;
}

export function estimateEligibleOneRepMax(
  externalLoadKg: number,
  repetitions: number,
  setType: string,
): number | null {
  if (
    externalLoadKg <= 0 ||
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > 12 ||
    setType === "warmup" ||
    setType === "timed"
  )
    return null;
  return externalLoadKg * (1 + repetitions / 30);
}

function canonicalSet(log: DerivedMetricLog): CanonicalSet | null {
  if (log.draft) return null;
  const completedAt = log.completedAt ?? log.completed_at;
  if (!completedAt) return null;
  const name = derivedExerciseName(log);
  const identity = derivedExerciseIdentity(log);
  if (!name || identity === "name:") return null;

  const direct = directMetricValues(log);
  const segments = segmentMetricValues(log);
  const details = log.setDetails ?? log.set_details;
  const setType = String(
    log.setType ??
      log.set_type ??
      details?.setType ??
      details?.set_type ??
      "normal",
  );
  const repetitions = canonicalMetric(
    log,
    direct,
    segments,
    "repetitions",
    "sum",
  );
  const externalLoadKg = canonicalMetric(
    log,
    direct,
    segments,
    "external_load_kg",
    "max",
  );
  const durationSeconds =
    canonicalMetric(log, direct, segments, "duration_seconds", "sum") ?? 0;
  const distanceMeters =
    canonicalMetric(log, direct, segments, "distance_meters", "sum") ?? 0;
  const rounds =
    canonicalMetric(log, direct, segments, "rounds", "sum") ?? 0;
  const structuredVolume = pairedStructuredVolume(direct, segments);
  const volume = structuredVolume ??
    ((repetitions ?? 0) * (externalLoadKg ?? 0));
  const rpe = finiteInRange(log.rpe ?? details?.rpe, 0, 10);
  const rir = finiteInRange(log.rir ?? details?.rir, 0, 20);

  return {
    workoutSessionIdentity:
      String(log.workoutSessionId ?? log.workout_session_id ?? "unknown"),
    exerciseIdentity: identity,
    exerciseName: name,
    setType,
    repetitions,
    externalLoadKg,
    durationSeconds,
    distanceMeters,
    rounds,
    volume,
    rpe,
    rir,
    eligibleEstimatedOneRepMaxKg:
      repetitions !== null && externalLoadKg !== null
        ? estimateEligibleOneRepMax(externalLoadKg, repetitions, setType)
        : null,
  };
}

function canonicalSets(logs: readonly DerivedMetricLog[]): CanonicalSet[] {
  const seen = new Set<string>();
  return logs.flatMap((log, index) => {
    const identity = derivedLogIdentity(log, index);
    if (seen.has(identity)) return [];
    seen.add(identity);
    const set = canonicalSet(log);
    return set ? [set] : [];
  });
}

function distribution(sets: readonly CanonicalSet[]): Record<string, number> {
  return sets.reduce<Record<string, number>>((result, set) => {
    result[set.setType] = (result[set.setType] ?? 0) + 1;
    return result;
  }, {});
}

function comparableRepetitionKey(set: CanonicalSet): string {
  return `${set.exerciseIdentity}:${set.setType}:${set.externalLoadKg ?? "bodyweight"}`;
}

function bestByIdentity(
  sets: readonly CanonicalSet[],
  selector: (set: CanonicalSet) => number | null,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const set of sets) {
    const value = selector(set);
    if (value === null) continue;
    result.set(
      set.exerciseIdentity,
      Math.max(result.get(set.exerciseIdentity) ?? -Infinity, value),
    );
  }
  return result;
}

function bestHistoricalSessionVolume(
  sets: readonly CanonicalSet[],
): Map<string, number> {
  const bySessionExercise = new Map<string, number>();
  for (const set of sets) {
    const key = `${set.workoutSessionIdentity}:${set.exerciseIdentity}`;
    bySessionExercise.set(key, (bySessionExercise.get(key) ?? 0) + set.volume);
  }
  const result = new Map<string, number>();
  for (const [key, volume] of bySessionExercise) {
    const exerciseIdentity = key.slice(key.indexOf(":") + 1);
    result.set(
      exerciseIdentity,
      Math.max(result.get(exerciseIdentity) ?? 0, volume),
    );
  }
  return result;
}

function record(
  set: CanonicalSet,
  type: DerivedPersonalRecordType,
  value: number,
  context: string,
): DerivedPersonalRecord {
  return {
    exerciseIdentity: set.exerciseIdentity,
    exerciseName: set.exerciseName,
    type,
    value,
    externalLoadKg: set.externalLoadKg,
    repetitions: set.repetitions,
    setType: set.setType,
    comparableContext: context,
  };
}

export function buildPersonalRecordCandidates(
  currentLogs: readonly DerivedMetricLog[],
  historicalLogs: readonly DerivedMetricLog[] = [],
): DerivedPersonalRecord[] {
  const current = canonicalSets(currentLogs);
  const historical = canonicalSets(historicalLogs);
  const previousLoad = bestByIdentity(historical, (set) => set.externalLoadKg);
  const previousOneRepMax = bestByIdentity(
    historical,
    (set) => set.eligibleEstimatedOneRepMaxKg,
  );
  const previousReps = new Map<string, number>();
  for (const set of historical) {
    if (
      set.repetitions === null ||
      !comparableRepetitionSetTypes.has(set.setType)
    ) continue;
    const key = comparableRepetitionKey(set);
    previousReps.set(
      key,
      Math.max(previousReps.get(key) ?? -Infinity, set.repetitions),
    );
  }
  const previousSessionVolume = bestHistoricalSessionVolume(historical);

  const candidates: DerivedPersonalRecord[] = [];
  const exercises = new Map<string, CanonicalSet[]>();
  for (const set of current)
    exercises.set(set.exerciseIdentity, [
      ...(exercises.get(set.exerciseIdentity) ?? []),
      set,
    ]);

  for (const sets of exercises.values()) {
    const first = sets[0];
    const maxLoad = [...sets]
      .filter((set) => (set.externalLoadKg ?? 0) > 0)
      .sort(
        (left, right) =>
          (right.externalLoadKg ?? 0) - (left.externalLoadKg ?? 0),
      )[0];
    if (
      maxLoad &&
      maxLoad.externalLoadKg !== null &&
      maxLoad.externalLoadKg > (previousLoad.get(first.exerciseIdentity) ?? 0)
    )
      candidates.push(
        record(maxLoad, "highest_load", maxLoad.externalLoadKg, maxLoad.setType),
      );

    const maxOneRep = [...sets]
      .filter((set) => set.eligibleEstimatedOneRepMaxKg !== null)
      .sort(
        (left, right) =>
          (right.eligibleEstimatedOneRepMaxKg ?? 0) -
          (left.eligibleEstimatedOneRepMaxKg ?? 0),
      )[0];
    if (
      maxOneRep &&
      maxOneRep.eligibleEstimatedOneRepMaxKg !== null &&
      maxOneRep.eligibleEstimatedOneRepMaxKg >
        (previousOneRepMax.get(first.exerciseIdentity) ?? 0)
    )
      candidates.push(
        record(
          maxOneRep,
          "estimated_one_rep_max",
          maxOneRep.eligibleEstimatedOneRepMaxKg,
          maxOneRep.setType,
        ),
      );

    for (const set of sets) {
      if (
        set.repetitions === null ||
        !comparableRepetitionSetTypes.has(set.setType)
      ) continue;
      const context = comparableRepetitionKey(set);
      if (set.repetitions > (previousReps.get(context) ?? 0))
        candidates.push(record(set, "max_repetitions", set.repetitions, context));
    }

    const volume = sets.reduce((sum, set) => sum + set.volume, 0);
    if (
      volume > 0 &&
      volume > (previousSessionVolume.get(first.exerciseIdentity) ?? 0)
    )
      candidates.push(
        record(first, "session_volume", volume, first.exerciseIdentity),
      );
  }

  const unique = new Map<string, DerivedPersonalRecord>();
  for (const candidate of candidates) {
    const key = `${candidate.exerciseIdentity}:${candidate.type}:${candidate.comparableContext}`;
    const existing = unique.get(key);
    if (!existing || candidate.value > existing.value) unique.set(key, candidate);
  }
  return [...unique.values()];
}

function exerciseMetrics(
  identity: string,
  sets: readonly CanonicalSet[],
): DerivedExerciseMetrics {
  const rpes = sets.flatMap((set) => (set.rpe === null ? [] : [set.rpe]));
  const rirs = sets.flatMap((set) => (set.rir === null ? [] : [set.rir]));
  const durationSeconds = sets.reduce((sum, set) => sum + set.durationSeconds, 0);
  const distanceMeters = sets.reduce((sum, set) => sum + set.distanceMeters, 0);
  const eligible = sets.flatMap((set) =>
    set.eligibleEstimatedOneRepMaxKg === null
      ? []
      : [set.eligibleEstimatedOneRepMaxKg],
  );
  const eligibleWorkingSets = sets.flatMap((set) =>
    workingPerformanceSetTypes.has(set.setType) &&
    set.eligibleEstimatedOneRepMaxKg !== null
      ? [set.eligibleEstimatedOneRepMaxKg]
      : [],
  );
  const performanceChangePercent =
    eligibleWorkingSets.length > 1 && eligibleWorkingSets[0] !== 0
      ? ((eligibleWorkingSets.at(-1)! - eligibleWorkingSets[0]) /
          eligibleWorkingSets[0]) * 100
      : null;
  const loads = sets.flatMap((set) =>
    set.externalLoadKg === null ? [] : [set.externalLoadKg],
  );
  const repetitions = sets.flatMap((set) =>
    set.repetitions === null ? [] : [set.repetitions],
  );
  return {
    exerciseIdentity: identity,
    exerciseName: sets[0]?.exerciseName ?? identity,
    completedSetCount: sets.length,
    externalLoadVolume: sets.reduce((sum, set) => sum + set.volume, 0),
    averageRpe: average(rpes),
    rpeCount: rpes.length,
    averageRir: average(rirs),
    rirCount: rirs.length,
    setTypeDistribution: distribution(sets),
    durationSeconds,
    distanceMeters,
    rounds: sets.reduce((sum, set) => sum + set.rounds, 0),
    paceSecondsPerMeter:
      durationSeconds > 0 && distanceMeters > 0
        ? durationSeconds / distanceMeters
        : null,
    heaviestExternalLoadKg: loads.length ? Math.max(...loads) : null,
    maxRepetitions: repetitions.length ? Math.max(...repetitions) : null,
    bestEstimatedOneRepMaxKg: eligible.length ? Math.max(...eligible) : null,
    performanceChangePercent,
  };
}

export function deriveSessionMetrics(
  currentLogs: readonly DerivedMetricLog[],
  historicalLogs: readonly DerivedMetricLog[] = [],
): DerivedSessionMetrics {
  const sets = canonicalSets(currentLogs);
  const byExercise = new Map<string, CanonicalSet[]>();
  for (const set of sets)
    byExercise.set(set.exerciseIdentity, [
      ...(byExercise.get(set.exerciseIdentity) ?? []),
      set,
    ]);
  const exercises = [...byExercise.entries()].map(([identity, values]) =>
    exerciseMetrics(identity, values),
  );
  const rpes = sets.flatMap((set) => (set.rpe === null ? [] : [set.rpe]));
  const rirs = sets.flatMap((set) => (set.rir === null ? [] : [set.rir]));
  const durationSeconds = sets.reduce((sum, set) => sum + set.durationSeconds, 0);
  const distanceMeters = sets.reduce((sum, set) => sum + set.distanceMeters, 0);
  const personalRecords = buildPersonalRecordCandidates(
    currentLogs,
    historicalLogs,
  );
  const highlights = personalRecords
    .slice(0, 3)
    .map((item) => `${item.exerciseName}:${item.type}`);
  return {
    schemaVersion: DERIVED_METRICS_SCHEMA_VERSION,
    formulaVersion: DERIVED_METRICS_FORMULA_VERSION,
    completedSetCount: sets.length,
    completedExerciseCount: exercises.length,
    externalLoadVolume: sets.reduce((sum, set) => sum + set.volume, 0),
    averageRpe: average(rpes),
    rpeCount: rpes.length,
    averageRir: average(rirs),
    rirCount: rirs.length,
    setTypeDistribution: distribution(sets),
    durationSeconds,
    distanceMeters,
    rounds: sets.reduce((sum, set) => sum + set.rounds, 0),
    paceSecondsPerMeter:
      durationSeconds > 0 && distanceMeters > 0
        ? durationSeconds / distanceMeters
        : null,
    eligiblePersonalRecordCount: personalRecords.length,
    personalRecords,
    highlights,
    exercises,
  };
}
