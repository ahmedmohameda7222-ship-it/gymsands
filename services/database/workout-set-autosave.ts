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
      void requestFlush();
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

    inFlight = (async () => {
      try {
        await adapter.persistSnapshot(snapshot);
        if (cancelled) return;
        getAdapter().acknowledgeSnapshot(snapshot);
      } catch (error) {
        if (cancelled) return;
        getAdapter().onFailure?.(error);
        if (getAdapter().hasPendingWrites(getAdapter().getSnapshot())) {
          scheduleFlush(retryDelayMs);
        }
      } finally {
        inFlight = null;
        if (cancelled) return;
        if (flushRequestedWhileSaving) {
          flushRequestedWhileSaving = false;
          await requestFlush();
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
