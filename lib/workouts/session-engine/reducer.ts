import type {
  ExerciseLog,
  WorkoutSessionExecutionState,
  WorkoutSessionPrescriptionItem
} from "@/types";
import {
  ActiveSessionError,
  MAX_ACTIVITY_TIMER_DURATION_SECONDS,
  validateSessionCommandIntent,
  type SessionCommandIntent,
  type SessionEngineContext,
  type SessionTransitionPlan
} from "./contracts";
import {
  assertCursorInvariants,
  assertPrescriptionInvariants,
  sameCanonicalExecutionState
} from "./invariants";
import { activityTimerProjection, restSecondsRemaining, sessionElapsedSeconds } from "./timers";

function iso(nowMs: number) {
  return new Date(nowMs).toISOString();
}

function withDevice(
  state: WorkoutSessionExecutionState,
  payload: { controller_device_id?: string | null }
) {
  return Object.prototype.hasOwnProperty.call(payload, "controller_device_id")
    ? { ...state, controller_device_id: payload.controller_device_id ?? null }
    : state;
}

function validateDuration(value: number, maximum = 86_400) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new ActiveSessionError("invalid_transition", "Timer duration is outside the supported range.");
  }
}

function clearRest(state: WorkoutSessionExecutionState) {
  return {
    ...state,
    rest_started_at: null,
    rest_duration_seconds: null,
    rest_ends_at: null
  };
}

function clearActivity(state: WorkoutSessionExecutionState) {
  return {
    ...state,
    activity_timer_kind: null,
    activity_timer_elapsed_seconds: 0,
    activity_timer_running_since: null,
    activity_timer_duration_seconds: null,
    activity_timer_ends_at: null
  } satisfies WorkoutSessionExecutionState;
}

export type SessionAfterSetCompletionPlan = {
  hasNextSet: boolean;
  nextExerciseIndex: number;
  nextSetIndex: number;
  patch: {
    active_snapshot_item_id: string;
    active_item_order: number;
    active_set_number: number;
    view_state: "rest" | "set_entry" | "exercise_complete";
    rest_duration_seconds: number | null;
    controller_device_id: string | null;
  };
};

export function planSessionAfterSetCompletion(input: {
  userId: string;
  workoutSessionId: string;
  currentSnapshotItemId: string;
  currentSetNumber: number;
  prescription: readonly WorkoutSessionPrescriptionItem[];
  performedLogs?: readonly ExerciseLog[];
  restDurationSeconds: number;
  controllerDeviceId: string | null;
}): SessionAfterSetCompletionPlan {
  assertPrescriptionInvariants(
    input.prescription,
    input.userId,
    input.workoutSessionId
  );
  const ordered = [...input.prescription].sort(
    (left, right) => left.itemOrder - right.itemOrder
  );
  const currentIndex = ordered.findIndex(
    (item) => item.id === input.currentSnapshotItemId
  );
  if (currentIndex < 0) {
    throw new ActiveSessionError(
      "identity_mismatch",
      "The completed set does not belong to the frozen prescription."
    );
  }
  const currentItem = ordered[currentIndex];
  assertCursorInvariants(
    {
      active_snapshot_item_id: currentItem.id,
      active_item_order: currentItem.itemOrder,
      active_set_number: input.currentSetNumber
    },
    {
      userId: input.userId,
      workoutSessionId: input.workoutSessionId,
      rootStatus: "started",
      prescription: ordered,
      performedLogs: input.performedLogs
    }
  );
  validateDuration(input.restDurationSeconds);

  const nextSetInItem = currentItem.prescriptionSets.find(
    (set) => set.setOrder === input.currentSetNumber + 1
  );
  const nextItem = nextSetInItem ? currentItem : ordered[currentIndex + 1] ?? null;
  const nextSetNumber = nextSetInItem ? nextSetInItem.setOrder : 1;
  const hasNextSet = nextItem !== null;
  const shouldRest = hasNextSet && input.restDurationSeconds > 0;

  return {
    hasNextSet,
    nextExerciseIndex: hasNextSet ? nextItem.itemOrder - 1 : currentItem.itemOrder - 1,
    nextSetIndex: hasNextSet ? nextSetNumber - 1 : input.currentSetNumber - 1,
    patch: {
      active_snapshot_item_id: hasNextSet ? nextItem.id : currentItem.id,
      active_item_order: hasNextSet ? nextItem.itemOrder : currentItem.itemOrder,
      active_set_number: hasNextSet ? nextSetNumber : input.currentSetNumber,
      view_state: shouldRest
        ? "rest"
        : hasNextSet
          ? "set_entry"
          : "exercise_complete",
      rest_duration_seconds: shouldRest ? input.restDurationSeconds : null,
      controller_device_id: input.controllerDeviceId
    }
  };
}

export function reduceSessionCommand(
  current: WorkoutSessionExecutionState,
  intent: SessionCommandIntent,
  context: SessionEngineContext,
  nowMs: number
): SessionTransitionPlan {
  validateSessionCommandIntent(intent);
  if (context.rootStatus !== "started") {
    throw new ActiveSessionError(
      "terminal_mutation_attempt",
      "A terminal workout session cannot accept execution commands."
    );
  }
  if (
    current.user_id !== intent.userId
    || current.workout_session_id !== intent.workoutSessionId
    || context.userId !== intent.userId
    || context.workoutSessionId !== intent.workoutSessionId
  ) {
    throw new ActiveSessionError("identity_mismatch", "Workout command identity does not match the store.");
  }

  let next = withDevice(current, intent.payload as { controller_device_id?: string | null });
  let reason: string | null = null;

  switch (intent.commandType) {
    case "move_cursor": {
      const payload = intent.payload;
      next = {
        ...next,
        active_snapshot_item_id: payload.active_snapshot_item_id,
        active_item_order: payload.active_item_order,
        active_set_number: payload.active_set_number
      };
      assertCursorInvariants(next, context);
      if (payload.view_state) {
        next = clearRest({ ...next, view_state: payload.view_state });
        if (payload.view_state === "session_review") {
          next = {
            ...next,
            session_state: "review",
            session_elapsed_seconds: sessionElapsedSeconds(current, nowMs),
            session_running_since: iso(nowMs)
          };
        } else if (current.session_state === "review") {
          next = {
            ...next,
            session_state: "active",
            session_elapsed_seconds: sessionElapsedSeconds(current, nowMs),
            session_running_since: iso(nowMs)
          };
        }
      }
      break;
    }
    case "complete_set_transition": {
      const payload = intent.payload;
      if (current.session_state === "paused") {
        throw new ActiveSessionError(
          "invalid_transition",
          "A paused workout cannot complete a set transition."
        );
      }
      next = {
        ...next,
        active_snapshot_item_id: payload.active_snapshot_item_id,
        active_item_order: payload.active_item_order,
        active_set_number: payload.active_set_number,
        view_state: payload.view_state
      };
      assertCursorInvariants(next, context);
      if (current.session_state === "review") {
        next = {
          ...next,
          session_state: "active",
          session_elapsed_seconds: sessionElapsedSeconds(current, nowMs),
          session_running_since: iso(nowMs)
        };
      }
      if (payload.view_state === "rest") {
        if (payload.rest_duration_seconds === null) {
          throw new ActiveSessionError("invalid_transition", "Rest transition requires a duration.");
        }
        validateDuration(payload.rest_duration_seconds);
        next = {
          ...next,
          rest_started_at: iso(nowMs),
          rest_duration_seconds: payload.rest_duration_seconds,
          rest_ends_at: iso(nowMs + payload.rest_duration_seconds * 1000)
        };
      } else {
        next = clearRest(next);
      }
      break;
    }
    case "start_rest": {
      const payload = intent.payload;
      validateDuration(payload.duration_seconds);
      if (current.session_state === "review") {
        throw new ActiveSessionError("invalid_transition", "Review state cannot start a rest timer.");
      }
      next = {
        ...next,
        view_state: "rest",
        rest_started_at: current.session_state === "paused" ? null : iso(nowMs),
        rest_duration_seconds: payload.duration_seconds,
        rest_ends_at: current.session_state === "paused"
          ? null
          : iso(nowMs + payload.duration_seconds * 1000)
      };
      break;
    }
    case "clear_rest": {
      const payload = intent.payload;
      next = clearRest({ ...next, view_state: payload.view_state });
      if (payload.view_state === "session_review") {
        next = {
          ...next,
          session_state: "review",
          session_elapsed_seconds: sessionElapsedSeconds(current, nowMs),
          session_running_since: iso(nowMs)
        };
      } else if (current.session_state === "review") {
        next = {
          ...next,
          session_state: "active",
          session_elapsed_seconds: sessionElapsedSeconds(current, nowMs),
          session_running_since: iso(nowMs)
        };
      }
      break;
    }
    case "reset_timer":
      next = {
        ...next,
        session_state: "active",
        view_state: next.view_state === "session_review" ? "set_entry" : next.view_state,
        session_elapsed_seconds: 0,
        session_running_since: iso(nowMs)
      };
      break;
    case "pause": {
      if (current.session_state === "review") {
        throw new ActiveSessionError("invalid_transition", "Review state cannot be paused.");
      }
      if (current.session_state === "paused") {
        next = current;
        reason = "already_paused";
        break;
      }
      const restRemaining = current.view_state === "rest"
        ? restSecondsRemaining(current, nowMs)
        : null;
      const activity = activityTimerProjection(current, nowMs);
      next = {
        ...next,
        session_state: "paused",
        session_elapsed_seconds: sessionElapsedSeconds(current, nowMs),
        session_running_since: null,
        ...(restRemaining === null ? {} : {
          rest_started_at: null,
          rest_duration_seconds: restRemaining,
          rest_ends_at: null
        }),
        ...(activity.active ? {
          activity_timer_elapsed_seconds: activity.elapsedSeconds,
          activity_timer_running_since: null,
          activity_timer_ends_at: null
        } : {})
      };
      break;
    }
    case "resume": {
      if (current.session_state !== "paused") {
        next = current;
        reason = "already_running";
        break;
      }
      next = {
        ...next,
        session_state: "active",
        session_running_since: iso(nowMs)
      };
      if (current.view_state === "rest" && current.rest_duration_seconds !== null) {
        next = {
          ...next,
          rest_started_at: iso(nowMs),
          rest_ends_at: iso(nowMs + current.rest_duration_seconds * 1000)
        };
      }
      if (current.activity_timer_kind) {
        const remaining = current.activity_timer_duration_seconds === null
          ? null
          : Math.max(
              0,
              current.activity_timer_duration_seconds - current.activity_timer_elapsed_seconds
            );
        next = {
          ...next,
          activity_timer_running_since: iso(nowMs),
          activity_timer_ends_at: remaining === null ? null : iso(nowMs + remaining * 1000)
        };
      }
      break;
    }
    case "import_legacy_cache": {
      const payload = intent.payload;
      if (current.bootstrap_source !== "legacy_backfill" || current.revision !== 0) {
        next = current;
        reason = "legacy_import_not_eligible";
        break;
      }
      const startedAt = payload.cached_started_at
        ? Date.parse(payload.cached_started_at)
        : Number.NaN;
      const restEndsAt = payload.cached_rest_ends_at
        ? Date.parse(payload.cached_rest_ends_at)
        : Number.NaN;
      const validStart = Number.isFinite(startedAt)
        && startedAt >= nowMs - 24 * 60 * 60_000
        && startedAt <= nowMs + 5 * 60_000;
      const importedElapsed = validStart
        ? Math.max(0, Math.floor((nowMs - startedAt) / 1000))
        : 0;
      const restDuration = payload.cached_rest_duration_seconds;
      const validRest = Number.isFinite(restEndsAt)
        && restDuration !== null
        && Number.isSafeInteger(restDuration)
        && restDuration >= 0
        && restDuration <= 86_400
        && restEndsAt > nowMs
        && restEndsAt <= nowMs + 24 * 60 * 60_000;
      const currentElapsed = sessionElapsedSeconds(current, nowMs);
      if (importedElapsed <= currentElapsed && !validRest) {
        next = current;
        reason = "legacy_cache_not_newer";
        break;
      }
      next = {
        ...next,
        bootstrap_source: "client_cache_import"
      };
      if (importedElapsed > currentElapsed) {
        next = {
          ...next,
          session_elapsed_seconds: importedElapsed,
          session_running_since: current.session_state === "paused" ? null : iso(nowMs)
        };
      }
      if (validRest && restDuration !== null) {
        next = {
          ...next,
          session_state: current.session_state === "review" ? "active" : current.session_state,
          session_running_since: current.session_state === "review" ? iso(nowMs) : next.session_running_since,
          view_state: "rest",
          rest_duration_seconds: current.session_state === "paused" ? Math.ceil((restEndsAt - nowMs) / 1000) : restDuration,
          rest_started_at: current.session_state === "paused"
            ? null
            : iso(restEndsAt - restDuration * 1000),
          rest_ends_at: current.session_state === "paused" ? null : iso(restEndsAt)
        };
      }
      break;
    }
    case "start_activity_timer": {
      const payload = intent.payload;
      if (current.session_state === "review") {
        throw new ActiveSessionError("invalid_transition", "Review state cannot start an activity timer.");
      }
      if (payload.kind === "block" && payload.duration_seconds === null) {
        throw new ActiveSessionError("invalid_transition", "A block activity timer must be bounded.");
      }
      if (payload.duration_seconds !== null) {
        validateDuration(payload.duration_seconds, MAX_ACTIVITY_TIMER_DURATION_SECONDS);
      }
      if (current.activity_timer_kind) {
        const exact = current.activity_timer_kind === payload.kind
          && current.activity_timer_duration_seconds === payload.duration_seconds
          && current.activity_timer_running_since !== null;
        if (exact) {
          next = current;
          reason = "activity_timer_already_running";
          break;
        }
        throw new ActiveSessionError("invalid_transition", "A different activity timer is already active.");
      }
      next = {
        ...next,
        activity_timer_kind: payload.kind,
        activity_timer_elapsed_seconds: 0,
        activity_timer_running_since: current.session_state === "paused" ? null : iso(nowMs),
        activity_timer_duration_seconds: payload.duration_seconds,
        activity_timer_ends_at: current.session_state === "paused" || payload.duration_seconds === null
          ? null
          : iso(nowMs + payload.duration_seconds * 1000)
      };
      break;
    }
    case "clear_activity_timer":
      if (!current.activity_timer_kind) {
        next = current;
        reason = "activity_timer_inactive";
      } else {
        next = clearActivity(next);
      }
      break;
    case "reset_activity_timer": {
      if (!current.activity_timer_kind) {
        next = current;
        reason = "activity_timer_inactive";
        break;
      }
      next = {
        ...next,
        activity_timer_elapsed_seconds: 0,
        activity_timer_running_since: current.session_state === "paused" ? null : iso(nowMs),
        activity_timer_ends_at: current.session_state === "paused"
          || current.activity_timer_duration_seconds === null
          ? null
          : iso(nowMs + current.activity_timer_duration_seconds * 1000)
      };
      break;
    }
  }

  if (sameCanonicalExecutionState(current, next)) {
    return { outcome: "no_op", reason: reason ?? "no_effective_change", state: current };
  }
  return { outcome: "applied", reason, state: next };
}
