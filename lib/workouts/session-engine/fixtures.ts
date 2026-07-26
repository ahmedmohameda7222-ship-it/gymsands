import type { WorkoutSessionExecutionState, WorkoutSessionPrescriptionItem } from "@/types";

export const fixtureIds = {
  userId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  itemId: "33333333-3333-4333-8333-333333333333",
  setId: "44444444-4444-4444-8444-444444444444",
  commandId: "55555555-5555-4555-8555-555555555555"
} as const;

export function executionFixture(
  overrides: Partial<WorkoutSessionExecutionState> = {}
): WorkoutSessionExecutionState {
  return {
    workout_session_id: fixtureIds.sessionId,
    user_id: fixtureIds.userId,
    state_version: 1,
    revision: 0,
    session_state: "active",
    view_state: "set_entry",
    active_snapshot_item_id: fixtureIds.itemId,
    active_item_order: 1,
    active_set_number: 1,
    session_elapsed_seconds: 10,
    session_running_since: "2026-07-26T08:00:00.000Z",
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
    created_at: "2026-07-26T08:00:00.000Z",
    updated_at: "2026-07-26T08:00:00.000Z",
    ...overrides
  };
}

export function prescriptionFixture(
  overrides: Partial<WorkoutSessionPrescriptionItem> = {}
): WorkoutSessionPrescriptionItem {
  return {
    snapshotId: "66666666-6666-4666-8666-666666666666",
    id: fixtureIds.itemId,
    workoutSessionId: fixtureIds.sessionId,
    userId: fixtureIds.userId,
    itemOrder: 1,
    sourcePlanExerciseId: "77777777-7777-4777-8777-777777777777",
    sourcePlanActivityId: null,
    activityName: "AW-4 fixture",
    rawCompatibilityPrescription: { sets: 2 },
    plannedSets: 2,
    executionState: "planned",
    normalizationStatus: "complete",
    prescriptionSets: [1, 2].map((setOrder) => ({
      id: setOrder === 1 ? fixtureIds.setId : "88888888-8888-4888-8888-888888888888",
      snapshotItemId: fixtureIds.itemId,
      snapshotId: "66666666-6666-4666-8666-666666666666",
      workoutSessionId: fixtureIds.sessionId,
      userId: fixtureIds.userId,
      setOrder,
      performedOrderHint: null,
      setType: "other",
      targetMode: "custom",
      sideMode: "none",
      restSeconds: 60,
      tempoTarget: null,
      schemaVersion: 1,
      createdAt: "2026-07-26T08:00:00.000Z",
      targets: []
    })),
    ...overrides
  };
}

export const transitionFixtureNames = [
  "active_set_entry",
  "active_rest",
  "active_exercise_complete",
  "review_session_review",
  "paused_set_entry",
  "paused_rest",
  "paused_bounded_activity",
  "active_unbounded_timed_set",
  "active_bounded_timed_set",
  "active_bounded_block",
  "terminal_completed",
  "terminal_skipped",
  "terminal_cancelled"
] as const;
