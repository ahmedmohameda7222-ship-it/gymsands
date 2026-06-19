"use client";

import { supabase } from "@/lib/supabase/client";
import type { WelcomeSettings } from "@/types";
import { adminUpdateWelcomeSettings, adminUpsertWelcomeMessage } from "./settings";

export { adminUpdateWelcomeSettings, adminUpsertWelcomeMessage };

export async function adminListUsers() {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: false });
  if (error) {
    console.warn("FitLife Hub could not load admin users.", error.message);
    return [];
  }
  return data ?? [];
}

export async function adminUpdateUserRole(userId: string, role: "member" | "admin") {
  if (!supabase) throw new Error("Database not connected");
  const { error } = await supabase!.from("profiles").update({ role }).eq("id", userId);
  if (error) throw error;
  return true;
}

export type { WelcomeSettings };
