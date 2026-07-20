import type { WorkoutSessionExecutionSessionState, WorkoutSessionExecutionState, WorkoutSessionExecutionViewState } from "@/types";

export const activeWorkoutEvent = "plaivra:active-workout-changed";

export type ActiveWorkoutState = {
  sessionId: string;
  route: string;
  label: string;
  /** Running anchor for the current accumulated segment. */
  startedAtMs: number;
  /** Accumulated elapsed seconds before startedAtMs, or the paused total. */
  elapsedSeconds: number;
  paused: boolean;
  serverRevision?: number;
  stateVersion?: 1;
  activeSnapshotItemId?: string | null;
  activeItemOrder?: number;
  activeSetNumber?: number;
  sessionState?: WorkoutSessionExecutionSessionState;
  viewState?: WorkoutSessionExecutionViewState;
  restEndsAtMs?: number | null;
  controllerDeviceId?: string | null;
};

export function isValidActiveWorkoutRoute(route: string) {
  return /^\/workouts\/session\/(?:day\/)?[^/?#]+$/.test(route);
}

function key(userId: string) {
  return `plaivra.active-workout.${userId}`;
}

function optionalNonNegativeInteger(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function optionalPositiveInteger(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 1);
}

function optionalNullableString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

export function parseActiveWorkoutState(value: unknown): ActiveWorkoutState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (
    typeof state.sessionId !== "string" || !state.sessionId ||
    typeof state.route !== "string" || !isValidActiveWorkoutRoute(state.route) ||
    typeof state.label !== "string" ||
    typeof state.startedAtMs !== "number" || !Number.isFinite(state.startedAtMs) || state.startedAtMs < 0 ||
    typeof state.elapsedSeconds !== "number" || !Number.isFinite(state.elapsedSeconds) || state.elapsedSeconds < 0 ||
    typeof state.paused !== "boolean" ||
    !optionalNonNegativeInteger(state.serverRevision) ||
    !(state.stateVersion === undefined || state.stateVersion === 1) ||
    !optionalNullableString(state.activeSnapshotItemId) ||
    !optionalPositiveInteger(state.activeItemOrder) ||
    !optionalPositiveInteger(state.activeSetNumber) ||
    !optionalNullableString(state.controllerDeviceId) ||
    !(state.restEndsAtMs === undefined || state.restEndsAtMs === null || (typeof state.restEndsAtMs === "number" && Number.isFinite(state.restEndsAtMs))) ||
    !(state.sessionState === undefined || ["active", "paused", "review"].includes(String(state.sessionState))) ||
    !(state.viewState === undefined || ["set_entry", "rest", "exercise_complete", "session_review"].includes(String(state.viewState)))
  ) return null;
  return state as ActiveWorkoutState;
}

export function readActiveWorkoutState(userId: string) {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key(userId));
    if (!value) return null;
    const parsed = parseActiveWorkoutState(JSON.parse(value));
    if (!parsed) window.localStorage.removeItem(key(userId));
    return parsed;
  } catch {
    window.localStorage.removeItem(key(userId));
    return null;
  }
}

export function writeActiveWorkoutState(userId: string, state: ActiveWorkoutState) {
  if (typeof window === "undefined") return;
  const parsed = parseActiveWorkoutState(state);
  if (!parsed) throw new Error("Active workout cache state is invalid.");
  window.localStorage.setItem(key(userId), JSON.stringify(parsed));
  window.dispatchEvent(new CustomEvent(activeWorkoutEvent));
}

export function clearActiveWorkoutState(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(userId));
  window.dispatchEvent(new CustomEvent(activeWorkoutEvent));
}

export function activeWorkoutElapsed(state: ActiveWorkoutState, now = Date.now()) {
  const accumulated = Math.max(0, Math.floor(state.elapsedSeconds));
  if (state.paused) return accumulated;
  return accumulated + Math.max(0, Math.floor((now - state.startedAtMs) / 1000));
}

export function activeWorkoutCacheFromExecution(
  state: WorkoutSessionExecutionState,
  input: { route: string; label: string; controllerDeviceId?: string | null },
  now = Date.now()
): ActiveWorkoutState {
  const runningSince = state.session_running_since ? Date.parse(state.session_running_since) : Number.NaN;
  const restEndsAt = state.rest_ends_at ? Date.parse(state.rest_ends_at) : Number.NaN;
  return {
    sessionId: state.workout_session_id,
    route: input.route,
    label: input.label,
    startedAtMs: Number.isFinite(runningSince) ? runningSince : now,
    elapsedSeconds: Math.max(0, state.session_elapsed_seconds),
    paused: state.session_state === "paused",
    serverRevision: state.revision,
    stateVersion: state.state_version,
    activeSnapshotItemId: state.active_snapshot_item_id,
    activeItemOrder: state.active_item_order,
    activeSetNumber: state.active_set_number,
    sessionState: state.session_state,
    viewState: state.view_state,
    restEndsAtMs: Number.isFinite(restEndsAt) ? restEndsAt : null,
    controllerDeviceId: input.controllerDeviceId ?? state.controller_device_id
  };
}

export function resolveActiveWorkoutRoute(
  session: { id: string; plan_day_id?: string | null; workout_id: string | null },
  stored: ActiveWorkoutState | null
) {
  if (stored?.sessionId === session.id && isValidActiveWorkoutRoute(stored.route)) return stored.route;
  if (session.plan_day_id) return `/workouts/session/day/${session.plan_day_id}`;
  if (session.workout_id) return `/workouts/session/${session.workout_id}`;
  return "/workout-history";
}
