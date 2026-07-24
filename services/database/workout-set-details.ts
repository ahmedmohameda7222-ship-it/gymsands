import type {
  WorkoutPerformanceMetricSource,
  WorkoutSetDetailsInput,
  WorkoutSetDetailsRow,
  WorkoutSetDetailsSqlInput,
  WorkoutSetSegmentMetricValueRow,
  WorkoutSetSegmentInput,
  WorkoutSetSegmentRow,
  WorkoutSetSegmentSqlInput,
  WorkoutSetRuntimeSource,
  WorkoutSetSideMode,
  WorkoutSetTempoAdherence,
  WorkoutSetType,
} from "@/types";
import {
  isWorkoutPerformanceMetricSource,
  workoutPerformanceMetricInputToSql,
} from "./workout-performance";

const setTypes = new Set<WorkoutSetType>([
  "warmup",
  "working",
  "normal",
  "failure",
  "drop",
  "backoff",
  "amrap",
  "timed",
  "other",
]);
const sideModes = new Set<WorkoutSetSideMode>([
  "none",
  "bilateral",
  "left",
  "right",
  "alternating",
]);
const tempoAdherenceValues = new Set<WorkoutSetTempoAdherence>([
  "not_recorded",
  "adhered",
  "adjusted",
  "missed",
]);
const segmentKinds = new Set(["primary", "drop", "rest_pause", "other"]);
const providerPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u;
export const WORKOUT_SET_NOTE_MAX_CODE_POINTS = 4000;

type SourceDefaults = {
  source?: WorkoutSetRuntimeSource;
  sourceProvider?: string | null;
  sourceVersion?: string | null;
};

export type WorkoutSetDetailsRelation =
  | WorkoutSetDetailsRow
  | WorkoutSetDetailsRow[]
  | null
  | undefined;

export type WorkoutSetSegmentRelationRow = Omit<
  WorkoutSetSegmentRow,
  "metric_values"
> & {
  metric_values?:
    | WorkoutSetSegmentMetricValueRow
    | WorkoutSetSegmentMetricValueRow[]
    | null;
};

export type WorkoutSetSegmentsRelation =
  | WorkoutSetSegmentRelationRow
  | WorkoutSetSegmentRelationRow[]
  | null
  | undefined;

export type WorkoutSetRelationContext = {
  exerciseLogId: string;
  workoutSessionId: string;
  userId?: string | null;
};

export class WorkoutSetRelationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkoutSetRelationIntegrityError";
  }
}

function relationArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function requireRelationString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new WorkoutSetRelationIntegrityError(`${label} is malformed.`);
  }
}

function assertRelationOwnership(
  row: Pick<WorkoutSetDetailsRow, "exercise_log_id" | "workout_session_id" | "user_id">,
  context?: WorkoutSetRelationContext,
) {
  requireRelationString(row.exercise_log_id, "Workout set exercise-log ownership");
  requireRelationString(row.workout_session_id, "Workout set session ownership");
  requireRelationString(row.user_id, "Workout set user ownership");
  if (!context) return;
  if (
    row.exercise_log_id !== context.exerciseLogId
    || row.workout_session_id !== context.workoutSessionId
    || (context.userId && row.user_id !== context.userId)
  ) {
    throw new WorkoutSetRelationIntegrityError(
      "Workout set relation does not belong to its parent log.",
    );
  }
}

export function normalizeWorkoutSetDetailsRelation(
  value: WorkoutSetDetailsRelation,
  context?: WorkoutSetRelationContext,
): WorkoutSetDetailsRow | null {
  const rows = relationArray(value);
  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    throw new WorkoutSetRelationIntegrityError(
      "Workout set detail relation must contain exactly one row.",
    );
  }
  const row = rows[0];
  if (!row || typeof row !== "object") {
    throw new WorkoutSetRelationIntegrityError(
      "Workout set detail relation is malformed.",
    );
  }
  assertRelationOwnership(row, context);
  return row;
}

function segmentMetricIdentity(
  metric: Pick<WorkoutSetSegmentMetricValueRow, "metric_key" | "metric_version" | "side">,
) {
  return `${metric.metric_key}:${metric.metric_version}:${metric.side}`;
}

function compareSegmentMetrics(
  left: WorkoutSetSegmentMetricValueRow,
  right: WorkoutSetSegmentMetricValueRow,
) {
  return (
    left.metric_key.localeCompare(right.metric_key)
    || left.metric_version - right.metric_version
    || left.side.localeCompare(right.side)
    || left.id.localeCompare(right.id)
  );
}

export function normalizeWorkoutSetSegmentsRelation(
  value: WorkoutSetSegmentsRelation,
  context?: WorkoutSetRelationContext,
): WorkoutSetSegmentRow[] {
  const segmentOrders = new Set<number>();
  const normalized = relationArray(value).map((segment) => {
    if (!segment || typeof segment !== "object") {
      throw new WorkoutSetRelationIntegrityError(
        "Workout set segment relation is malformed.",
      );
    }
    requireRelationString(segment.id, "Workout set segment id");
    assertRelationOwnership(segment, context);
    if (
      !Number.isInteger(segment.segment_order)
      || segment.segment_order < 1
      || segment.segment_order > 32
    ) {
      throw new WorkoutSetRelationIntegrityError(
        "Workout set segment order is malformed.",
      );
    }
    if (segmentOrders.has(segment.segment_order)) {
      throw new WorkoutSetRelationIntegrityError(
        "Workout set segment order is duplicated.",
      );
    }
    segmentOrders.add(segment.segment_order);

    const metricIdentities = new Set<string>();
    const metricValues = relationArray(segment.metric_values).map((metric) => {
      if (!metric || typeof metric !== "object") {
        throw new WorkoutSetRelationIntegrityError(
          "Workout set segment metric relation is malformed.",
        );
      }
      requireRelationString(metric.id, "Workout set segment metric id");
      requireRelationString(metric.segment_id, "Workout set segment metric segment");
      assertRelationOwnership(metric, context);
      requireRelationString(metric.metric_key, "Workout set segment metric key");
      requireRelationString(metric.side, "Workout set segment metric side");
      if (!Number.isInteger(metric.metric_version) || metric.metric_version < 1) {
        throw new WorkoutSetRelationIntegrityError(
          "Workout set segment metric version is malformed.",
        );
      }
      if (
        metric.segment_id !== segment.id
        || metric.exercise_log_id !== segment.exercise_log_id
        || metric.workout_session_id !== segment.workout_session_id
        || metric.user_id !== segment.user_id
      ) {
        throw new WorkoutSetRelationIntegrityError(
          "Workout set segment metric does not belong to its parent segment.",
        );
      }
      const identity = segmentMetricIdentity(metric);
      if (metricIdentities.has(identity)) {
        throw new WorkoutSetRelationIntegrityError(
          "Workout set segment metric identity is duplicated.",
        );
      }
      metricIdentities.add(identity);
      return metric;
    }).sort(compareSegmentMetrics);

    return {
      ...segment,
      metric_values: metricValues,
    };
  });

  return normalized.sort(
    (left, right) =>
      left.segment_order - right.segment_order || left.id.localeCompare(right.id),
  );
}

function normalizeOptionalMachineValue(
  value: string | null | undefined,
  pattern: RegExp,
  label: string,
) {
  if (value === undefined || value === null || value === "") return null;
  if (!pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizeSource(input: SourceDefaults, defaults?: SourceDefaults) {
  const source = input.source ?? defaults?.source ?? "manual";
  if (!isWorkoutPerformanceMetricSource(source))
    throw new Error("Workout set source is invalid.");
  if ((source as WorkoutPerformanceMetricSource) === "backfill")
    throw new Error("Backfill provenance is reserved for database migrations.");
  const sourceProvider = normalizeOptionalMachineValue(
    input.sourceProvider === undefined
      ? defaults?.sourceProvider
      : input.sourceProvider,
    providerPattern,
    "Workout set source provider",
  );
  const sourceVersion = normalizeOptionalMachineValue(
    input.sourceVersion === undefined
      ? defaults?.sourceVersion
      : input.sourceVersion,
    versionPattern,
    "Workout set source version",
  );
  if ((source === "device" || source === "import") && !sourceProvider) {
    throw new Error(
      "Device and import workout set details require a source provider.",
    );
  }
  return { source, sourceProvider, sourceVersion };
}

export function editableWorkoutSetProvenance(
  _source: WorkoutPerformanceMetricSource,
  _sourceProvider: string | null,
  _sourceVersion: string | null,
): {
  source: WorkoutSetRuntimeSource;
  sourceProvider: string | null;
  sourceVersion: string | null;
} {
  return {
    source: "manual",
    sourceProvider: "plaivra",
    sourceVersion: "aw3b-v1",
  };
}

export type WorkoutSetEffortField = "rpe" | "rir";
export type WorkoutSetEffortValidation = {
  value: number | null;
  error: "format" | "range" | null;
};

export function validateWorkoutSetEffortInput(
  rawValue: string,
  field: WorkoutSetEffortField,
): WorkoutSetEffortValidation {
  const value = rawValue.trim();
  if (value === "") return { value: null, error: null };
  if (!/^(?:0|[1-9]\d*)(?:\.\d)?$/.test(value)) {
    return { value: null, error: "format" };
  }
  const numericValue = Number(value);
  const maximum = field === "rpe" ? 10 : 20;
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > maximum) {
    return { value: null, error: "range" };
  }
  return { value: numericValue, error: null };
}

export function parseWorkoutSetEffortInput(
  rawValue: string,
  field: WorkoutSetEffortField,
) {
  const result = validateWorkoutSetEffortInput(rawValue, field);
  if (result.error) {
    const maximum = field === "rpe" ? 10 : 20;
    throw new Error(
      `${field.toUpperCase()} must be empty or between 0 and ${maximum} with at most one decimal place.`,
    );
  }
  return result.value;
}

function normalizeOneDecimal(
  value: number | null | undefined,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (value === undefined || value === null) return null;
  const rounded = Math.round(value * 10) / 10;
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    Math.abs(value - rounded) > 1e-9
  ) {
    throw new Error(
      `${label} must be between ${minimum} and ${maximum} with at most one decimal place.`,
    );
  }
  return rounded;
}

export function workoutSetNoteCodePointLength(value: string) {
  return Array.from(value).length;
}

export function isWorkoutSetNoteWithinLimit(value: string) {
  return workoutSetNoteCodePointLength(value) <= WORKOUT_SET_NOTE_MAX_CODE_POINTS;
}

export function canUpdateWorkoutSetNote(current: string, next: string) {
  return isWorkoutSetNoteWithinLimit(next)
    || workoutSetNoteCodePointLength(next) < workoutSetNoteCodePointLength(current);
}

function normalizeFreeNote(value: string | null | undefined) {
  if (value === undefined || value === null || value === "") return null;
  if (!isWorkoutSetNoteWithinLimit(value))
    throw new Error("Workout set notes cannot exceed 4000 characters.");
  return value;
}

function normalizeTempo(value: string | null | undefined, label: string) {
  if (value === undefined || value === null || value === "") return null;
  if (Array.from(value).length > 64 || controlCharacters.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function normalizeTimestamp(value: string | null | undefined, label: string) {
  if (value === undefined || value === null || value === "") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60 * 1000) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

export function workoutSetDetailsInputToSql(
  input: WorkoutSetDetailsInput,
  defaults?: SourceDefaults,
): WorkoutSetDetailsSqlInput {
  if ((input.schemaVersion ?? 1) !== 1)
    throw new Error("Workout set detail schema version is unsupported.");
  if (!setTypes.has(input.setType))
    throw new Error("Workout set type is invalid.");
  const sideMode = input.sideMode ?? "none";
  if (!sideModes.has(sideMode))
    throw new Error("Workout set side mode is invalid.");
  const tempoAdherence = input.tempoAdherence ?? "not_recorded";
  if (!tempoAdherenceValues.has(tempoAdherence))
    throw new Error("Workout set tempo adherence is invalid.");
  const source = normalizeSource(input, defaults);
  return {
    schema_version: 1,
    set_type: input.setType,
    rpe: normalizeOneDecimal(input.rpe, 0, 10, "RPE"),
    rir: normalizeOneDecimal(input.rir, 0, 20, "RIR"),
    notes: normalizeFreeNote(input.notes),
    side_mode: sideMode,
    planned_tempo: normalizeTempo(input.plannedTempo, "Planned tempo"),
    performed_tempo: normalizeTempo(input.performedTempo, "Performed tempo"),
    tempo_adherence: tempoAdherence,
    source: source.source,
    source_provider: source.sourceProvider,
    source_version: source.sourceVersion,
  };
}

export function workoutSetSegmentsInputToSql(
  segments: WorkoutSetSegmentInput[],
  defaults?: SourceDefaults,
): WorkoutSetSegmentSqlInput[] {
  if (segments.length > 32)
    throw new Error("A workout set can contain at most 32 segments.");
  const orders = new Set<number>();
  return segments.map((segment) => {
    if (
      !Number.isInteger(segment.segmentOrder) ||
      segment.segmentOrder < 1 ||
      segment.segmentOrder > 32
    ) {
      throw new Error("Workout set segment order is invalid.");
    }
    if (orders.has(segment.segmentOrder))
      throw new Error("Workout set segment order must be unique.");
    orders.add(segment.segmentOrder);
    if (!segmentKinds.has(segment.segmentKind))
      throw new Error("Workout set segment kind is invalid.");
    const side = segment.side ?? "none";
    if (!sideModes.has(side))
      throw new Error("Workout set segment side is invalid.");
    const source = normalizeSource(segment, defaults);
    const performanceMetrics = segment.performanceMetrics ?? [];
    if (performanceMetrics.length > 16) {
      throw new Error(
        "A workout set segment can contain at most 16 performance metrics.",
      );
    }
    const metricIdentities = new Set<string>();
    const sqlMetrics = performanceMetrics.map((metric) => {
      if ((metric.source as WorkoutPerformanceMetricSource | undefined) === "backfill") {
        throw new Error("Backfill provenance is reserved for database migrations.");
      }
      const sql = workoutPerformanceMetricInputToSql(metric, {
        source: source.source,
        sourceProvider: source.sourceProvider,
        sourceVersion: source.sourceVersion,
      });
      const identity = `${sql.metric_key}:${sql.metric_version}:${sql.side}`;
      if (metricIdentities.has(identity))
        throw new Error("Workout set segment metrics must be unique.");
      metricIdentities.add(identity);
      return sql as WorkoutSetSegmentSqlInput["performance_metrics"][number];
    }).sort((left, right) =>
      left.metric_key.localeCompare(right.metric_key)
      || left.metric_version - right.metric_version
      || left.side.localeCompare(right.side)
    );
    return {
      segment_order: segment.segmentOrder,
      segment_kind: segment.segmentKind,
      side,
      completed_at: normalizeTimestamp(
        segment.completedAt,
        "Workout set segment completion time",
      ),
      source: source.source,
      source_provider: source.sourceProvider,
      source_version: source.sourceVersion,
      performance_metrics: sqlMetrics,
    };
  }).sort((left, right) => left.segment_order - right.segment_order);
}
