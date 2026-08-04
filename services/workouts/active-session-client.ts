"use client";

import { isUuid } from "@/lib/utils";
import type { WorkoutSession } from "@/types";

export type ActiveWorkoutSessionReadResult = {
  session: WorkoutSession | null;
  error?: string;
};

type ActiveWorkoutSessionPayload = {
  session?: unknown;
};

const readFailure =
  "Active workout could not load. Your current route was left unchanged.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSession(
  value: unknown,
  expectedUserId: string,
): WorkoutSession | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isUuid(value.id) ||
    value.user_id !== expectedUserId ||
    value.status !== "started"
  ) {
    throw new Error("Active workout response is malformed.");
  }
  return value as unknown as WorkoutSession;
}

export async function readActiveWorkoutSessionAuthenticated(input: {
  userId: string;
  accessToken: string;
  workoutId?: string | null;
  candidateSessionId?: string | null;
}): Promise<ActiveWorkoutSessionReadResult> {
  if (!isUuid(input.userId) || !input.accessToken.trim()) {
    return { session: null, error: readFailure };
  }

  const search = new URLSearchParams();
  if (input.workoutId && isUuid(input.workoutId)) {
    search.set("workoutId", input.workoutId);
  }
  if (input.candidateSessionId && isUuid(input.candidateSessionId)) {
    search.set("candidateSessionId", input.candidateSessionId);
  }

  try {
    const query = search.size ? `?${search.toString()}` : "";
    const response = await fetch(`/api/workouts/active-session${query}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return { session: null, error: readFailure };

    const payload = (await response.json()) as ActiveWorkoutSessionPayload;
    if (!Object.prototype.hasOwnProperty.call(payload, "session")) {
      return { session: null, error: readFailure };
    }
    return {
      session: normalizeSession(payload.session, input.userId),
    };
  } catch {
    return { session: null, error: readFailure };
  }
}
