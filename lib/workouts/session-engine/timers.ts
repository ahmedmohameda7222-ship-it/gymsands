import type { WorkoutSessionExecutionState } from "@/types";
import { ActiveSessionError } from "./contracts";

function timestampMs(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireTimestamp(value: string | null, label: string) {
  const parsed = timestampMs(value);
  if (parsed === null) {
    throw new ActiveSessionError("timer_state_corruption", `${label} is invalid.`);
  }
  return parsed;
}

export function sessionElapsedSeconds(
  state: Pick<
    WorkoutSessionExecutionState,
    "session_state" | "session_elapsed_seconds" | "session_running_since"
  >,
  nowMs: number
) {
  const accumulated = Math.max(0, Math.floor(state.session_elapsed_seconds));
  if (state.session_state === "paused") return accumulated;
  const runningSince = requireTimestamp(state.session_running_since, "Session running timestamp");
  return accumulated + Math.max(0, Math.floor((nowMs - runningSince) / 1000));
}

export function restSecondsRemaining(
  state: Pick<
    WorkoutSessionExecutionState,
    "session_state" | "view_state" | "rest_duration_seconds" | "rest_ends_at"
  >,
  nowMs: number
) {
  if (state.view_state !== "rest") return 0;
  if (state.session_state === "paused") {
    return Math.max(0, Math.floor(state.rest_duration_seconds ?? 0));
  }
  const endsAt = requireTimestamp(state.rest_ends_at, "Rest end timestamp");
  return Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
}

export type ActivityTimerProjection = {
  active: boolean;
  kind: "timed_set" | "block" | null;
  bounded: boolean;
  elapsedSeconds: number;
  remainingSeconds: number | null;
  complete: boolean;
};

export function activityTimerProjection(
  state: Pick<
    WorkoutSessionExecutionState,
    | "session_state"
    | "activity_timer_kind"
    | "activity_timer_elapsed_seconds"
    | "activity_timer_running_since"
    | "activity_timer_duration_seconds"
    | "activity_timer_ends_at"
  >,
  nowMs: number
): ActivityTimerProjection {
  if (!state.activity_timer_kind) {
    return {
      active: false,
      kind: null,
      bounded: false,
      elapsedSeconds: 0,
      remainingSeconds: null,
      complete: false
    };
  }
  const accumulated = Math.max(0, Math.floor(state.activity_timer_elapsed_seconds));
  const runningDelta = state.session_state === "paused"
    ? 0
    : Math.max(
        0,
        Math.floor(
          (nowMs - requireTimestamp(state.activity_timer_running_since, "Activity timer running timestamp"))
          / 1000
        )
      );
  const duration = state.activity_timer_duration_seconds;
  if (duration === null) {
    return {
      active: true,
      kind: state.activity_timer_kind,
      bounded: false,
      elapsedSeconds: accumulated + runningDelta,
      remainingSeconds: null,
      complete: false
    };
  }
  const boundedDuration = Math.max(0, duration);
  const remaining = state.session_state === "paused"
    ? Math.max(0, boundedDuration - accumulated)
    : Math.max(
        0,
        Math.ceil(
          (requireTimestamp(state.activity_timer_ends_at, "Activity timer end timestamp") - nowMs)
          / 1000
        )
      );
  const elapsed = Math.max(accumulated, boundedDuration - remaining);
  return {
    active: true,
    kind: state.activity_timer_kind,
    bounded: true,
    elapsedSeconds: Math.min(boundedDuration, elapsed),
    remainingSeconds: remaining,
    complete: remaining === 0
  };
}
