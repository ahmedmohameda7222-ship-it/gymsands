// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const profileUpsert = vi.fn().mockResolvedValue({ error: null });
  return {
    rpc: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    authSignOut: vi.fn(),
    routerReplace: vi.fn(),
    clearActiveWorkout: vi.fn().mockResolvedValue(undefined),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    releaseStores: vi.fn(),
    profileUpsert,
    profileFrom: vi.fn(() => ({ upsert: profileUpsert })),
    authCallback: null as null | ((event: string, session: Session | null) => void),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
}));
vi.mock("@/lib/env", () => ({
  env: { useMockAuth: false, productionQaBuild: false },
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.authSignOut,
    },
    rpc: mocks.rpc,
    from: mocks.profileFrom,
  },
}));
vi.mock("@/lib/workouts/active-session-sync", () => ({
  clearActiveWorkoutUserData: mocks.clearActiveWorkout,
}));
vi.mock("@/lib/workouts/active-session-store/store", () => ({
  releaseActiveSessionStoresForUser: mocks.releaseStores,
}));
vi.mock("@/lib/workouts/history/offline-cache", () => ({
  clearWorkoutHistoryOwnerCache: mocks.clearHistory,
}));

import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { privateAppBootstrapMemoryCache } from "@/lib/auth/private-app-bootstrap";
import { REQUIRED_CONSENTS } from "@/lib/legal/versions";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const userC = "33333333-3333-4333-8333-333333333333";

function session(userId: string): Session {
  return {
    user: { id: userId, email: `${userId}@example.test` },
    access_token: `access-${userId}`,
    refresh_token: `refresh-${userId}`,
    token_type: "bearer",
    expires_in: 3600,
  } as Session;
}

function rpcPayload(userId: string) {
  return {
    contractVersion: 1,
    userId,
    profile: {
      id: userId,
      email: `${userId}@example.test`,
      full_name: "Member",
      role: "member",
      avatar_url: null,
      created_at: "2026-08-03T00:00:00.000Z",
      updated_at: "2026-08-03T00:00:00.000Z",
    },
    accountAccessState: "active",
    consentRecords: REQUIRED_CONSENTS.map((record) => ({
      ...record,
      granted: true,
      revoked_at: null,
    })),
    onboarding: {
      age: 25,
      completed_at: "2026-08-03T00:00:00.000Z",
    },
    settings: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

type AuthSnapshot = ReturnType<typeof useAuth>;
let latest: AuthSnapshot | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe() {
  const auth = useAuth();
  useEffect(() => {
    latest = auth;
  }, [auth]);
  return <div data-status={auth.bootstrapStatus} />;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function emitAuthEvent(event: string, nextSession: Session | null) {
  await act(async () => {
    mocks.authCallback?.(event, nextSession);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(initialSession: Session | null) {
  mocks.getSession.mockResolvedValue({
    data: { session: initialSession },
    error: null,
  });
  mocks.onAuthStateChange.mockImplementation(
    (callback: (event: string, next: Session | null) => void) => {
      mocks.authCallback = callback;
      queueMicrotask(() => callback("INITIAL_SESSION", initialSession));
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      };
    },
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
  await flush();
}

beforeEach(() => {
  latest = null;
  mocks.rpc.mockReset();
  mocks.getSession.mockReset();
  mocks.onAuthStateChange.mockReset();
  mocks.authSignOut.mockReset().mockResolvedValue({ error: null });
  mocks.routerReplace.mockReset();
  mocks.clearActiveWorkout.mockReset().mockResolvedValue(undefined);
  mocks.clearHistory.mockReset().mockResolvedValue(undefined);
  mocks.releaseStores.mockReset();
  mocks.authCallback = null;
  mocks.profileUpsert.mockClear();
  mocks.profileFrom.mockClear();
  privateAppBootstrapMemoryCache.clear();
});

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe("AuthProvider private bootstrap authority", () => {
  it("deduplicates getSession plus INITIAL_SESSION and repeated same-user events", async () => {
    const initial = session(userA);
    mocks.rpc.mockResolvedValue({ data: rpcPayload(userA), error: null });
    await mount(initial);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_private_app_bootstrap_v1");
    expect(latest?.bootstrapStatus).toBe("ready");

    await emitAuthEvent("TOKEN_REFRESHED", initial);
    await flush();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(latest?.bootstrap?.userId).toBe(userA);
  });

  it("clears A authority immediately and waits for current A-to-B cleanup before bootstrapping B", async () => {
    const cleanupA = deferred<void>();
    const nextSession = session(userB);
    mocks.rpc
      .mockResolvedValueOnce({ data: rpcPayload(userA), error: null })
      .mockResolvedValueOnce({ data: rpcPayload(userB), error: null });
    await mount(session(userA));
    mocks.clearActiveWorkout.mockImplementationOnce(() => cleanupA.promise);

    await emitAuthEvent("SIGNED_IN", nextSession);

    expect(latest?.user?.id).toBe(userB);
    expect(latest?.session?.user.id).toBe(userB);
    expect(latest?.profile).toBeNull();
    expect(latest?.bootstrap).toBeNull();
    expect(latest?.bootstrapStatus).not.toBe("ready");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.clearActiveWorkout).toHaveBeenCalledWith(userA);
    expect(mocks.clearHistory).toHaveBeenCalledWith(userA);

    await emitAuthEvent("TOKEN_REFRESHED", nextSession);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      cleanupA.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(latest?.user?.id).toBe(userB);
    expect(latest?.bootstrap?.userId).toBe(userB);
  });

  it("prevents superseded A-to-B work from starting or publishing after B-to-C wins", async () => {
    const cleanupA = deferred<void>();
    const cleanupB = deferred<void>();
    mocks.rpc
      .mockResolvedValueOnce({ data: rpcPayload(userA), error: null })
      .mockResolvedValueOnce({ data: rpcPayload(userC), error: null });
    await mount(session(userA));
    mocks.clearActiveWorkout.mockImplementation((userId: string) => {
      if (userId === userA) return cleanupA.promise;
      if (userId === userB) return cleanupB.promise;
      return Promise.resolve();
    });

    await emitAuthEvent("SIGNED_IN", session(userB));
    expect(latest?.user?.id).toBe(userB);
    expect(latest?.bootstrap).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    await emitAuthEvent("SIGNED_IN", session(userC));
    expect(latest?.user?.id).toBe(userC);
    expect(latest?.bootstrap).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.clearActiveWorkout).toHaveBeenCalledWith(userA);
    expect(mocks.clearActiveWorkout).toHaveBeenCalledWith(userB);

    await act(async () => {
      cleanupB.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(latest?.user?.id).toBe(userC);
    expect(latest?.bootstrap?.userId).toBe(userC);

    await act(async () => {
      cleanupA.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(latest?.user?.id).toBe(userC);
    expect(latest?.bootstrap?.userId).toBe(userC);
  });

  it("clears visible authority before delayed sign-out cleanup resolves", async () => {
    const cleanupA = deferred<void>();
    mocks.rpc.mockResolvedValue({ data: rpcPayload(userA), error: null });
    await mount(session(userA));
    mocks.clearActiveWorkout.mockImplementationOnce(() => cleanupA.promise);

    let signOutPromise!: Promise<void>;
    await act(async () => {
      signOutPromise = latest!.signOut();
      await Promise.resolve();
    });

    expect(latest?.user).toBeNull();
    expect(latest?.session).toBeNull();
    expect(latest?.profile).toBeNull();
    expect(latest?.bootstrap).toBeNull();
    expect(latest?.bootstrapStatus).not.toBe("ready");
    expect(mocks.clearActiveWorkout).toHaveBeenCalledWith(userA);
    expect(mocks.clearHistory).toHaveBeenCalledWith(userA);
    expect(mocks.releaseStores).toHaveBeenCalledWith(userA);

    await act(async () => {
      cleanupA.resolve();
      await signOutPromise;
    });

    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expect(mocks.routerReplace).toHaveBeenCalledWith("/");
  });

  it("keeps an explicit error state after a failed refresh so retry remains available", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: rpcPayload(userA), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("RPC unavailable") });
    await mount(session(userA));

    await act(async () => {
      await expect(latest!.refreshBootstrap()).rejects.toThrow("RPC unavailable");
    });
    await flush();

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(latest?.user?.id).toBe(userA);
    expect(latest?.profile).toBeNull();
    expect(latest?.bootstrap).toBeNull();
    expect(latest?.bootstrapStatus).toBe("error");
    expect(latest?.bootstrapError?.message).toBe("RPC unavailable");
  });
});
