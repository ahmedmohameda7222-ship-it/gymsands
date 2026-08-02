import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DERIVED_METRICS_FORMULA_VERSION,
  DERIVED_METRICS_SCHEMA_VERSION,
} from "@/lib/workouts/derived-metrics";
import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";

type ProjectionRoot = {
  status: string;
  deleted_at: string | null;
  derived_record_schema_version: number | null;
  derived_record_formula_version: string | null;
  derived_records_evaluated_at: string | null;
};

export async function workoutHistoryRecordProjectionIsCurrent(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await supabase
    .from("workout_sessions")
    .select("status,deleted_at,derived_record_schema_version,derived_record_formula_version,derived_records_evaluated_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) {
    throw new WorkoutHistoryReaderError(
      "history_detail_unavailable",
      "Workout details could not load.",
      503,
    );
  }
  const root = result.data as ProjectionRoot | null;
  if (!root) {
    throw new WorkoutHistoryReaderError(
      "history_not_found",
      "Workout history item was not found.",
      404,
    );
  }
  if (!new Set(["completed", "cancelled"]).has(root.status)) return true;
  return (
    root.derived_record_schema_version === DERIVED_METRICS_SCHEMA_VERSION
    && root.derived_record_formula_version === DERIVED_METRICS_FORMULA_VERSION
    && Boolean(root.derived_records_evaluated_at)
  );
}
