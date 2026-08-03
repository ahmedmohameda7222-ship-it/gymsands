"use client";

import { env } from "@/lib/env";
import { getMockTrainActivity } from "@/lib/fixtures/train-mock";
import { resolveCanonicalWorkoutActivity } from "@/lib/workouts/history/resolve-activity";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type CanonicalWorkoutActivityReadResult,
} from "@/types/workout-history";

export function mockHistory(
  userId: string,
  limit: number,
): CanonicalWorkoutActivityReadResult {
  const performed = getMockTrainActivity().map((session) => ({
    session: {
      ...session,
      user_id: userId,
      scheduled_session_id: null,
      cancelled_at: null,
    },
    metadata: {
      completedSetCount: session.status === "completed" ? 8 : 0,
      structuredPerformedMetricCount: 0,
      actualPerformedSnapshotCount: 0,
      plannedSetCount: null,
    },
  }));
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activities: resolveCanonicalWorkoutActivity({
      ownerUserId: userId,
      performed,
      scheduledTerminal: [],
    }).slice(0, limit),
    sources: {
      performed: { source: "performed", state: "loaded" },
      scheduledFallback: {
        source: "scheduled_fallback",
        state: "loaded",
      },
    },
  };
}

export function renderedQaScenario(): string | null {
  if (!env.productionQaBuild || typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(
    "plaivra.qa.workout-history-scenario",
  );
}
