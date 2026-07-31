import { describe, expect, it, vi } from "vitest";
import type { ActiveSessionPersistenceAdapter } from "../active-session-store/persistence-adapter";
import {
  ActiveSessionError,
  ActiveSessionIdempotencyConflictError,
  ActiveSessionRevisionConflictError,
  ActiveSessionTransportUncertainError,
  type SessionCommandRequest,
  type SessionCommandResponse
} from "./contracts";
import {
  createSessionCommandDispatcher,
  dispatchWithTransportClassification
} from "./commands";
import { executionFixture, fixtureIds } from "./fixtures";

function response(
  request: SessionCommandRequest,
  revisionAfter: number,
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
    revisionAfter,
    reason: outcome === "applied" ? null : outcome,
    state: executionFixture({
      workout_session_id: request.workoutSessionId,
      user_id: request.userId,
      revision: revisionAfter,
      updated_at: `2026-07-26T08:00:0${revisionAfter}.000Z`
    })
  };
}

const pauseIntent = {
  userId: fixtureIds.userId,
  workoutSessionId: fixtureIds.sessionId,
  commandId: fixtureIds.commandId,
  commandType: "pause" as const,
  payload: { controller_device_id: fixtureIds.deviceId }
};

describe("AW-4 serialized command dispatcher", () => {
  it("serializes one session from the latest accepted revision", async () => {
    const observed: number[] = [];
    const adapter = {
      dispatchExecutionCommand: vi.fn(async (request: SessionCommandRequest) => {
        observed.push(request.expectedRevision);
        await Promise.resolve();
        return response(request, request.expectedRevision + 1);
      })
    };
    const dispatcher = createSessionCommandDispatcher(
      adapter as Pick<ActiveSessionPersistenceAdapter, "dispatchExecutionCommand">
    );
    dispatcher.replace(executionFixture());
    await Promise.all([
      dispatcher.dispatch(pauseIntent),
      dispatcher.dispatch({
        ...pauseIntent,
        commandId: "99999999-9999-4999-8999-999999999999",
        commandType: "resume"
      })
    ]);
    expect(observed).toEqual([0, 1]);
    expect(dispatcher.current(fixtureIds.userId, fixtureIds.sessionId)?.revision).toBe(2);
  });

  it("runs independent session lanes concurrently", async () => {
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondSessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const order: string[] = [];
    const dispatcher = createSessionCommandDispatcher({
      dispatchExecutionCommand: async (request) => {
        if (request.workoutSessionId === fixtureIds.sessionId) await firstBlocked;
        order.push(request.workoutSessionId);
        return response(request, request.expectedRevision + 1);
      }
    });
    dispatcher.replace(executionFixture());
    dispatcher.replace(executionFixture({ workout_session_id: secondSessionId }));
    const first = dispatcher.dispatch(pauseIntent);
    const second = dispatcher.dispatch({ ...pauseIntent, workoutSessionId: secondSessionId });
    await second;
    expect(order).toEqual([secondSessionId]);
    releaseFirst();
    await first;
  });

  it("reconciles authoritative conflicts without silent retry", async () => {
    const adapter = {
      dispatchExecutionCommand: vi.fn(async (request: SessionCommandRequest) =>
        response(request, 2, "revision_conflict"))
    };
    const dispatcher = createSessionCommandDispatcher(adapter);
    dispatcher.replace(executionFixture());
    await expect(dispatcher.dispatch(pauseIntent))
      .rejects.toBeInstanceOf(ActiveSessionRevisionConflictError);
    expect(adapter.dispatchExecutionCommand).toHaveBeenCalledTimes(1);
    expect(dispatcher.current(fixtureIds.userId, fixtureIds.sessionId)?.revision).toBe(2);
  });

  it("fails closed on command identity reuse", async () => {
    const dispatcher = createSessionCommandDispatcher({
      dispatchExecutionCommand: async (request) =>
        response(request, request.expectedRevision, "idempotency_conflict")
    });
    dispatcher.replace(executionFixture());
    await expect(dispatcher.dispatch(pauseIntent))
      .rejects.toBeInstanceOf(ActiveSessionIdempotencyConflictError);
  });

  it("retries transport uncertainty with the identical request", async () => {
    const request: SessionCommandRequest<"pause"> = {
      ...pauseIntent,
      expectedRevision: 0
    };
    const send = vi.fn()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce({ ...response(request, 1), replayed: true });
    let uncertain: ActiveSessionTransportUncertainError | null = null;
    try {
      await dispatchWithTransportClassification(request, send);
    } catch (error) {
      uncertain = error as ActiveSessionTransportUncertainError;
    }
    expect(uncertain).toBeInstanceOf(ActiveSessionTransportUncertainError);
    const replay = await dispatchWithTransportClassification(uncertain!.request, send);
    expect(replay.replayed).toBe(true);
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
  });

  it("surfaces adapter failures without changing canonical state", async () => {
    const dispatcher = createSessionCommandDispatcher({
      dispatchExecutionCommand: async () => {
        throw new Error("denied");
      }
    });
    dispatcher.replace(executionFixture());
    await expect(dispatcher.dispatch(pauseIntent)).rejects.toMatchObject({
      code: "adapter_failure"
    } satisfies Partial<ActiveSessionError>);
    expect(dispatcher.current(fixtureIds.userId, fixtureIds.sessionId)?.revision).toBe(0);
  });
});
