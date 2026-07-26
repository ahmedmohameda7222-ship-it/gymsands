import { describe, expect, it } from "vitest";
import {
  ActiveSessionError,
  type SessionCommandIntent,
  type SessionCommandPayloadByType,
  type SessionCommandType
} from "./contracts";
import { executionFixture, fixtureIds, prescriptionFixture, transitionFixtureNames } from "./fixtures";
import { assertCursorInvariants, assertPrescriptionInvariants, normalizeExecutionState } from "./invariants";
import { reduceSessionCommand } from "./reducer";

const now = Date.parse("2026-07-26T08:01:00.000Z");
const context = {
  userId: fixtureIds.userId,
  workoutSessionId: fixtureIds.sessionId,
  rootStatus: "started" as const,
  prescription: [prescriptionFixture()],
  performedLogs: []
};

function intent<T extends SessionCommandType>(
  commandType: T,
  payload: SessionCommandPayloadByType[T]
) {
  return {
    userId: fixtureIds.userId,
    workoutSessionId: fixtureIds.sessionId,
    commandId: fixtureIds.commandId,
    commandType,
    payload
  } as SessionCommandIntent<T>;
}

describe("AW-4 session reducer", () => {
  it("keeps the required deterministic fixture matrix explicit", () => {
    expect(transitionFixtureNames).toHaveLength(13);
  });

  it("enters and leaves review without changing the canonical cursor", () => {
    const entered = reduceSessionCommand(executionFixture(), intent("move_cursor", {
      active_snapshot_item_id: fixtureIds.itemId,
      active_item_order: 1,
      active_set_number: 1,
      view_state: "session_review"
    }), context, now);
    expect(entered.state).toMatchObject({
      session_state: "review",
      view_state: "session_review",
      active_snapshot_item_id: fixtureIds.itemId,
      active_set_number: 1
    });
    const left = reduceSessionCommand(entered.state, intent("move_cursor", {
      active_snapshot_item_id: fixtureIds.itemId,
      active_item_order: 1,
      active_set_number: 1,
      view_state: "set_entry"
    }), context, now + 1000);
    expect(left.state).toMatchObject({ session_state: "active", view_state: "set_entry" });
  });

  it("plans rest, pause, and resume from injected time", () => {
    const resting = reduceSessionCommand(executionFixture(), intent("start_rest", {
      duration_seconds: 90,
      controller_device_id: null
    }), context, now);
    expect(resting.state).toMatchObject({
      view_state: "rest",
      rest_duration_seconds: 90,
      rest_ends_at: "2026-07-26T08:02:30.000Z"
    });
    const paused = reduceSessionCommand(resting.state, intent("pause", {
      controller_device_id: null
    }), context, now + 30_000);
    expect(paused.state).toMatchObject({
      session_state: "paused",
      session_running_since: null,
      rest_duration_seconds: 60
    });
    const resumed = reduceSessionCommand(paused.state, intent("resume", {
      controller_device_id: null
    }), context, now + 60_000);
    expect(resumed.state).toMatchObject({
      session_state: "active",
      rest_ends_at: "2026-07-26T08:03:00.000Z"
    });
  });

  it("starts, pauses, resumes, resets, and clears a bounded activity timer", () => {
    const started = reduceSessionCommand(executionFixture(), intent("start_activity_timer", {
      kind: "block",
      duration_seconds: 120,
      controller_device_id: null
    }), context, now);
    expect(started.state.activity_timer_ends_at).toBe("2026-07-26T08:03:00.000Z");
    const paused = reduceSessionCommand(started.state, intent("pause", {
      controller_device_id: null
    }), context, now + 30_000);
    expect(paused.state).toMatchObject({
      activity_timer_elapsed_seconds: 30,
      activity_timer_running_since: null,
      activity_timer_ends_at: null
    });
    const resumed = reduceSessionCommand(paused.state, intent("resume", {
      controller_device_id: null
    }), context, now + 60_000);
    expect(resumed.state.activity_timer_ends_at).toBe("2026-07-26T08:03:30.000Z");
    const reset = reduceSessionCommand(resumed.state, intent("reset_activity_timer", {
      controller_device_id: null
    }), context, now + 70_000);
    expect(reset.state.activity_timer_elapsed_seconds).toBe(0);
    expect(reduceSessionCommand(reset.state, intent("clear_activity_timer", {
      completion_reason: "completed",
      controller_device_id: null
    }), context, now + 80_000).state.activity_timer_kind).toBeNull();
  });

  it("classifies repeated pause and identical activity start as deterministic no-ops", () => {
    const paused = executionFixture({
      session_state: "paused",
      session_running_since: null
    });
    expect(reduceSessionCommand(paused, intent("pause", {
      controller_device_id: null
    }), context, now)).toMatchObject({ outcome: "no_op", reason: "already_paused" });
    const activeTimer = executionFixture({
      activity_timer_kind: "timed_set",
      activity_timer_running_since: "2026-07-26T08:00:00.000Z"
    });
    expect(reduceSessionCommand(activeTimer, intent("start_activity_timer", {
      kind: "timed_set",
      duration_seconds: null,
      controller_device_id: null
    }), context, now)).toMatchObject({
      outcome: "no_op",
      reason: "activity_timer_already_running"
    });
  });

  it("rejects terminal mutation, skipped items, cursor mismatch, and invalid set bounds", () => {
    expect(() => reduceSessionCommand(executionFixture(), intent("pause", {
      controller_device_id: null
    }), { ...context, rootStatus: "completed" }, now)).toThrow(/terminal/i);
    expect(() => assertCursorInvariants(executionFixture(), {
      ...context,
      prescription: [prescriptionFixture({ executionState: "skipped" })]
    })).toThrow(/terminal prescription/i);
    expect(() => assertCursorInvariants(executionFixture({
      active_snapshot_item_id: "99999999-9999-4999-8999-999999999999"
    }), context)).toThrow(/cursor/i);
    expect(() => assertCursorInvariants(executionFixture({
      active_set_number: 3
    }), context)).toThrow(/outside/i);
  });

  it("allows an explicit performed extra set only with canonical performed identity", () => {
    const extra = executionFixture({ active_set_number: 3 });
    expect(() => assertCursorInvariants(extra, {
      ...context,
      performedLogs: [{
        id: "log",
        workout_session_id: fixtureIds.sessionId,
        plan_exercise_id: context.prescription[0].sourcePlanExerciseId,
        exercise_name: "AW-4 fixture",
        planned_sets: 2,
        planned_reps: null,
        planned_rest_seconds: 60,
        set_number: 3,
        reps: 8,
        weight_kg: 50,
        notes: null,
        completed_at: "2026-07-26T08:00:00.000Z",
        created_at: "2026-07-26T08:00:00.000Z"
      }]
    })).not.toThrow();
  });

  it("fails closed on non-contiguous prescription items and sets", () => {
    expect(() => assertPrescriptionInvariants([
      prescriptionFixture({ itemOrder: 2 })
    ], fixtureIds.userId, fixtureIds.sessionId)).toThrow(/order/i);
    const broken = prescriptionFixture();
    broken.prescriptionSets[1] = { ...broken.prescriptionSets[1], setOrder: 3 };
    expect(() => assertPrescriptionInvariants(
      [broken],
      fixtureIds.userId,
      fixtureIds.sessionId
    )).toThrow(/non-contiguous/i);
  });

  it("normalizes all required timer fields and rejects corrupt tuples", () => {
    expect(normalizeExecutionState(executionFixture())).toEqual(executionFixture());
    expect(normalizeExecutionState(executionFixture({
      activity_timer_kind: "block",
      activity_timer_duration_seconds: 30,
      activity_timer_running_since: null,
      activity_timer_ends_at: null
    }))).toBeNull();
  });

  it("uses typed invalid-transition errors", () => {
    try {
      reduceSessionCommand(executionFixture(), intent("start_activity_timer", {
        kind: "block",
        duration_seconds: null,
        controller_device_id: null
      }), context, now);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ActiveSessionError);
      expect((error as ActiveSessionError).code).toBe("invalid_transition");
    }
  });
});
