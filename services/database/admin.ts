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
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Admin session expired.");
  const response = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Plaivra could not load admin users.");
  return (data.users ?? []) as AdminUser[];
}

export async function adminUpdateUserRole(userId: string, role: UserRole) {
  if (!supabase) throw new Error("Database not connected");
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Admin session expired.");
  const response = await fetch("/api/admin/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, role })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "The user role was not changed.");
  return true;
}

export type { WelcomeSettings };
