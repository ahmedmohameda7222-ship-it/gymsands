import type { WorkoutSessionExecutionState, WorkoutSessionPrescriptionItem } from "@/types";
import {
  ActiveSessionError,
  MAX_ACTIVITY_TIMER_DURATION_SECONDS,
  type SessionEngineContext
} from "./contracts";

const sessionStates = new Set(["active", "paused", "review"]);
const viewStates = new Set(["set_entry", "rest", "exercise_complete", "session_review"]);
const bootstrapSources = new Set(["session_start", "legacy_backfill", "client_cache_import"]);
const activityKinds = new Set(["timed_set", "block"]);

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalValue(nested)])
  );
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

export function sameCanonicalExecutionState(
  left: WorkoutSessionExecutionState,
  right: WorkoutSessionExecutionState
) {
  return canonicalJson(left) === canonicalJson(right);
}

export function acceptMonotonicExecutionState(
  current: WorkoutSessionExecutionState | null,
  candidate: WorkoutSessionExecutionState
) {
  if (!current) return candidate;
  if (
    current.workout_session_id !== candidate.workout_session_id
    || current.user_id !== candidate.user_id
  ) {
    throw new ActiveSessionError("identity_mismatch", "Workout execution authority changed identity.");
  }
  if (candidate.revision > current.revision) return candidate;
  if (candidate.revision < current.revision) return current;
  if (!sameCanonicalExecutionState(current, candidate)) {
    throw new ActiveSessionError(
      "same_revision_state_divergence",
      "Workout execution returned divergent states at the same revision."
    );
  }
  return current;
}

function validActivityTuple(row: Record<string, unknown>) {
  const kind = row.activity_timer_kind;
  const elapsed = row.activity_timer_elapsed_seconds;
  const runningSince = row.activity_timer_running_since;
  const duration = row.activity_timer_duration_seconds;
  const endsAt = row.activity_timer_ends_at;
  const sessionState = row.session_state;
  if (kind === null) {
    return elapsed === 0 && runningSince === null && duration === null && endsAt === null;
  }
  if (!activityKinds.has(String(kind)) || !nonNegativeInteger(elapsed)) return false;
  if (duration === null) {
    return kind === "timed_set"
      && endsAt === null
      && (sessionState === "paused" ? runningSince === null : typeof runningSince === "string");
  }
  if (
    !nonNegativeInteger(duration)
    || duration > MAX_ACTIVITY_TIMER_DURATION_SECONDS
    || elapsed > duration
  ) return false;
  return sessionState === "paused"
    ? runningSince === null && endsAt === null
    : typeof runningSince === "string" && typeof endsAt === "string";
}

export function normalizeExecutionState(value: unknown): WorkoutSessionExecutionState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.workout_session_id !== "string"
    || typeof row.user_id !== "string"
    || row.state_version !== 1
    || !nonNegativeInteger(row.revision)
    || !sessionStates.has(String(row.session_state))
    || !viewStates.has(String(row.view_state))
    || !nullableString(row.active_snapshot_item_id)
    || !positiveInteger(row.active_item_order)
    || !positiveInteger(row.active_set_number)
    || !nonNegativeInteger(row.session_elapsed_seconds)
    || !nullableString(row.session_running_since)
    || !nullableString(row.rest_started_at)
    || !(row.rest_duration_seconds === null || nonNegativeInteger(row.rest_duration_seconds))
    || !nullableString(row.rest_ends_at)
    || !(row.activity_timer_kind === null || activityKinds.has(String(row.activity_timer_kind)))
    || !nonNegativeInteger(row.activity_timer_elapsed_seconds)
    || !nullableString(row.activity_timer_running_since)
    || !(row.activity_timer_duration_seconds === null || nonNegativeInteger(row.activity_timer_duration_seconds))
    || !nullableString(row.activity_timer_ends_at)
    || !nullableString(row.controller_device_id)
    || !bootstrapSources.has(String(row.bootstrap_source))
    || typeof row.created_at !== "string"
    || typeof row.updated_at !== "string"
  ) return null;
  if ((row.session_state === "review") !== (row.view_state === "session_review")) return null;
  if ((row.session_state === "paused") !== (row.session_running_since === null)) return null;
  const hasRestDuration = row.rest_duration_seconds !== null;
  const runningRestTuple = row.rest_started_at !== null && row.rest_ends_at !== null;
  const pausedRestTuple = row.rest_started_at === null && row.rest_ends_at === null;
  if (row.view_state === "rest") {
    if (
      !hasRestDuration
      || (row.session_state === "paused" ? !pausedRestTuple : !runningRestTuple)
    ) return null;
  } else if (
    row.rest_started_at !== null
    || row.rest_duration_seconds !== null
    || row.rest_ends_at !== null
  ) return null;
  if (!validActivityTuple(row)) return null;
  return row as WorkoutSessionExecutionState;
}

export function assertPrescriptionInvariants(
  prescription: readonly WorkoutSessionPrescriptionItem[],
  userId: string,
  workoutSessionId: string
) {
  const ordered = [...prescription].sort((left, right) => left.itemOrder - right.itemOrder);
  const itemIds = new Set<string>();
  for (const [index, item] of ordered.entries()) {
    if (itemIds.has(item.id)) {
      throw new ActiveSessionError("invalid_transition", "The frozen prescription has a duplicate item identity.");
    }
    itemIds.add(item.id);
    if (
      item.userId !== userId
      || item.workoutSessionId !== workoutSessionId
      || item.itemOrder !== index + 1
    ) {
      throw new ActiveSessionError(
        "identity_mismatch",
        "The frozen prescription owner, session, or item order is invalid."
      );
    }
    for (const [setIndex, set] of item.prescriptionSets.entries()) {
      if (
        set.userId !== userId
        || set.workoutSessionId !== workoutSessionId
        || set.snapshotItemId !== item.id
        || set.setOrder !== setIndex + 1
      ) {
        throw new ActiveSessionError(
          "invalid_transition",
          "The frozen prescription contains a non-contiguous or mismatched set graph."
        );
      }
    }
  }
}

export function assertCursorInvariants(
  state: Pick<
    WorkoutSessionExecutionState,
    "active_snapshot_item_id" | "active_item_order" | "active_set_number"
  >,
  context: SessionEngineContext
) {
  if (!positiveInteger(state.active_item_order) || !positiveInteger(state.active_set_number)) {
    throw new ActiveSessionError("invalid_transition", "The workout cursor must be one-based.");
  }
  assertPrescriptionInvariants(context.prescription, context.userId, context.workoutSessionId);
  if (state.active_snapshot_item_id === null) {
    if (context.prescription.length === 0) return;
    throw new ActiveSessionError(
      "identity_mismatch",
      "A workout with a frozen prescription requires an active snapshot item."
    );
  }
  const item = context.prescription.find(
    (candidate) => candidate.id === state.active_snapshot_item_id
  );
  if (!item || item.itemOrder !== state.active_item_order) {
    throw new ActiveSessionError(
      "identity_mismatch",
      "The active cursor does not match a frozen prescription item."
    );
  }
  if (item.executionState === "skipped" || item.executionState === "completed") {
    throw new ActiveSessionError(
      "invalid_transition",
      "A terminal prescription item cannot become the active set-entry target."
    );
  }
  const setExists = item.prescriptionSets.some(
    (candidate) => candidate.setOrder === state.active_set_number
  );
  if (!setExists) {
    const matchingLog = context.performedLogs?.some((log) =>
      log.workout_session_id === context.workoutSessionId
      && log.set_number === state.active_set_number
      && (
        (item.sourcePlanExerciseId && log.plan_exercise_id === item.sourcePlanExerciseId)
        || (item.sourcePlanActivityId && log.plan_activity_id === item.sourcePlanActivityId)
      )
    );
    if (!matchingLog) {
      throw new ActiveSessionError(
        "invalid_transition",
        "The active set is outside the frozen prescription and has no canonical performed-set identity."
      );
    }
  }
}
