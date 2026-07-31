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

function stableSetValue(value: {
  reps?: number | null;
  weightKg?: number | null;
  notes?: string | null;
  completedAt?: string | null;
  setDetails?: unknown;
  performanceMetrics?: unknown;
  segments?: unknown;
}) {
  return JSON.stringify({
    reps: value.reps ?? null,
    weightKg: value.weightKg ?? null,
    notes: value.notes ?? null,
    completedAt: value.completedAt ?? null,
    setDetails: value.setDetails ?? null,
    performanceMetrics: value.performanceMetrics ?? null,
    segments: value.segments ?? null,
  });
}

export function fingerprintCanonicalSetWrite(log: CanonicalWorkoutSetWrite) {
  return stableSetValue(log);
}

export function fingerprintCanonicalExerciseLog(log: ExerciseLog) {
  return stableSetValue({
    reps: log.reps,
    weightKg: log.weight_kg,
    notes: log.notes,
    completedAt: log.completed_at,
    setDetails: log.set_details,
    performanceMetrics: log.performance_metrics,
    segments: log.segments,
  });
}

export function exerciseLogTargetIdentity(log: ExerciseLog) {
  const exerciseIdentity =
    log.plan_exercise_id
    ?? `${log.exercise_order ?? "none"}:${log.exercise_name.trim().toLocaleLowerCase("en")}`;
  return `${exerciseIdentity}:set:${log.set_number}`;
}
