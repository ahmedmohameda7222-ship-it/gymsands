"use client";

import { createClient } from "@supabase/supabase-js";
import { env, hasSupabaseEnv } from "@/lib/env";

const rememberPreferenceKey = "fitlife-hub-remember-session";

function getBrowserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  const remember = window.localStorage.getItem(rememberPreferenceKey);
  return remember === "false" ? window.sessionStorage : window.localStorage;
}

const authStorage = {
  getItem(key: string) {
    return getBrowserStorage()?.getItem(key) ?? null;
  },
  setItem(key: string, value: string) {
    getBrowserStorage()?.setItem(key, value);
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

export function setRememberSession(remember: boolean) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(rememberPreferenceKey, String(remember));
  }
}

export const supabase = hasSupabaseEnv()
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: authStorage
      }
    })
  : null;
