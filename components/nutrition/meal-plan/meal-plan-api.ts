"use client";

import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";

export async function mealPlanApiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!supabase) throw new Error("Meal Plan client is unavailable.");
  const renderedQa = env.useMockAuth && env.productionQaBuild;
  let authorization: string | null = null;
  if (!renderedQa) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Please sign in before using Meal Plan.");
    authorization = `Bearer ${data.session.access_token}`;
  }
  return fetch(input, {
    ...init,
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(renderedQa ? { "x-plaivra-rendered-qa": "mock-auth" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function mealPlanApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await mealPlanApiFetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Meal Plan request could not be completed.");
  return body as T;
}
