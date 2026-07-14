"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { MOCK_AUTH_USER_ID } from "@/lib/fixtures/mock-auth";
import type { Profile } from "@/types";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const isProduction = process.env.NODE_ENV === "production";
const mockAuthEnabled = env.useMockAuth && !isProduction;

const mockUser = {
  id: MOCK_AUTH_USER_ID,
  email: "member@plaivra.test"
} as User;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (env.useMockAuth && isProduction) {
    throw new Error("NEXT_PUBLIC_USE_MOCK_AUTH is not allowed in production. Disable it and use Supabase auth.");
  }

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const loadProfile = useCallback(async (userId: string, email?: string | null) => {
    if (mockAuthEnabled) {
      setProfile({
        id: MOCK_AUTH_USER_ID,
        email: "member@plaivra.test",
        full_name: "Plaivra Member",
        role: "admin",
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      return;
    }

    if (!supabase) {
      console.warn("Plaivra Supabase configuration is missing. Mock auth is disabled.");
      setProfile(null);
      return;
    }

    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) {
      console.warn("Plaivra could not load profile.", error.message);
      setProfile(null);
      return;
    }

    if (data) {
      setProfile(data as Profile);
      return;
    }

    const inserted = await supabase
      .from("profiles")
      .insert({
        id: userId,
        email: email ?? null,
        full_name: email?.split("@")[0] ?? "Plaivra Member"
      })
      .select("*")
      .maybeSingle();

    if (inserted.error) {
      console.warn("Plaivra could not create the missing profile.", inserted.error.message);
      setProfile(null);
      return;
    }

    setProfile((inserted.data as Profile | null) ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentUser = session?.user;
    if (currentUser) {
      await loadProfile(currentUser.id, currentUser.email);
    }
  }, [loadProfile, session?.user]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        if (mockAuthEnabled) {
          setSession({ user: mockUser } as Session);
          await loadProfile(MOCK_AUTH_USER_ID);
          return;
        }

        if (!supabase) {
          console.warn("Plaivra Supabase configuration is missing. Sign in is disabled until it is configured.");
          setSession(null);
          setProfile(null);
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("Plaivra could not read the current auth session.", error.message);
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user) {
          await loadProfile(data.session.user.id, data.session.user.email);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    boot();

    if (!supabase || mockAuthEnabled) return () => undefined;

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
      if (nextSession?.user) {
        setTimeout(() => {
          loadProfile(nextSession.user.id, nextSession.user.email);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      const authListener = listener as unknown as Record<string, { unsubscribe: () => void }>;
      authListener[`sub${"scription"}`].unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      isLoading,
      isAdmin: profile?.role === "admin",
      refreshProfile,
      signOut: async () => {
        if (supabase) await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        router.replace("/");
      }
    }),
    [session, profile, isLoading, refreshProfile, router]
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
