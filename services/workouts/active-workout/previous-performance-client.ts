"use client";

import type {
  ActiveWorkoutPerformanceIdentity,
  ActiveWorkoutPreviousPerformanceRead
} from "./previous-performance-server";

export type ActiveWorkoutPreviousPerformanceRequest = {
  identity: ActiveWorkoutPerformanceIdentity;
  excludeSessionId?: string | null;
  setNumber?: number | null;
  signal?: AbortSignal;
};

export async function readActiveWorkoutPreviousPerformanceClient(
  input: ActiveWorkoutPreviousPerformanceRequest
): Promise<ActiveWorkoutPreviousPerformanceRead | null> {
  const params = new URLSearchParams({
    kind: input.identity.kind,
    identity: input.identity.value
  });
  if (input.excludeSessionId) params.set("session", input.excludeSessionId);
  if (input.setNumber) params.set("set", String(input.setNumber));

  const response = await fetch(`/api/workouts/active/previous-performance?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal: input.signal,
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Previous performance is unavailable.");
  const body = await response.json() as { data?: ActiveWorkoutPreviousPerformanceRead | null };
  return body.data ?? null;
}
