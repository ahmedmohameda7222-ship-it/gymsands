import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSessionExecutionState } from "@/types";
import {
  WorkoutSessionExecutionIdempotencyConflictError,
  WorkoutSessionExecutionRevisionConflictError
} from "@/lib/workouts/workout-session-execution";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";

function row(overrides: Partial<WorkoutSessionExecutionState> = {}): WorkoutSessionExecutionState {
  return {
    workout_session_id: sessionId,
    user_id: userId,
    state_version: 1,
    revision: 7,
    session_state: "active",
    view_state: "set_entry",
    active_snapshot_item_id: null,
    active_item_order: 1,
    active_set_number: 1,
    session_elapsed_seconds: 10,
    session_running_since: "2026-07-22T00:00:00.000Z",
    rest_started_at: null,
    rest_duration_seconds: null,
    rest_ends_at: null,
    controller_device_id: null,
    bootstrap_source: "legacy_backfill",
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
    ...overrides
  };
}

const mocks = vi.hoisted(() => {
  const state = {
    row: null as WorkoutSessionExecutionState | null,
    rpcOutcome: "applied" as "applied" | "no_op" | "revision_conflict" | "idempotency_conflict",
    rpcReason: null as string | null,
    filters: [] as Array<[string, unknown]>
  };
  const from = vi.fn(() => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((key: string, value: unknown) => { state.filters.push([key, value]); return builder; }),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: state.row, error: null }))
    };
    return builder;
  });
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    const current = state.row!;
    const outcome = state.rpcOutcome;
    const revisionAfter = outcome === "applied" ? current.revision + 1 : current.revision;
    const commandType = String(args.p_command_type);
    let next = { ...current, revision: revisionAfter } as WorkoutSessionExecutionState;
    if (outcome === "applied") {
      if (commandType === "pause") next = { ...next, session_state: "paused", session_running_since: null };
      if (commandType === "resume" || commandType === "reset_timer") next = { ...next, session_state: "active", view_state: "set_entry", session_running_since: "2026-07-22T00:01:00.000Z" };
      if (commandType === "start_rest" || commandType === "complete_set_transition") {
        const payload = args.p_payload as { view_state?: string; duration_seconds?: number; rest_duration_seconds?: number | null };
        if (commandType === "start_rest" || payload.view_state === "rest") {
          const duration = payload.duration_seconds ?? payload.rest_duration_seconds ?? 60;
          next = {
            ...next,
            view_state: "rest",
            rest_started_at: "2026-07-22T00:01:00.000Z",
            rest_duration_seconds: duration,
            rest_ends_at: "2026-07-22T00:02:00.000Z"
          };
        }
      }
      if (commandType === "clear_rest") next = { ...next, view_state: "set_entry", rest_started_at: null, rest_duration_seconds: null, rest_ends_at: null };
      if (commandType === "import_legacy_cache") next = { ...next, bootstrap_source: "client_cache_import" };
    }
    return {
      data: {
        schemaVersion: 1,
        workoutSessionId: args.p_workout_session_id,
        commandId: args.p_command_id,
        commandType: args.p_command_type,
        outcome,
        replayed: false,
        expectedRevision: args.p_expected_revision,
        revisionBefore: current.revision,
        revisionAfter,
        reason: state.rpcReason,
        state: next
      },
      error: null
    };
  });
  return { state, from, rpc };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

import {
  clearWorkoutSessionRestTimer,
  executeWorkoutSessionExecutionCommand,
  importLegacyWorkoutExecutionCache,
  persistWorkoutSessionAfterSetCompletion,
  persistWorkoutSessionCursor,
  persistWorkoutSessionPause,
  persistWorkoutSessionRestTimer,
  persistWorkoutSessionResume,
  persistWorkoutSessionTimerReset
} from "./workout-session-execution";

beforeEach(() => {
  mocks.state.row = row();
  mocks.state.rpcOutcome = "applied";
  mocks.state.rpcReason = null;
  mocks.state.filters = [];
  vi.clearAllMocks();
});

describe("AW-2B workout execution database service", () => {
  it("maps every mutation helper to the finite command authority with a UUID and latest revision", async () => {
    await persistWorkoutSessionCursor(userId, sessionId, { snapshotItemId: null, itemOrder: 1, setNumber: 2 });
    await persistWorkoutSessionAfterSetCompletion(userId, sessionId, {
      activeSnapshotItemId: null,
      activeItemOrder: 1,
      activeSetNumber: 2,
      viewState: "rest",
      restStartedAt: "client-ignored",
      restDurationSeconds: 60,
      restEndsAt: "client-ignored",
      controllerDeviceId: deviceId
    });
    await persistWorkoutSessionRestTimer(userId, sessionId, 90, deviceId);
    await clearWorkoutSessionRestTimer(userId, sessionId, "set_entry", deviceId);
    await persistWorkoutSessionTimerReset(userId, sessionId, deviceId);
    await persistWorkoutSessionPause(userId, sessionId, row(), deviceId);
    await persistWorkoutSessionResume(userId, sessionId, row({ session_state: "paused", session_running_since: null }), deviceId);
    await importLegacyWorkoutExecutionCache(userId, sessionId, row(), Date.parse("2026-07-21T23:55:00.000Z"), deviceId);

    expect(mocks.rpc.mock.calls.map((call) => call[1].p_command_type)).toEqual([
      "move_cursor",
      "complete_set_transition",
      "start_rest",
      "clear_rest",
      "reset_timer",
      "pause",
      "resume",
      "import_legacy_cache"
    ]);
    for (const [, args] of mocks.rpc.mock.calls) {
      expect(args.p_command_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(args.p_expected_revision).toBe(7);
    }
    expect(mocks.rpc.mock.calls[1]?.[1].p_payload).toEqual({
      active_snapshot_item_id: null,
      active_item_order: 1,
      active_set_number: 2,
      view_state: "rest",
      rest_duration_seconds: 60,
      controller_device_id: deviceId
    });
  });

  it("uses an explicit command ID unchanged for transport replay", async () => {
    const commandId = "44444444-4444-4444-8444-444444444444";
    await executeWorkoutSessionExecutionCommand({
      userId,
      workoutSessionId: sessionId,
      commandId,
      expectedRevision: 7,
      commandType: "resume",
      payload: { controller_device_id: deviceId }
    });
    expect(mocks.rpc).toHaveBeenCalledWith("apply_workout_session_execution_command_atomic", expect.objectContaining({
      p_command_id: commandId,
      p_expected_revision: 7,
      p_command_type: "resume"
    }));
  });

  it("returns applied and no-op authoritative states", async () => {
    await expect(executeWorkoutSessionExecutionCommand({
      userId,
      workoutSessionId: sessionId,
      commandId: "55555555-5555-4555-8555-555555555555",
      expectedRevision: 7,
      commandType: "resume",
      payload: { controller_device_id: null }
    })).resolves.toMatchObject({ outcome: "applied", revisionAfter: 8 });

    mocks.state.rpcOutcome = "no_op";
    mocks.state.rpcReason = "already_running";
    await expect(executeWorkoutSessionExecutionCommand({
      userId,
      workoutSessionId: sessionId,
      commandId: "66666666-6666-4666-8666-666666666666",
      expectedRevision: 7,
      commandType: "resume",
      payload: { controller_device_id: null }
    })).resolves.toMatchObject({ outcome: "no_op", revisionAfter: 7, reason: "already_running" });
  });

  it("raises typed revision and idempotency conflicts", async () => {
    mocks.state.rpcOutcome = "revision_conflict";
    mocks.state.rpcReason = "expected_revision_mismatch";
    await expect(executeWorkoutSessionExecutionCommand({
      userId,
      workoutSessionId: sessionId,
      commandId: "77777777-7777-4777-8777-777777777777",
      expectedRevision: 6,
      commandType: "pause",
      payload: { controller_device_id: null }
    })).rejects.toBeInstanceOf(WorkoutSessionExecutionRevisionConflictError);

    mocks.state.rpcOutcome = "idempotency_conflict";
    mocks.state.rpcReason = "command_id_reused_with_different_request";
    await expect(executeWorkoutSessionExecutionCommand({
      userId,
      workoutSessionId: sessionId,
      commandId: "88888888-8888-4888-8888-888888888888",
      expectedRevision: 7,
      commandType: "pause",
      payload: { controller_device_id: null }
    })).rejects.toBeInstanceOf(WorkoutSessionExecutionIdempotencyConflictError);
  });

  it("contains no authenticated direct UPDATE path", async () => {
    await persistWorkoutSessionTimerReset(userId, sessionId, null);
    expect(mocks.from).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const builder = mocks.from.mock.results[0]?.value as Record<string, unknown>;
    expect(builder).not.toHaveProperty("update");
  });
});
