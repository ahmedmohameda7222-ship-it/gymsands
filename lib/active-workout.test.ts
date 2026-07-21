import { describe, expect, it } from "vitest";
import {
  activeWorkoutCacheFromExecution,
  activeWorkoutElapsed,
  parseActiveWorkoutState,
  resolveActiveWorkoutRoute,
  type ActiveWorkoutState
} from "./active-workout";
import type { WorkoutSessionExecutionState } from "@/types";

const stored: ActiveWorkoutState = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  route: "/workouts/session/55555555-5555-4555-8555-555555555555",
  label: "Squat",
  startedAtMs: 1_000,
  elapsedSeconds: 20,
  paused: false
};

function executionState(overrides: Partial<WorkoutSessionExecutionState> = {}): WorkoutSessionExecutionState {
  return {
    workout_session_id: stored.sessionId,
    user_id: "99999999-9999-4999-8999-999999999999",
    state_version: 1,
    revision: 4,
    session_state: "active",
    view_state: "set_entry",
    active_snapshot_item_id: null,
    active_item_order: 1,
    active_set_number: 2,
    session_elapsed_seconds: 30,
    session_running_since: "2026-07-20T20:00:00.000Z",
    rest_started_at: null,
    rest_duration_seconds: null,
    rest_ends_at: null,
    controller_device_id: null,
    bootstrap_source: "session_start",
    created_at: "2026-07-20T20:00:00.000Z",
    updated_at: "2026-07-20T20:00:00.000Z",
    ...overrides
  };
}

describe("active workout compatibility cache", () => {
  it("preserves a validated stored route for the same owner-validated session", () => {
    expect(resolveActiveWorkoutRoute({ id: stored.sessionId, workout_id: null }, stored)).toBe(stored.route);
  });

  it("does not preserve a stored route for another session", () => {
    expect(resolveActiveWorkoutRoute({ id: "22222222-2222-4222-8222-222222222222", workout_id: null }, stored)).toBe("/workout-history");
  });

  it("accepts legacy cache rows but rejects malformed or unsafe rows", () => {
    expect(parseActiveWorkoutState(stored)).toEqual(stored);
    expect(parseActiveWorkoutState({ ...stored, route: "https://example.invalid" })).toBeNull();
    expect(parseActiveWorkoutState({ ...stored, activeSetNumber: 0 })).toBeNull();
    expect(parseActiveWorkoutState({ ...stored, serverRevision: -1 })).toBeNull();
  });

  it("derives elapsed time from accumulated seconds plus the running anchor", () => {
    expect(activeWorkoutElapsed(stored, 11_000)).toBe(30);
    expect(activeWorkoutElapsed({ ...stored, paused: true }, 99_000)).toBe(20);
  });

  it("mirrors authoritative server metadata without changing its authority", () => {
    const cache = activeWorkoutCacheFromExecution(executionState(), {
      route: stored.route,
      label: "Server workout",
      controllerDeviceId: "33333333-3333-4333-8333-333333333333"
    }, Date.parse("2026-07-20T20:00:10.000Z"));
    expect(cache).toMatchObject({
      sessionId: stored.sessionId,
      elapsedSeconds: 30,
      startedAtMs: Date.parse("2026-07-20T20:00:00.000Z"),
      serverRevision: 4,
      stateVersion: 1,
      activeSetNumber: 2,
      sessionState: "active",
      viewState: "set_entry",
      controllerDeviceId: "33333333-3333-4333-8333-333333333333"
    });
  });
});
