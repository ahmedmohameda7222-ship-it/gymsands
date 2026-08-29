"use client";

import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";

export async function foodLibraryApi(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!supabase) throw new Error("Food Library client is unavailable.");
  const renderedQa = env.useMockAuth && env.productionQaBuild;
  let authorization: string | null = null;
  if (!renderedQa) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Please sign in before using Food Library.");
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
