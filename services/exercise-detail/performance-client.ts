"use client";

import { env } from "@/lib/env";
import type { CanonicalExerciseIdentity } from "@/lib/exercise-detail/identity";
import { identityCandidates } from "@/lib/exercise-detail/identity";
import type { ExercisePerformanceModel } from "@/lib/exercise-detail/performance";
import { supabase } from "@/lib/supabase/client";

async function token() {
  const session = supabase ? await supabase.auth.getSession() : null;
  const accessToken = session?.data.session?.access_token || (env.useMockAuth ? "plaivra-local-qa" : "");
  if (!accessToken) throw new Error("Please sign in again.");
  return accessToken;
}

export async function getExercisePerformance(
  identity: CanonicalExerciseIdentity,
  options: { limit?: number; signal?: AbortSignal; timezone?: string } = {}
): Promise<ExercisePerformanceModel> {
  const query = new URLSearchParams();
  for (const value of identityCandidates(identity)) query.append("identity", value);
  query.set("limit", String(options.limit ?? 8));
  query.set("timezone", options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  const response = await fetch(`/api/exercise-detail/performance?${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
    headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" }
  });
  const body = await response.json().catch(() => ({})) as ExercisePerformanceModel & { error?: string };
  if (!response.ok) throw new Error(body.error || "Performance is unavailable right now.");
  return body;
}
