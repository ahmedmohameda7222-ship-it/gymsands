import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readVerifiedRecordIdentityScope,
  rebuildVerifiedRecordsForIdentities,
  replaceVerifiedRecordsForSession,
} from "@/services/workouts/history/verified-records";

export type CompletedSessionCorrection = {
  expectedHistoryRevision: number;
  idempotencyKey: string;
  sessionPatch?: { durationMinutes?: number | null; notes?: string | null };
  setOperations: Array<
    | { kind: "update"; exerciseLogId: string; patch: Record<string, unknown> }
    | {
        kind: "add";
        snapshotItemId: string;
        setNumber: number;
        values: Record<string, unknown>;
      }
    | { kind: "remove"; exerciseLogId: string }
  >;
};

export class WorkoutHistoryMutationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkoutHistoryMutationError";
  }
}

function mutationError(
  error: { message?: string; code?: string } | null,
  fallback: string,
): never {
  const code = error?.code ?? "mutation_failed";
  const status =
    code === "40001"
      ? 409
      : code === "P0002"
        ? 404
        : code === "42501"
          ? 403
          : 400;
  throw new WorkoutHistoryMutationError(
    code,
    error?.message ?? fallback,
    status,
  );
}

function validKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9:._-]{15,199}$/.test(value)
  );
}

function withProjectionState<T extends object>(
  result: T,
  projectionRefreshPending: boolean,
): T & { projection_refresh_pending: boolean } {
  return { ...result, projection_refresh_pending: projectionRefreshPending };
}

export async function correctCompletedSession(
  supabase: SupabaseClient,
  authority: SupabaseClient,
  userId: string,
  sessionId: string,
  input: CompletedSessionCorrection,
) {
  if (
    !Number.isSafeInteger(input.expectedHistoryRevision) ||
    input.expectedHistoryRevision < 0 ||
    !validKey(input.idempotencyKey) ||
    !Array.isArray(input.setOperations) ||
    input.setOperations.length > 100 ||
    new TextEncoder().encode(JSON.stringify(input)).byteLength > 65_536
  ) {
    throw new WorkoutHistoryMutationError(
      "invalid_correction",
      "Workout correction is invalid.",
      400,
    );
  }
  const result = await supabase.rpc(
    "correct_completed_workout_session_atomic",
    {
      p_user_id: userId,
      p_session_id: sessionId,
      p_expected_history_revision: input.expectedHistoryRevision,
      p_idempotency_key: input.idempotencyKey,
      p_session_patch: input.sessionPatch ?? {},
      p_set_operations: input.setOperations,
    },
  );
  if (result.error) mutationError(result.error, "Workout correction failed.");
  const value = (result.data ?? {}) as Record<string, unknown>;
  let projectionRefreshPending = false;
  if (value.performance_changed === true) {
    try {
      await replaceVerifiedRecordsForSession(authority, userId, sessionId);
    } catch {
      projectionRefreshPending = true;
    }
  }
  return withProjectionState(value, projectionRefreshPending);
}

export async function softDeleteSession(
  supabase: SupabaseClient,
  authority: SupabaseClient,
  userId: string,
  sessionId: string,
  idempotencyKey: string,
) {
  if (!validKey(idempotencyKey))
    throw new WorkoutHistoryMutationError(
      "invalid_idempotency_key",
      "Deletion request key is invalid.",
      400,
    );
  const scope = await readVerifiedRecordIdentityScope(
    supabase,
    userId,
    sessionId,
  );
  const result = await supabase.rpc("soft_delete_workout_session_atomic", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_idempotency_key: idempotencyKey,
  });
  if (result.error) mutationError(result.error, "Workout deletion failed.");
  let projectionRefreshPending = false;
  try {
    await rebuildVerifiedRecordsForIdentities(
      authority,
      userId,
      scope.identities,
      sessionId,
    );
  } catch {
    projectionRefreshPending = true;
  }
  return withProjectionState(
    (result.data ?? {}) as Record<string, unknown>,
    projectionRefreshPending,
  );
}

export async function restoreSession(
  supabase: SupabaseClient,
  authority: SupabaseClient,
  userId: string,
  sessionId: string,
  idempotencyKey: string,
) {
  if (!validKey(idempotencyKey))
    throw new WorkoutHistoryMutationError(
      "invalid_idempotency_key",
      "Restore request key is invalid.",
      400,
    );
  const result = await supabase.rpc("restore_workout_session_atomic", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_idempotency_key: idempotencyKey,
  });
  if (result.error) mutationError(result.error, "Workout restore failed.");
  let projectionRefreshPending = false;
  try {
    await replaceVerifiedRecordsForSession(authority, userId, sessionId);
  } catch {
    projectionRefreshPending = true;
  }
  return withProjectionState(
    (result.data ?? {}) as Record<string, unknown>,
    projectionRefreshPending,
  );
}

export async function purgeSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  confirmed: boolean,
) {
  if (!confirmed)
    throw new WorkoutHistoryMutationError(
      "confirmation_required",
      "Permanent deletion requires confirmation.",
      400,
    );
  const result = await supabase.rpc("purge_workout_session_atomic", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_confirm_permanent: true,
  });
  if (result.error)
    mutationError(result.error, "Permanent workout deletion failed.");
  return result.data;
}
