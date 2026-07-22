import type { SupabaseClient, User } from "@supabase/supabase-js";

export * from "./data-export-legacy";

import { buildCurrentUserDataExport as buildLegacyCurrentUserDataExport } from "./data-export-legacy";

const performanceMetricPageSize = 1000;
const performanceMetricSelection = "id,exercise_log_id,workout_session_id,metric_key,metric_version,side,value,source,source_provider,source_version,captured_at,created_at,updated_at";

async function loadAllPerformanceMetricValues(supabase: SupabaseClient, userId: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += performanceMetricPageSize) {
    const page = await supabase
      .from("exercise_log_metric_values")
      .select(performanceMetricSelection)
      .eq("user_id", userId)
      .order("captured_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + performanceMetricPageSize - 1);

    if (page.error) return { data: null, error: page.error };
    const pageRows = (page.data ?? []) as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < performanceMetricPageSize) return { data: rows, error: null };
  }
}

export async function buildCurrentUserDataExport(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email" | "created_at">
) {
  const result = await buildLegacyCurrentUserDataExport(supabase, user);
  const [timelineResult, performanceMetricResult] = await Promise.all([
    supabase
      .from("workout_session_timeline_events")
      .select("workout_session_id,sequence_number,event_type,occurred_at,source,exercise_log_id,snapshot_item_id,payload_version,payload,created_at")
      .eq("user_id", user.id)
      .order("sequence_number", { ascending: true })
      .limit(5000),
    loadAllPerformanceMetricValues(supabase, user.id)
  ]);

  if (timelineResult.error) {
    result.warnings.push("Workout session timeline events could not be included in this export.");
  }
  if (performanceMetricResult.error) {
    result.warnings.push("Workout performance metric values could not be included in this export.");
  }

  const workouts = result.data.workouts as Record<string, unknown>;
  workouts.timeline_events = timelineResult.data ?? [];
  workouts.performance_metric_values = performanceMetricResult.data ?? [];
  return result;
}
