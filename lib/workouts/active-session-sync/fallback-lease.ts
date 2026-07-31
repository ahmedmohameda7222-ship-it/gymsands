const DEFAULT_STABILIZATION_MS = 25;

export type ActiveWorkoutFallbackLeaseRecord = {
  ownerId: string;
  fenceToken: string;
  expiresAt: number;
};

type LeaseStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type LeaseClock = {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
  token(): string;
};

export type ActiveWorkoutFallbackLease = {
  owns(): boolean;
  renew(): boolean;
  release(): void;
};

function parseLease(value: string | null): ActiveWorkoutFallbackLeaseRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ActiveWorkoutFallbackLeaseRecord>;
    if (
      typeof parsed.ownerId !== "string"
      || !parsed.ownerId
      || typeof parsed.fenceToken !== "string"
      || !parsed.fenceToken
      || !Number.isFinite(parsed.expiresAt)
    ) return null;
    return {
      ownerId: parsed.ownerId,
      fenceToken: parsed.fenceToken,
      expiresAt: Number(parsed.expiresAt),
    };
  } catch {
    return null;
  }
}

function defaultClock(): LeaseClock {
  return {
    now: () => Date.now(),
    sleep: (milliseconds) =>
      new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)),
    token: () =>
      globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random()}`,
  };
}

export async function acquireActiveWorkoutFallbackLease(input: {
  storage: LeaseStorage;
  key: string;
  ownerId: string;
  leaseMs: number;
  stabilizationMs?: number;
  clock?: LeaseClock;
}): Promise<ActiveWorkoutFallbackLease | null> {
  const clock = input.clock ?? defaultClock();
  const now = clock.now();
  const current = parseLease(input.storage.getItem(input.key));
  if (
    current
    && current.expiresAt > now
    && current.ownerId !== input.ownerId
  ) return null;

  const fenceToken = clock.token();
  const candidate: ActiveWorkoutFallbackLeaseRecord = {
    ownerId: input.ownerId,
    fenceToken,
    expiresAt: now + input.leaseMs,
  };
  input.storage.setItem(input.key, JSON.stringify(candidate));

  // localStorage has no compare-and-swap. A short stabilization turn lets
  // simultaneous contenders settle; only the last persisted fenced token
  // may enter the flush lane.
  await clock.sleep(input.stabilizationMs ?? DEFAULT_STABILIZATION_MS);

  const isOwned = () => {
    const persisted = parseLease(input.storage.getItem(input.key));
    return Boolean(
      persisted
      && persisted.ownerId === input.ownerId
      && persisted.fenceToken === fenceToken
      && persisted.expiresAt > clock.now(),
    );
  };

  if (!isOwned()) return null;

  return {
    owns: isOwned,
    renew() {
      if (!isOwned()) return false;
      input.storage.setItem(
        input.key,
        JSON.stringify({
          ownerId: input.ownerId,
          fenceToken,
          expiresAt: clock.now() + input.leaseMs,
        } satisfies ActiveWorkoutFallbackLeaseRecord),
      );
      return isOwned();
    },
    release() {
      if (isOwned()) input.storage.removeItem(input.key);
    },
  };
}
