import type {
  ExerciseLog,
  WorkoutSession,
  WorkoutSessionExecutionState,
  WorkoutSessionPrescriptionItem,
} from "@/types";
import type {
  ActiveSessionPresentationSurface,
} from "@/lib/workouts/active-session-store/store";
import type {
  CanonicalWorkoutSetWrite,
  CompleteActiveSessionInput,
} from "@/lib/workouts/active-session-store/persistence-adapter";
import type { SessionCommandRequest } from "@/lib/workouts/session-engine/contracts";
import { serializeWorkoutSetLogs } from "@/services/database/workout-set-log-serialization";

export const ACTIVE_WORKOUT_INDEXED_DB_NAME = "plaivra-active-workout-v1";
export const ACTIVE_WORKOUT_SYNC_SCHEMA_VERSION = 1 as const;
export const ACTIVE_WORKOUT_OFFLINE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type ActiveWorkoutSyncState =
  | "online_synced"
  | "offline_saved"
  | "syncing"
  | "retry_needed"
  | "device_conflict"
  | "data_conflict"
  | "terminal_pending";

export type ActiveWorkoutSessionCache = {
  key: string;
  schemaVersion: 1;
  userId: string;
  workoutSessionId: string;
  root: WorkoutSession;
  executionState: WorkoutSessionExecutionState | null;
  prescription: WorkoutSessionPrescriptionItem[];
  performedLogs: ExerciseLog[];
  presentationSurface: ActiveSessionPresentationSurface;
  lastValidSecondaryProjection: unknown;
  serverRevision: number | null;
  controllerDeviceId: string | null;
  syncState: ActiveWorkoutSyncState;
  updatedAt: string;
  expiresAt: string;
};

export type ActiveWorkoutOperationState =
  | "pending"
  | "sending"
  | "transport_uncertain"
  | "conflict"
  | "applied"
  | "discarded";

export type ActiveWorkoutOperationPayload =
  | { kind: "command"; request: SessionCommandRequest }
  | {
      kind: "set_write";
      workoutSessionId: string;
      controllerDeviceId: string;
      logs: CanonicalWorkoutSetWrite[];
    }
  | {
      kind: "complete_session";
      input: CompleteActiveSessionInput;
    };

export type ActiveWorkoutOperation = {
  schemaVersion: 1;
  id: string;
  userId: string;
  workoutSessionId: string;
  deviceId: string;
  tabId: string;
  sequence: number;
  targetIdentity: string | null;
  baseTargetFingerprint: string | null;
  stableCommandId: string | null;
  payload: ActiveWorkoutOperationPayload;
  state: ActiveWorkoutOperationState;
  attemptCount: number;
  nextRetryAt: string | null;
  baseRevision: number | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActiveWorkoutSetConflict = {
  operationId: string;
  targetIdentity: string;
  local: CanonicalWorkoutSetWrite;
  server: ExerciseLog | null;
};

export function canonicalSetTargetIdentity(log: CanonicalWorkoutSetWrite) {
  const exerciseIdentity =
    log.planExerciseId
    ?? `${log.exerciseOrder ?? "none"}:${log.exerciseName.trim().toLocaleLowerCase("en")}`;
  return `${exerciseIdentity}:set:${log.setNumber}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pick(value: unknown, ...keys: string[]) {
  const row = record(value);
  if (!row) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function nullableString(value: unknown) {
  return value === undefined || value === null || value === ""
    ? null
    : String(value);
}

function nullableNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function semanticMetric(value: unknown) {
  return {
    metric_key: nullableString(pick(value, "metric_key", "metricKey")),
    metric_version: nullableNumber(pick(value, "metric_version", "metricVersion") ?? 1),
    value: nullableNumber(pick(value, "value")),
    side: nullableString(pick(value, "side") ?? "none"),
    source: nullableString(pick(value, "source") ?? "manual"),
    source_provider: nullableString(pick(value, "source_provider", "sourceProvider")),
    source_version: nullableString(pick(value, "source_version", "sourceVersion")),
  };
}

function semanticMetrics(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map(semanticMetric)
    .sort((left, right) =>
      String(left.metric_key).localeCompare(String(right.metric_key))
      || Number(left.metric_version) - Number(right.metric_version)
      || String(left.side).localeCompare(String(right.side)),
    );
}

function semanticSetDetails(value: unknown) {
  if (!record(value)) return null;
  return {
    schema_version: nullableNumber(pick(value, "schema_version", "schemaVersion") ?? 1),
    set_type: nullableString(pick(value, "set_type", "setType")),
    rpe: nullableNumber(pick(value, "rpe")),
    rir: nullableNumber(pick(value, "rir")),
    notes: nullableString(pick(value, "notes")),
    side_mode: nullableString(pick(value, "side_mode", "sideMode") ?? "none"),
    planned_tempo: nullableString(pick(value, "planned_tempo", "plannedTempo")),
    performed_tempo: nullableString(pick(value, "performed_tempo", "performedTempo")),
    tempo_adherence: nullableString(
      pick(value, "tempo_adherence", "tempoAdherence") ?? "not_recorded",
    ),
    source: nullableString(pick(value, "source") ?? "manual"),
    source_provider: nullableString(pick(value, "source_provider", "sourceProvider")),
    source_version: nullableString(pick(value, "source_version", "sourceVersion")),
  };
}

function semanticSegments(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((segment) => ({
      segment_order: nullableNumber(pick(segment, "segment_order", "segmentOrder")),
      segment_kind: nullableString(pick(segment, "segment_kind", "segmentKind")),
      side: nullableString(pick(segment, "side") ?? "none"),
      completed_at: nullableString(pick(segment, "completed_at", "completedAt")),
      source: nullableString(pick(segment, "source") ?? "manual"),
      source_provider: nullableString(pick(segment, "source_provider", "sourceProvider")),
      source_version: nullableString(pick(segment, "source_version", "sourceVersion")),
      performance_metrics: semanticMetrics(
        pick(segment, "performance_metrics", "performanceMetrics", "metric_values"),
      ),
    }))
    .sort((left, right) => Number(left.segment_order) - Number(right.segment_order));
}

function stableSqlSetValue(value: unknown) {
  return JSON.stringify({
    reps: nullableNumber(pick(value, "reps")),
    weight_kg: nullableNumber(pick(value, "weight_kg", "weightKg")),
    notes: nullableString(pick(value, "notes")),
    completed_at: nullableString(pick(value, "completed_at", "completedAt")),
    set_details: semanticSetDetails(pick(value, "set_details", "setDetails")),
    performance_metrics: semanticMetrics(
      pick(value, "performance_metrics", "performanceMetrics"),
    ),
    segments: semanticSegments(pick(value, "segments")),
  });
}

export function fingerprintCanonicalSetWrite(log: CanonicalWorkoutSetWrite) {
  return stableSqlSetValue(serializeWorkoutSetLogs([log])[0]);
}

export function fingerprintCanonicalExerciseLog(log: ExerciseLog) {
  return stableSqlSetValue(log);
}

export function exerciseLogTargetIdentity(log: ExerciseLog) {
  const exerciseIdentity =
    log.plan_exercise_id
    ?? `${log.exercise_order ?? "none"}:${log.exercise_name.trim().toLocaleLowerCase("en")}`;
  return `${exerciseIdentity}:set:${log.set_number}`;
}
