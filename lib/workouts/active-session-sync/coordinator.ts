import type { ActiveSessionPersistenceAdapter } from "@/lib/workouts/active-session-store/persistence-adapter";
import {
  ActiveSessionControllerConflictError,
  ActiveSessionDataConflictError,
  ActiveSessionError,
  ActiveSessionIdempotencyConflictError,
  ActiveSessionRevisionConflictError,
  ActiveSessionTransportUncertainError,
} from "@/lib/workouts/session-engine/contracts";
import {
  addActiveWorkoutOperation,
  listActiveWorkoutOperations,
  updateActiveWorkoutOperation,
} from "./indexed-db";
import {
  canonicalSetTargetIdentity,
  exerciseLogTargetIdentity,
  fingerprintCanonicalExerciseLog,
  fingerprintCanonicalSetWrite,
  type ActiveWorkoutOperation,
  type ActiveWorkoutOperationPayload,
  type ActiveWorkoutSetConflict,
  type ActiveWorkoutSyncState,
} from "./contracts";

const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const MAX_ATTEMPTS = 6;
const FLUSH_LEASE_MS = 15_000;

export type ActiveWorkoutSyncCoordinator = {
  enqueue(
    payload: ActiveWorkoutOperationPayload,
    baseRevision: number | null,
    baseTargetFingerprint?: string | null,
  ): Promise<ActiveWorkoutOperation>;
  reconcile(options?: { force?: boolean }): Promise<ActiveWorkoutSyncState>;
  pendingCount(): Promise<number>;
  resolveDataConflict(
    operationId: string,
    strategy: "server" | "local",
  ): Promise<ActiveWorkoutSyncState>;
  dispose(): void;
};

function operationId() {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value) throw new Error("A durable operation identity is unavailable.");
  return value;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error)
    return String((error as { message?: unknown }).message ?? "");
  return String(error ?? "");
}

function isRetryableTransport(error: unknown) {
  if (error instanceof ActiveSessionTransportUncertainError) return true;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return /failed to fetch|network|timeout|timed out|connection|socket|econn|temporarily unavailable|could not be confirmed/i
    .test(errorMessage(error));
}

export function createActiveWorkoutSyncCoordinator(input: {
  userId: string;
  workoutSessionId: string;
  controllerDeviceId: string;
  tabId?: string;
  adapter: ActiveSessionPersistenceAdapter;
  onState?: (state: ActiveWorkoutSyncState, pendingCount: number) => void;
  onDataConflict?: (conflict: ActiveWorkoutSetConflict | null) => void;
  onInvalidate?: () => void;
}): ActiveWorkoutSyncCoordinator {
  let disposed = false;
  let reconciliation: Promise<ActiveWorkoutSyncState> | null = null;
  const tabId = input.tabId
    ?? globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random()}`;
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(
          `plaivra-active-workout:${input.userId}:${input.workoutSessionId}`,
        );
  const invalidate = () => input.onInvalidate?.();
  channel?.addEventListener("message", invalidate);
  const laneKey =
    `plaivra.active-workout.flush.${input.userId}.${input.workoutSessionId}`;

  async function pendingCount() {
    return (
      await listActiveWorkoutOperations(input.userId, input.workoutSessionId)
    ).length;
  }

  async function notify(state: ActiveWorkoutSyncState) {
    input.onState?.(state, await pendingCount());
    channel?.postMessage({ type: "sync_state", state });
    return state;
  }

  async function execute(operation: ActiveWorkoutOperation) {
    const root = await input.adapter.loadSessionRoot(
      operation.userId,
      operation.workoutSessionId,
    );
    if (!root || root.status !== "started") {
      if (
        operation.payload.kind === "complete_session"
        && root?.status === "completed"
      ) return;
      throw new ActiveSessionError(
        "terminal_mutation_attempt",
        "The server workout is already terminal.",
      );
    }

    if (operation.payload.kind === "command") {
      await input.adapter.dispatchExecutionCommand(operation.payload.request);
      return;
    }
    if (operation.payload.kind === "set_write") {
      const targetIdentity = operation.targetIdentity;
      const desired = operation.payload.logs[0];
      if (
        !targetIdentity
        || !desired
        || operation.payload.logs.length !== 1
      ) {
        throw new ActiveSessionError(
          "invalid_transition",
          "A durable set operation requires exactly one target.",
        );
      }
      const serverLogs = await input.adapter.loadPerformedLogs(
        operation.userId,
        operation.workoutSessionId,
      );
      const serverTarget = serverLogs.find(
        (log) => exerciseLogTargetIdentity(log) === targetIdentity,
      );
      const serverFingerprint = serverTarget
        ? fingerprintCanonicalExerciseLog(serverTarget)
        : null;
      const desiredFingerprint = fingerprintCanonicalSetWrite(desired);
      if (serverFingerprint === desiredFingerprint) return;
      if (serverFingerprint !== operation.baseTargetFingerprint) {
        throw new ActiveSessionDataConflictError(targetIdentity);
      }
      await input.adapter.writeCanonicalSet(
        operation.payload.workoutSessionId,
        operation.payload.logs,
        operation.payload.controllerDeviceId,
      );
      const confirmedLogs = await input.adapter.loadPerformedLogs(
        operation.userId,
        operation.workoutSessionId,
      );
      const confirmedTarget = confirmedLogs.find(
        (log) => exerciseLogTargetIdentity(log) === targetIdentity,
      );
      if (
        !confirmedTarget
        || fingerprintCanonicalExerciseLog(confirmedTarget) !== desiredFingerprint
      ) {
        throw new ActiveSessionTransportUncertainError(
          {
            userId: operation.userId,
            workoutSessionId: operation.workoutSessionId,
            commandId: operation.id,
            commandType: "move_cursor",
            expectedRevision: operation.baseRevision ?? 0,
            payload: {
              active_snapshot_item_id: null,
              active_item_order: 1,
              active_set_number: 1,
            },
          },
          new Error("The canonical set write could not be confirmed."),
        );
      }
      return;
    }
    await input.adapter.completeSession(operation.payload.input);
  }

  async function discardTerminalOperations() {
    const operations = await listActiveWorkoutOperations(
      input.userId,
      input.workoutSessionId,
    );
    for (const operation of operations) {
      await updateActiveWorkoutOperation(operation, {
        state: "discarded",
        nextRetryAt: null,
        lastErrorCode: "terminal_server_wins",
      });
    }
    input.onDataConflict?.(null);
    input.onInvalidate?.();
  }

  async function run(force = false) {
    if (disposed) return "retry_needed" as const;
    if (typeof navigator !== "undefined" && !navigator.onLine)
      return notify("offline_saved");
    await notify("syncing");
    const operations = await listActiveWorkoutOperations(
      input.userId,
      input.workoutSessionId,
    );
    for (const operation of operations) {
      if (operation.state === "conflict") {
        return notify(
          operation.lastErrorCode === "controller_conflict"
            ? "device_conflict"
            : "data_conflict",
        );
      }
      if (operation.attemptCount >= MAX_ATTEMPTS) {
        await updateActiveWorkoutOperation(operation, {
          state: "transport_uncertain",
          lastErrorCode: "retry_limit",
        });
        return notify("retry_needed");
      }
      if (
        !force
        && operation.nextRetryAt
        && Date.parse(operation.nextRetryAt) > Date.now()
      ) return notify("retry_needed");
      await updateActiveWorkoutOperation(operation, {
        state: "sending",
        attemptCount: operation.attemptCount + 1,
      });
      try {
        await execute(operation);
        await updateActiveWorkoutOperation(operation, {
          state: "applied",
          nextRetryAt: null,
          lastErrorCode: null,
        });
      } catch (error) {
        if (error instanceof ActiveSessionControllerConflictError) {
          await updateActiveWorkoutOperation(operation, {
            state: "conflict",
            nextRetryAt: null,
            lastErrorCode: "controller_conflict",
          });
          return notify("device_conflict");
        }
        if (error instanceof ActiveSessionDataConflictError) {
          const local =
            operation.payload.kind === "set_write"
              ? operation.payload.logs[0]
              : null;
          const serverLogs = await input.adapter.loadPerformedLogs(
            operation.userId,
            operation.workoutSessionId,
          );
          const server = serverLogs.find(
            (log) =>
              operation.targetIdentity !== null
              && exerciseLogTargetIdentity(log) === operation.targetIdentity,
          ) ?? null;
          if (local && operation.targetIdentity) {
            input.onDataConflict?.({
              operationId: operation.id,
              targetIdentity: operation.targetIdentity,
              local,
              server,
            });
          }
          await updateActiveWorkoutOperation(operation, {
            state: "conflict",
            nextRetryAt: null,
            lastErrorCode: "target_conflict",
          });
          return notify("data_conflict");
        }
        if (error instanceof ActiveSessionRevisionConflictError) {
          await updateActiveWorkoutOperation(operation, {
            state: "discarded",
            nextRetryAt: null,
            lastErrorCode: "revision_conflict_rehydrate",
          });
          input.onInvalidate?.();
          return notify("retry_needed");
        }
        if (error instanceof ActiveSessionIdempotencyConflictError) {
          await updateActiveWorkoutOperation(operation, {
            state: "conflict",
            nextRetryAt: null,
            lastErrorCode: "idempotency_conflict",
          });
          return notify("retry_needed");
        }
        if (
          error instanceof ActiveSessionError
          && error.code === "terminal_mutation_attempt"
        ) {
          await discardTerminalOperations();
          return notify("online_synced");
        }
        if (error instanceof ActiveSessionError && !isRetryableTransport(error)) {
          await updateActiveWorkoutOperation(operation, {
            state: "discarded",
            nextRetryAt: null,
            lastErrorCode: error.code,
          });
          input.onInvalidate?.();
          return notify("retry_needed");
        }
        if (!isRetryableTransport(error)) {
          await updateActiveWorkoutOperation(operation, {
            state: "discarded",
            nextRetryAt: null,
            lastErrorCode: "non_retryable_adapter_error",
          });
          input.onInvalidate?.();
          return notify("retry_needed");
        }
        const delay = Math.min(
          MAX_RETRY_MS,
          BASE_RETRY_MS * 2 ** operation.attemptCount,
        );
        await updateActiveWorkoutOperation(operation, {
          state: "transport_uncertain",
          nextRetryAt: new Date(Date.now() + delay).toISOString(),
          lastErrorCode:
            error instanceof ActiveSessionTransportUncertainError
              ? error.code
              : "transport_uncertainty",
        });
        return notify("retry_needed");
      }
    }
    input.onInvalidate?.();
    return notify("online_synced");
  }

  async function runAsLaneLeader(force: boolean) {
    if (
      typeof navigator !== "undefined"
      && navigator.locks
    ) {
      return navigator.locks.request(
        laneKey,
        { mode: "exclusive", ifAvailable: true },
        (lock) => lock ? run(force) : notify("retry_needed"),
      );
    }
    if (typeof localStorage === "undefined") return run(force);
    const acquireOrRenewLease = () => {
      localStorage.setItem(
        laneKey,
        JSON.stringify({ tabId, expiresAt: Date.now() + FLUSH_LEASE_MS }),
      );
    };
    const now = Date.now();
    try {
      const lease = JSON.parse(localStorage.getItem(laneKey) ?? "null") as {
        tabId?: unknown;
        expiresAt?: unknown;
      } | null;
      if (
        lease
        && lease.tabId !== tabId
        && typeof lease.expiresAt === "number"
        && lease.expiresAt > now
      ) return notify("retry_needed");
    } catch {
      // Invalid fallback lease data is replaced below.
    }
    acquireOrRenewLease();
    const renewal = setInterval(acquireOrRenewLease, FLUSH_LEASE_MS / 3);
    try {
      return await run(force);
    } finally {
      clearInterval(renewal);
      try {
        const lease = JSON.parse(localStorage.getItem(laneKey) ?? "null") as {
          tabId?: unknown;
        } | null;
        if (lease?.tabId === tabId) localStorage.removeItem(laneKey);
      } catch {
        localStorage.removeItem(laneKey);
      }
    }
  }

  async function nextConflict() {
    const operations = await listActiveWorkoutOperations(
      input.userId,
      input.workoutSessionId,
    );
    const conflict = operations.find((item) => item.state === "conflict");
    if (!conflict || conflict.payload.kind !== "set_write") {
      input.onDataConflict?.(null);
      return null;
    }
    const local = conflict.payload.logs[0];
    if (!local || !conflict.targetIdentity) return null;
    const serverLogs = await input.adapter.loadPerformedLogs(
      conflict.userId,
      conflict.workoutSessionId,
    );
    input.onDataConflict?.({
      operationId: conflict.id,
      targetIdentity: conflict.targetIdentity,
      local,
      server: serverLogs.find(
        (log) => exerciseLogTargetIdentity(log) === conflict.targetIdentity,
      ) ?? null,
    });
    return conflict;
  }

  return {
    async enqueue(payload, baseRevision, baseTargetFingerprint = null) {
      if (payload.kind === "set_write" && payload.logs.length !== 1) {
        throw new ActiveSessionError(
          "invalid_transition",
          "Each durable set operation must contain exactly one canonical set.",
        );
      }
      const targetIdentity =
        payload.kind === "set_write" && payload.logs[0]
          ? canonicalSetTargetIdentity(payload.logs[0])
          : null;
      const queued = targetIdentity
        ? await listActiveWorkoutOperations(
            input.userId,
            input.workoutSessionId,
          )
        : [];
      const priorTargetOperation = queued
        .filter(
          (operation) =>
            operation.targetIdentity === targetIdentity
            && operation.payload.kind === "set_write",
        )
        .at(-1);
      const effectiveBaseTargetFingerprint =
        priorTargetOperation?.payload.kind === "set_write"
        && priorTargetOperation.payload.logs[0]
          ? fingerprintCanonicalSetWrite(priorTargetOperation.payload.logs[0])
          : baseTargetFingerprint;
      const operation = await addActiveWorkoutOperation({
        id: operationId(),
        userId: input.userId,
        workoutSessionId: input.workoutSessionId,
        deviceId: input.controllerDeviceId,
        tabId,
        targetIdentity,
        baseTargetFingerprint: effectiveBaseTargetFingerprint,
        stableCommandId:
          payload.kind === "command" ? payload.request.commandId : null,
        payload,
        baseRevision,
      });
      await notify(
        payload.kind === "complete_session" ? "terminal_pending" : "offline_saved",
      );
      return operation;
    },
    reconcile(options = {}) {
      if (reconciliation) return reconciliation;
      reconciliation = runAsLaneLeader(Boolean(options.force)).finally(() => {
        reconciliation = null;
      });
      return reconciliation;
    },
    pendingCount,
    async resolveDataConflict(operationIdValue, strategy) {
      const operations = await listActiveWorkoutOperations(
        input.userId,
        input.workoutSessionId,
      );
      const operation = operations.find(
        (item) => item.id === operationIdValue && item.state === "conflict",
      );
      if (!operation || operation.payload.kind !== "set_write") {
        throw new ActiveSessionError(
          "invalid_transition",
          "The selected set conflict is no longer pending.",
        );
      }
      if (strategy === "local") {
        const serverLogs = await input.adapter.loadPerformedLogs(
          operation.userId,
          operation.workoutSessionId,
        );
        const serverTarget = serverLogs.find(
          (log) =>
            operation.targetIdentity !== null
            && exerciseLogTargetIdentity(log) === operation.targetIdentity,
        );
        await updateActiveWorkoutOperation(operation, {
          state: "discarded",
          lastErrorCode: null,
          nextRetryAt: null,
        });
        await addActiveWorkoutOperation({
          id: operationId(),
          userId: operation.userId,
          workoutSessionId: operation.workoutSessionId,
          deviceId: input.controllerDeviceId,
          tabId,
          targetIdentity: operation.targetIdentity,
          baseTargetFingerprint: serverTarget
            ? fingerprintCanonicalExerciseLog(serverTarget)
            : null,
          stableCommandId: null,
          payload: operation.payload,
          baseRevision: operation.baseRevision,
        });
      } else {
        await updateActiveWorkoutOperation(operation, {
          state: "discarded",
          lastErrorCode: null,
          nextRetryAt: null,
        });
      }
      const remaining = await nextConflict();
      if (remaining) return notify("data_conflict");
      return strategy === "local"
        ? runAsLaneLeader(true)
        : notify("online_synced");
    },
    dispose() {
      disposed = true;
      channel?.removeEventListener("message", invalidate);
      channel?.close();
    },
  };
}
