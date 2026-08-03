// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  authSignOut: vi.fn(),
  routerReplace: vi.fn(),
  clearActiveWorkout: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  releaseStores: vi.fn(),
  authCallback: null as null | ((event: string, session: Session | null) => void),
}));

const profileUpsert = vi.fn().mockResolvedValue({ error: null });
const profileFrom = vi.fn(() => ({ upsert: profileUpsert }));

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
    from: profileFrom,
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
import {
  privateAppBootstrapMemoryCache,
} from "@/lib/auth/private-app-bootstrap";
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

type AuthSnapshot = ReturnType<typeof useAuth>;
let latest: AuthSnapshot | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe() {
  latest = useAuth();
  return <div data-status={latest.bootstrapStatus} />;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
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
  mocks.clearActiveWorkout.mockClear();
  mocks.clearHistory.mockClear();
  mocks.releaseStores.mockClear();
  mocks.authCallback = null;
  profileUpsert.mockClear();
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
  it("deduplicates getSession plus INITIAL_SESSION and repeated same-session events", async () => {
    const initial = session(userA);
    mocks.rpc.mockResolvedValue({ data: rpcPayload(userA), error: null });
    await mount(initial);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_private_app_bootstrap_v1");
    expect(latest?.bootstrapStatus).toBe("ready");

    await act(async () => {
      mocks.authCallback?.("TOKEN_REFRESHED", initial);
    });
    await flush();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight request and prevents stale user-A completion from overwriting user B", async () => {
    let resolveA!: (value: unknown) => void;
    let resolveB!: (value: unknown) => void;
    mocks.rpc
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveB = resolve;
          }),
      );

    const initial = session(userA);
    await mount(initial);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      mocks.authCallback?.("SIGNED_IN", initial);
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      mocks.authCallback?.("SIGNED_IN", session(userB));
      await Promise.resolve();
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveB({ data: rpcPayload(userB), error: null });
      await Promise.resolve();
    });
    await flush();
    expect(latest?.user?.id).toBe(userB);
    expect(latest?.bootstrap?.userId).toBe(userB);

    await act(async () => {
      resolveA({ data: rpcPayload(userA), error: null });
      await Promise.resolve();
    });
    await flush();
    expect(latest?.user?.id).toBe(userB);
    expect(latest?.bootstrap?.userId).toBe(userB);
  });

  it("retries one failed bootstrap and clears user-scoped state on sign-out", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: new Error("RPC unavailable") })
      .mockResolvedValueOnce({ data: rpcPayload(userA), error: null });
    await mount(session(userA));
    expect(latest?.bootstrapStatus).toBe("error");

    await act(async () => {
      await latest!.refreshBootstrap();
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(latest?.bootstrapStatus).toBe("ready");

    await act(async () => {
      await latest!.signOut();
    });
    expect(latest?.user).toBeNull();
    expect(latest?.bootstrap).toBeNull();
    expect(latest?.profile).toBeNull();
    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expect(mocks.clearActiveWorkout).toHaveBeenCalledWith(userA);
    expect(mocks.clearHistory).toHaveBeenCalledWith(userA);
  });
});
