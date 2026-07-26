import type {
  ExerciseLog,
  WorkoutSession,
  WorkoutSessionExecutionState
} from "@/types";
import type { WorkoutSessionPrescriptionItem } from "@/types/workout-prescription";
import {
  createSessionCommandDispatcher,
  createSessionCommandId
} from "../session-engine/commands";
import {
  ActiveSessionError,
  ActiveSessionIdempotencyConflictError,
  ActiveSessionRevisionConflictError,
  ActiveSessionTransportUncertainError,
  type SessionCommandIntent,
  type SessionCommandRequest,
  type SessionCommandResponse
} from "../session-engine/contracts";
import {
  acceptMonotonicExecutionState,
  assertPrescriptionInvariants
} from "../session-engine/invariants";
import type {
  ActiveSessionPersistenceAdapter,
  CanonicalWorkoutSetWrite,
  CompleteActiveSessionInput
} from "./persistence-adapter";

export type ActiveSessionPresentationSurface =
  | "primary"
  | "exercise_list"
  | "exercise_details"
  | "completion";

export type ActiveSessionHydrationStatus =
  | "idle"
  | "loading"
  | "ready"
  | "terminal"
  | "failed";

export type ActiveSessionCommandStatus = {
  phase: "idle" | "pending" | "terminalizing";
  commandId: string | null;
  commandType: string | null;
};

export type ActiveSessionFinalProjection = Readonly<{
  root: WorkoutSession;
  previousExecutionState: WorkoutSessionExecutionState;
  prescription: readonly WorkoutSessionPrescriptionItem[];
  performedLogs: readonly ExerciseLog[];
}>;

export type ActiveSessionSnapshot = {
  schemaVersion: 1;
  userId: string;
  workoutSessionId: string;
  root: WorkoutSession | null;
  executionState: WorkoutSessionExecutionState | null;
  prescription: readonly WorkoutSessionPrescriptionItem[];
  performedLogs: readonly ExerciseLog[];
  presentationSurface: ActiveSessionPresentationSurface;
  hydrationGeneration: number;
  hydrationStatus: ActiveSessionHydrationStatus;
  command: ActiveSessionCommandStatus;
  pendingTransportRequest: SessionCommandRequest | null;
  recoverableError: ActiveSessionError | null;
  hardError: ActiveSessionError | null;
  lastValidSecondaryProjection: unknown;
  finalProjection: ActiveSessionFinalProjection | null;
};

export type LegacyActiveSessionCache = {
  userId?: string;
  sessionId: string;
  startedAtMs: number | null;
  restEndsAtMs?: number | null;
  restDurationSeconds?: number | null;
  controllerDeviceId?: string | null;
};

export type HydrateActiveSessionOptions = {
  force?: boolean;
  legacyCache?: LegacyActiveSessionCache | null;
};

export type CompleteCanonicalSetInput = {
  logs: CanonicalWorkoutSetWrite[];
  executionIntent: SessionCommandIntent;
};

type Listener = () => void;

export type ActiveSessionStore = {
  getSnapshot(): ActiveSessionSnapshot;
  subscribe(listener: Listener): () => void;
  subscribeSelector<T>(
    selector: (snapshot: ActiveSessionSnapshot) => T,
    listener: Listener,
    isEqual?: (left: T, right: T) => boolean
  ): () => void;
  select<T>(selector: (snapshot: ActiveSessionSnapshot) => T): T;
  hydrate(options?: HydrateActiveSessionOptions): Promise<void>;
  reconcile(state: WorkoutSessionExecutionState): WorkoutSessionExecutionState;
  dispatch(intent: SessionCommandIntent): Promise<SessionCommandResponse>;
  retryPendingTransport(): Promise<SessionCommandResponse>;
  saveCanonicalSets(logs: CanonicalWorkoutSetWrite[]): Promise<void>;
  completeCanonicalSet(input: CompleteCanonicalSetInput): Promise<SessionCommandResponse>;
  completeSession(input: Omit<CompleteActiveSessionInput, "userId" | "workoutSessionId">): Promise<void>;
  cancelSession(): Promise<void>;
  setPresentationSurface(surface: ActiveSessionPresentationSurface): void;
  setSecondaryProjection(value: unknown): void;
  clearTerminalState(): void;
  dispose(): void;
};

function initialSnapshot(userId: string, workoutSessionId: string): ActiveSessionSnapshot {
  return {
    schemaVersion: 1,
    userId,
    workoutSessionId,
    root: null,
    executionState: null,
    prescription: [],
    performedLogs: [],
    presentationSurface: "primary",
    hydrationGeneration: 0,
    hydrationStatus: "idle",
    command: { phase: "idle", commandId: null, commandType: null },
    pendingTransportRequest: null,
    recoverableError: null,
    hardError: null,
    lastValidSecondaryProjection: null,
    finalProjection: null
  };
}

function storeKey(userId: string, workoutSessionId: string) {
  return `${userId}:${workoutSessionId}`;
}

function validateHydrationIdentity(
  snapshot: ActiveSessionSnapshot,
  root: WorkoutSession | null,
  executionState: WorkoutSessionExecutionState | null,
  prescription: readonly WorkoutSessionPrescriptionItem[],
  performedLogs: readonly ExerciseLog[]
) {
  if (
    !root
    || root.id !== snapshot.workoutSessionId
    || root.user_id !== snapshot.userId
  ) {
    throw new ActiveSessionError(
      "identity_mismatch",
      "The canonical workout root does not match this store."
    );
  }
  if (root.status === "started" && !executionState) {
    throw new ActiveSessionError(
      "hydration_failed",
      "The active workout has no canonical execution state."
    );
  }
  if (root.status !== "started" && executionState) {
    throw new ActiveSessionError(
      "terminal_mutation_attempt",
      "A terminal workout cannot retain an execution state."
    );
  }
  if (executionState) {
    if (
      executionState.user_id !== snapshot.userId
      || executionState.workout_session_id !== snapshot.workoutSessionId
    ) {
      throw new ActiveSessionError(
        "identity_mismatch",
        "The canonical execution state does not match this store."
      );
    }
    assertPrescriptionInvariants(
      prescription,
      snapshot.userId,
      snapshot.workoutSessionId
    );
  }
  if (performedLogs.some((log) => log.workout_session_id !== snapshot.workoutSessionId)) {
    throw new ActiveSessionError(
      "identity_mismatch",
      "A performed set belongs to another workout session."
    );
  }
}

function eligibleLegacyCache(
  snapshot: ActiveSessionSnapshot,
  state: WorkoutSessionExecutionState,
  cache: LegacyActiveSessionCache | null | undefined
) {
  return Boolean(
    cache
    && cache.sessionId === snapshot.workoutSessionId
    && (!cache.userId || cache.userId === snapshot.userId)
    && state.bootstrap_source === "legacy_backfill"
    && state.revision === 0
    && (cache.startedAtMs === null || Number.isFinite(cache.startedAtMs))
  );
}

export function createActiveSessionStore(input: {
  userId: string;
  workoutSessionId: string;
  adapter: ActiveSessionPersistenceAdapter;
  clearCompatibilityCache?: () => void;
  commandId?: () => string;
}): ActiveSessionStore {
  let snapshot = initialSnapshot(input.userId, input.workoutSessionId);
  let hydrationPromise: Promise<void> | null = null;
  let disposed = false;
  let terminalizing = false;
  const listeners = new Set<Listener>();
  const selectorListeners = new Set<{
    listener: Listener;
    selector: (value: ActiveSessionSnapshot) => unknown;
    isEqual: (left: unknown, right: unknown) => boolean;
    selected: unknown;
  }>();
  const dispatcher = createSessionCommandDispatcher(input.adapter);

  function requireUsable() {
    if (disposed) {
      throw new ActiveSessionError("invalid_transition", "The Active Workout store is disposed.");
    }
  }

  function publish(patch: Partial<ActiveSessionSnapshot>) {
    const previous = snapshot;
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
    for (const subscription of selectorListeners) {
      const selected = subscription.selector(snapshot);
      if (!subscription.isEqual(subscription.selected, selected)) {
        subscription.selected = selected;
        subscription.listener();
      }
    }
    return previous;
  }

  function acceptState(state: WorkoutSessionExecutionState) {
    if (
      state.user_id !== snapshot.userId
      || state.workout_session_id !== snapshot.workoutSessionId
    ) {
      throw new ActiveSessionError(
        "identity_mismatch",
        "Workout execution authority changed identity."
      );
    }
    const accepted = acceptMonotonicExecutionState(snapshot.executionState, state);
    dispatcher.replace(accepted);
    if (accepted !== snapshot.executionState) publish({ executionState: accepted });
    return accepted;
  }

  function setCommandIdle(patch: Partial<ActiveSessionSnapshot> = {}) {
    publish({
      command: { phase: "idle", commandId: null, commandType: null },
      ...patch
    });
  }

  async function dispatch(intent: SessionCommandIntent) {
    requireUsable();
    if (
      intent.userId !== snapshot.userId
      || intent.workoutSessionId !== snapshot.workoutSessionId
    ) {
      throw new ActiveSessionError(
        "identity_mismatch",
        "Workout command identity does not match this store."
      );
    }
    if (!snapshot.root || snapshot.root.status !== "started" || !snapshot.executionState) {
      throw new ActiveSessionError(
        "terminal_mutation_attempt",
        "This workout cannot accept another execution command."
      );
    }
    publish({
      command: {
        phase: "pending",
        commandId: intent.commandId,
        commandType: intent.commandType
      },
      recoverableError: null,
      hardError: null
    });
    try {
      const response = await dispatcher.dispatch(intent);
      acceptState(response.state);
      setCommandIdle({ pendingTransportRequest: null });
      return response;
    } catch (error) {
      const current = dispatcher.current(snapshot.userId, snapshot.workoutSessionId);
      if (current) acceptState(current);
      if (error instanceof ActiveSessionTransportUncertainError) {
        setCommandIdle({
          pendingTransportRequest: error.request,
          recoverableError: error
        });
      } else if (error instanceof ActiveSessionRevisionConflictError) {
        setCommandIdle({
          pendingTransportRequest: null,
          recoverableError: error
        });
      } else if (error instanceof ActiveSessionIdempotencyConflictError) {
        setCommandIdle({
          pendingTransportRequest: null,
          hardError: error
        });
      } else {
        const typed = error instanceof ActiveSessionError
          ? error
          : new ActiveSessionError(
              "adapter_failure",
              "The workout command could not be persisted.",
              error
            );
        setCommandIdle({ recoverableError: typed });
      }
      throw error;
    }
  }

  async function terminalize(
    operation: () => Promise<WorkoutSession>
  ) {
    requireUsable();
    if (terminalizing) {
      throw new ActiveSessionError(
        "terminal_mutation_attempt",
        "A terminal workout request is already pending."
      );
    }
    if (!snapshot.root || snapshot.root.status !== "started" || !snapshot.executionState) {
      throw new ActiveSessionError(
        "terminal_mutation_attempt",
        "Only an active workout can be terminalized."
      );
    }
    terminalizing = true;
    const previousExecutionState = snapshot.executionState;
    publish({
      command: { phase: "terminalizing", commandId: null, commandType: null },
      recoverableError: null,
      hardError: null
    });
    try {
      const root = await operation();
      if (
        root.id !== snapshot.workoutSessionId
        || root.user_id !== snapshot.userId
        || root.status === "started"
      ) {
        throw new ActiveSessionError(
          "identity_mismatch",
          "The terminal workout response is inconsistent."
        );
      }
      const finalProjection: ActiveSessionFinalProjection = Object.freeze({
        root,
        previousExecutionState,
        prescription: snapshot.prescription,
        performedLogs: snapshot.performedLogs
      });
      dispatcher.clear(snapshot.userId, snapshot.workoutSessionId);
      input.clearCompatibilityCache?.();
      publish({
        root,
        executionState: null,
        presentationSurface: "completion",
        hydrationStatus: "terminal",
        command: { phase: "idle", commandId: null, commandType: null },
        pendingTransportRequest: null,
        finalProjection
      });
    } catch (error) {
      const typed = error instanceof ActiveSessionError
        ? error
        : new ActiveSessionError(
            "adapter_failure",
            "The workout could not be finalized.",
            error
          );
      setCommandIdle({ recoverableError: typed });
      throw error;
    } finally {
      terminalizing = false;
    }
  }

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      requireUsable();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeSelector(selector, listener, isEqual = Object.is) {
      requireUsable();
      const subscription = {
        listener,
        selector: selector as (value: ActiveSessionSnapshot) => unknown,
        isEqual: isEqual as (left: unknown, right: unknown) => boolean,
        selected: selector(snapshot)
      };
      selectorListeners.add(subscription);
      return () => selectorListeners.delete(subscription);
    },
    select(selector) {
      return selector(snapshot);
    },
    hydrate(options = {}) {
      requireUsable();
      if (hydrationPromise && !options.force) return hydrationPromise;
      const generation = snapshot.hydrationGeneration + 1;
      publish({
        hydrationGeneration: generation,
        hydrationStatus: "loading",
        recoverableError: null,
        hardError: null
      });
      const promise = (async () => {
        try {
          const [root, executionState, prescription, performedLogs] = await Promise.all([
            input.adapter.loadSessionRoot(snapshot.userId, snapshot.workoutSessionId),
            input.adapter.loadExecutionState(snapshot.userId, snapshot.workoutSessionId),
            input.adapter.loadPrescription(snapshot.userId, snapshot.workoutSessionId),
            input.adapter.loadPerformedLogs(snapshot.userId, snapshot.workoutSessionId)
          ]);
          if (disposed || generation !== snapshot.hydrationGeneration) return;
          validateHydrationIdentity(
            snapshot,
            root,
            executionState,
            prescription,
            performedLogs
          );
          publish({
            root,
            executionState,
            prescription,
            performedLogs,
            hydrationStatus: root!.status === "started" ? "ready" : "terminal",
            finalProjection: null
          });
          if (executionState) dispatcher.replace(executionState);
          if (
            executionState
            && eligibleLegacyCache(snapshot, executionState, options.legacyCache)
          ) {
            const cache = options.legacyCache!;
            try {
              await dispatch({
                userId: snapshot.userId,
                workoutSessionId: snapshot.workoutSessionId,
                commandId: createSessionCommandId(input.commandId),
                commandType: "import_legacy_cache",
                payload: {
                  cached_started_at: cache.startedAtMs === null
                    ? null
                    : new Date(cache.startedAtMs).toISOString(),
                  cached_rest_ends_at: cache.restEndsAtMs == null
                    ? null
                    : new Date(cache.restEndsAtMs).toISOString(),
                  cached_rest_duration_seconds: cache.restDurationSeconds ?? null,
                  controller_device_id: cache.controllerDeviceId ?? null
                }
              });
            } catch {
              // Canonical hydration remains usable; dispatch records the bounded typed error.
            }
          }
        } catch (error) {
          if (disposed || generation !== snapshot.hydrationGeneration) return;
          const typed = error instanceof ActiveSessionError
            ? error
            : new ActiveSessionError(
                "hydration_failed",
                "The active workout could not be hydrated.",
                error
              );
          publish({ hydrationStatus: "failed", hardError: typed });
          throw typed;
        } finally {
          if (generation === snapshot.hydrationGeneration) hydrationPromise = null;
        }
      })();
      hydrationPromise = promise;
      return promise;
    },
    reconcile: acceptState,
    dispatch,
    async retryPendingTransport() {
      requireUsable();
      const request = snapshot.pendingTransportRequest;
      if (!request) {
        throw new ActiveSessionError(
          "invalid_transition",
          "There is no retry-safe workout command."
        );
      }
      publish({
        command: {
          phase: "pending",
          commandId: request.commandId,
          commandType: request.commandType
        }
      });
      try {
        const response = await dispatcher.retry(request);
        acceptState(response.state);
        setCommandIdle({
          pendingTransportRequest: null,
          recoverableError: null
        });
        return response;
      } catch (error) {
        if (error instanceof ActiveSessionTransportUncertainError) {
          setCommandIdle({ recoverableError: error });
        } else {
          setCommandIdle({ pendingTransportRequest: null });
        }
        throw error;
      }
    },
    async completeCanonicalSet(setInput) {
      requireUsable();
      try {
        await input.adapter.writeCanonicalSet(
          snapshot.workoutSessionId,
          setInput.logs
        );
      } catch (error) {
        const typed = new ActiveSessionError(
          "adapter_failure",
          "The workout set could not be saved.",
          error
        );
        publish({ recoverableError: typed });
        throw typed;
      }
      try {
        return await dispatch(setInput.executionIntent);
      } catch (error) {
        try {
          const [performedLogs, executionState] = await Promise.all([
            input.adapter.loadPerformedLogs(snapshot.userId, snapshot.workoutSessionId),
            input.adapter.loadExecutionState(snapshot.userId, snapshot.workoutSessionId)
          ]);
          if (executionState) acceptState(executionState);
          publish({ performedLogs });
        } catch {
          // Preserve the confirmed save and original typed synchronization failure.
        }
        const typed = new ActiveSessionError(
          "canonical_set_saved_execution_sync_failed",
          "The set was saved, but the workout position needs reconciliation.",
          error
        );
        publish({ recoverableError: typed });
        throw typed;
      }
    },
    async saveCanonicalSets(logs) {
      requireUsable();
      await input.adapter.writeCanonicalSet(snapshot.workoutSessionId, logs);
      const performedLogs = await input.adapter.loadPerformedLogs(
        snapshot.userId,
        snapshot.workoutSessionId
      );
      publish({ performedLogs });
    },
    completeSession(completeInput) {
      return terminalize(() => input.adapter.completeSession({
        ...completeInput,
        userId: snapshot.userId,
        workoutSessionId: snapshot.workoutSessionId
      }));
    },
    cancelSession() {
      return terminalize(() =>
        input.adapter.cancelSession(snapshot.userId, snapshot.workoutSessionId)
      );
    },
    setPresentationSurface(presentationSurface) {
      requireUsable();
      publish({ presentationSurface });
    },
    setSecondaryProjection(lastValidSecondaryProjection) {
      requireUsable();
      publish({ lastValidSecondaryProjection });
    },
    clearTerminalState() {
      requireUsable();
      if (snapshot.hydrationStatus !== "terminal") return;
      publish({
        root: null,
        finalProjection: null,
        prescription: [],
        performedLogs: [],
        presentationSurface: "primary",
        hydrationStatus: "idle"
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      snapshot = {
        ...snapshot,
        hydrationGeneration: snapshot.hydrationGeneration + 1
      };
      dispatcher.clear(snapshot.userId, snapshot.workoutSessionId);
      listeners.clear();
      selectorListeners.clear();
      hydrationPromise = null;
    }
  };
}

const activeSessionStores = new Map<string, ActiveSessionStore>();

export function getActiveSessionStore(input: {
  userId: string;
  workoutSessionId: string;
  adapter: ActiveSessionPersistenceAdapter;
  clearCompatibilityCache?: () => void;
}) {
  const key = storeKey(input.userId, input.workoutSessionId);
  const existing = activeSessionStores.get(key);
  if (existing) return existing;
  const created = createActiveSessionStore(input);
  activeSessionStores.set(key, created);
  return created;
}

export function releaseActiveSessionStore(userId: string, workoutSessionId: string) {
  const key = storeKey(userId, workoutSessionId);
  const store = activeSessionStores.get(key);
  store?.dispose();
  activeSessionStores.delete(key);
}
