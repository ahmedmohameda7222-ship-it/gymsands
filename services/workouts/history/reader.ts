import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PerformedWorkoutHistoryCandidate,
  PerformedWorkoutHistoryRow,
  ScheduledWorkoutHistoryRow,
  WorkoutHistoryEligibilityOptions,
} from "@/lib/workouts/history/contracts";
import { resolveCanonicalWorkoutActivity } from "@/lib/workouts/history/resolve-activity";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type CanonicalWorkoutActivityReadResult,
  type WorkoutHistorySourceNotice,
} from "@/types/workout-history";

type HistoryReaderInput = {
  supabase: SupabaseClient;
  userId: string;
  limit?: number;
  eligibility?: WorkoutHistoryEligibilityOptions;
};

type PerformedSetRow = {
  id: string;
  workout_session_id: string;
  completed_at: string | null;
};

type StructuredMetricRow = {
  workout_session_id: string;
};

type PrescriptionSetRow = {
  workout_session_id: string;
};

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

const PERFORMED_SELECT = [
  "id",
  "user_id",
  "scheduled_session_id",
  "workout_name",
  "workout_day_name",
  "workout_category",
  "started_at",
  "completed_at",
  "skipped_at",
  "cancelled_at",
  "duration_minutes",
  "notes",
  "status",
  "plan_id",
  "plan_day_id",
  "plan_week_id",
  "plan_session_id",
].join(",");

const SCHEDULED_SELECT = [
  "id",
  "user_id",
  "user_workout_plan_id",
  "plan_day_id",
  "plan_week_id",
  "plan_session_id",
  "scheduled_date",
  "day_title",
  "status",
  "started_at",
  "completed_at",
  "skipped_at",
  "duration_minutes",
  "notes",
].join(",");

function loaded(source: WorkoutHistorySourceNotice["source"]): WorkoutHistorySourceNotice {
  return { source, state: "loaded" };
}

function failed(
  source: WorkoutHistorySourceNotice["source"],
  message: string,
): WorkoutHistorySourceNotice {
  return { source, state: "failed", message };
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function readPerformedCandidates(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
): Promise<QueryResult<PerformedWorkoutHistoryCandidate[]>> {
  const roots = await supabase
    .from("workout_sessions")
    .select(PERFORMED_SELECT)
    .eq("user_id", userId)
    .in("status", ["completed", "skipped", "cancelled"])
    .order("started_at", { ascending: false })
    .limit(limit);
  if (roots.error) return { data: null, error: roots.error };

  const sessions = (roots.data ?? []) as unknown as PerformedWorkoutHistoryRow[];
  const sessionIds = sessions.map((session) => session.id);
  if (!sessionIds.length) return { data: [], error: null };

  const [logs, metrics, prescriptions] = await Promise.all([
    supabase
      .from("exercise_logs")
      .select("id,workout_session_id,completed_at")
      .in("workout_session_id", sessionIds),
    supabase
      .from("exercise_log_metric_values")
      .select("workout_session_id")
      .in("workout_session_id", sessionIds),
    supabase
      .from("workout_session_prescription_sets")
      .select("workout_session_id")
      .in("workout_session_id", sessionIds),
  ]);
  const metadataError = logs.error ?? metrics.error ?? prescriptions.error;
  if (metadataError) return { data: null, error: metadataError };

  const completedSets = new Map<string, number>();
  const structuredMetrics = new Map<string, number>();
  const plannedSets = new Map<string, number>();
  for (const row of (logs.data ?? []) as unknown as PerformedSetRow[]) {
    if (row.completed_at) increment(completedSets, row.workout_session_id);
  }
  for (const row of (metrics.data ?? []) as unknown as StructuredMetricRow[]) {
    increment(structuredMetrics, row.workout_session_id);
  }
  for (const row of (prescriptions.data ?? []) as unknown as PrescriptionSetRow[]) {
    increment(plannedSets, row.workout_session_id);
  }

  return {
    data: sessions.map((session) => ({
      session,
      metadata: {
        completedSetCount: completedSets.get(session.id) ?? 0,
        structuredPerformedMetricCount: structuredMetrics.get(session.id) ?? 0,
        actualPerformedSnapshotCount: 0,
        plannedSetCount: plannedSets.has(session.id)
          ? (plannedSets.get(session.id) ?? 0)
          : null,
      },
    })),
    error: null,
  };
}

async function readScheduledFallbackCandidates(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
): Promise<QueryResult<ScheduledWorkoutHistoryRow[]>> {
  const result = await supabase
    .from("user_workout_sessions")
    .select(SCHEDULED_SELECT)
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("scheduled_date", { ascending: false })
    .limit(limit);
  return {
    data: result.error
      ? null
      : ((result.data ?? []) as unknown as ScheduledWorkoutHistoryRow[]),
    error: result.error,
  };
}

export async function readCanonicalWorkoutActivityWithClient({
  supabase,
  userId,
  limit = 180,
  eligibility,
}: HistoryReaderInput): Promise<CanonicalWorkoutActivityReadResult> {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const [performedResult, scheduledResult] = await Promise.all([
    readPerformedCandidates(supabase, userId, safeLimit),
    readScheduledFallbackCandidates(supabase, userId, safeLimit),
  ]);

  const activities = resolveCanonicalWorkoutActivity({
    ownerUserId: userId,
    performed: performedResult.data ?? [],
    scheduledTerminal: scheduledResult.data ?? [],
    eligibility,
  }).slice(0, safeLimit);

  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activities,
    sources: {
      performed: performedResult.error
        ? failed("performed", "Completed workout sessions could not load.")
        : loaded("performed"),
      scheduledFallback: scheduledResult.error
        ? failed(
            "scheduled_fallback",
            "Scheduled workout history could not load.",
          )
        : loaded("scheduled_fallback"),
    },
  };
}
