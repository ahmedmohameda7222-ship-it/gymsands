import { describe, expect, it, vi } from "vitest";
import type { Workout, WorkoutSession, WorkoutSessionExecutionState } from "@/types";
import type { ActiveSessionPersistenceAdapter } from "./persistence-adapter";
import {
  ActiveSessionTransportUncertainError,
  type SessionCommandRequest,
  type SessionCommandResponse
} from "../session-engine/contracts";
import { executionFixture, fixtureIds, prescriptionFixture } from "../session-engine/fixtures";
import { createActiveSessionStore } from "./store";

function root(status: WorkoutSession["status"] = "started"): WorkoutSession {
  return {
    id: fixtureIds.sessionId,
    user_id: fixtureIds.userId,
    workout_id: null,
    workout_name: "AW-4 fixture",
    started_at: "2026-07-26T08:00:00.000Z",
    completed_at: status === "completed" ? "2026-07-26T08:30:00.000Z" : null,
    duration_minutes: status === "completed" ? 30 : null,
    notes: null,
    status
  };
}

function response(
  request: SessionCommandRequest,
  state: WorkoutSessionExecutionState,
  outcome: SessionCommandResponse["outcome"] = "applied"
): SessionCommandResponse {
  return {
    schemaVersion: 1,
    workoutSessionId: request.workoutSessionId,
    commandId: request.commandId,
    commandType: request.commandType,
    outcome,
    replayed: false,
    expectedRevision: request.expectedRevision,
    revisionBefore: request.expectedRevision,
    revisionAfter: state.revision,
    reason: outcome === "applied" ? null : outcome,
    state
  };
}

function adapter(
  overrides: Partial<ActiveSessionPersistenceAdapter> = {}
): ActiveSessionPersistenceAdapter {
  return {
    loadSessionRoot: vi.fn(async () => root()),
    loadExecutionState: vi.fn(async () => executionFixture()),
    loadPrescription: vi.fn(async () => [prescriptionFixture()]),
    loadPerformedLogs: vi.fn(async () => []),
    dispatchExecutionCommand: vi.fn(async (request) =>
      response(request, executionFixture({
        revision: request.expectedRevision + 1,
        updated_at: "2026-07-26T08:00:01.000Z"
      }))),
    writeCanonicalSet: vi.fn(async () => undefined),
    completeSession: vi.fn(async () => root("completed")),
    replaceExercise: vi.fn(async () => ({})),
    skipExercise: vi.fn(async () => ({})),
    cancelSession: vi.fn(async () => root("cancelled")),
    ...overrides
  };
}

function pauseIntent(commandId = fixtureIds.commandId) {
  return {
    userId: fixtureIds.userId,
    workoutSessionId: fixtureIds.sessionId,
    commandId,
    commandType: "pause" as const,
    payload: { controller_device_id: fixtureIds.deviceId }
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("AW-4 official Active Workout store", () => {
  it("starts all canonical loads together and joins one hydration flight", async () => {
    const gate = deferred();
    const calls: string[] = [];
    const mock = adapter({
      loadSessionRoot: vi.fn(async () => { calls.push("root"); await gate.promise; return root(); }),
      loadExecutionState: vi.fn(async () => { calls.push("state"); await gate.promise; return executionFixture(); }),
      loadPrescription: vi.fn(async () => { calls.push("prescription"); await gate.promise; return [prescriptionFixture()]; }),
      loadPerformedLogs: vi.fn(async () => { calls.push("logs"); await gate.promise; return []; })
    });
    const store = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: mock
    });
    const first = store.hydrate();
    const second = store.hydrate();
    expect(first).toBe(second);
    await Promise.resolve();
    expect(calls.sort()).toEqual(["logs", "prescription", "root", "state"]);
    gate.resolve();
    await first;
    expect(store.getSnapshot().hydrationStatus).toBe("ready");
  });

  it("ignores stale generations and keeps independent store identities isolated", async () => {
    const firstGate = deferred();
    let stateLoad = 0;
    const mock = adapter({
      loadSessionRoot: vi.fn(async () => {
        const call = ++stateLoad;
        if (call === 1) await firstGate.promise;
        return root();
      }),
      loadExecutionState: vi.fn(async () =>
        executionFixture({ revision: stateLoad === 1 ? 0 : 2 })),
      loadPrescription: vi.fn(async () => [prescriptionFixture()]),
      loadPerformedLogs: vi.fn(async () => [])
    });
    const store = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: mock
    });
    const stale = store.hydrate();
    await Promise.resolve();
    const current = store.hydrate({ force: true });
    await current;
    expect(store.getSnapshot().executionState?.revision).toBe(2);
    firstGate.resolve();
    await stale;
    expect(store.getSnapshot().executionState?.revision).toBe(2);
  });

  it("rejects cross-user hydration and divergent equal revisions", async () => {
    const wrong = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: adapter({
        loadSessionRoot: vi.fn(async () => ({ ...root(), user_id: "other-user" }))
      })
    });
    await expect(wrong.hydrate()).rejects.toMatchObject({ code: "identity_mismatch" });

    const store = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: adapter()
    });
    await store.hydrate();
    expect(() => store.reconcile(executionFixture({ active_set_number: 2 })))
      .toThrow(/same revision/i);
  });

  it("notifies only selectors whose selected slice changed", async () => {
    const store = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: adapter()
    });
    await store.hydrate();
    const cursorListener = vi.fn();
    const surfaceListener = vi.fn();
    store.subscribeSelector(
      (value) => value.executionState?.active_set_number,
      cursorListener
    );
    store.subscribeSelector(
      (value) => value.presentationSurface,
      surfaceListener
    );
    store.setPresentationSurface("exercise_list");
    expect(cursorListener).not.toHaveBeenCalled();
    expect(surfaceListener).toHaveBeenCalledTimes(1);
    store.reconcile(executionFixture({
      revision: 1,
      active_set_number: 2,
      updated_at: "2026-07-26T08:00:01.000Z"
    }));
    expect(cursorListener).toHaveBeenCalledTimes(1);
    expect(surfaceListener).toHaveBeenCalledTimes(1);
  });

  it("imports only an identity-matched eligible legacy cache", async () => {
    const dispatch = vi.fn(async (request: SessionCommandRequest) =>
      response(request, executionFixture({
        revision: 1,
        bootstrap_source: "client_cache_import",
        updated_at: "2026-07-26T08:00:01.000Z"
      })));
    const store = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: adapter({
        loadExecutionState: vi.fn(async () =>
          executionFixture({ bootstrap_source: "legacy_backfill" })),
        dispatchExecutionCommand: dispatch
      }),
      commandId: () => fixtureIds.commandId
    });
    await store.hydrate({
      legacyCache: {
        userId: fixtureIds.userId,
        sessionId: fixtureIds.sessionId,
        startedAtMs: Date.parse("2026-07-26T07:59:00.000Z")
      }
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().executionState?.bootstrap_source)
      .toBe("client_cache_import");

    const untrusted = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: adapter({ dispatchExecutionCommand: dispatch })
    });
    await untrusted.hydrate({
      legacyCache: {
        userId: "another-user",
        sessionId: fixtureIds.sessionId,
        startedAtMs: Date.now() + 60_000
      }
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("retains the exact request only after transport uncertainty", async () => {
    const send = vi.fn(async (request: SessionCommandRequest) => {
      throw new ActiveSessionTransportUncertainError(request, new TypeError("lost"));
    });
    const store = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: adapter({ dispatchExecutionCommand: send })
    });
    await store.hydrate();
    await expect(store.dispatch(pauseIntent())).rejects
      .toBeInstanceOf(ActiveSessionTransportUncertainError);
    expect(store.getSnapshot().pendingTransportRequest).toMatchObject({
      commandId: fixtureIds.commandId,
      expectedRevision: 0,
      commandType: "pause"
    });
  });

  it("reconciles a confirmed saved set after execution synchronization fails", async () => {
    const savedLog = {
      id: "saved-log",
      workout_session_id: fixtureIds.sessionId,
      plan_exercise_id: prescriptionFixture().sourcePlanExerciseId,
      exercise_name: "AW-4 fixture",
      planned_sets: 2,
      planned_reps: null,
      planned_rest_seconds: 60,
      set_number: 1,
      reps: 8,
      weight_kg: 50,
      notes: null,
      completed_at: "2026-07-26T08:01:00.000Z",
      created_at: "2026-07-26T08:01:00.000Z"
    };
    const write = vi.fn(async () => undefined);
    const mock = adapter({
      writeCanonicalSet: write,
      dispatchExecutionCommand: vi.fn(async (request) =>
        response(request, executionFixture(), "revision_conflict")),
      loadPerformedLogs: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([savedLog]),
      loadExecutionState: vi.fn()
        .mockResolvedValueOnce(executionFixture())
        .mockResolvedValueOnce(executionFixture({
          revision: 1,
          updated_at: "2026-07-26T08:00:01.000Z"
        }))
    });
    const store = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: mock
    });
    await store.hydrate();
    await expect(store.completeCanonicalSet({
      logs: [{
        exerciseName: "AW-4 fixture",
        setNumber: 1,
        reps: 8,
        weightKg: 50
      }],
      executionIntent: pauseIntent()
    })).rejects.toMatchObject({
      code: "canonical_set_saved_execution_sync_failed"
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().performedLogs).toEqual([savedLog]);
    expect(store.getSnapshot().executionState?.revision).toBe(1);
    expect(store.getSnapshot().pendingTransportRequest).toBeNull();
  });

  it("cleans durable authority after confirmed terminal success", async () => {
    const clearCompatibilityCache = vi.fn();
    const store = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: adapter(),
      clearCompatibilityCache
    });
    await store.hydrate();
    await store.completeSession({ notes: "", durationMinutes: 30 });
    expect(store.getSnapshot()).toMatchObject({
      hydrationStatus: "terminal",
      executionState: null,
      presentationSurface: "completion"
    });
    expect(store.getSnapshot().finalProjection?.previousExecutionState.revision).toBe(0);
    expect(clearCompatibilityCache).toHaveBeenCalledTimes(1);
    await expect(store.dispatch(pauseIntent())).rejects
      .toMatchObject({ code: "terminal_mutation_attempt" });
  });

  it("routes replacement and skip through the identity-bound adapter and rehydrates", async () => {
    const replaceExercise = vi.fn(async () => ({}));
    const skipExercise = vi.fn(async () => ({}));
    const loadSessionRoot = vi.fn(async () => root());
    const mock = adapter({ replaceExercise, skipExercise, loadSessionRoot });
    const store = createActiveSessionStore({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      adapter: mock
    });
    await store.hydrate();
    const replacement = {
      id: fixtureIds.itemId,
      name: "Identity-bound replacement",
      catalog_source: null
    } as Workout;

    await store.replaceExercise({
      sourcePlanExerciseId: fixtureIds.itemId,
      replacement
    });
    expect(replaceExercise).toHaveBeenCalledWith({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      sourcePlanExerciseId: fixtureIds.itemId,
      replacement,
      controllerDeviceId: fixtureIds.deviceId
    });

    await store.skipExercise(fixtureIds.itemId, "user_skipped");
    expect(skipExercise).toHaveBeenCalledWith(
      fixtureIds.userId,
      fixtureIds.sessionId,
      fixtureIds.itemId,
      "user_skipped",
      fixtureIds.deviceId
    );
    expect(loadSessionRoot).toHaveBeenCalledTimes(3);
  });
});
