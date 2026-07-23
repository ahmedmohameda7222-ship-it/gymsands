import type { SupabaseClient, User } from "@supabase/supabase-js";

export * from "./data-export-legacy";

import { buildCurrentUserDataExport as buildLegacyCurrentUserDataExport } from "./data-export-legacy";

const performanceMetricPageSize = 1000;
const performanceMetricSelection = "id,exercise_log_id,workout_session_id,metric_key,metric_version,side,value,source,source_provider,source_version,captured_at,created_at,updated_at";
const setDetailSelection = "exercise_log_id,workout_session_id,user_id,schema_version,set_type,rpe,rir,notes,side_mode,planned_tempo,performed_tempo,tempo_adherence,source,source_provider,source_version,created_at,updated_at";
const setSegmentSelection = "id,exercise_log_id,workout_session_id,user_id,segment_order,segment_kind,side,completed_at,source,source_provider,source_version,created_at,updated_at";
const setSegmentMetricSelection = "id,segment_id,exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,source,source_provider,source_version,captured_at,created_at,updated_at";

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

async function loadAllOwnedRows(
  supabase: SupabaseClient,
  userId: string,
  table: string,
  selection: string,
  orderColumn: string
) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += performanceMetricPageSize) {
    const page = await supabase
      .from(table)
      .select(selection)
      .eq("user_id", userId)
      .order(orderColumn, { ascending: true })
      .range(from, from + performanceMetricPageSize - 1);
    if (page.error) return { data: null, error: page.error };
    const pageRows = (page.data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < performanceMetricPageSize) return { data: rows, error: null };
  }
}

export async function buildCurrentUserDataExport(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email" | "created_at">
) {
  const result = await buildLegacyCurrentUserDataExport(supabase, user);
  const [timelineResult, performanceMetricResult, setDetailResult, setSegmentResult, setSegmentMetricResult] = await Promise.all([
    supabase
      .from("workout_session_timeline_events")
      .select("workout_session_id,sequence_number,event_type,occurred_at,source,exercise_log_id,snapshot_item_id,payload_version,payload,created_at")
      .eq("user_id", user.id)
      .order("sequence_number", { ascending: true })
      .limit(5000),
    loadAllPerformanceMetricValues(supabase, user.id),
    loadAllOwnedRows(supabase, user.id, "exercise_log_set_details", setDetailSelection, "exercise_log_id"),
    loadAllOwnedRows(supabase, user.id, "exercise_log_set_segments", setSegmentSelection, "id"),
    loadAllOwnedRows(supabase, user.id, "exercise_log_set_segment_metric_values", setSegmentMetricSelection, "id")
  ]);

  if (timelineResult.error) {
    result.warnings.push("Workout session timeline events could not be included in this export.");
  }
  if (performanceMetricResult.error) {
    result.warnings.push("Workout performance metric values could not be included in this export.");
  }
  if (setDetailResult.error) result.warnings.push("Workout set details could not be included in this export.");
  if (setSegmentResult.error) result.warnings.push("Workout set segments could not be included in this export.");
  if (setSegmentMetricResult.error) result.warnings.push("Workout set segment metrics could not be included in this export.");

  const workouts = result.data.workouts as Record<string, unknown>;
  workouts.timeline_events = timelineResult.data ?? [];
  workouts.performance_metric_values = performanceMetricResult.data ?? [];
  workouts.set_details = setDetailResult.data ?? [];
  workouts.set_segments = setSegmentResult.data ?? [];
  workouts.set_segment_metric_values = setSegmentMetricResult.data ?? [];
  return result;
}
