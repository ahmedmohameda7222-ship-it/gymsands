"use client";

import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";

export async function recipeApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabase) throw new Error("Recipe client is unavailable.");
  const renderedQa = env.useMockAuth && env.productionQaBuild;
  let authorization: string | null = null;
  if (!renderedQa) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Please sign in before using My Recipes.");
    authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch(`/api/nutrition/v1/recipes${path}`, {
    ...init,
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(renderedQa ? { "x-plaivra-rendered-qa": "mock-auth" } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Recipe request could not be completed.");
  return body as T;
}
