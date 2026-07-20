import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSessionExecutionState } from "@/types";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => {
  const state = {
    row: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
    filters: [] as Array<[string, unknown]>,
    update: null as Record<string, unknown> | null,
    table: ""
  };
  const from = vi.fn((table: string) => {
    state.table = table;
    state.filters = [];
    state.update = null;
    const builder = {
      select: vi.fn(() => builder),
      update: vi.fn((patch: Record<string, unknown>) => { state.update = patch; return builder; }),
      eq: vi.fn((key: string, value: unknown) => { state.filters.push([key, value]); return builder; }),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: state.row, error: state.error })),
      single: vi.fn(async () => ({
        data: state.row && state.update ? { ...state.row, ...state.update, revision: Number(state.row.revision) + 1 } : state.row,
        error: state.error
      }))
    };
    return builder;
  });
  return { state, from };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: { from: mocks.from } }));

import {
  clearWorkoutSessionRestTimer,
  getWorkoutSessionExecutionState,
  importLegacyWorkoutExecutionCache,
  persistWorkoutSessionPause,
  persistWorkoutSessionRestTimer,
  persistWorkoutSessionResume,
  persistWorkoutSessionTimerReset,
  sanitizeExecutionStatePatch,
  updateWorkoutSessionExecutionState
} from "./workout-session-execution";

function row(overrides: Partial<WorkoutSessionExecutionState> = {}): WorkoutSessionExecutionState {
  return {
    workout_session_id: sessionId,
    user_id: userId,
    state_version: 1,
    revision: 0,
    session_state: "active",
    view_state: "set_entry",
    active_snapshot_item_id: null,
    active_item_order: 1,
    active_set_number: 1,
    session_elapsed_seconds: 10,
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

beforeEach(() => {
  mocks.state.row = row();
  mocks.state.error = null;
  mocks.state.filters = [];
  mocks.state.update = null;
  vi.clearAllMocks();
});

describe("workout session execution database service", () => {
  it("scopes every execution-state read by owner and session", async () => {
    await expect(getWorkoutSessionExecutionState(userId, sessionId)).resolves.toMatchObject({ workout_session_id: sessionId });
    expect(mocks.state.table).toBe("workout_session_execution_states");
    expect(mocks.state.filters).toEqual([
      ["workout_session_id", sessionId],
      ["user_id", userId]
    ]);
  });

  it("surfaces database failures instead of fabricating authority", async () => {
    mocks.state.error = { message: "database unavailable" };
    await expect(getWorkoutSessionExecutionState(userId, sessionId)).rejects.toMatchObject({ message: "database unavailable" });
  });

  it("allows only typed mutable fields and returns the server revision", async () => {
    expect(() => sanitizeExecutionStatePatch({ revision: 4 } as never)).toThrow(/not writable/i);
    const result = await updateWorkoutSessionExecutionState(userId, sessionId, { active_set_number: 2 });
    expect(mocks.state.update).toEqual({ active_set_number: 2 });
    expect(mocks.state.filters).toEqual([
      ["workout_session_id", sessionId],
      ["user_id", userId]
    ]);
    expect(result.revision).toBe(1);
  });

  it("persists pause and resume with timestamp-based elapsed math", async () => {
    const current = row({ session_elapsed_seconds: 20, session_running_since: "2026-07-20T20:00:00.000Z" });
    await persistWorkoutSessionPause(userId, sessionId, current, "33333333-3333-4333-8333-333333333333", new Date("2026-07-20T20:00:10.000Z"));
    expect(mocks.state.update).toMatchObject({
      session_state: "paused",
      session_elapsed_seconds: 30,
      session_running_since: null
    });

    mocks.state.row = row({ session_state: "paused", session_running_since: null, session_elapsed_seconds: 30 });
    await persistWorkoutSessionResume(userId, sessionId, mocks.state.row as WorkoutSessionExecutionState, null, new Date("2026-07-20T20:01:00.000Z"));
    expect(mocks.state.update).toMatchObject({
      session_state: "active",
      session_elapsed_seconds: 30,
      session_running_since: "2026-07-20T20:01:00.000Z"
    });
  });

  it("persists timer reset and timestamp-based rest start/clear", async () => {
    await persistWorkoutSessionTimerReset(userId, sessionId, null, new Date("2026-07-20T20:02:00.000Z"));
    expect(mocks.state.update).toMatchObject({ session_elapsed_seconds: 0, session_running_since: "2026-07-20T20:02:00.000Z" });

    await persistWorkoutSessionRestTimer(userId, sessionId, 90, null, new Date("2026-07-20T20:03:00.000Z"));
    expect(mocks.state.update).toMatchObject({
      view_state: "rest",
      rest_started_at: "2026-07-20T20:03:00.000Z",
      rest_duration_seconds: 90,
      rest_ends_at: "2026-07-20T20:04:30.000Z"
    });

    await clearWorkoutSessionRestTimer(userId, sessionId);
    expect(mocks.state.update).toMatchObject({ view_state: "set_entry", rest_started_at: null, rest_duration_seconds: null, rest_ends_at: null });
  });

  it("imports only a plausible same-user/session initial legacy cache that increases elapsed time", async () => {
    const current = row({ bootstrap_source: "legacy_backfill", revision: 0, session_elapsed_seconds: 30, session_running_since: "2026-07-20T20:09:50.000Z" });
    const imported = await importLegacyWorkoutExecutionCache(
      userId,
      sessionId,
      current,
      Date.parse("2026-07-20T20:00:00.000Z"),
      null,
      new Date("2026-07-20T20:10:00.000Z")
    );
    expect(imported.imported).toBe(true);
    expect(mocks.state.update).toMatchObject({ bootstrap_source: "client_cache_import", session_elapsed_seconds: 600 });

    await expect(importLegacyWorkoutExecutionCache(
      "44444444-4444-4444-8444-444444444444",
      sessionId,
      current,
      Date.parse("2026-07-20T20:00:00.000Z"),
      null,
      new Date("2026-07-20T20:10:00.000Z")
    )).resolves.toMatchObject({ imported: false, reason: "identity_mismatch" });

    await expect(importLegacyWorkoutExecutionCache(
      userId,
      sessionId,
      current,
      Date.parse("2026-07-18T20:00:00.000Z"),
      null,
      new Date("2026-07-20T20:10:00.000Z")
    )).resolves.toMatchObject({ imported: false, reason: "invalid_or_implausible_cache" });
  });
});
