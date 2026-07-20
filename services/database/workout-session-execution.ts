"use client";

import { supabase } from "@/lib/supabase/client";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { isUuid } from "@/lib/utils";
import {
  executionElapsedSeconds,
  normalizeExecutionState,
  type WorkoutSessionExecutionCursorItem
} from "@/lib/workouts/workout-session-execution";
import type {
  WorkoutSessionExecutionState,
  WorkoutSessionExecutionStatePatch,
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

const patchFields = new Set<keyof WorkoutSessionExecutionStatePatch>([
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
  "bootstrap_source"
]);

const mockStates = new Map<string, WorkoutSessionExecutionState>();

function mockKey(userId: string, sessionId: string) {
  return `${userId}:${sessionId}`;
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

export function sanitizeExecutionStatePatch(patch: WorkoutSessionExecutionStatePatch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Workout execution update is invalid.");
  }
  const result: WorkoutSessionExecutionStatePatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!patchFields.has(key as keyof WorkoutSessionExecutionStatePatch)) {
      throw new Error(`Workout execution field is not writable: ${key}`);
    }
    (result as Record<string, unknown>)[key] = value;
  }
  if (!Object.keys(result).length) throw new Error("Workout execution update is empty.");
  return result;
}

function requireNormalizedState(value: unknown) {
  const normalized = normalizeExecutionState(value);
  if (!normalized) throw new Error("Workout execution state returned an invalid persisted contract.");
  return normalized;
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

export async function updateWorkoutSessionExecutionState(
  userId: string,
  sessionId: string,
  typedPatch: WorkoutSessionExecutionStatePatch
) {
  requireDatabaseIdentity(userId, sessionId);
  const patch = sanitizeExecutionStatePatch(typedPatch);
  if (isMockAuthUserId(userId)) {
    const current = mockState(userId, sessionId);
    const updated = requireNormalizedState({
      ...current,
      ...patch,
      revision: current.revision + 1,
      updated_at: new Date().toISOString()
    });
    mockStates.set(mockKey(userId, sessionId), updated);
    return updated;
  }
  const { data, error } = await supabase!
    .from("workout_session_execution_states")
    .update(patch)
    .eq("workout_session_id", sessionId)
    .eq("user_id", userId)
    .select(executionStateColumns)
    .single();
  if (error) throw error;
  return requireNormalizedState(data);
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
  const patch: WorkoutSessionExecutionStatePatch = {
    active_snapshot_item_id: input.snapshotItemId,
    active_item_order: Math.max(1, Math.floor(input.itemOrder)),
    active_set_number: Math.max(1, Math.floor(input.setNumber))
  };
  if (input.controllerDeviceId !== undefined) {
    patch.controller_device_id = input.controllerDeviceId;
  }
  if (input.viewState) {
    patch.view_state = input.viewState;
    const current = input.currentState ?? null;
    const now = input.now ?? new Date();
    if (input.viewState === "session_review") {
      if (!current) throw new Error("Current execution state is required to enter session review.");
      patch.session_state = "review";
      patch.session_elapsed_seconds = executionElapsedSeconds(current, now);
      patch.session_running_since = now.toISOString();
      patch.rest_started_at = null;
      patch.rest_duration_seconds = null;
      patch.rest_ends_at = null;
    } else if (current?.session_state === "review") {
      patch.session_state = "active";
      patch.session_elapsed_seconds = executionElapsedSeconds(current, now);
      patch.session_running_since = now.toISOString();
    }
  }
  return updateWorkoutSessionExecutionState(userId, sessionId, patch);
}

export async function persistWorkoutSessionRestTimer(
  userId: string,
  sessionId: string,
  durationSeconds: number,
  controllerDeviceId: string | null,
  now = new Date()
) {
  const seconds = Math.min(86400, Math.max(0, Math.floor(durationSeconds)));
  const startedAt = now.toISOString();
  const endsAt = new Date(now.getTime() + seconds * 1000).toISOString();
  return updateWorkoutSessionExecutionState(userId, sessionId, {
    view_state: "rest",
    rest_started_at: startedAt,
    rest_duration_seconds: seconds,
    rest_ends_at: endsAt,
    controller_device_id: controllerDeviceId
  });
}

export async function clearWorkoutSessionRestTimer(
  userId: string,
  sessionId: string,
  viewState: Exclude<WorkoutSessionExecutionViewState, "rest"> = "set_entry",
  controllerDeviceId?: string | null
) {
  const patch: WorkoutSessionExecutionStatePatch = {
    view_state: viewState,
    rest_started_at: null,
    rest_duration_seconds: null,
    rest_ends_at: null
  };
  if (controllerDeviceId !== undefined) patch.controller_device_id = controllerDeviceId;
  if (viewState === "session_review") patch.session_state = "review";
  return updateWorkoutSessionExecutionState(userId, sessionId, patch);
}

export async function persistWorkoutSessionTimerReset(
  userId: string,
  sessionId: string,
  controllerDeviceId: string | null,
  now = new Date()
) {
  return updateWorkoutSessionExecutionState(userId, sessionId, {
    session_state: "active",
    session_elapsed_seconds: 0,
    session_running_since: now.toISOString(),
    controller_device_id: controllerDeviceId
  });
}

export async function persistWorkoutSessionPause(
  userId: string,
  sessionId: string,
  current: WorkoutSessionExecutionState,
  controllerDeviceId: string | null,
  now = new Date()
) {
  if (current.session_state === "review") throw new Error("A workout in session review cannot be paused.");
  return updateWorkoutSessionExecutionState(userId, sessionId, {
    session_state: "paused",
    session_elapsed_seconds: executionElapsedSeconds(current, now),
    session_running_since: null,
    controller_device_id: controllerDeviceId
  });
}

export async function persistWorkoutSessionResume(
  userId: string,
  sessionId: string,
  current: WorkoutSessionExecutionState,
  controllerDeviceId: string | null,
  now = new Date()
) {
  return updateWorkoutSessionExecutionState(userId, sessionId, {
    session_state: current.view_state === "session_review" ? "review" : "active",
    session_elapsed_seconds: Math.max(0, current.session_elapsed_seconds),
    session_running_since: now.toISOString(),
    controller_device_id: controllerDeviceId
  });
}

export async function importLegacyWorkoutExecutionCache(
  userId: string,
  sessionId: string,
  current: WorkoutSessionExecutionState,
  cachedStartedAtMs: number | null,
  controllerDeviceId: string | null,
  now = new Date(),
  cachedRest?: { endsAtMs: number | null; durationSeconds: number | null }
) {
  if (current.user_id !== userId || current.workout_session_id !== sessionId) {
    return { imported: false, state: current, reason: "identity_mismatch" as const };
  }
  if (current.bootstrap_source !== "legacy_backfill" || current.revision !== 0) {
    return { imported: false, state: current, reason: "not_initial_legacy_state" as const };
  }
  const nowValue = now.getTime();
  const validStartedAt = Number.isFinite(cachedStartedAtMs) && cachedStartedAtMs !== null
    && cachedStartedAtMs <= nowValue + 5 * 60_000
    && cachedStartedAtMs >= nowValue - 24 * 60 * 60_000;
  const cachedElapsed = validStartedAt && cachedStartedAtMs !== null
    ? Math.max(0, Math.floor((nowValue - cachedStartedAtMs) / 1000))
    : 0;
  const increasesElapsed = validStartedAt && cachedElapsed > executionElapsedSeconds(current, now);
  const restDuration = cachedRest?.durationSeconds === null || cachedRest?.durationSeconds === undefined
    ? null
    : Math.min(86400, Math.max(0, Math.floor(cachedRest.durationSeconds)));
  const cachedRestEndsAtMs = cachedRest?.endsAtMs ?? null;
  const validRest = typeof cachedRestEndsAtMs === "number"
    && Number.isFinite(cachedRestEndsAtMs)
    && restDuration !== null
    && cachedRestEndsAtMs > nowValue
    && cachedRestEndsAtMs <= nowValue + 24 * 60 * 60_000;
  if (!increasesElapsed && !validRest) {
    return { imported: false, state: current, reason: validStartedAt ? "would_not_increase_elapsed" as const : "invalid_or_implausible_cache" as const };
  }
  const patch: WorkoutSessionExecutionStatePatch = {
    controller_device_id: controllerDeviceId,
    bootstrap_source: "client_cache_import"
  };
  if (increasesElapsed) {
    patch.session_elapsed_seconds = cachedElapsed;
    patch.session_running_since = current.session_state === "paused" ? null : now.toISOString();
  }
  if (validRest && cachedRestEndsAtMs !== null && restDuration !== null) {
    const restEndsAt = new Date(cachedRestEndsAtMs);
    patch.view_state = "rest";
    patch.rest_duration_seconds = restDuration;
    patch.rest_ends_at = restEndsAt.toISOString();
    patch.rest_started_at = new Date(restEndsAt.getTime() - restDuration * 1000).toISOString();
  }
  const updated = await updateWorkoutSessionExecutionState(userId, sessionId, patch);
  return { imported: true, state: updated, reason: null };
}
