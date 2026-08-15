"use client";

import type { Phase3SessionAnalysisContract } from "@/lib/train/muscle-intelligence/session-analysis-contract";

function isTrainingFocusPayload(value: unknown): value is Phase3SessionAnalysisContract {
  return Boolean(value && typeof value === "object" && "snapshotId" in value && "effectiveCompleteness" in value && "analysis" in value);
}

export async function getWorkoutHistoryTrainingFocus(
  sessionId: string,
  options: { accessToken?: string | null; signal?: AbortSignal } = {},
): Promise<Phase3SessionAnalysisContract> {
  const response = await fetch(`/api/workouts/sessions/${encodeURIComponent(sessionId)}/muscle-analysis?mode=completed`, {
    cache: "no-store",
    signal: options.signal,
    headers: options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : undefined,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isTrainingFocusPayload(payload)) throw new Error("Workout History training focus could not load.");
  return payload;
}
