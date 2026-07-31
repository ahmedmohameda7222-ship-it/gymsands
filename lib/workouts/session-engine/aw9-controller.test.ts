import { describe, expect, it } from "vitest";

import {
  ActiveSessionControllerConflictError,
  type SessionCommandIntent,
} from "./contracts";
import { executionFixture, fixtureIds, prescriptionFixture } from "./fixtures";
import { reduceSessionCommand } from "./reducer";

const context = {
  userId: fixtureIds.userId,
  workoutSessionId: fixtureIds.sessionId,
  rootStatus: "started" as const,
  prescription: [prescriptionFixture()],
  performedLogs: [],
};

function intent(
  commandType: SessionCommandIntent["commandType"],
  payload: SessionCommandIntent["payload"],
) {
  return {
    userId: fixtureIds.userId,
    workoutSessionId: fixtureIds.sessionId,
    commandId: fixtureIds.commandId,
    commandType,
    payload,
  } as SessionCommandIntent;
}

describe("AW-9 controller authority", () => {
  it("claims an unowned session only through claim_control", () => {
    const state = executionFixture({ controller_device_id: null });
    const result = reduceSessionCommand(
      state,
      intent("claim_control", {
        controller_device_id: fixtureIds.deviceId,
        expected_controller_device_id: null,
        takeover: false,
      }),
      context,
      Date.now(),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.controller_device_id).toBe(fixtureIds.deviceId);
  });

  it("requires explicit takeover and the exact expected controller", () => {
    const otherDevice = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const state = executionFixture({ controller_device_id: otherDevice });
    expect(() =>
      reduceSessionCommand(
        state,
        intent("claim_control", {
          controller_device_id: fixtureIds.deviceId,
          expected_controller_device_id: otherDevice,
          takeover: false,
        }),
        context,
        Date.now(),
      ),
    ).toThrow(ActiveSessionControllerConflictError);
    expect(
      reduceSessionCommand(
        state,
        intent("claim_control", {
          controller_device_id: fixtureIds.deviceId,
          expected_controller_device_id: otherDevice,
          takeover: true,
        }),
        context,
        Date.now(),
      ).state.controller_device_id,
    ).toBe(fixtureIds.deviceId);
  });

  it("rejects ordinary commands from null or mismatched controllers", () => {
    expect(() =>
      reduceSessionCommand(
        executionFixture({ controller_device_id: null }),
        intent("pause", { controller_device_id: fixtureIds.deviceId }),
        context,
        Date.now(),
      ),
    ).toThrow(ActiveSessionControllerConflictError);
    expect(() =>
      reduceSessionCommand(
        executionFixture(),
        intent("pause", {
          controller_device_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
        context,
        Date.now(),
      ),
    ).toThrow(ActiveSessionControllerConflictError);
  });

  it("preserves the controller on every ordinary command", () => {
    const result = reduceSessionCommand(
      executionFixture(),
      intent("pause", { controller_device_id: fixtureIds.deviceId }),
      context,
      Date.now(),
    );
    expect(result.state.controller_device_id).toBe(fixtureIds.deviceId);
  });
});

