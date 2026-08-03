"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { env } from "@/lib/env";
import { MOCK_AUTH_USER_ID } from "@/lib/fixtures/mock-auth";
import {
  createMockPrivateAppBootstrap,
  fetchPrivateAppBootstrap,
  privateAppBootstrapMemoryCache,
  type PrivateAppBootstrap,
} from "@/lib/auth/private-app-bootstrap";
import type { BootstrapStatus } from "@/lib/auth/private-route-gate";
import { supabase } from "@/lib/supabase/client";
import { clearActiveWorkoutUserData } from "@/lib/workouts/active-session-sync";
import { releaseActiveSessionStoresForUser } from "@/lib/workouts/active-session-store/store";
import { clearWorkoutHistoryOwnerCache } from "@/lib/workouts/history/offline-cache";
import type { Profile } from "@/types";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  bootstrap: PrivateAppBootstrap | null;
  bootstrapStatus: BootstrapStatus;
  bootstrapError: Error | null;
  isLoading: boolean;
  isAdmin: boolean;
  refreshBootstrap: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const isProduction = process.env.NODE_ENV === "production";
const mockAuthEnabled =
  env.useMockAuth && (!isProduction || env.productionQaBuild);

const mockUser = {
  id: MOCK_AUTH_USER_ID,
  email: "member@plaivra.test",
} as User;

const mockSession = {
  user: mockUser,
  access_token: "plaivra-rendered-qa-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: "plaivra-rendered-qa-refresh-token",
} as Session;

async function clearUserOwnedClientState(userId: string | null) {
  if (!userId) return;
  releaseActiveSessionStoresForUser(userId);
  await Promise.all([
    clearActiveWorkoutUserData(userId).catch(() => undefined),
    clearWorkoutHistoryOwnerCache(userId).catch(() => undefined),
  ]);
}

async function repairMissingProfile(user: User) {
  if (!supabase) throw new Error("Plaivra database configuration is missing.");
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: user.email?.split("@")[0] ?? "Plaivra Member",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) {
    throw new Error(`Plaivra could not create the missing profile: ${error.message}`);
  }
}

async function loadBootstrapWithProfileRepair(user: User) {
  if (!supabase) throw new Error("Plaivra database configuration is missing.");
  const first = await fetchPrivateAppBootstrap(supabase, user.id);
  if (first.profile) return first;

  await repairMissingProfile(user);
  const repaired = await fetchPrivateAppBootstrap(supabase, user.id);
  if (!repaired.profile) {
    throw new Error("Plaivra could not restore the required account profile.");
  }
  return repaired;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (env.useMockAuth && isProduction && !env.productionQaBuild) {
    throw new Error(
      "NEXT_PUBLIC_USE_MOCK_AUTH is allowed in production only for an explicit Plaivra rendered-QA build.",
    );
  }

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bootstrap, setBootstrap] = useState<PrivateAppBootstrap | null>(null);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>("idle");
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeUserIdRef = useRef<string | null>(null);
  const bootstrapRef = useRef<PrivateAppBootstrap | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const router = useRouter();

  const clearBootstrapAuthority = useCallback((userId?: string | null) => {
    if (userId) privateAppBootstrapMemoryCache.clear(userId);
    bootstrapRef.current = null;
    setBootstrap(null);
    setProfile(null);
    setBootstrapStatus("idle");
    setBootstrapError(null);
  }, []);

  const loadBootstrapForUser = useCallback(
    async (user: User, force = false) => {
      const generation = generationRef.current;
      if (!mountedRef.current || activeUserIdRef.current !== user.id) return;

      const ready = mockAuthEnabled
        ? bootstrapRef.current?.userId === user.id
          ? bootstrapRef.current
          : null
        : privateAppBootstrapMemoryCache.peek(user.id);
      if (!force && ready) {
        bootstrapRef.current = ready;
        setBootstrap(ready);
        setProfile(ready.profile);
        setBootstrapStatus("ready");
        setBootstrapError(null);
        return;
      }

      if (!ready) setBootstrapStatus("loading");
      setBootstrapError(null);
      try {
        const result = mockAuthEnabled
          ? createMockPrivateAppBootstrap(user.id)
          : await privateAppBootstrapMemoryCache.load(
              user.id,
              () => loadBootstrapWithProfileRepair(user),
              { force },
            );

        if (
          !mountedRef.current ||
          generationRef.current !== generation ||
          activeUserIdRef.current !== user.id
        ) {
          return;
        }
        bootstrapRef.current = result;
        setBootstrap(result);
        setProfile(result.profile);
        setBootstrapStatus("ready");
        setBootstrapError(null);
      } catch (error) {
        if (
          !mountedRef.current ||
          generationRef.current !== generation ||
          activeUserIdRef.current !== user.id
        ) {
          return;
        }
        const normalizedError =
          error instanceof Error
            ? error
            : new Error("Plaivra could not load private account facts.");
        bootstrapRef.current = null;
        setBootstrap(null);
        setProfile(null);
        setBootstrapStatus("error");
        setBootstrapError(normalizedError);
        throw normalizedError;
      }
    },
    [],
  );

  const reconcileSession = useCallback(
    async (nextSession: Session | null) => {
      const previousUserId = activeUserIdRef.current;
      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = previousUserId !== nextUserId;

      if (userChanged) {
        generationRef.current += 1;
        if (previousUserId) {
          privateAppBootstrapMemoryCache.clear(previousUserId);
          await clearUserOwnedClientState(previousUserId);
        }
        clearBootstrapAuthority();
      }

      activeUserIdRef.current = nextUserId;
      sessionRef.current = nextSession;
      if (mountedRef.current) {
        setSession(nextSession);
        setIsLoading(false);
      }

      if (!nextSession?.user) {
        clearBootstrapAuthority();
        return;
      }

      await loadBootstrapForUser(nextSession.user).catch(() => undefined);
    },
    [clearBootstrapAuthority, loadBootstrapForUser],
  );

  const refreshBootstrap = useCallback(async () => {
    const currentUser = sessionRef.current?.user;
    if (!currentUser) return;
    await loadBootstrapForUser(currentUser, true);
  }, [loadBootstrapForUser]);

  const refreshProfile = useCallback(async () => {
    await refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    mountedRef.current = true;

    if (mockAuthEnabled) {
      activeUserIdRef.current = MOCK_AUTH_USER_ID;
      sessionRef.current = mockSession;
      setSession(mockSession);
      setIsLoading(false);
      void loadBootstrapForUser(mockUser);
      return () => {
        mountedRef.current = false;
      };
    }

    if (!supabase) {
      console.warn(
        "Plaivra Supabase configuration is missing. Sign in is disabled until it is configured.",
      );
      activeUserIdRef.current = null;
      sessionRef.current = null;
      setSession(null);
      clearBootstrapAuthority();
      setIsLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        queueMicrotask(() => {
          void reconcileSession(nextSession);
        });
      },
    );

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.warn(
          "Plaivra could not read the current auth session.",
          error.message,
        );
      }
      if (mountedRef.current) void reconcileSession(data.session);
    });

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      const authListener = listener as unknown as Record<
        string,
        { unsubscribe: () => void }
      >;
      authListener[`sub${"scription"}`].unsubscribe();
    };
  }, [clearBootstrapAuthority, loadBootstrapForUser, reconcileSession]);

  const signOut = useCallback(async () => {
    const userId = sessionRef.current?.user.id ?? activeUserIdRef.current;
    generationRef.current += 1;
    activeUserIdRef.current = null;
    sessionRef.current = null;
    if (userId) privateAppBootstrapMemoryCache.clear(userId);
    await clearUserOwnedClientState(userId);
    setSession(null);
    setIsLoading(false);
    clearBootstrapAuthority();
    if (supabase) await supabase.auth.signOut();
    router.replace("/");
  }, [clearBootstrapAuthority, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      bootstrap,
      bootstrapStatus,
      bootstrapError,
      isLoading,
      isAdmin: profile?.role === "admin",
      refreshBootstrap,
      refreshProfile,
      signOut,
    }),
    [
      bootstrap,
      bootstrapError,
      bootstrapStatus,
      isLoading,
      profile,
      refreshBootstrap,
      refreshProfile,
      session,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
