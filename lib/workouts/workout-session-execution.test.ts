import { describe, expect, it, vi } from "vitest";
import type { WorkoutSessionExecutionState } from "@/types";
import {
  createWorkoutSessionExecutionWriteQueue,
  executionCursorToIndexes,
  executionDurationMinutes,
  executionElapsedSeconds,
  executionRestSecondsLeft,
  executionStartedAtMs,
  normalizeExecutionState,
  persistCanonicalSetThenExecution,
  planWorkoutSessionAfterSetCompletion,
  WorkoutSessionExecutionSyncError
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

function accepted(current: WorkoutSessionExecutionState, patch: Partial<WorkoutSessionExecutionState>) {
  return state({ ...current, ...patch, revision: current.revision + 1 });
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
    expect(executionDurationMinutes(state({ session_state: "review", view_state: "session_review" }), now)).toBe(1);
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

describe("post-set transition planning", () => {
  const cursorItems = [
    { id: "item-a", itemOrder: 1, sourcePlanExerciseId: "plan-a" },
    { id: "item-b", itemOrder: 2, sourcePlanExerciseId: "plan-b" }
  ];
  const exercises = [{ id: "plan-a" }, { id: "plan-b" }];

  it("commits the automatic rest tuple and next cursor in one resulting patch", () => {
    const result = planWorkoutSessionAfterSetCompletion({
      exerciseIndex: 0,
      setIndex: 0,
      exerciseSetCounts: [2, 1],
      orderedSnapshotItems: cursorItems,
      dayExercises: exercises,
      restDurationSeconds: 90,
      controllerDeviceId: "device",
      now: new Date("2026-07-20T20:00:00.000Z")
    });
    expect(result).toEqual({
      hasNextSet: true,
      nextExerciseIndex: 0,
      nextSetIndex: 1,
      patch: {
        active_snapshot_item_id: "item-a",
        active_item_order: 1,
        active_set_number: 2,
        view_state: "rest",
        rest_started_at: "2026-07-20T20:00:00.000Z",
        rest_duration_seconds: 90,
        rest_ends_at: "2026-07-20T20:01:30.000Z",
        controller_device_id: "device"
      }
    });
  });

  it("persists the final set in a non-rest exercise-complete view", () => {
    const result = planWorkoutSessionAfterSetCompletion({
      exerciseIndex: 1,
      setIndex: 0,
      exerciseSetCounts: [2, 1],
      orderedSnapshotItems: cursorItems,
      dayExercises: exercises,
      restDurationSeconds: 90,
      controllerDeviceId: null
    });
    expect(result.hasNextSet).toBe(false);
    expect(result.patch).toMatchObject({
      active_snapshot_item_id: "item-b",
      active_item_order: 2,
      active_set_number: 1,
      view_state: "exercise_complete",
      rest_started_at: null,
      rest_duration_seconds: null,
      rest_ends_at: null
    });
  });

  it("does not write execution state when the canonical set log fails", async () => {
    const order: string[] = [];
    const persistExecutionState = vi.fn(async () => state());
    await expect(persistCanonicalSetThenExecution({
      saveCanonicalSet: async () => { order.push("log"); throw new Error("log failed"); },
      persistExecutionState
    })).rejects.toThrow("log failed");
    expect(order).toEqual(["log"]);
    expect(persistExecutionState).not.toHaveBeenCalled();
  });

  it("saves the canonical log before exactly one execution-state write", async () => {
    const order: string[] = [];
    const persistExecutionState = vi.fn(async () => { order.push("execution"); return state({ revision: 1 }); });
    await persistCanonicalSetThenExecution({
      saveCanonicalSet: async () => { order.push("log"); },
      persistExecutionState
    });
    expect(order).toEqual(["log", "execution"]);
    expect(persistExecutionState).toHaveBeenCalledTimes(1);
  });

  it("marks execution failure as post-save without fabricating an unsaved log", async () => {
    const saveCanonicalSet = vi.fn(async () => undefined);
    const error = await persistCanonicalSetThenExecution({
      saveCanonicalSet,
      persistExecutionState: async () => { throw new Error("execution failed"); }
    }).catch((caught) => caught);
    expect(saveCanonicalSet).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(WorkoutSessionExecutionSyncError);
    expect(error.canonicalSetSaved).toBe(true);
  });
});

describe("latest accepted execution-state queue", () => {
  it("preserves timer reset when session review is queued immediately afterward", async () => {
    const queue = createWorkoutSessionExecutionWriteQueue(state({ session_elapsed_seconds: 40 }));
    const reset = queue.enqueue(async (current) => accepted(current, { session_elapsed_seconds: 0, session_running_since: "2026-07-20T20:10:00.000Z" }));
    const review = queue.enqueue(async (current) => accepted(current, { session_state: "review", view_state: "session_review" }));
    await Promise.all([reset, review]);
    expect(queue.current()).toMatchObject({ session_elapsed_seconds: 0, session_state: "review", view_state: "session_review" });
  });

  it("uses the accepted rest update for review and return", async () => {
    const queue = createWorkoutSessionExecutionWriteQueue(state());
    await queue.enqueue(async (current) => accepted(current, {
      view_state: "rest",
      rest_started_at: "2026-07-20T20:00:00.000Z",
      rest_duration_seconds: 60,
      rest_ends_at: "2026-07-20T20:01:00.000Z"
    }));
    await queue.enqueue(async (current) => accepted(current, {
      session_state: "review",
      view_state: "session_review",
      rest_started_at: null,
      rest_duration_seconds: null,
      rest_ends_at: null
    }));
    await queue.enqueue(async (current) => accepted(current, { session_state: "active", view_state: "set_entry" }));
    expect(queue.current()).toMatchObject({ session_state: "active", view_state: "set_entry", rest_started_at: null });
  });

  it("serializes two cursor writes against the latest accepted row", async () => {
    const seen: number[] = [];
    const queue = createWorkoutSessionExecutionWriteQueue(state());
    const first = queue.enqueue(async (current) => {
      seen.push(current.active_set_number);
      return accepted(current, { active_set_number: 2 });
    });
    const second = queue.enqueue(async (current) => {
      seen.push(current.active_set_number);
      return accepted(current, { active_set_number: 3 });
    });
    await Promise.all([first, second]);
    expect(seen).toEqual([1, 2]);
    expect(queue.current()?.active_set_number).toBe(3);
  });

  it("does not advance authority on failure and lets the next valid write use the prior row", async () => {
    const queue = createWorkoutSessionExecutionWriteQueue(state({ active_set_number: 1 }));
    await expect(queue.enqueue(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    const next = await queue.enqueue(async (current) => accepted(current, { active_set_number: current.active_set_number + 1 }));
    expect(next.active_set_number).toBe(2);
    expect(queue.current()?.active_set_number).toBe(2);
  });
});
