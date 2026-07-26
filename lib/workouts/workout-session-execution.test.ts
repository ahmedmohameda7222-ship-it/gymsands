import { describe, expect, it } from "vitest";
import type { WorkoutSessionExecutionState } from "@/types";
import {
  createWorkoutSessionExecutionCommandId,
  executionCursorToIndexes,
  executionDurationMinutes,
  executionElapsedSeconds,
  executionRestSecondsLeft,
  executionStartedAtMs,
  normalizeExecutionState,
  normalizeWorkoutSessionExecutionCommandResponse,
  planWorkoutSessionAfterSetCompletion,
  type WorkoutSessionExecutionCommandResponse
} from "./workout-session-execution";

const now = Date.parse("2026-07-20T20:00:10.000Z");
const sessionId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const commandId = "44444444-4444-4444-8444-444444444444";

function state(overrides: Partial<WorkoutSessionExecutionState> = {}): WorkoutSessionExecutionState {
  return {
    workout_session_id: sessionId,
    user_id: userId,
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
    activity_timer_kind: null,
    activity_timer_elapsed_seconds: 0,
    activity_timer_running_since: null,
    activity_timer_duration_seconds: null,
    activity_timer_ends_at: null,
    controller_device_id: null,
    bootstrap_source: "session_start",
    created_at: "2026-07-20T20:00:00.000Z",
    updated_at: "2026-07-20T20:00:00.000Z",
    ...overrides
  };
}

function response(overrides: Partial<WorkoutSessionExecutionCommandResponse> = {}): WorkoutSessionExecutionCommandResponse {
  const next = state({ revision: 1, updated_at: "2026-07-20T20:00:01.000Z" });
  return {
    schemaVersion: 1,
    workoutSessionId: sessionId,
    commandId,
    commandType: "move_cursor",
    outcome: "applied",
    replayed: false,
    expectedRevision: 0,
    revisionBefore: 0,
    revisionAfter: 1,
    reason: null,
    state: next,
    ...overrides
  };
}

describe("workout session execution helpers", () => {
  it("calculates active and paused elapsed time without negative values", () => {
    expect(executionElapsedSeconds(state(), now)).toBe(30);
    expect(executionElapsedSeconds(state({ session_state: "paused", session_running_since: null }), now)).toBe(20);
    expect(executionElapsedSeconds(state({ session_elapsed_seconds: -10 }), now)).toBe(10);
  });

  it("projects paused duration from frozen authoritative elapsed time", () => {
    const paused = state({ session_state: "paused", session_elapsed_seconds: 121, session_running_since: null });
    expect(executionDurationMinutes(paused, new Date("2026-07-20T20:00:00.000Z"))).toBe(3);
    expect(executionDurationMinutes(paused, new Date("2026-07-20T23:00:00.000Z"))).toBe(3);
    expect(executionDurationMinutes(state({ session_state: "active", session_elapsed_seconds: 0 }), now)).toBe(1);
  });

  it("derives cursor, rest, and reset-compatible timer projections", () => {
    expect(executionStartedAtMs(state({ session_elapsed_seconds: 0, session_running_since: new Date(now).toISOString() }), now)).toBe(now);
    expect(executionRestSecondsLeft(state({
      view_state: "rest",
      rest_started_at: "2026-07-20T20:00:00.000Z",
      rest_duration_seconds: 30,
      rest_ends_at: "2026-07-20T20:00:30.000Z"
    }), now)).toBe(20);
    expect(executionCursorToIndexes(state({ active_item_order: 2, active_set_number: 3 }), [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", itemOrder: 1, sourcePlanExerciseId: "plan-b" },
      { id: "33333333-3333-4333-8333-333333333333", itemOrder: 2, sourcePlanExerciseId: "plan-a" }
    ], [{ id: "plan-a" }, { id: "plan-b" }])).toMatchObject({ exerciseIndex: 0, setIndex: 2 });
  });

  it("rejects malformed state and generates exact injected UUID command IDs", () => {
    expect(normalizeExecutionState(state())).toEqual(state());
    expect(normalizeExecutionState({ ...state(), revision: -1 })).toBeNull();
    expect(normalizeExecutionState({ ...state(), session_state: "paused", session_running_since: "2026-07-20T20:00:00.000Z" })).toBeNull();
    expect(createWorkoutSessionExecutionCommandId(() => commandId)).toBe(commandId);
    expect(() => createWorkoutSessionExecutionCommandId(() => "timestamp-123")).toThrow(/random UUID/i);
  });
});

describe("command response normalization", () => {
  it("accepts applied, no-op, replay, and revision-conflict envelopes", () => {
    expect(normalizeWorkoutSessionExecutionCommandResponse(response(), {
      workoutSessionId: sessionId,
      commandId,
      commandType: "move_cursor"
    }).outcome).toBe("applied");

    const unchanged = state({ revision: 2, updated_at: "2026-07-20T20:00:02.000Z" });
    expect(normalizeWorkoutSessionExecutionCommandResponse(response({
      outcome: "no_op",
      expectedRevision: 2,
      revisionBefore: 2,
      revisionAfter: 2,
      reason: "already_running",
      state: unchanged
    })).outcome).toBe("no_op");
    expect(normalizeWorkoutSessionExecutionCommandResponse(response({ replayed: true })).replayed).toBe(true);
    expect(normalizeWorkoutSessionExecutionCommandResponse(response({
      outcome: "revision_conflict",
      expectedRevision: 0,
      revisionBefore: 2,
      revisionAfter: 2,
      reason: "expected_revision_mismatch",
      state: unchanged
    })).state.revision).toBe(2);
  });

  it("rejects malformed, mismatched, and impossible revision envelopes", () => {
    expect(() => normalizeWorkoutSessionExecutionCommandResponse({ ...response(), commandId: "bad" })).toThrow(/identity|revision/i);
    expect(() => normalizeWorkoutSessionExecutionCommandResponse(response(), {
      workoutSessionId: "55555555-5555-4555-8555-555555555555",
      commandId,
      commandType: "move_cursor"
    })).toThrow(/request identity/i);
    expect(() => normalizeWorkoutSessionExecutionCommandResponse(response({ revisionAfter: 2, state: state({ revision: 2 }) }))).toThrow(/exactly once/i);
    expect(() => normalizeWorkoutSessionExecutionCommandResponse(response({ outcome: "unknown" as never }))).toThrow(/invalid persisted contract/i);
  });
});

describe("post-set transition planning and truthful ordering", () => {
  const cursorItems = [
    { id: "item-a", itemOrder: 1, sourcePlanExerciseId: "plan-a" },
    { id: "item-b", itemOrder: 2, sourcePlanExerciseId: "plan-b" }
  ];
  const exercises = [{ id: "plan-a" }, { id: "plan-b" }];

  it("plans duration-only server rest intent and a final non-rest transition", () => {
    const resting = planWorkoutSessionAfterSetCompletion({
      exerciseIndex: 0,
      setIndex: 0,
      exerciseSetCounts: [2, 1],
      orderedSnapshotItems: cursorItems,
      dayExercises: exercises,
      restDurationSeconds: 90,
      controllerDeviceId: commandId,
      now: new Date("2026-07-20T20:00:00.000Z")
    });
    expect(resting.patch).toMatchObject({ active_set_number: 2, view_state: "rest", rest_duration_seconds: 90 });

    const complete = planWorkoutSessionAfterSetCompletion({
      exerciseIndex: 1,
      setIndex: 0,
      exerciseSetCounts: [2, 1],
      orderedSnapshotItems: cursorItems,
      dayExercises: exercises,
      restDurationSeconds: 90,
      controllerDeviceId: null
    });
    expect(complete).toMatchObject({ hasNextSet: false, patch: { view_state: "exercise_complete", rest_duration_seconds: null } });
  });

});
