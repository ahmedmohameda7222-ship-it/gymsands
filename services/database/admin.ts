"use client";

import { supabase } from "@/lib/supabase/client";
import type { UserRole, WelcomeSettings } from "@/types";
import {
  adminGetWelcomeSettings,
  adminListWelcomeMessages,
  adminUpdateWelcomeSettings,
  adminUpsertWelcomeMessage,
  type AdminWelcomeMessage
} from "./settings";

export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
};

export {
  adminGetWelcomeSettings,
  adminListWelcomeMessages,
  adminUpdateWelcomeSettings,
  adminUpsertWelcomeMessage,
  type AdminWelcomeMessage
};

export async function adminListUsers(): Promise<AdminUser[]> {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: false });
  if (error) {
    console.warn("FitLife Hub could not load admin users.", error.message);
    return [];
  }
  return (data ?? []) as AdminUser[];
}

export async function adminUpdateUserRole(userId: string, role: UserRole) {
  if (!supabase) throw new Error("Database not connected");
  const { error } = await supabase!.from("profiles").update({ role }).eq("id", userId);
  if (error) throw error;
  return true;
}

export type { WelcomeSettings };
