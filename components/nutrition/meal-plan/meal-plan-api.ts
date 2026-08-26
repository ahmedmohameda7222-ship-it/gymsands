"use client";

import { supabase } from "@/lib/supabase/client";

export async function mealPlanApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabase) throw new Error("Meal Plan client is unavailable.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Please sign in before using Meal Plan.");
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Meal Plan request could not be completed.");
  return body as T;
}
