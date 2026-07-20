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
