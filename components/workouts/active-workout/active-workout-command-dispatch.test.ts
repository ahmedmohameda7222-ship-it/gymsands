import { describe, expect, it, vi } from "vitest";

import type { ActiveSessionStore } from "@/lib/workouts/active-session-store/store";
import type { WorkoutSessionExecutionState } from "@/types";

import {
  dispatchActiveWorkoutExecutionAwaited,
  dispatchActiveWorkoutExecutionBackground,
  type ActiveWorkoutExecutionDispatchContext
} from "./active-workout-command-dispatch";

const deviceId = "33333333-3333-4333-8333-333333333333";
const state = {
  workout_session_id: "session-1",
  user_id: "user-1",
  revision: 2
} as WorkoutSessionExecutionState;

function setup(dispatch: ActiveSessionStore["dispatch"]) {
  const feedback = vi.fn();
  const toast = vi.fn();
  const rollback = vi.fn();
  const mirrorState = vi.fn();
  let nextCommandId = 0;
  const store = {
    getSnapshot: () => ({ executionState: state }),
    dispatch
  } as unknown as ActiveSessionStore;
  const context: ActiveWorkoutExecutionDispatchContext = {
    store,
    userId: "user-1",
    sessionId: "session-1",
    createCommandId: () => `command-${++nextCommandId}`,
    mirrorState,
    reportFailure: () => {
      feedback();
      toast();
    }
  };
  return { context, feedback, toast, rollback, mirrorState, dispatch };
}

describe("active workout command dispatch modes", () => {
  it("settles a rejected background command after one report and rollback", async () => {
    const error = new Error("offline");
    const dispatch = vi.fn().mockRejectedValue(error);
    const { context, feedback, toast, rollback } = setup(dispatch);
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);

    try {
      await expect(dispatchActiveWorkoutExecutionBackground(
        context,
        "clear_rest",
        { view_state: "set_entry", controller_device_id: deviceId },
        { rollback }
      )).resolves.toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", listener);
    }

    expect(feedback).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledWith(state);
    expect(unhandled).toEqual([]);
  });

  it("reports once and rejects an awaited command to caller recovery", async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error("offline"));
    const { context, feedback, toast } = setup(dispatch);
    const callerCatch = vi.fn();

    await dispatchActiveWorkoutExecutionAwaited(context, "pause", { controller_device_id: deviceId })
      .catch(callerCatch);

    expect(callerCatch).toHaveBeenCalledTimes(1);
    expect(feedback).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("mirrors each successful store response once and creates unique command IDs", async () => {
    const dispatch = vi.fn().mockResolvedValue({ state });
    const { context, mirrorState } = setup(dispatch);

    await dispatchActiveWorkoutExecutionAwaited(context, "pause", { controller_device_id: deviceId });
    await dispatchActiveWorkoutExecutionBackground(context, "resume", { controller_device_id: deviceId });

    expect(mirrorState).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(2);
    const firstIntent = dispatch.mock.calls[0]?.[0];
    const secondIntent = dispatch.mock.calls[1]?.[0];
    expect(firstIntent.commandId).not.toBe(secondIntent.commandId);
    expect(firstIntent.workoutSessionId).toBe("session-1");
    expect(secondIntent.workoutSessionId).toBe("session-1");
  });
});
