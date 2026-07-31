import type {
  ExerciseLog,
  WorkoutSession,
  WorkoutSessionExecutionState
} from "@/types";
import type { WorkoutSessionExerciseSkipReason } from "@/types/workout-session-timeline";
import type { WorkoutSessionPrescriptionItem } from "@/types/workout-prescription";
import {
  createSessionCommandDispatcher,
  createSessionCommandId
} from "../session-engine/commands";
import {
  ActiveSessionError,
  ActiveSessionControllerConflictError,
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
import { reduceSessionCommand } from "../session-engine/reducer";
import {
  canonicalSetTargetIdentity,
  createActiveWorkoutSyncCoordinator,
  exerciseLogTargetIdentity,
  fingerprintCanonicalExerciseLog,
  clearActiveWorkoutSessionData,
  clearStaleActiveWorkoutData,
  listActiveWorkoutOperations,
  readActiveWorkoutSessionCache,
  writeActiveWorkoutSessionCache,
  type ActiveWorkoutOperation,
  type ActiveWorkoutSyncCoordinator,
  type ActiveWorkoutSetConflict,
  type ActiveWorkoutSyncState
} from "../active-session-sync";
import type {
  ActiveSessionPersistenceAdapter,
  CanonicalWorkoutSetWrite,
  CompleteActiveSessionInput,
  ReplaceActiveSessionExerciseInput
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
  syncState: ActiveWorkoutSyncState;
  pendingOperationCount: number;
  dataConflict: ActiveWorkoutSetConflict | null;
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
  reconcile?: boolean;
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
  resolveDataConflict(strategy: "server" | "local"): Promise<void>;
  saveCanonicalSets(logs: CanonicalWorkoutSetWrite[]): Promise<void>;
  completeCanonicalSet(input: CompleteCanonicalSetInput): Promise<SessionCommandResponse>;
  replaceExercise(
    input: Omit<
      ReplaceActiveSessionExerciseInput,
      "userId" | "workoutSessionId" | "controllerDeviceId"
    >
  ): Promise<void>;
  skipExercise(
    snapshotItemId: string,
    reason?: WorkoutSessionExerciseSkipReason
  ): Promise<void>;
  completeSession(
    input: Omit<
      CompleteActiveSessionInput,
      "userId" | "workoutSessionId" | "controllerDeviceId"
    >
  ): Promise<void>;
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
    finalProjection: null,
    syncState: "online_synced",
    pendingOperationCount: 0,
    dataConflict: null
  };
}

function storeKey(userId: string, workoutSessionId: string) {
  return `${userId}:${workoutSessionId}`;
}

let staleCleanupPromise: Promise<void> | null = null;

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

function pendingSetDetails(
  operation: ActiveWorkoutOperation,
  write: CanonicalWorkoutSetWrite,
  exerciseLogId: string
): ExerciseLog["set_details"] {
  if (!write.setDetails) return null;
  const details = write.setDetails;
  return {
    exercise_log_id: exerciseLogId,
    workout_session_id: operation.workoutSessionId,
    user_id: operation.userId,
    schema_version: details.schemaVersion ?? 1,
    set_type: details.setType,
    rpe: details.rpe ?? null,
    rir: details.rir ?? null,
    notes: details.notes ?? write.notes ?? null,
    side_mode: details.sideMode ?? "none",
    planned_tempo: details.plannedTempo ?? null,
    performed_tempo: details.performedTempo ?? null,
    tempo_adherence: details.tempoAdherence ?? "not_recorded",
    source: details.source ?? write.metricSource ?? "manual",
    source_provider:
      details.sourceProvider ?? write.metricSourceProvider ?? null,
    source_version:
      details.sourceVersion ?? write.metricSourceVersion ?? null,
    created_at: operation.createdAt,
    updated_at: operation.updatedAt
  };
}

function pendingWriteProjection(
  operation: ActiveWorkoutOperation,
  write: CanonicalWorkoutSetWrite,
  existing: ExerciseLog | undefined
): ExerciseLog {
  const id = existing?.id ?? `offline:${operation.id}`;
  return {
    id,
    workout_session_id: operation.workoutSessionId,
    plan_exercise_id: write.planExerciseId ?? existing?.plan_exercise_id ?? null,
    plan_activity_id: existing?.plan_activity_id ?? null,
    source_workout_id: existing?.source_workout_id ?? null,
    exercise_order: write.exerciseOrder ?? existing?.exercise_order ?? null,
    exercise_name: write.exerciseName,
    exercise_category:
      write.exerciseCategory ?? existing?.exercise_category ?? null,
    planned_sets: write.plannedSets ?? existing?.planned_sets ?? null,
    planned_reps: write.plannedReps ?? existing?.planned_reps ?? null,
    planned_rest_seconds:
      write.plannedRestSeconds ?? existing?.planned_rest_seconds ?? null,
    set_number: write.setNumber,
    reps: write.reps,
    weight_kg: write.weightKg,
    notes: write.notes ?? write.setDetails?.notes ?? null,
    completed_at: write.completedAt ?? null,
    created_at: existing?.created_at ?? operation.createdAt,
    set_type: write.setDetails?.setType ?? existing?.set_type,
    set_details:
      pendingSetDetails(operation, write, id) ?? existing?.set_details ?? null,
    performance_metrics: existing?.performance_metrics,
    segments: existing?.segments
  };
}

function projectPendingSetWrites(
  baseLogs: readonly ExerciseLog[],
  operations: readonly ActiveWorkoutOperation[]
): ExerciseLog[] {
  const projected = new Map<string, ExerciseLog>();
  const order: string[] = [];
  for (const log of baseLogs) {
    const identity = exerciseLogTargetIdentity(log);
    if (!projected.has(identity)) order.push(identity);
    projected.set(identity, log);
  }
  for (const operation of operations) {
    if (
      operation.payload.kind !== "set_write"
      || operation.payload.logs.length !== 1
      || operation.state === "applied"
      || operation.state === "discarded"
    ) continue;
    const write = operation.payload.logs[0];
    const identity = canonicalSetTargetIdentity(write);
    const existing = projected.get(identity);
    if (!projected.has(identity)) order.push(identity);
    projected.set(
      identity,
      pendingWriteProjection(operation, write, existing)
    );
  }
  return order.flatMap((identity) => {
    const log = projected.get(identity);
    return log ? [log] : [];
  });
}

export function createActiveSessionStore(input: {
  userId: string;
  workoutSessionId: string;
  adapter: ActiveSessionPersistenceAdapter;
  clearCompatibilityCache?: () => void;
  commandId?: () => string;
  controllerDeviceId?: string | null;
  tabId?: string;
}): ActiveSessionStore {
  let snapshot = initialSnapshot(input.userId, input.workoutSessionId);
  let hydrationPromise: Promise<void> | null = null;
  let disposed = false;
  let terminalizing = false;
  let canonicalExecutionState: WorkoutSessionExecutionState | null = null;
  let canonicalPerformedLogs: ExerciseLog[] = [];
  const listeners = new Set<Listener>();
  const selectorListeners = new Set<{
    listener: Listener;
    selector: (value: ActiveSessionSnapshot) => unknown;
    isEqual: (left: unknown, right: unknown) => boolean;
    selected: unknown;
  }>();
  const dispatcher = createSessionCommandDispatcher(input.adapter);
  let syncCoordinator: ActiveWorkoutSyncCoordinator | null = null;

  function requireUsable() {
    if (disposed) {
      throw new ActiveSessionError("invalid_transition", "The Active Workout store is disposed.");
    }
  }

  function requireLocalController() {
    const controllerDeviceId = input.controllerDeviceId;
    if (
      !controllerDeviceId
      || snapshot.executionState?.controller_device_id !== controllerDeviceId
    ) {
      throw new ActiveSessionControllerConflictError();
    }
    return controllerDeviceId;
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
    if (snapshot.root && snapshot.root.status === "started") {
      void writeActiveWorkoutSessionCache({
        schemaVersion: 1,
        userId: snapshot.userId,
        workoutSessionId: snapshot.workoutSessionId,
        root: snapshot.root,
        executionState: canonicalExecutionState ?? snapshot.executionState,
        prescription: [...snapshot.prescription],
        performedLogs: [...canonicalPerformedLogs],
        presentationSurface: snapshot.presentationSurface,
        lastValidSecondaryProjection: snapshot.lastValidSecondaryProjection,
        serverRevision:
          canonicalExecutionState?.revision
          ?? snapshot.executionState?.revision
          ?? null,
        controllerDeviceId:
          canonicalExecutionState?.controller_device_id
          ?? snapshot.executionState?.controller_device_id
          ?? null,
        syncState: snapshot.syncState
      }).catch(() => undefined);
    }
    return previous;
  }

  function coordinator() {
    if (syncCoordinator) return syncCoordinator;
    if (!input.controllerDeviceId) return null;
    syncCoordinator = createActiveWorkoutSyncCoordinator({
      userId: snapshot.userId,
      workoutSessionId: snapshot.workoutSessionId,
      controllerDeviceId: input.controllerDeviceId,
      tabId: input.tabId,
      adapter: input.adapter,
      onState(syncState, pendingOperationCount) {
        if (!disposed) publish({ syncState, pendingOperationCount });
      },
      onDataConflict(dataConflict) {
        if (!disposed) publish({ dataConflict });
      },
      onInvalidate() {
        if (disposed || isOffline() || hydrationPromise) return;
        void hydrate({ force: true, reconcile: false }).catch(() => undefined);
      }
    });
    return syncCoordinator;
  }

  function baseFingerprint(log: CanonicalWorkoutSetWrite) {
    const targetIdentity = canonicalSetTargetIdentity(log);
    const existing = canonicalPerformedLogs.find(
      (performed) => exerciseLogTargetIdentity(performed) === targetIdentity
    );
    return existing ? fingerprintCanonicalExerciseLog(existing) : null;
  }

  function isOffline() {
    return (
      typeof window !== "undefined"
      && typeof indexedDB !== "undefined"
      && !navigator.onLine
    );
  }

  const reconcileFromBrowserEvent = () => {
    if (
      disposed
      || isOffline()
      || (typeof document !== "undefined" && document.visibilityState === "hidden")
    ) return;
    const sync = coordinator();
    if (!sync) return;
    void sync.reconcile()
      .then((state) => {
        if (state !== "online_synced") return;
        return hydrate({ force: true, reconcile: false });
      })
      .catch(() => undefined);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("online", reconcileFromBrowserEvent);
    window.addEventListener("focus", reconcileFromBrowserEvent);
    document.addEventListener("visibilitychange", reconcileFromBrowserEvent);
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
    canonicalExecutionState = accepted;
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

  function planOfflineCommand(
    current: WorkoutSessionExecutionState,
    intent: SessionCommandIntent
  ) {
    return reduceSessionCommand(
      current,
      intent,
      {
        userId: snapshot.userId,
        workoutSessionId: snapshot.workoutSessionId,
        rootStatus: snapshot.root?.status ?? "started",
        prescription: snapshot.prescription,
        performedLogs: snapshot.performedLogs
      },
      Date.now()
    );
  }

  async function dispatch(
    intent: SessionCommandIntent
  ): Promise<SessionCommandResponse> {
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
    if (isOffline()) {
      const controllerDeviceId = requireLocalController();
      const current = snapshot.executionState;
      const transition = planOfflineCommand(current, intent);
      const request: SessionCommandRequest = {
        ...intent,
        expectedRevision: current.revision
      };
      const sync = coordinator();
      if (!sync) {
        throw new ActiveSessionError(
          "adapter_failure",
          "Offline workout storage is unavailable."
        );
      }
      await sync.enqueue(
        { kind: "command", request },
        current.revision
      );
      const state = transition.outcome === "applied"
        ? {
            ...transition.state,
            controller_device_id: controllerDeviceId,
            revision: current.revision + 1,
            updated_at: new Date().toISOString()
          }
        : current;
      dispatcher.replace(state);
      publish({
        executionState: state,
        syncState: "offline_saved",
        pendingOperationCount: await sync.pendingCount()
      });
      return {
        schemaVersion: 1,
        workoutSessionId: intent.workoutSessionId,
        commandId: intent.commandId,
        commandType: intent.commandType,
        outcome: transition.outcome,
        replayed: false,
        expectedRevision: current.revision,
        revisionBefore: current.revision,
        revisionAfter: state.revision,
        reason: transition.reason,
        state
      };
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
      } else if (error instanceof ActiveSessionControllerConflictError) {
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
      let performedLogs = snapshot.performedLogs;
      try {
        performedLogs = await input.adapter.loadPerformedLogs(
          snapshot.userId,
          snapshot.workoutSessionId
        );
      } catch {
        // Terminal proof remains authoritative. Derived presentation may use
        // the last hydrated canonical projection when a post-terminal read
        // is temporarily unavailable.
      }
      const finalProjection: ActiveSessionFinalProjection = Object.freeze({
        root,
        previousExecutionState,
        prescription: snapshot.prescription,
        performedLogs
      });
      dispatcher.clear(snapshot.userId, snapshot.workoutSessionId);
      input.clearCompatibilityCache?.();
      await clearActiveWorkoutSessionData(
        snapshot.userId,
        snapshot.workoutSessionId
      ).catch(() => undefined);
      publish({
        root,
        executionState: null,
        presentationSurface: "completion",
        hydrationStatus: "terminal",
        command: { phase: "idle", commandId: null, commandType: null },
        pendingTransportRequest: null,
        performedLogs,
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

  function hydrate(options: HydrateActiveSessionOptions = {}) {
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
        const offline = isOffline();
        if (typeof indexedDB !== "undefined") {
          staleCleanupPromise ??= clearStaleActiveWorkoutData()
            .catch(() => undefined);
          if (offline) await staleCleanupPromise;
        }
        const cached = !offline || typeof indexedDB === "undefined"
          ? null
          : await readActiveWorkoutSessionCache(
              snapshot.userId,
              snapshot.workoutSessionId
            ).catch(() => null);
        if (cached) {
          canonicalExecutionState = cached.executionState;
          canonicalPerformedLogs = [...cached.performedLogs];
          let localExecutionState = cached.executionState;
          const pendingOperations = await listActiveWorkoutOperations(
            snapshot.userId,
            snapshot.workoutSessionId
          );
          let localPerformedLogs = [...cached.performedLogs];
          let terminalPending = false;
          if (localExecutionState && cached.root.status === "started") {
            for (const operation of pendingOperations) {
              if (operation.payload.kind === "set_write") {
                localPerformedLogs = projectPendingSetWrites(
                  localPerformedLogs,
                  [operation]
                );
                continue;
              }
              if (operation.payload.kind === "complete_session") {
                terminalPending = true;
                continue;
              }
              const transition = reduceSessionCommand(
                localExecutionState,
                operation.payload.request,
                {
                  userId: snapshot.userId,
                  workoutSessionId: snapshot.workoutSessionId,
                  rootStatus: cached.root.status,
                  prescription: cached.prescription,
                  performedLogs: localPerformedLogs
                },
                Date.parse(operation.createdAt)
              );
              if (transition.outcome !== "applied") continue;
              localExecutionState = {
                ...transition.state,
                revision: localExecutionState.revision + 1,
                updated_at: operation.createdAt
              };
            }
          }
          publish({
            root: cached.root,
            executionState: localExecutionState,
            prescription: cached.prescription,
            performedLogs: localPerformedLogs,
            presentationSurface: cached.presentationSurface,
            lastValidSecondaryProjection: cached.lastValidSecondaryProjection,
            hydrationStatus: "ready",
            syncState: terminalPending ? "terminal_pending" : "offline_saved",
            pendingOperationCount: pendingOperations.length
          });
          if (localExecutionState) dispatcher.replace(localExecutionState);
          return;
        }
        if (offline) {
          throw new ActiveSessionError(
            "hydration_failed",
            "No durable offline snapshot is available for this workout."
          );
        }
        const canonicalLoads = Promise.all([
          input.adapter.loadSessionRoot(snapshot.userId, snapshot.workoutSessionId),
          input.adapter.loadExecutionState(snapshot.userId, snapshot.workoutSessionId),
          input.adapter.loadPrescription(snapshot.userId, snapshot.workoutSessionId),
          input.adapter.loadPerformedLogs(snapshot.userId, snapshot.workoutSessionId)
        ]);
        if (options.reconcile !== false && coordinator()) {
          await coordinator()!.reconcile();
        }
        const [root, executionState, prescription, performedLogs] =
          await canonicalLoads;
        if (disposed || generation !== snapshot.hydrationGeneration) return;
        validateHydrationIdentity(
          snapshot,
          root,
          executionState,
          prescription,
          performedLogs
        );
        canonicalExecutionState = executionState;
        canonicalPerformedLogs = [...performedLogs];
        const hydratedFinalProjection =
          root!.status !== "started" && snapshot.executionState
            ? Object.freeze({
                root: root!,
                previousExecutionState: snapshot.executionState,
                prescription,
                performedLogs
              })
            : null;
        publish({
          root,
          executionState,
          prescription,
          performedLogs,
          hydrationStatus: root!.status === "started" ? "ready" : "terminal",
          presentationSurface:
            root!.status === "started" ? snapshot.presentationSurface : "completion",
          syncState: "online_synced",
          pendingOperationCount:
            await coordinator()?.pendingCount() ?? 0,
          finalProjection: hydratedFinalProjection
        });
        if (root!.status !== "started") {
          input.clearCompatibilityCache?.();
          await clearActiveWorkoutSessionData(
            snapshot.userId,
            snapshot.workoutSessionId
          ).catch(() => undefined);
        }
        if (executionState) dispatcher.replace(executionState);
        if (
          executionState
          && eligibleLegacyCache(snapshot, executionState, options.legacyCache)
        ) {
          const cache = options.legacyCache!;
          const localControllerDeviceId =
            input.controllerDeviceId ?? cache.controllerDeviceId ?? null;
          if (localControllerDeviceId) {
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
                  controller_device_id: localControllerDeviceId
                }
              });
            } catch {
              // Canonical hydration remains usable; dispatch records the bounded typed error.
            }
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
  }

  async function mutateSessionProjection(operation: () => Promise<unknown>) {
    requireUsable();
    if (!snapshot.root || snapshot.root.status !== "started" || !snapshot.executionState) {
      throw new ActiveSessionError(
        "terminal_mutation_attempt",
        "This workout cannot accept another projection mutation."
      );
    }
    try {
      await operation();
      await hydrate({ force: true });
    } catch (error) {
      if (error instanceof ActiveSessionError) throw error;
      const typed = new ActiveSessionError(
        "adapter_failure",
        "The workout projection could not be updated.",
        error
      );
      publish({ recoverableError: typed });
      throw typed;
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
    hydrate,
    reconcile: acceptState,
    dispatch,
    async retryPendingTransport() {
      requireUsable();
      if (!snapshot.pendingTransportRequest && coordinator()) {
        await coordinator()!.reconcile({ force: true });
        await hydrate({ force: true, reconcile: false });
        const state = snapshot.executionState;
        if (!state) {
          throw new ActiveSessionError(
            "hydration_failed",
            "Workout execution state is unavailable after synchronization."
          );
        }
        return {
          schemaVersion: 1,
          workoutSessionId: snapshot.workoutSessionId,
          commandId: createSessionCommandId(input.commandId),
          commandType: "move_cursor",
          outcome: "no_op",
          replayed: false,
          expectedRevision: state.revision,
          revisionBefore: state.revision,
          revisionAfter: state.revision,
          reason: "offline_queue_reconciled",
          state
        };
      }
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
    async resolveDataConflict(strategy) {
      const sync = coordinator();
      const conflict = snapshot.dataConflict;
      if (!sync || !conflict) return;
      await sync.resolveDataConflict(conflict.operationId, strategy);
      await hydrate({ force: true, reconcile: false });
    },
    async completeCanonicalSet(setInput) {
      requireUsable();
      if (isOffline()) {
        const controllerDeviceId = requireLocalController();
        const current = snapshot.executionState;
        if (!current) {
          throw new ActiveSessionError(
            "hydration_failed",
            "Workout execution state is unavailable."
          );
        }
        planOfflineCommand(current, setInput.executionIntent);
        const sync = coordinator();
        if (!sync) throw new ActiveSessionError(
          "adapter_failure",
          "Offline workout storage is unavailable."
        );
        const queuedOperations: ActiveWorkoutOperation[] = [];
        for (const log of setInput.logs) {
          queuedOperations.push(await sync.enqueue({
            kind: "set_write",
            workoutSessionId: snapshot.workoutSessionId,
            controllerDeviceId,
            logs: [log]
          }, current.revision, baseFingerprint(log)));
        }
        publish({
          performedLogs: projectPendingSetWrites(
            snapshot.performedLogs,
            queuedOperations
          )
        });
        return dispatch(setInput.executionIntent);
      }
      try {
        await input.adapter.writeCanonicalSet(
          snapshot.workoutSessionId,
          setInput.logs,
          requireLocalController()
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
          canonicalPerformedLogs = [...performedLogs];
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
      if (isOffline()) {
        const controllerDeviceId = requireLocalController();
        const sync = coordinator();
        if (!sync) throw new ActiveSessionError(
          "adapter_failure",
          "Offline workout storage is unavailable."
        );
        const queuedOperations: ActiveWorkoutOperation[] = [];
        for (const log of logs) {
          queuedOperations.push(await sync.enqueue({
            kind: "set_write",
            workoutSessionId: snapshot.workoutSessionId,
            controllerDeviceId,
            logs: [log]
          }, snapshot.executionState?.revision ?? null, baseFingerprint(log)));
        }
        publish({
          performedLogs: projectPendingSetWrites(
            snapshot.performedLogs,
            queuedOperations
          ),
          syncState: "offline_saved",
          pendingOperationCount: await sync.pendingCount()
        });
        return;
      }
      await input.adapter.writeCanonicalSet(
        snapshot.workoutSessionId,
        logs,
        requireLocalController()
      );
      const performedLogs = await input.adapter.loadPerformedLogs(
        snapshot.userId,
        snapshot.workoutSessionId
      );
      canonicalPerformedLogs = [...performedLogs];
      publish({ performedLogs });
    },
    replaceExercise(replacementInput) {
      if (isOffline()) {
        return Promise.reject(new ActiveSessionError(
          "invalid_transition",
          "Exercise replacement requires a connection."
        ));
      }
      return mutateSessionProjection(() =>
        input.adapter.replaceExercise({
          ...replacementInput,
          userId: snapshot.userId,
          workoutSessionId: snapshot.workoutSessionId,
          controllerDeviceId: requireLocalController()
        })
      );
    },
    skipExercise(snapshotItemId, reason) {
      if (isOffline()) {
        return Promise.reject(new ActiveSessionError(
          "invalid_transition",
          "Skipping an exercise requires a connection."
        ));
      }
      return mutateSessionProjection(() =>
        input.adapter.skipExercise(
          snapshot.userId,
          snapshot.workoutSessionId,
          snapshotItemId,
          reason,
          requireLocalController()
        )
      );
    },
    completeSession(completeInput) {
      if (isOffline()) {
        const controllerDeviceId = requireLocalController();
        const sync = coordinator();
        if (!sync) return Promise.reject(new ActiveSessionError(
          "adapter_failure",
          "Offline workout storage is unavailable."
        ));
        return sync.enqueue({
          kind: "complete_session",
          input: {
            ...completeInput,
            userId: snapshot.userId,
            workoutSessionId: snapshot.workoutSessionId,
            controllerDeviceId,
            finalLogs: undefined
          }
        }, snapshot.executionState?.revision ?? null).then(async () => {
          publish({
            syncState: "terminal_pending",
            pendingOperationCount: await sync.pendingCount()
          });
        });
      }
      return terminalize(() => input.adapter.completeSession({
        ...completeInput,
        userId: snapshot.userId,
        workoutSessionId: snapshot.workoutSessionId,
        controllerDeviceId: requireLocalController()
      }));
    },
    cancelSession() {
      if (isOffline()) {
        return Promise.reject(new ActiveSessionError(
          "invalid_transition",
          "Cancelling a workout requires a connection."
        ));
      }
      return terminalize(() =>
        input.adapter.cancelSession(
          snapshot.userId,
          snapshot.workoutSessionId,
          requireLocalController()
        )
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
      syncCoordinator?.dispose();
      syncCoordinator = null;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", reconcileFromBrowserEvent);
        window.removeEventListener("focus", reconcileFromBrowserEvent);
        document.removeEventListener("visibilitychange", reconcileFromBrowserEvent);
      }
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
  controllerDeviceId?: string | null;
  tabId?: string;
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

export function releaseActiveSessionStoresForUser(userId: string) {
  for (const [key, store] of activeSessionStores) {
    if (!key.startsWith(`${userId}:`)) continue;
    store.dispose();
    activeSessionStores.delete(key);
  }
}
