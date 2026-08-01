import {
  acquireActiveWorkoutFallbackLease,
  type ActiveWorkoutFallbackLease,
} from "./fallback-lease";

const LEASE_MS = 15_000;

export type ActiveWorkoutTabLeadership = {
  tabId: string;
  isLeader(): boolean;
  acquire(force?: boolean): Promise<boolean>;
  renew(): boolean;
  release(): void;
  dispose(): void;
  subscribe(listener: (leader: boolean) => void): () => void;
};

export function createActiveWorkoutTabLeadership(input: {
  userId: string;
  workoutSessionId: string;
}): ActiveWorkoutTabLeadership {
  const tabId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const key = `plaivra.active-workout.leader.${input.userId}.${input.workoutSessionId}`;
  const listeners = new Set<(leader: boolean) => void>();
  let activeLease: ActiveWorkoutFallbackLease | null = null;
  let disposed = false;

  function storage(): Storage | null {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  }

  function isLeader() {
    return !disposed && Boolean(activeLease?.owns());
  }

  function notify() {
    const value = isLeader();
    for (const listener of listeners) listener(value);
  }

  async function acquire(force = false) {
    if (disposed) return false;
    const leaseStorage = storage();
    if (!leaseStorage) {
      activeLease = null;
      notify();
      return false;
    }

    if (force) {
      activeLease?.release();
      activeLease = null;
      try {
        leaseStorage.removeItem(key);
      } catch {
        notify();
        return false;
      }
    }

    const nextLease = await acquireActiveWorkoutFallbackLease({
      storage: leaseStorage,
      key,
      ownerId: tabId,
      leaseMs: LEASE_MS,
    });
    if (disposed) {
      nextLease?.release();
      return false;
    }
    if (nextLease) {
      activeLease?.release();
      activeLease = nextLease;
    }
    notify();
    return isLeader();
  }

  function renew() {
    const renewed = activeLease?.renew() ?? false;
    if (!renewed) activeLease = null;
    notify();
    return renewed;
  }

  function release() {
    activeLease?.release();
    activeLease = null;
    notify();
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    if (activeLease && !activeLease.owns()) activeLease = null;
    notify();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    tabId,
    isLeader,
    acquire,
    renew,
    release,
    dispose() {
      if (disposed) return;
      release();
      disposed = true;
      if (typeof window !== "undefined")
        window.removeEventListener("storage", onStorage);
      listeners.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
