export const activeWorkoutEvent = "plaivra:active-workout-changed";

export type ActiveWorkoutState = {
  sessionId: string;
  route: string;
  label: string;
  startedAtMs: number;
  elapsedSeconds: number;
  paused: boolean;
};

export function isValidActiveWorkoutRoute(route: string) {
  return /^\/workouts\/session\/(?:day\/)?[^/?#]+$/.test(route);
}

function key(userId: string) {
  return `plaivra.active-workout.${userId}`;
}

export function readActiveWorkoutState(userId: string) {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key(userId));
    return value ? JSON.parse(value) as ActiveWorkoutState : null;
  } catch {
    return null;
  }
}

export function writeActiveWorkoutState(userId: string, state: ActiveWorkoutState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(userId), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(activeWorkoutEvent));
}

export function clearActiveWorkoutState(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(userId));
  window.dispatchEvent(new CustomEvent(activeWorkoutEvent));
}

export function activeWorkoutElapsed(state: ActiveWorkoutState, now = Date.now()) {
  return state.paused ? state.elapsedSeconds : Math.max(0, Math.floor((now - state.startedAtMs) / 1000));
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
