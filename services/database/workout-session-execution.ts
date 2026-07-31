"use client";

import { supabase } from "@/lib/supabase/client";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { isUuid } from "@/lib/utils";
import {
  createWorkoutSessionExecutionCommandId,
  normalizeExecutionState,
  normalizeWorkoutSessionExecutionCommandResponse,
  WorkoutSessionExecutionControllerConflictError,
  WorkoutSessionExecutionIdempotencyConflictError,
  WorkoutSessionExecutionRevisionConflictError,
  type WorkoutSessionExecutionCommandPayloadByType,
  type WorkoutSessionExecutionCommandRequest,
  type WorkoutSessionExecutionCommandResponse,
  type WorkoutSessionExecutionCommandType
} from "@/lib/workouts/workout-session-execution";
import {
  MAX_ACTIVITY_TIMER_DURATION_SECONDS,
  type ActivityTimerCompletionReason,
  type ActivityTimerKind,
  type RestCompletionReason,
  type SessionCommandIntent
} from "@/lib/workouts/session-engine/contracts";
import { reduceSessionCommand } from "@/lib/workouts/session-engine/reducer";
import type {
  WorkoutSessionExecutionState,
  WorkoutSessionExecutionViewState
} from "@/types";
import { getWorkoutSessionPrescriptionItems } from "@/services/database/workout-session-prescriptions";
import type { WorkoutSessionPrescriptionItem } from "@/types/workout-prescription";

const executionStateColumns = [
  "workout_session_id",
  "user_id",
  "state_version",
  "revision",
  "session_state",
  "view_state",
  "active_snapshot_item_id",
  "active_item_order",
  "active_set_number",
  "session_elapsed_seconds",
  "session_running_since",
  "rest_started_at",
  "rest_duration_seconds",
  "rest_ends_at",
  "activity_timer_kind",
  "activity_timer_elapsed_seconds",
  "activity_timer_running_since",
  "activity_timer_duration_seconds",
  "activity_timer_ends_at",
  "controller_device_id",
  "bootstrap_source",
  "created_at",
  "updated_at"
].join(",");

const mockStates = new Map<string, WorkoutSessionExecutionState>();
const mockReceipts = new Map<string, { fingerprint: string; response: WorkoutSessionExecutionCommandResponse }>();

function mockKey(userId: string, sessionId: string) {
  return `${userId}:${sessionId}`;
}

function mockReceiptKey(request: WorkoutSessionExecutionCommandRequest) {
  return `${request.userId}:${request.workoutSessionId}:${request.commandId}`;
}

function commandFingerprint(request: WorkoutSessionExecutionCommandRequest) {
  return JSON.stringify({
    workoutSessionId: request.workoutSessionId,
    userId: request.userId,
    commandId: request.commandId,
    commandType: request.commandType,
    expectedRevision: request.expectedRevision,
    payload: request.payload
  });
}

function mockState(userId: string, sessionId: string) {
  const key = mockKey(userId, sessionId);
  const existing = mockStates.get(key);
  if (existing) return existing;
  const timestamp = new Date().toISOString();
  const created: WorkoutSessionExecutionState = {
    workout_session_id: sessionId,
    user_id: userId,
    state_version: 1,
    revision: 0,
    session_state: "active",
    view_state: "set_entry",
    active_snapshot_item_id: null,
    active_item_order: 1,
    active_set_number: 1,
    session_elapsed_seconds: 0,
    session_running_since: timestamp,
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
    created_at: timestamp,
    updated_at: timestamp
  };
  mockStates.set(key, created);
  return created;
}

function requireDatabaseIdentity(userId: string, sessionId: string) {
  if (isMockAuthUserId(userId)) return;
  if (!supabase || !isUuid(userId) || !isUuid(sessionId)) {
    throw new Error("Workout execution state could not be loaded. Please refresh, sign in again, and try once more.");
  }
}

function requireNormalizedState(value: unknown) {
  const normalized = normalizeExecutionState(value);
  if (!normalized) throw new Error("Workout execution state returned an invalid persisted contract.");
  return normalized;
}

function mockPrescriptionForTransition<T extends WorkoutSessionExecutionCommandType>(
  current: WorkoutSessionExecutionState,
  commandType: T,
  payload: WorkoutSessionExecutionCommandPayloadByType[T]
): WorkoutSessionPrescriptionItem[] {
  const cursor = commandType === "move_cursor" || commandType === "complete_set_transition"
    ? payload as WorkoutSessionExecutionCommandPayloadByType["move_cursor"]
    : null;
  const activeId = cursor?.active_snapshot_item_id ?? current.active_snapshot_item_id;
  if (!activeId) return [];
  const activeOrder = cursor?.active_item_order ?? current.active_item_order;
  const activeSet = cursor?.active_set_number ?? current.active_set_number;
  return Array.from({ length: activeOrder }, (_, itemIndex) => {
    const itemOrder = itemIndex + 1;
    const itemId = itemOrder === activeOrder
      ? activeId
      : `mock-snapshot-item-${itemOrder}-${current.workout_session_id}`;
    const setCount = itemOrder === activeOrder ? Math.max(1, activeSet) : 1;
    return {
      snapshotId: `mock-snapshot-${current.workout_session_id}`,
      id: itemId,
      workoutSessionId: current.workout_session_id,
      userId: current.user_id,
      itemOrder,
      sourcePlanExerciseId: `mock-plan-exercise-${itemOrder}`,
      sourcePlanActivityId: null,
      activityName: `Mock activity ${itemOrder}`,
      rawCompatibilityPrescription: { sets: setCount },
      plannedSets: setCount,
      executionState: "planned",
      normalizationStatus: "partial",
      prescriptionSets: Array.from({ length: setCount }, (_, setIndex) => ({
        id: `mock-prescription-set-${itemOrder}-${setIndex + 1}-${current.workout_session_id}`,
        snapshotItemId: itemId,
        snapshotId: `mock-snapshot-${current.workout_session_id}`,
        workoutSessionId: current.workout_session_id,
        userId: current.user_id,
        setOrder: setIndex + 1,
        performedOrderHint: null,
        setType: "other",
        targetMode: "custom",
        sideMode: "none",
        restSeconds: null,
        tempoTarget: null,
        schemaVersion: 1,
        createdAt: current.created_at,
        targets: []
      }))
    };
  });
}

function applyMockTransition<T extends WorkoutSessionExecutionCommandType>(
  current: WorkoutSessionExecutionState,
  request: WorkoutSessionExecutionCommandRequest<T>,
  now: Date
) {
  return reduceSessionCommand(
    current,
    request as SessionCommandIntent,
    {
      userId: request.userId,
      workoutSessionId: request.workoutSessionId,
      rootStatus: "started",
      prescription: mockPrescriptionForTransition(
        current,
        request.commandType,
        request.payload
      ),
      performedLogs: []
    },
    now.getTime()
  );
}

async function executeMockCommand<T extends WorkoutSessionExecutionCommandType>(
  request: WorkoutSessionExecutionCommandRequest<T>
) {
  const receiptKey = mockReceiptKey(request);
  const fingerprint = commandFingerprint(request);
  const existing = mockReceipts.get(receiptKey);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      const conflict = {
        ...existing.response,
        commandType: request.commandType,
        expectedRevision: request.expectedRevision,
        outcome: "idempotency_conflict" as const,
        replayed: false,
        reason: "command_id_reused_with_different_request"
      };
      throw new WorkoutSessionExecutionIdempotencyConflictError(conflict);
    }
    return { ...existing.response, replayed: true };
  }

  const current = mockState(request.userId, request.workoutSessionId);
  if (current.revision !== request.expectedRevision) {
    const response: WorkoutSessionExecutionCommandResponse = {
      schemaVersion: 1,
      workoutSessionId: request.workoutSessionId,
      commandId: request.commandId,
      commandType: request.commandType,
      outcome: "revision_conflict",
      replayed: false,
      expectedRevision: request.expectedRevision,
      revisionBefore: current.revision,
      revisionAfter: current.revision,
      reason: "expected_revision_mismatch",
      state: current
    };
    mockReceipts.set(receiptKey, { fingerprint, response });
    throw new WorkoutSessionExecutionRevisionConflictError(response);
  }

  const transition = applyMockTransition(current, request, new Date());
  const changed = transition.outcome === "applied";
  const next = changed
    ? requireNormalizedState({
        ...transition.state,
        revision: current.revision + 1,
        updated_at: new Date().toISOString()
      })
    : current;
  if (changed) mockStates.set(mockKey(request.userId, request.workoutSessionId), next);
  const response: WorkoutSessionExecutionCommandResponse = {
    schemaVersion: 1,
    workoutSessionId: request.workoutSessionId,
    commandId: request.commandId,
    commandType: request.commandType,
    outcome: changed ? "applied" : "no_op",
    replayed: false,
    expectedRevision: request.expectedRevision,
    revisionBefore: current.revision,
    revisionAfter: next.revision,
    reason: transition.reason,
    state: next
  };
  mockReceipts.set(receiptKey, { fingerprint, response });
  return response;
}

export async function executeWorkoutSessionExecutionCommand<T extends WorkoutSessionExecutionCommandType>(
  request: WorkoutSessionExecutionCommandRequest<T>
) {
  requireDatabaseIdentity(request.userId, request.workoutSessionId);
  if (!isUuid(request.commandId) || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
    throw new Error("Workout execution command identity or expected revision is invalid.");
  }
  if (isMockAuthUserId(request.userId)) return executeMockCommand(request);

  const { data, error } = await supabase!.rpc("apply_workout_session_execution_command_atomic", {
    p_user_id: request.userId,
    p_workout_session_id: request.workoutSessionId,
    p_command_id: request.commandId,
    p_expected_revision: request.expectedRevision,
    p_command_type: request.commandType,
    p_payload: request.payload
  });
  if (error) throw error;
  const response = normalizeWorkoutSessionExecutionCommandResponse(data, request);
  if (response.outcome === "revision_conflict") {
    throw new WorkoutSessionExecutionRevisionConflictError(response);
  }
  if (response.outcome === "idempotency_conflict") {
    throw new WorkoutSessionExecutionIdempotencyConflictError(response);
  }
  if (response.outcome === "controller_conflict") {
    throw new WorkoutSessionExecutionControllerConflictError(response);
  }
  return response;
}

async function executeLatestCommand<T extends WorkoutSessionExecutionCommandType>(
  userId: string,
  sessionId: string,
  commandType: T,
  payload: WorkoutSessionExecutionCommandPayloadByType[T],
  commandId = createWorkoutSessionExecutionCommandId()
) {
  const latest = await requireWorkoutSessionExecutionState(userId, sessionId);
  const request = {
    userId,
    workoutSessionId: sessionId,
    commandId,
    expectedRevision: latest.revision,
    commandType,
    payload
  } as WorkoutSessionExecutionCommandRequest<T>;
  return executeWorkoutSessionExecutionCommand(request);
}

export async function getWorkoutSessionExecutionState(userId: string, sessionId: string) {
  requireDatabaseIdentity(userId, sessionId);
  if (isMockAuthUserId(userId)) return mockState(userId, sessionId);
  const { data, error } = await supabase!
    .from("workout_session_execution_states")
    .select(executionStateColumns)
    .eq("workout_session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? requireNormalizedState(data) : null;
}

export async function requireWorkoutSessionExecutionState(userId: string, sessionId: string) {
  const state = await getWorkoutSessionExecutionState(userId, sessionId);
  if (!state) throw new Error("The active workout has no persisted execution state.");
  return state;
}

export type WorkoutSessionExecutionCursorRow = WorkoutSessionPrescriptionItem;

export async function getWorkoutSessionExecutionCursorItems(userId: string, sessionId: string) {
  requireDatabaseIdentity(userId, sessionId);
  if (isMockAuthUserId(userId)) return [] as WorkoutSessionExecutionCursorRow[];
  return getWorkoutSessionPrescriptionItems(userId, sessionId);
}

export async function persistWorkoutSessionCursor(
  userId: string,
  sessionId: string,
  input: {
    snapshotItemId: string | null;
    itemOrder: number;
    setNumber: number;
    viewState?: Exclude<WorkoutSessionExecutionViewState, "rest">;
    controllerDeviceId?: string | null;
    currentState?: WorkoutSessionExecutionState | null;
    now?: Date;
  }
) {
  const response = await executeLatestCommand(userId, sessionId, "move_cursor", {
    active_snapshot_item_id: input.snapshotItemId,
    active_item_order: Math.max(1, Math.floor(input.itemOrder)),
    active_set_number: Math.max(1, Math.floor(input.setNumber)),
    ...(input.viewState ? { view_state: input.viewState } : {}),
    ...(input.controllerDeviceId !== undefined ? { controller_device_id: input.controllerDeviceId } : {})
  });
  return response.state;
}

export async function persistWorkoutSessionAfterSetCompletion(
  userId: string,
  sessionId: string,
  input: {
    activeSnapshotItemId: string | null;
    activeItemOrder: number;
    activeSetNumber: number;
    viewState: Exclude<WorkoutSessionExecutionViewState, "session_review">;
    restStartedAt: string | null;
    restDurationSeconds: number | null;
    restEndsAt: string | null;
    controllerDeviceId: string | null;
  }
) {
  const isRest = input.viewState === "rest";
  if (isRest !== (input.restDurationSeconds !== null)) {
    throw new Error("Workout set completion rest state is inconsistent.");
  }
  const response = await executeLatestCommand(userId, sessionId, "complete_set_transition", {
    active_snapshot_item_id: input.activeSnapshotItemId,
    active_item_order: Math.max(1, Math.floor(input.activeItemOrder)),
    active_set_number: Math.max(1, Math.floor(input.activeSetNumber)),
    view_state: input.viewState,
    rest_duration_seconds: input.restDurationSeconds === null
      ? null
      : Math.min(86400, Math.max(0, Math.floor(input.restDurationSeconds))),
    controller_device_id: input.controllerDeviceId
  });
  return response.state;
}

export async function persistWorkoutSessionRestTimer(
  userId: string,
  sessionId: string,
  durationSeconds: number,
  controllerDeviceId: string | null,
  _now = new Date()
) {
  const response = await executeLatestCommand(userId, sessionId, "start_rest", {
    duration_seconds: Math.min(86400, Math.max(0, Math.floor(durationSeconds))),
    controller_device_id: controllerDeviceId
  });
  return response.state;
}

export async function clearWorkoutSessionRestTimer(
  userId: string,
  sessionId: string,
  viewState: Exclude<WorkoutSessionExecutionViewState, "rest"> = "set_entry",
  controllerDeviceId?: string | null,
  completionReason?: RestCompletionReason
) {
  const response = await executeLatestCommand(userId, sessionId, "clear_rest", {
    view_state: viewState,
    ...(controllerDeviceId !== undefined ? { controller_device_id: controllerDeviceId } : {}),
    ...(completionReason !== undefined ? { completion_reason: completionReason } : {})
  });
  return response.state;
}

export async function persistWorkoutSessionActivityTimer(
  userId: string,
  sessionId: string,
  kind: ActivityTimerKind,
  durationSeconds: number | null,
  controllerDeviceId: string | null
) {
  if (kind === "block" && durationSeconds === null) {
    throw new Error("A block activity timer requires a bounded duration.");
  }
  const response = await executeLatestCommand(userId, sessionId, "start_activity_timer", {
    kind,
    duration_seconds: durationSeconds === null
      ? null
      : Math.min(
          MAX_ACTIVITY_TIMER_DURATION_SECONDS,
          Math.max(0, Math.floor(durationSeconds))
        ),
    controller_device_id: controllerDeviceId
  });
  return response.state;
}

export async function clearWorkoutSessionActivityTimer(
  userId: string,
  sessionId: string,
  completionReason: ActivityTimerCompletionReason,
  controllerDeviceId: string | null
) {
  const response = await executeLatestCommand(userId, sessionId, "clear_activity_timer", {
    completion_reason: completionReason,
    controller_device_id: controllerDeviceId
  });
  return response.state;
}

export async function persistWorkoutSessionActivityTimerReset(
  userId: string,
  sessionId: string,
  controllerDeviceId: string | null
) {
  const response = await executeLatestCommand(userId, sessionId, "reset_activity_timer", {
    controller_device_id: controllerDeviceId
  });
  return response.state;
}

export async function persistWorkoutSessionTimerReset(
  userId: string,
  sessionId: string,
  controllerDeviceId: string | null,
  _now = new Date()
) {
  const response = await executeLatestCommand(userId, sessionId, "reset_timer", {
    controller_device_id: controllerDeviceId
  });
  return response.state;
}

export async function persistWorkoutSessionPause(
  userId: string,
  sessionId: string,
  current: WorkoutSessionExecutionState,
  controllerDeviceId: string | null,
  _now = new Date()
) {
  if (current.session_state === "review") throw new Error("A workout in session review cannot be paused.");
  const response = await executeLatestCommand(userId, sessionId, "pause", {
    controller_device_id: controllerDeviceId
  });
  return response.state;
}

export async function persistWorkoutSessionResume(
  userId: string,
  sessionId: string,
  _current: WorkoutSessionExecutionState,
  controllerDeviceId: string | null,
  _now = new Date()
) {
  const response = await executeLatestCommand(userId, sessionId, "resume", {
    controller_device_id: controllerDeviceId
  });
  return response.state;
}

export async function importLegacyWorkoutExecutionCache(
  userId: string,
  sessionId: string,
  current: WorkoutSessionExecutionState,
  cachedStartedAtMs: number | null,
  controllerDeviceId: string | null,
  _now = new Date(),
  cachedRest?: { endsAtMs: number | null; durationSeconds: number | null }
) {
  if (current.user_id !== userId || current.workout_session_id !== sessionId) {
    return { imported: false, state: current, reason: "identity_mismatch" as const };
  }
  const response = await executeLatestCommand(userId, sessionId, "import_legacy_cache", {
    cached_started_at: Number.isFinite(cachedStartedAtMs) && cachedStartedAtMs !== null
      ? new Date(cachedStartedAtMs).toISOString()
      : null,
    cached_rest_ends_at: Number.isFinite(cachedRest?.endsAtMs) && cachedRest?.endsAtMs !== null && cachedRest?.endsAtMs !== undefined
      ? new Date(cachedRest.endsAtMs).toISOString()
      : null,
    cached_rest_duration_seconds: cachedRest?.durationSeconds ?? null,
    controller_device_id: controllerDeviceId
  });
  return {
    imported: response.outcome === "applied",
    state: response.state,
    reason: response.outcome === "applied" ? null : response.reason
  };
}
