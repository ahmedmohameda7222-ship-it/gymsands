// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  authSignOut: vi.fn().mockResolvedValue({ error: null }),
  routerReplace: vi.fn(),
  clearActiveWorkout: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  releaseStores: vi.fn(),
  profileUpsert: vi.fn().mockResolvedValue({ error: null }),
  authCallback: null as null | ((event: string, session: Session | null) => void),
}));

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
    from: () => ({ upsert: mocks.profileUpsert }),
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
      created_at: "2026-08-04T00:00:00.000Z",
      updated_at: "2026-08-04T00:00:00.000Z",
    },
    accountAccessState: "active",
    consentRecords: REQUIRED_CONSENTS.map((record) => ({
      ...record,
      granted: true,
      revoked_at: null,
    })),
    onboarding: {
      age: 25,
      completed_at: "2026-08-04T00:00:00.000Z",
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
  return <div data-user={auth.user?.id ?? "none"} />;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderProvider() {
  mocks.onAuthStateChange.mockImplementation(
    (callback: (event: string, next: Session | null) => void) => {
      mocks.authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
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

async function emit(event: string, nextSession: Session | null) {
  await act(async () => {
    mocks.authCallback?.(event, nextSession);
    await Promise.resolve();
    await Promise.resolve();
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
  mocks.profileUpsert.mockReset().mockResolvedValue({ error: null });
  mocks.authCallback = null;
  privateAppBootstrapMemoryCache.clear();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("AuthProvider initial-session authority", () => {
  it("does not let a delayed null getSession result erase a newer SIGNED_IN event", async () => {
    const initialRead = deferred<{
      data: { session: Session | null };
      error: null;
    }>();
    mocks.getSession.mockReturnValue(initialRead.promise);
    mocks.rpc.mockResolvedValue({ data: rpcPayload(userB), error: null });
    await renderProvider();

    await emit("SIGNED_IN", session(userB));
    expect(latest?.user?.id).toBe(userB);
    expect(latest?.bootstrap?.userId).toBe(userB);

    await act(async () => {
      initialRead.resolve({ data: { session: null }, error: null });
      await initialRead.promise;
    });
    await flush();

    expect(latest?.user?.id).toBe(userB);
    expect(latest?.session?.user.id).toBe(userB);
    expect(latest?.bootstrap?.userId).toBe(userB);
    expect(latest?.bootstrapStatus).toBe("ready");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("still accepts the initial getSession result when no newer auth event exists", async () => {
    const initialRead = deferred<{
      data: { session: Session | null };
      error: null;
    }>();
    mocks.getSession.mockReturnValue(initialRead.promise);
    mocks.rpc.mockResolvedValue({ data: rpcPayload(userA), error: null });
    await renderProvider();

    await act(async () => {
      initialRead.resolve({ data: { session: session(userA) }, error: null });
      await initialRead.promise;
    });
    await flush();

    expect(latest?.user?.id).toBe(userA);
    expect(latest?.bootstrap?.userId).toBe(userA);
    expect(latest?.bootstrapStatus).toBe("ready");
  });

  it("keeps a newer SIGNED_OUT event authoritative over a delayed initial session", async () => {
    const initialRead = deferred<{
      data: { session: Session | null };
      error: null;
    }>();
    mocks.getSession.mockReturnValue(initialRead.promise);
    await renderProvider();

    await emit("SIGNED_OUT", null);
    await act(async () => {
      initialRead.resolve({ data: { session: session(userA) }, error: null });
      await initialRead.promise;
    });
    await flush();

    expect(latest?.user).toBeNull();
    expect(latest?.session).toBeNull();
    expect(latest?.bootstrap).toBeNull();
    expect(latest?.isLoading).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
