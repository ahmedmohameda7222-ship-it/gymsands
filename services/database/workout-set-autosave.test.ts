import { describe, expect, it, vi } from "vitest";
import { createWorkoutSetAutosaveCoordinator } from "./workout-set-autosave";

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

  it("retains dirty state after failure and schedules an automatic retry", async () => {
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

    await coordinator.requestFlush();
    expect(current.dirty).toBe(true);
    expect(failures).toHaveLength(1);
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(attempts).toBe(2);
    expect(current.dirty).toBe(false);
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
});
