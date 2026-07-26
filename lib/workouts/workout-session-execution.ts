import type {
  WorkoutSessionExecutionBootstrapSource,
  WorkoutSessionExecutionSessionState,
  WorkoutSessionExecutionState,
  WorkoutSessionExecutionViewState
} from "@/types";
import {
  ActiveSessionIdempotencyConflictError,
  ActiveSessionRevisionConflictError,
  sessionCommandOutcomes,
  sessionCommandTypes,
  type ActivityTimerCompletionReason,
  type ActivityTimerKind,
  type CompleteSetTransitionPayload,
  type MoveCursorPayload,
  type RestCompletionReason,
  type SessionCommandOutcome,
  type SessionCommandPayloadByType,
  type SessionCommandRequest,
  type SessionCommandResponse,
  type SessionCommandType
} from "./session-engine/contracts";
import { normalizeExecutionState as normalizeCanonicalExecutionState } from "./session-engine/invariants";
import {
  restSecondsRemaining,
  sessionElapsedSeconds
} from "./session-engine/timers";

export type WorkoutSessionExecutionCursorItem = {
  id: string;
  itemOrder: number;
  sourcePlanExerciseId?: string | null;
};

export type WorkoutSessionExecutionDayExercise = {
  id: string;
};

export type WorkoutSessionAfterSetCompletionPlan = {
  hasNextSet: boolean;
  nextExerciseIndex: number;
  nextSetIndex: number;
  patch: {
    active_snapshot_item_id: string | null;
    active_item_order: number;
    active_set_number: number;
    view_state: Exclude<WorkoutSessionExecutionViewState, "session_review">;
    rest_started_at: string | null;
    rest_duration_seconds: number | null;
    rest_ends_at: string | null;
    controller_device_id: string | null;
  };
};

export const workoutSessionExecutionCommandTypes = sessionCommandTypes;

export type WorkoutSessionExecutionCommandType = SessionCommandType;

export type WorkoutSessionExecutionMoveCursorPayload = MoveCursorPayload;

export type WorkoutSessionExecutionCompleteSetTransitionPayload =
  CompleteSetTransitionPayload;

export type WorkoutSessionExecutionStartRestPayload = {
  duration_seconds: number;
  controller_device_id: string | null;
};

export type WorkoutSessionExecutionClearRestPayload = {
  view_state: "set_entry" | "exercise_complete" | "session_review";
  completion_reason?: RestCompletionReason;
  controller_device_id?: string | null;
};

export type WorkoutSessionExecutionStartActivityTimerPayload = {
  kind: ActivityTimerKind;
  duration_seconds: number | null;
  controller_device_id: string | null;
};

export type WorkoutSessionExecutionClearActivityTimerPayload = {
  completion_reason: ActivityTimerCompletionReason;
  controller_device_id: string | null;
};

export type WorkoutSessionExecutionDevicePayload = {
  controller_device_id: string | null;
};

export type WorkoutSessionExecutionImportLegacyCachePayload = {
  cached_started_at: string | null;
  cached_rest_ends_at: string | null;
  cached_rest_duration_seconds: number | null;
  controller_device_id: string | null;
};

export type WorkoutSessionExecutionCommandPayloadByType =
  SessionCommandPayloadByType;

export type WorkoutSessionExecutionCommandRequest<
  T extends WorkoutSessionExecutionCommandType = WorkoutSessionExecutionCommandType
> = SessionCommandRequest<T>;

export const workoutSessionExecutionCommandOutcomes = sessionCommandOutcomes;

export type WorkoutSessionExecutionCommandOutcome = SessionCommandOutcome;

export type WorkoutSessionExecutionCommandResponse = SessionCommandResponse;

export class WorkoutSessionExecutionRevisionConflictError
  extends ActiveSessionRevisionConflictError {
  readonly authoritativeState: WorkoutSessionExecutionState;
  readonly response: WorkoutSessionExecutionCommandResponse;

  constructor(response: WorkoutSessionExecutionCommandResponse) {
    super(response);
    this.name = "WorkoutSessionExecutionRevisionConflictError";
    this.authoritativeState = response.state;
    this.response = response;
  }
}

export class WorkoutSessionExecutionIdempotencyConflictError
  extends ActiveSessionIdempotencyConflictError {
  readonly response: WorkoutSessionExecutionCommandResponse;

  constructor(response: WorkoutSessionExecutionCommandResponse) {
    super(response);
    this.name = "WorkoutSessionExecutionIdempotencyConflictError";
    this.response = response;
  }
}

const commandTypes = new Set<WorkoutSessionExecutionCommandType>(workoutSessionExecutionCommandTypes);
const commandOutcomes = new Set<WorkoutSessionExecutionCommandOutcome>(workoutSessionExecutionCommandOutcomes);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function finiteNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function finitePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nowMs(now: number | Date) {
  const value = now instanceof Date ? now.getTime() : now;
  return Number.isFinite(value) ? value : Date.now();
}

export function createWorkoutSessionExecutionCommandId(randomUuid?: () => string) {
  const generated = randomUuid?.() ?? globalThis.crypto?.randomUUID?.();
  if (!generated || !uuidPattern.test(generated)) {
    throw new Error("Workout execution command IDs require cryptographically random UUIDs.");
  }
  return generated;
}

export function normalizeExecutionState(value: unknown): WorkoutSessionExecutionState | null {
  return normalizeCanonicalExecutionState(value);
}

export function normalizeWorkoutSessionExecutionCommandResponse(
  value: unknown,
  expected?: Pick<WorkoutSessionExecutionCommandRequest, "workoutSessionId" | "commandId" | "commandType">
): WorkoutSessionExecutionCommandResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Workout execution command returned a malformed envelope.");
  }
  const row = value as Record<string, unknown>;
  const state = normalizeExecutionState(row.state);
  if (
    row.schemaVersion !== 1 ||
    typeof row.workoutSessionId !== "string" ||
    typeof row.commandId !== "string" ||
    !commandTypes.has(row.commandType as WorkoutSessionExecutionCommandType) ||
    !commandOutcomes.has(row.outcome as WorkoutSessionExecutionCommandOutcome) ||
    typeof row.replayed !== "boolean" ||
    !finiteNonNegativeInteger(row.expectedRevision) ||
    !finiteNonNegativeInteger(row.revisionBefore) ||
    !finiteNonNegativeInteger(row.revisionAfter) ||
    !(row.reason === null || typeof row.reason === "string") ||
    !state
  ) {
    throw new Error("Workout execution command returned an invalid persisted contract.");
  }
  if (!uuidPattern.test(row.commandId) || state.workout_session_id !== row.workoutSessionId || state.revision !== row.revisionAfter) {
    throw new Error("Workout execution command response identity or revision is inconsistent.");
  }
  if (expected && (
    row.workoutSessionId !== expected.workoutSessionId ||
    row.commandId !== expected.commandId ||
    row.commandType !== expected.commandType
  )) {
    throw new Error("Workout execution command response does not match the request identity.");
  }
  if (row.outcome === "applied" && row.revisionAfter !== row.revisionBefore + 1) {
    throw new Error("Applied workout execution commands must advance revision exactly once.");
  }
  if ((row.outcome === "no_op" || row.outcome === "revision_conflict") && row.revisionAfter !== row.revisionBefore) {
    throw new Error("Non-applied workout execution commands cannot advance revision.");
  }
  return row as WorkoutSessionExecutionCommandResponse;
}

export function executionElapsedSeconds(
  state: Pick<WorkoutSessionExecutionState, "session_state" | "session_elapsed_seconds" | "session_running_since">,
  now: number | Date = Date.now()
) {
  return sessionElapsedSeconds(state, nowMs(now));
}

export function executionDurationMinutes(
  state: Pick<WorkoutSessionExecutionState, "session_state" | "session_elapsed_seconds" | "session_running_since">,
  now: number | Date = Date.now()
) {
  return Math.max(1, Math.ceil(executionElapsedSeconds(state, now) / 60));
}

export function executionRestSecondsLeft(
  state: Pick<
    WorkoutSessionExecutionState,
    "session_state" | "view_state" | "rest_duration_seconds" | "rest_ends_at"
  >,
  now: number | Date = Date.now()
) {
  return restSecondsRemaining(state, nowMs(now));
}

export function executionStartedAtMs(
  state: Pick<WorkoutSessionExecutionState, "session_state" | "session_elapsed_seconds" | "session_running_since">,
  now: number | Date = Date.now()
) {
  const currentNow = nowMs(now);
  return Math.max(0, currentNow - executionElapsedSeconds(state, currentNow) * 1000);
}

export function executionCursorToIndexes(
  state: Pick<WorkoutSessionExecutionState, "active_snapshot_item_id" | "active_item_order" | "active_set_number">,
  orderedSnapshotItems: readonly WorkoutSessionExecutionCursorItem[],
  dayExercises: readonly WorkoutSessionExecutionDayExercise[] = []
) {
  const ordered = [...orderedSnapshotItems].sort((left, right) => left.itemOrder - right.itemOrder || left.id.localeCompare(right.id));
  const item = ordered.find((candidate) => candidate.id === state.active_snapshot_item_id)
    ?? ordered.find((candidate) => candidate.itemOrder === state.active_item_order)
    ?? ordered[0]
    ?? null;

  let exerciseIndex = item ? ordered.findIndex((candidate) => candidate.id === item.id) : Math.max(0, state.active_item_order - 1);
  if (item?.sourcePlanExerciseId && dayExercises.length) {
    const stableIndex = dayExercises.findIndex((exercise) => exercise.id === item.sourcePlanExerciseId);
    if (stableIndex >= 0) exerciseIndex = stableIndex;
  }

  return {
    exerciseIndex: Math.max(0, exerciseIndex),
    setIndex: Math.max(0, state.active_set_number - 1),
    snapshotItem: item
  };
}

export function planWorkoutSessionAfterSetCompletion(input: {
  exerciseIndex: number;
  setIndex: number;
  exerciseSetCounts: readonly number[];
  orderedSnapshotItems: readonly WorkoutSessionExecutionCursorItem[];
  dayExercises: readonly WorkoutSessionExecutionDayExercise[];
  restDurationSeconds: number;
  controllerDeviceId: string | null;
  now?: Date;
}): WorkoutSessionAfterSetCompletionPlan {
  const exerciseIndex = Math.max(0, Math.floor(input.exerciseIndex));
  const setIndex = Math.max(0, Math.floor(input.setIndex));
  const currentSetCount = Math.max(1, Math.floor(input.exerciseSetCounts[exerciseIndex] ?? 1));
  const hasNextSetInExercise = setIndex + 1 < currentSetCount;
  const hasNextExercise = exerciseIndex + 1 < input.exerciseSetCounts.length;
  const hasNextSet = hasNextSetInExercise || hasNextExercise;
  const nextExerciseIndex = hasNextSetInExercise ? exerciseIndex : hasNextExercise ? exerciseIndex + 1 : exerciseIndex;
  const nextSetIndex = hasNextSetInExercise ? setIndex + 1 : hasNextExercise ? 0 : setIndex;
  const nextExercise = input.dayExercises[nextExerciseIndex];
  const cursorItem = input.orderedSnapshotItems.find((item) => item.sourcePlanExerciseId === nextExercise?.id)
    ?? input.orderedSnapshotItems.find((item) => item.itemOrder === nextExerciseIndex + 1)
    ?? null;
  const restDurationSeconds = Math.min(86400, Math.max(0, Math.floor(input.restDurationSeconds)));
  const shouldRest = hasNextSet && restDurationSeconds > 0;
  const now = input.now ?? new Date();
  const restStartedAt = shouldRest ? now.toISOString() : null;
  const restEndsAt = shouldRest ? new Date(now.getTime() + restDurationSeconds * 1000).toISOString() : null;

  return {
    hasNextSet,
    nextExerciseIndex,
    nextSetIndex,
    patch: {
      active_snapshot_item_id: cursorItem?.id ?? null,
      active_item_order: cursorItem?.itemOrder ?? nextExerciseIndex + 1,
      active_set_number: nextSetIndex + 1,
      view_state: shouldRest ? "rest" : hasNextSet ? "set_entry" : "exercise_complete",
      rest_started_at: restStartedAt,
      rest_duration_seconds: shouldRest ? restDurationSeconds : null,
      rest_ends_at: restEndsAt,
      controller_device_id: input.controllerDeviceId
    }
  };
}
