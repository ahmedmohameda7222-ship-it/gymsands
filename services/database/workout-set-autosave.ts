export type WorkoutSetAutosaveAdapter<TSnapshot> = {
  getSnapshot: () => TSnapshot;
  hasPendingWrites: (snapshot: TSnapshot) => boolean;
  persistSnapshot: (snapshot: TSnapshot) => Promise<void>;
  acknowledgeSnapshot: (snapshot: TSnapshot) => void;
  onFailure?: (error: unknown) => void;
};

type TimerHandle = ReturnType<typeof setTimeout>;

type WorkoutSetAutosaveOptions = {
  retryDelayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};

export type WorkoutSetAutosaveCoordinator = {
  requestFlush: () => Promise<void>;
  scheduleFlush: (delayMs: number) => void;
  cancel: () => void;
  isSaving: () => boolean;
};

function isRetryableAutosaveError(error: unknown) {
  return !(
    error
    && typeof error === "object"
    && "retryable" in error
    && error.retryable === false
  );
}

export function createWorkoutSetAutosaveCoordinator<TSnapshot>(
  getAdapter: () => WorkoutSetAutosaveAdapter<TSnapshot>,
  options: WorkoutSetAutosaveOptions = {},
): WorkoutSetAutosaveCoordinator {
  const retryDelayMs = options.retryDelayMs ?? 1500;
  const setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  let inFlight: Promise<void> | null = null;
  let flushRequestedWhileSaving = false;
  let timer: TimerHandle | null = null;
  let cancelled = false;

  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const scheduleFlush = (delayMs: number) => {
    if (cancelled) return;
    cancelTimer();
    timer = setTimer(() => {
      timer = null;
      void requestFlush().catch(() => {
        // Background autosave remains recoverable. Explicit callers receive
        // the rejection and can block navigation or review transitions.
      });
    }, Math.max(0, delayMs));
  };

  const requestFlush = async (): Promise<void> => {
    if (cancelled) return;
    cancelTimer();
    if (inFlight) {
      flushRequestedWhileSaving = true;
      return inFlight;
    }

    const adapter = getAdapter();
    const snapshot = adapter.getSnapshot();
    if (!adapter.hasPendingWrites(snapshot)) return;

    let succeeded = false;
    inFlight = (async () => {
      try {
        await adapter.persistSnapshot(snapshot);
        if (cancelled) return;
        getAdapter().acknowledgeSnapshot(snapshot);
        succeeded = true;
      } catch (error) {
        if (cancelled) return;
        if (isRetryableAutosaveError(error)) {
          getAdapter().onFailure?.(error);
          if (getAdapter().hasPendingWrites(getAdapter().getSnapshot())) {
            scheduleFlush(retryDelayMs);
          }
        }
        throw error;
      } finally {
        inFlight = null;
        if (cancelled) return;
        if (flushRequestedWhileSaving) {
          flushRequestedWhileSaving = false;
          if (succeeded) await requestFlush();
        }
      }
    })();

    return inFlight;
  };

  return {
    requestFlush,
    scheduleFlush,
    cancel() {
      cancelled = true;
      cancelTimer();
    },
    isSaving() {
      return inFlight !== null;
    },
  };
}

export function mountWorkoutSetAutosaveCoordinator<TSnapshot>(
  coordinatorRef: { current: WorkoutSetAutosaveCoordinator | null },
  getAdapter: () => WorkoutSetAutosaveAdapter<TSnapshot>,
  options: WorkoutSetAutosaveOptions = {},
) {
  const coordinator = createWorkoutSetAutosaveCoordinator(getAdapter, options);
  coordinatorRef.current = coordinator;
  return () => {
    coordinator.cancel();
    if (coordinatorRef.current === coordinator) {
      coordinatorRef.current = null;
    }
  };
}
