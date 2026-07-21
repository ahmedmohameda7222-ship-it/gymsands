import type {
  WorkoutSessionExecutionBootstrapSource,
  WorkoutSessionExecutionSessionState,
  WorkoutSessionExecutionState,
  WorkoutSessionExecutionStatePatch,
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

export type WorkoutSessionExecutionWriteQueue = {
  current(): WorkoutSessionExecutionState | null;
  replace(next: WorkoutSessionExecutionState): void;
  enqueue(
    write: (currentServerState: WorkoutSessionExecutionState) => Promise<WorkoutSessionExecutionState>
  ): Promise<WorkoutSessionExecutionState>;
};

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

function finiteNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function finitePositiveInteger(value: unknown) {
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
      latestAcceptedState = next;
    },
    enqueue(write) {
      const operation = tail.then(async () => {
        if (!latestAcceptedState) {
          throw new Error("Workout execution state is not hydrated.");
        }
        const next = await write(latestAcceptedState);
        latestAcceptedState = next;
        return next;
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
