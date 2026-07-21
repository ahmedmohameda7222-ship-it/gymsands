"use client";

import { supabase } from "@/lib/supabase/client";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { isUuid } from "@/lib/utils";
import {
  createWorkoutSessionExecutionCommandId,
  executionElapsedSeconds,
  normalizeExecutionState,
  normalizeWorkoutSessionExecutionCommandResponse,
  WorkoutSessionExecutionIdempotencyConflictError,
  WorkoutSessionExecutionRevisionConflictError,
  type WorkoutSessionExecutionCommandPayloadByType,
  type WorkoutSessionExecutionCommandRequest,
  type WorkoutSessionExecutionCommandResponse,
  type WorkoutSessionExecutionCommandType,
  type WorkoutSessionExecutionCursorItem
} from "@/lib/workouts/workout-session-execution";
import type {
  WorkoutSessionExecutionState,
  WorkoutSessionExecutionViewState
} from "@/types";

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

function cloneState(state: WorkoutSessionExecutionState): WorkoutSessionExecutionState {
  return { ...state };
}

function applyMockTransition<T extends WorkoutSessionExecutionCommandType>(
  current: WorkoutSessionExecutionState,
  commandType: T,
  payload: WorkoutSessionExecutionCommandPayloadByType[T],
  now: Date
) {
  const next = cloneState(current);
  const elapsed = executionElapsedSeconds(current, now);
  const devicePayload = payload as { controller_device_id?: string | null };
  if (Object.prototype.hasOwnProperty.call(devicePayload, "controller_device_id")) {
    next.controller_device_id = devicePayload.controller_device_id ?? null;
  }

  switch (commandType) {
    case "move_cursor": {
      const typed = payload as WorkoutSessionExecutionCommandPayloadByType["move_cursor"];
      next.active_snapshot_item_id = typed.active_snapshot_item_id;
      next.active_item_order = Math.max(1, Math.floor(typed.active_item_order));
      next.active_set_number = Math.max(1, Math.floor(typed.active_set_number));
      if (typed.view_state) {
        next.view_state = typed.view_state;
        next.rest_started_at = null;
        next.rest_duration_seconds = null;
        next.rest_ends_at = null;
        if (typed.view_state === "session_review") {
          next.session_state = "review";
          next.session_elapsed_seconds = elapsed;
          next.session_running_since = now.toISOString();
        } else if (current.session_state === "review") {
          next.session_state = "active";
          next.session_elapsed_seconds = elapsed;
          next.session_running_since = now.toISOString();
        }
      }
      break;
    }
    case "complete_set_transition": {
      const typed = payload as WorkoutSessionExecutionCommandPayloadByType["complete_set_transition"];
      next.active_snapshot_item_id = typed.active_snapshot_item_id;
      next.active_item_order = Math.max(1, Math.floor(typed.active_item_order));
      next.active_set_number = Math.max(1, Math.floor(typed.active_set_number));
      next.view_state = typed.view_state;
      if (current.session_state === "review") {
        next.session_state = "active";
        next.session_elapsed_seconds = elapsed;
        next.session_running_since = now.toISOString();
      }
      if (typed.view_state === "rest") {
        const seconds = Math.min(86400, Math.max(0, Math.floor(typed.rest_duration_seconds ?? 0)));
        next.rest_started_at = now.toISOString();
        next.rest_duration_seconds = seconds;
        next.rest_ends_at = new Date(now.getTime() + seconds * 1000).toISOString();
      } else {
        next.rest_started_at = null;
        next.rest_duration_seconds = null;
        next.rest_ends_at = null;
      }
      break;
    }
    case "start_rest": {
      const typed = payload as WorkoutSessionExecutionCommandPayloadByType["start_rest"];
      const seconds = Math.min(86400, Math.max(0, Math.floor(typed.duration_seconds)));
      if (current.session_state === "review") {
        next.session_state = "active";
        next.session_elapsed_seconds = elapsed;
        next.session_running_since = now.toISOString();
      }
      next.view_state = "rest";
      next.rest_started_at = now.toISOString();
      next.rest_duration_seconds = seconds;
      next.rest_ends_at = new Date(now.getTime() + seconds * 1000).toISOString();
      break;
    }
    case "clear_rest": {
      const typed = payload as WorkoutSessionExecutionCommandPayloadByType["clear_rest"];
      next.view_state = typed.view_state;
      next.rest_started_at = null;
      next.rest_duration_seconds = null;
      next.rest_ends_at = null;
      if (typed.view_state === "session_review") {
        next.session_state = "review";
        next.session_elapsed_seconds = elapsed;
        next.session_running_since = now.toISOString();
      } else if (current.session_state === "review") {
        next.session_state = "active";
        next.session_elapsed_seconds = elapsed;
        next.session_running_since = now.toISOString();
      }
      break;
    }
    case "reset_timer":
      next.session_state = "active";
      if (next.view_state === "session_review") next.view_state = "set_entry";
      next.session_elapsed_seconds = 0;
      next.session_running_since = now.toISOString();
      break;
    case "pause":
      if (current.session_state === "review") throw new Error("A workout in session review cannot be paused.");
      if (current.session_state !== "paused") {
        next.session_state = "paused";
        next.session_elapsed_seconds = elapsed;
        next.session_running_since = null;
      }
      break;
    case "resume":
      if (current.session_state === "paused") {
        next.session_state = "active";
        next.session_running_since = now.toISOString();
      }
      break;
    case "import_legacy_cache": {
      const typed = payload as WorkoutSessionExecutionCommandPayloadByType["import_legacy_cache"];
      if (current.bootstrap_source !== "legacy_backfill" || current.revision !== 0) break;
      const startedAt = typed.cached_started_at ? Date.parse(typed.cached_started_at) : Number.NaN;
      const restEndsAt = typed.cached_rest_ends_at ? Date.parse(typed.cached_rest_ends_at) : Number.NaN;
      const nowValue = now.getTime();
      const validStart = Number.isFinite(startedAt) && startedAt >= nowValue - 24 * 60 * 60_000 && startedAt <= nowValue + 5 * 60_000;
      const cachedElapsed = validStart ? Math.max(0, Math.floor((nowValue - startedAt) / 1000)) : 0;
      const restDuration = typed.cached_rest_duration_seconds;
      const validRest = Number.isFinite(restEndsAt)
        && restDuration !== null
        && Number.isSafeInteger(restDuration)
        && restDuration >= 0
        && restDuration <= 86400
        && restEndsAt > nowValue
        && restEndsAt <= nowValue + 24 * 60 * 60_000;
      if (cachedElapsed > elapsed || validRest) {
        next.bootstrap_source = "client_cache_import";
        if (cachedElapsed > elapsed) {
          next.session_elapsed_seconds = cachedElapsed;
          if (next.session_state !== "paused") next.session_running_since = now.toISOString();
        }
        if (validRest && restDuration !== null) {
          if (next.session_state === "review") {
            next.session_state = "active";
            next.session_running_since = now.toISOString();
          }
          next.view_state = "rest";
          next.rest_duration_seconds = restDuration;
          next.rest_ends_at = new Date(restEndsAt).toISOString();
          next.rest_started_at = new Date(restEndsAt - restDuration * 1000).toISOString();
        }
      }
      break;
    }
  }
  if (
    (commandType === "pause" && current.session_state === "paused") ||
    (commandType === "resume" && current.session_state !== "paused") ||
    (commandType === "import_legacy_cache" && next.bootstrap_source === current.bootstrap_source)
  ) {
    next.controller_device_id = current.controller_device_id;
  }
  return requireNormalizedState(next);
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

  const candidate = applyMockTransition(current, request.commandType, request.payload, new Date());
  const changed = JSON.stringify({ ...candidate, revision: current.revision, updated_at: current.updated_at }) !== JSON.stringify(current);
  const next = changed
    ? requireNormalizedState({ ...candidate, revision: current.revision + 1, updated_at: new Date().toISOString() })
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
    reason: changed ? null : "no_effective_change",
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
  return executeWorkoutSessionExecutionCommand({
    userId,
    workoutSessionId: sessionId,
    commandId,
    expectedRevision: latest.revision,
    commandType,
    payload
  });
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

export type WorkoutSessionExecutionCursorRow = WorkoutSessionExecutionCursorItem & {
  sourcePlanActivityId: string | null;
  plannedSets: number | null;
};

export async function getWorkoutSessionExecutionCursorItems(userId: string, sessionId: string) {
  requireDatabaseIdentity(userId, sessionId);
  if (isMockAuthUserId(userId)) return [] as WorkoutSessionExecutionCursorRow[];
  const snapshotResult = await supabase!
    .from("workout_session_muscle_snapshots")
    .select("id")
    .eq("workout_session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (snapshotResult.error) throw snapshotResult.error;
  if (!snapshotResult.data?.id) throw new Error("The active workout snapshot could not be loaded.");
  const itemsResult = await supabase!
    .from("workout_session_muscle_snapshot_items")
    .select("id,item_order,source_plan_exercise_id,source_plan_activity_id,planned_sets")
    .eq("snapshot_id", snapshotResult.data.id)
    .eq("user_id", userId)
    .order("item_order", { ascending: true });
  if (itemsResult.error) throw itemsResult.error;
  return (itemsResult.data ?? []).map((item: { id: string; item_order: number; source_plan_exercise_id: string | null; source_plan_activity_id: string | null; planned_sets: number | null }) => ({
    id: item.id,
    itemOrder: item.item_order,
    sourcePlanExerciseId: item.source_plan_exercise_id,
    sourcePlanActivityId: item.source_plan_activity_id,
    plannedSets: item.planned_sets
  })) as WorkoutSessionExecutionCursorRow[];
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
  controllerDeviceId?: string | null
) {
  const response = await executeLatestCommand(userId, sessionId, "clear_rest", {
    view_state: viewState,
    ...(controllerDeviceId !== undefined ? { controller_device_id: controllerDeviceId } : {})
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
