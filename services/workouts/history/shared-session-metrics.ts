import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveSessionMetrics,
  type DerivedMetricLog,
  type DerivedSessionMetrics,
} from "@/lib/workouts/derived-metrics";
import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";

type SessionRoot = {
  id: string;
  user_id: string;
  deleted_at: string | null;
  status: string;
};

const METRIC_LOG_SELECTION = "id,workout_session_id,plan_exercise_id,plan_activity_id,exercise_order,exercise_name,set_number,reps,weight_kg,completed_at,set_type,performance_metrics:exercise_log_metric_values(metric_key,value,side),set_details:exercise_log_set_details(set_type,rpe,rir),segments:exercise_log_set_segments(segment_order,side,metric_values:exercise_log_set_segment_metric_values(metric_key,value,side))";

async function readCompletedMetricLogs(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<DerivedMetricLog[]> {
  const result = await supabase
    .from("exercise_logs")
    .select(METRIC_LOG_SELECTION)
    .eq("workout_session_id", sessionId)
    .not("completed_at", "is", null)
    .order("exercise_order", { ascending: true })
    .order("set_number", { ascending: true });
  if (result.error) {
    throw new WorkoutHistoryReaderError(
      "history_detail_unavailable",
      "Workout details could not load.",
      503,
    );
  }
  return (result.data ?? []) as unknown as DerivedMetricLog[];
}

/**
 * Reads only the shared AW-8 metric graph after another operation in the same
 * request has already established the owner-scoped canonical session root.
 * The supplied client must retain member RLS or another trusted owner boundary.
 */
export async function readSharedWorkoutHistorySessionMetricsForKnownOwnerScopedSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<DerivedSessionMetrics> {
  return deriveSessionMetrics(await readCompletedMetricLogs(supabase, sessionId));
}

export async function readSharedWorkoutHistorySessionMetrics(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<DerivedSessionMetrics> {
  const [rootResult, metrics] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("id,user_id,deleted_at,status")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle(),
    readSharedWorkoutHistorySessionMetricsForKnownOwnerScopedSession(
      supabase,
      sessionId,
    ),
  ]);
  if (rootResult.error) {
    throw new WorkoutHistoryReaderError(
      "history_detail_unavailable",
      "Workout details could not load.",
      503,
    );
  }
  const root = rootResult.data as SessionRoot | null;
  if (!root || !["completed", "cancelled", "skipped"].includes(root.status)) {
    throw new WorkoutHistoryReaderError(
      "history_not_found",
      "Workout history item was not found.",
      404,
    );
  }
  return metrics;
}
