"use client";

import { env } from "@/lib/env";
import { getMockTrainActivity } from "@/lib/fixtures/train-mock";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { resolveCanonicalWorkoutActivity } from "@/lib/workouts/history/resolve-activity";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { readCanonicalWorkoutActivityWithClient } from "@/services/workouts/history/reader";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type CanonicalWorkoutActivityReadResult,
} from "@/types/workout-history";

function mockHistory(userId: string, limit: number): CanonicalWorkoutActivityReadResult {
  const performed = getMockTrainActivity().map((session) => ({
    session: {
      ...session,
      user_id: userId,
      scheduled_session_id: null,
      cancelled_at: null,
    },
    metadata: {
      completedSetCount: 0,
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
      scheduledFallback: { source: "scheduled_fallback", state: "loaded" },
    },
  };
}

export async function getCanonicalWorkoutActivity(
  userId: string,
  limit = 180,
): Promise<CanonicalWorkoutActivityReadResult> {
  if (env.useMockAuth && isMockAuthUserId(userId)) return mockHistory(userId, limit);
  if (!supabase || !isUuid(userId)) {
    return {
      contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
      activities: [],
      sources: {
        performed: {
          source: "performed",
          state: "failed",
          message: "Workout history requires an active user session.",
        },
        scheduledFallback: {
          source: "scheduled_fallback",
          state: "failed",
          message: "Workout history requires an active user session.",
        },
      },
    };
  }
  return readCanonicalWorkoutActivityWithClient({
    supabase,
    userId,
    limit,
  });
}
