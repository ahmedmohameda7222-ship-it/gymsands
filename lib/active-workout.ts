export const activeWorkoutEvent = "plaivra:active-workout-changed";

export type ActiveWorkoutState = {
  sessionId: string;
  route: string;
  label: string;
  startedAtMs: number;
  elapsedSeconds: number;
  paused: boolean;
};

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
