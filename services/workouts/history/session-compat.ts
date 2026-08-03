"use client";

import { supabase } from "@/lib/supabase/client";

/**
 * Explicit compatibility boundary for non-Workout-History UI callers that have
 * not yet been moved under an AuthProvider request context.
 *
 * The Workout History list and detail pages must never use this resolver.
 */
export async function resolveWorkoutHistoryCompatibilityAccessToken(): Promise<
  string | null
> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}
