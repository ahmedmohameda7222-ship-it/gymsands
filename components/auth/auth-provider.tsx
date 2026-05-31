"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
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

const mockUser = {
  id: "mock-user",
  email: "member@ssgym.test"
} as User;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string, email?: string | null) => {
    if (!supabase || env.useMockAuth) {
      setProfile({
        id: "mock-user",
        email: "member@ssgym.test",
        full_name: "S&S Gym Member",
        role: "admin",
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      return;
    }

    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) {
      console.warn("S&S Gym could not load profile.", error.message);
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
        full_name: email?.split("@")[0] ?? "S&S Gym Member"
      })
      .select("*")
      .maybeSingle();

    if (inserted.error) {
      console.warn("S&S Gym could not create the missing profile.", inserted.error.message);
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
        if (!supabase || env.useMockAuth) {
          setSession({ user: mockUser } as Session);
          await loadProfile("mock-user");
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("S&S Gym could not read the current auth session.", error.message);
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

    if (!supabase || env.useMockAuth) return () => undefined;

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
      listener.subscription.unsubscribe();
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
      }
    }),
    [session, profile, isLoading, refreshProfile]
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
