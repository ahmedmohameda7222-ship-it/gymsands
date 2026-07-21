import type {
  WorkoutSessionExecutionBootstrapSource,
  WorkoutSessionExecutionSessionState,
  WorkoutSessionExecutionState,
  WorkoutSessionExecutionViewState
} from "@/types";

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

export const workoutSessionExecutionCommandTypes = [
  "move_cursor",
  "complete_set_transition",
  "start_rest",
  "clear_rest",
  "reset_timer",
  "pause",
  "resume",
  "import_legacy_cache"
] as const;

export type WorkoutSessionExecutionCommandType = (typeof workoutSessionExecutionCommandTypes)[number];

export type WorkoutSessionExecutionMoveCursorPayload = {
  active_snapshot_item_id: string | null;
  active_item_order: number;
  active_set_number: number;
  view_state?: "set_entry" | "exercise_complete" | "session_review";
  controller_device_id?: string | null;
};

export type WorkoutSessionExecutionCompleteSetTransitionPayload = {
  active_snapshot_item_id: string | null;
  active_item_order: number;
  active_set_number: number;
  view_state: "rest" | "set_entry" | "exercise_complete";
  rest_duration_seconds: number | null;
  controller_device_id: string | null;
};

export type WorkoutSessionExecutionStartRestPayload = {
  duration_seconds: number;
  controller_device_id: string | null;
};

export type WorkoutSessionExecutionClearRestPayload = {
  view_state: "set_entry" | "exercise_complete" | "session_review";
  controller_device_id?: string | null;
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

export type WorkoutSessionExecutionCommandPayloadByType = {
  move_cursor: WorkoutSessionExecutionMoveCursorPayload;
  complete_set_transition: WorkoutSessionExecutionCompleteSetTransitionPayload;
  start_rest: WorkoutSessionExecutionStartRestPayload;
  clear_rest: WorkoutSessionExecutionClearRestPayload;
  reset_timer: WorkoutSessionExecutionDevicePayload;
  pause: WorkoutSessionExecutionDevicePayload;
  resume: WorkoutSessionExecutionDevicePayload;
  import_legacy_cache: WorkoutSessionExecutionImportLegacyCachePayload;
};

export type WorkoutSessionExecutionCommandRequest<T extends WorkoutSessionExecutionCommandType = WorkoutSessionExecutionCommandType> = {
  userId: string;
  workoutSessionId: string;
  commandId: string;
  expectedRevision: number;
  commandType: T;
  payload: WorkoutSessionExecutionCommandPayloadByType[T];
};

export const workoutSessionExecutionCommandOutcomes = [
  "applied",
  "no_op",
  "revision_conflict",
  "idempotency_conflict"
] as const;

export type WorkoutSessionExecutionCommandOutcome = (typeof workoutSessionExecutionCommandOutcomes)[number];

export type WorkoutSessionExecutionCommandResponse = {
  schemaVersion: 1;
  workoutSessionId: string;
  commandId: string;
  commandType: WorkoutSessionExecutionCommandType;
  outcome: WorkoutSessionExecutionCommandOutcome;
  replayed: boolean;
  expectedRevision: number;
  revisionBefore: number;
  revisionAfter: number;
  reason: string | null;
  state: WorkoutSessionExecutionState;
};

export type WorkoutSessionExecutionWriteQueue = {
  current(): WorkoutSessionExecutionState | null;
  replace(next: WorkoutSessionExecutionState): void;
  enqueue(
    write: (currentServerState: WorkoutSessionExecutionState) => Promise<WorkoutSessionExecutionState>
  ): Promise<WorkoutSessionExecutionState>;
};

export class WorkoutSessionExecutionRevisionConflictError extends Error {
  readonly authoritativeState: WorkoutSessionExecutionState;
  readonly response: WorkoutSessionExecutionCommandResponse;

  constructor(response: WorkoutSessionExecutionCommandResponse) {
    super("The workout changed on another request. The latest server state was loaded; retry the intent deliberately.");
    this.name = "WorkoutSessionExecutionRevisionConflictError";
    this.authoritativeState = response.state;
    this.response = response;
  }
}

export class WorkoutSessionExecutionIdempotencyConflictError extends Error {
  readonly response: WorkoutSessionExecutionCommandResponse;

  constructor(response: WorkoutSessionExecutionCommandResponse) {
    super("This workout command ID is already bound to a different request. Create a new command after reconciling state.");
    this.name = "WorkoutSessionExecutionIdempotencyConflictError";
    this.response = response;
  }
}

export class WorkoutSessionExecutionSyncError extends Error {
  readonly canonicalSetSaved = true;
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("The set was saved, but the workout execution position could not be synchronized.");
    this.name = "WorkoutSessionExecutionSyncError";
    this.cause = cause;
  }
}

const sessionStates = new Set<WorkoutSessionExecutionSessionState>(["active", "paused", "review"]);
const viewStates = new Set<WorkoutSessionExecutionViewState>(["set_entry", "rest", "exercise_complete", "session_review"]);
const bootstrapSources = new Set<WorkoutSessionExecutionBootstrapSource>(["session_start", "legacy_backfill", "client_cache_import"]);
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

function sameExecutionState(left: WorkoutSessionExecutionState, right: WorkoutSessionExecutionState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function acceptMonotonicState(
  current: WorkoutSessionExecutionState | null,
  candidate: WorkoutSessionExecutionState
) {
  if (!current) return candidate;
  if (current.workout_session_id !== candidate.workout_session_id || current.user_id !== candidate.user_id) {
    throw new Error("Workout execution authority changed identity.");
  }
  if (candidate.revision > current.revision) return candidate;
  if (candidate.revision < current.revision) return current;
  if (!sameExecutionState(current, candidate)) {
    throw new Error("Workout execution returned incompatible states at the same revision.");
  }
  return current;
}

export function createWorkoutSessionExecutionCommandId(randomUuid?: () => string) {
  const generated = randomUuid?.() ?? globalThis.crypto?.randomUUID?.();
  if (!generated || !uuidPattern.test(generated)) {
    throw new Error("Workout execution command IDs require cryptographically random UUIDs.");
  }
  return generated;
}

export function normalizeExecutionState(value: unknown): WorkoutSessionExecutionState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.workout_session_id !== "string" ||
    typeof row.user_id !== "string" ||
    row.state_version !== 1 ||
    !finiteNonNegativeInteger(row.revision) ||
    !sessionStates.has(row.session_state as WorkoutSessionExecutionSessionState) ||
    !viewStates.has(row.view_state as WorkoutSessionExecutionViewState) ||
    !nullableString(row.active_snapshot_item_id) ||
    !finitePositiveInteger(row.active_item_order) ||
    !finitePositiveInteger(row.active_set_number) ||
    !finiteNonNegativeInteger(row.session_elapsed_seconds) ||
    !nullableString(row.session_running_since) ||
    !nullableString(row.rest_started_at) ||
    !(row.rest_duration_seconds === null || finiteNonNegativeInteger(row.rest_duration_seconds)) ||
    !nullableString(row.rest_ends_at) ||
    !nullableString(row.controller_device_id) ||
    !bootstrapSources.has(row.bootstrap_source as WorkoutSessionExecutionBootstrapSource) ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) return null;

  const sessionState = row.session_state as WorkoutSessionExecutionSessionState;
  const viewState = row.view_state as WorkoutSessionExecutionViewState;
  if ((sessionState === "review") !== (viewState === "session_review")) return null;
  if ((sessionState === "paused") !== (row.session_running_since === null)) return null;
  const restTupleComplete = row.rest_started_at !== null && row.rest_duration_seconds !== null && row.rest_ends_at !== null;
  if ((viewState === "rest") !== restTupleComplete) return null;

  return row as WorkoutSessionExecutionState;
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
  const accumulated = Math.max(0, Math.floor(Number(state.session_elapsed_seconds) || 0));
  if (state.session_state === "paused") return accumulated;
  const runningSince = timestampMs(state.session_running_since);
  if (runningSince === null) return accumulated;
  return accumulated + Math.max(0, Math.floor((nowMs(now) - runningSince) / 1000));
}

export function executionDurationMinutes(
  state: Pick<WorkoutSessionExecutionState, "session_state" | "session_elapsed_seconds" | "session_running_since">,
  now: number | Date = Date.now()
) {
  return Math.max(1, Math.ceil(executionElapsedSeconds(state, now) / 60));
}

export function executionRestSecondsLeft(
  state: Pick<WorkoutSessionExecutionState, "view_state" | "rest_ends_at">,
  now: number | Date = Date.now()
) {
  if (state.view_state !== "rest") return 0;
  const restEndsAt = timestampMs(state.rest_ends_at);
  if (restEndsAt === null) return 0;
  return Math.max(0, Math.ceil((restEndsAt - nowMs(now)) / 1000));
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

export function createWorkoutSessionExecutionWriteQueue(
  initialState: WorkoutSessionExecutionState | null = null
): WorkoutSessionExecutionWriteQueue {
  let latestAcceptedState = initialState;
  let tail: Promise<void> = Promise.resolve();

  return {
    current() {
      return latestAcceptedState;
    },
    replace(next) {
      latestAcceptedState = acceptMonotonicState(latestAcceptedState, next);
    },
    enqueue(write) {
      const operation = tail.then(async () => {
        if (!latestAcceptedState) {
          throw new Error("Workout execution state is not hydrated.");
        }
        try {
          const next = await write(latestAcceptedState);
          latestAcceptedState = acceptMonotonicState(latestAcceptedState, next);
          return latestAcceptedState;
        } catch (error) {
          if (error instanceof WorkoutSessionExecutionRevisionConflictError) {
            latestAcceptedState = acceptMonotonicState(latestAcceptedState, error.authoritativeState);
          }
          throw error;
        }
      });
      tail = operation.then(() => undefined, () => undefined);
      return operation;
    }
  };
}

export async function persistCanonicalSetThenExecution(input: {
  saveCanonicalSet: () => Promise<void>;
  persistExecutionState: () => Promise<WorkoutSessionExecutionState>;
}) {
  await input.saveCanonicalSet();
  try {
    return await input.persistExecutionState();
  } catch (error) {
    throw new WorkoutSessionExecutionSyncError(error);
  }
}
