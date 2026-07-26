export type ActiveSessionClock = {
  now(): number;
  getSnapshot(): number;
  subscribe(listener: () => void): () => void;
};

type ClockEnvironment = {
  now: () => number;
  setInterval: (listener: () => void, milliseconds: number) => unknown;
  clearInterval: (handle: unknown) => void;
  addVisibilityListener: (listener: () => void) => () => void;
  addFocusListener: (listener: () => void) => () => void;
};

function browserEnvironment(): ClockEnvironment {
  return {
    now: () => Date.now(),
    setInterval: (listener, milliseconds) =>
      globalThis.setInterval(listener, milliseconds),
    clearInterval: (handle) =>
      globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
    addVisibilityListener(listener) {
      if (typeof document === "undefined") return () => undefined;
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
    addFocusListener(listener) {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener("focus", listener);
      return () => window.removeEventListener("focus", listener);
    }
  };
}

export function createActiveSessionClock(
  environment: ClockEnvironment = browserEnvironment(),
  cadenceMs = 1_000
): ActiveSessionClock {
  let current = environment.now();
  let interval: unknown = null;
  let removeVisibility: (() => void) | null = null;
  let removeFocus: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function publish() {
    current = environment.now();
    for (const listener of listeners) listener();
  }

  function start() {
    if (interval !== null) return;
    interval = environment.setInterval(publish, cadenceMs);
    removeVisibility = environment.addVisibilityListener(publish);
    removeFocus = environment.addFocusListener(publish);
  }

  function stop() {
    if (interval !== null) environment.clearInterval(interval);
    interval = null;
    removeVisibility?.();
    removeVisibility = null;
    removeFocus?.();
    removeFocus = null;
  }

  return {
    now: environment.now,
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      publish();
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    }
  };
}

export const activeSessionClock = createActiveSessionClock();
