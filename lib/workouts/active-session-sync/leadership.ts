const LEASE_MS = 15_000;

type Lease = {
  tabId: string;
  expiresAt: number;
};

export type ActiveWorkoutTabLeadership = {
  tabId: string;
  isLeader(): boolean;
  acquire(force?: boolean): boolean;
  renew(): boolean;
  release(): void;
  subscribe(listener: (leader: boolean) => void): () => void;
};

function parseLease(value: string | null): Lease | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Lease>;
    return typeof parsed.tabId === "string"
      && Number.isFinite(parsed.expiresAt)
      ? { tabId: parsed.tabId, expiresAt: Number(parsed.expiresAt) }
      : null;
  } catch {
    return null;
  }
}

export function createActiveWorkoutTabLeadership(input: {
  userId: string;
  workoutSessionId: string;
}): ActiveWorkoutTabLeadership {
  const tabId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const key = `plaivra.active-workout.leader.${input.userId}.${input.workoutSessionId}`;
  const listeners = new Set<(leader: boolean) => void>();
  let releaseNavigatorLock: (() => void) | null = null;
  let navigatorLockPending = false;

  function acquireNavigatorLock() {
    if (
      navigatorLockPending
      || typeof navigator === "undefined"
      || !navigator.locks
    ) return;
    navigatorLockPending = true;
    void navigator.locks.request(key, { mode: "exclusive" }, async () => {
      if (!isLeader()) {
        navigatorLockPending = false;
        return;
      }
      await new Promise<void>((resolve) => {
        releaseNavigatorLock = resolve;
      });
      releaseNavigatorLock = null;
      navigatorLockPending = false;
    });
  }

  function current() {
    if (typeof localStorage === "undefined") return null;
    const lease = parseLease(localStorage.getItem(key));
    if (lease && lease.expiresAt <= Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    return lease;
  }

  function isLeader() {
    return current()?.tabId === tabId;
  }

  function notify() {
    const value = isLeader();
    for (const listener of listeners) listener(value);
  }

  function acquire(force = false) {
    if (typeof localStorage === "undefined") return true;
    const lease = current();
    if (lease && lease.tabId !== tabId && !force) {
      notify();
      return false;
    }
    localStorage.setItem(
      key,
      JSON.stringify({ tabId, expiresAt: Date.now() + LEASE_MS }),
    );
    acquireNavigatorLock();
    notify();
    return isLeader();
  }

  function release() {
    if (typeof localStorage !== "undefined" && isLeader())
      localStorage.removeItem(key);
    releaseNavigatorLock?.();
    notify();
    if (typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    if (!isLeader()) releaseNavigatorLock?.();
    notify();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    tabId,
    isLeader,
    acquire,
    renew() {
      return isLeader() ? acquire(true) : false;
    },
    release,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
