import { describe, expect, it } from "vitest";
import type { WorkoutSessionExecutionState } from "@/types";
import {
  executionCursorToIndexes,
  executionElapsedSeconds,
  executionRestSecondsLeft,
  executionStartedAtMs,
  normalizeExecutionState
} from "./workout-session-execution";

const now = Date.parse("2026-07-20T20:00:10.000Z");

function state(overrides: Partial<WorkoutSessionExecutionState> = {}): WorkoutSessionExecutionState {
  return {
    workout_session_id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    state_version: 1,
    revision: 0,
    session_state: "active",
    view_state: "set_entry",
    active_snapshot_item_id: "33333333-3333-4333-8333-333333333333",
    active_item_order: 1,
    active_set_number: 1,
    session_elapsed_seconds: 20,
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

describe("workout session execution helpers", () => {
  it("calculates active and paused elapsed time without negative values", () => {
    expect(executionElapsedSeconds(state(), now)).toBe(30);
    expect(executionElapsedSeconds(state({ session_state: "paused", session_running_since: null }), now)).toBe(20);
    expect(executionElapsedSeconds(state({ session_elapsed_seconds: -10 }), now)).toBe(10);
  });

  it("uses accumulated time when a running timestamp is invalid", () => {
    expect(executionElapsedSeconds(state({ session_running_since: "invalid" }), now)).toBe(20);
  });

  it("derives a reset-compatible start anchor", () => {
    expect(executionStartedAtMs(state({ session_elapsed_seconds: 0, session_running_since: new Date(now).toISOString() }), now)).toBe(now);
  });

  it("calculates active, expired, and invalid rest time", () => {
    expect(executionRestSecondsLeft(state({
      view_state: "rest",
      rest_started_at: "2026-07-20T20:00:00.000Z",
      rest_duration_seconds: 30,
      rest_ends_at: "2026-07-20T20:00:30.000Z"
    }), now)).toBe(20);
    expect(executionRestSecondsLeft(state({
      view_state: "rest",
      rest_started_at: "2026-07-20T19:59:00.000Z",
      rest_duration_seconds: 30,
      rest_ends_at: "2026-07-20T19:59:30.000Z"
    }), now)).toBe(0);
    expect(executionRestSecondsLeft(state({ view_state: "rest", rest_ends_at: "bad" }), now)).toBe(0);
  });

  it("maps a plan-day cursor by stable snapshot identity and source plan identity", () => {
    const result = executionCursorToIndexes(state({
      active_snapshot_item_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      active_item_order: 2,
      active_set_number: 3
    }), [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", itemOrder: 1, sourcePlanExerciseId: "plan-b" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", itemOrder: 2, sourcePlanExerciseId: "plan-a" }
    ], [{ id: "plan-a" }, { id: "plan-b" }]);
    expect(result).toMatchObject({ exerciseIndex: 0, setIndex: 2 });
  });

  it("maps a direct-session cursor by stable item order", () => {
    expect(executionCursorToIndexes(state({ active_snapshot_item_id: null, active_item_order: 1, active_set_number: 2 }), [
      { id: "direct", itemOrder: 1 }
    ])).toMatchObject({ exerciseIndex: 0, setIndex: 1 });
  });

  it("rejects malformed persisted rows instead of fabricating authority", () => {
    expect(normalizeExecutionState(state())).toEqual(state());
    expect(normalizeExecutionState({ ...state(), revision: -1 })).toBeNull();
    expect(normalizeExecutionState({ ...state(), session_state: "paused", session_running_since: "2026-07-20T20:00:00.000Z" })).toBeNull();
  });
});
