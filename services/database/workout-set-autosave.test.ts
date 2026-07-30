import { describe, expect, it, vi } from "vitest";
import { createWorkoutSetAutosaveCoordinator, mountWorkoutSetAutosaveCoordinator } from "./workout-set-autosave";

type Snapshot = { revision: number; dirty: boolean };

describe("AW-3B completed-set autosave coordinator", () => {
  it("serializes writes and preserves a newer edit after an older request succeeds", async () => {
    let current: Snapshot = { revision: 1, dirty: true };
    const persisted: Snapshot[] = [];
    let releaseFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const coordinator = createWorkoutSetAutosaveCoordinator(() => ({
      getSnapshot: () => current,
      hasPendingWrites: (snapshot) => snapshot.dirty,
      persistSnapshot: async (snapshot) => {
        persisted.push({ ...snapshot });
        if (snapshot.revision === 1) await firstSave;
      },
      acknowledgeSnapshot: (saved) => {
        if (current.revision === saved.revision) current = { ...current, dirty: false };
      },
    }));

    const firstFlush = coordinator.requestFlush();
    current = { revision: 2, dirty: true };
    const secondFlush = coordinator.requestFlush();
    releaseFirst();
    await Promise.all([firstFlush, secondFlush]);

    expect(persisted).toEqual([
      { revision: 1, dirty: true },
      { revision: 2, dirty: true },
    ]);
    expect(current).toEqual({ revision: 2, dirty: false });
  });

  it("rejects an explicit failed flush, retains dirty state, and schedules retry", async () => {
    let current: Snapshot = { revision: 1, dirty: true };
    let attempts = 0;
    const scheduled: Array<() => void> = [];
    const failures: unknown[] = [];
    const coordinator = createWorkoutSetAutosaveCoordinator(
      () => ({
        getSnapshot: () => current,
        hasPendingWrites: (snapshot) => snapshot.dirty,
        persistSnapshot: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("transient");
        },
        acknowledgeSnapshot: () => { current = { ...current, dirty: false }; },
        onFailure: (error) => failures.push(error),
      }),
      {
        setTimer: (callback) => {
          scheduled.push(callback);
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: vi.fn(),
      },
    );

    await expect(coordinator.requestFlush()).rejects.toThrow("transient");
    expect(current.dirty).toBe(true);
    expect(failures).toHaveLength(1);
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(attempts).toBe(2);
    expect(current.dirty).toBe(false);
  });

  it("does not retry expected non-retryable draft validation failures", async () => {
    const scheduled: Array<() => void> = [];
    const onFailure = vi.fn();
    const validationError = Object.assign(new Error("invalid draft"), {
      retryable: false
    });
    const coordinator = createWorkoutSetAutosaveCoordinator(
      () => ({
        getSnapshot: () => ({ revision: 1, dirty: true }),
        hasPendingWrites: (snapshot: Snapshot) => snapshot.dirty,
        persistSnapshot: async () => { throw validationError; },
        acknowledgeSnapshot: vi.fn(),
        onFailure,
      }),
      {
        setTimer: (callback) => {
          scheduled.push(callback);
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: vi.fn(),
      },
    );

    await expect(coordinator.requestFlush()).rejects.toBe(validationError);
    expect(onFailure).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);
  });

  it("does not write when no snapshot is pending", async () => {
    const persistSnapshot = vi.fn(async () => undefined);
    const coordinator = createWorkoutSetAutosaveCoordinator(() => ({
      getSnapshot: () => ({ revision: 1, dirty: false }),
      hasPendingWrites: (snapshot: Snapshot) => snapshot.dirty,
      persistSnapshot,
      acknowledgeSnapshot: vi.fn(),
    }));

    await coordinator.requestFlush();
    expect(persistSnapshot).not.toHaveBeenCalled();
  });

  it("replaces a cancelled Strict Mode mount with a live coordinator", async () => {
    let current: Snapshot = { revision: 1, dirty: true };
    const persisted: Snapshot[] = [];
    const coordinatorRef: { current: ReturnType<typeof createWorkoutSetAutosaveCoordinator<Snapshot>> | null } = { current: null };
    const getAdapter = () => ({
      getSnapshot: () => current,
      hasPendingWrites: (snapshot: Snapshot) => snapshot.dirty,
      persistSnapshot: async (snapshot: Snapshot) => { persisted.push({ ...snapshot }); },
      acknowledgeSnapshot: (saved: Snapshot) => {
        if (current.revision === saved.revision) current = { ...current, dirty: false };
      },
    });

    const cleanupFirstMount = mountWorkoutSetAutosaveCoordinator(coordinatorRef, getAdapter);
    const cancelledCoordinator = coordinatorRef.current;
    cleanupFirstMount();
    expect(coordinatorRef.current).toBeNull();

    const cleanupSecondMount = mountWorkoutSetAutosaveCoordinator(coordinatorRef, getAdapter);
    expect(coordinatorRef.current).not.toBe(cancelledCoordinator);
    await coordinatorRef.current?.requestFlush();
    expect(persisted).toEqual([{ revision: 1, dirty: true }]);
    expect(current.dirty).toBe(false);
    cleanupSecondMount();
    expect(coordinatorRef.current).toBeNull();
  });
});
