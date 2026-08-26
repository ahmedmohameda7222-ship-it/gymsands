import type { SupabaseClient, User } from "@supabase/supabase-js";

export * from "./data-export-legacy";

import { buildCurrentUserDataExport as buildLegacyCurrentUserDataExport } from "./data-export-legacy";

const exportPageSize = 1000;
const performanceMetricSelection = "id,exercise_log_id,workout_session_id,metric_key,metric_version,side,value,source,source_provider,source_version,captured_at,created_at,updated_at";
const setDetailSelection = "exercise_log_id,workout_session_id,user_id,schema_version,set_type,rpe,rir,notes,side_mode,planned_tempo,performed_tempo,tempo_adherence,source,source_provider,source_version,created_at,updated_at";
const setSegmentSelection = "id,exercise_log_id,workout_session_id,user_id,segment_order,segment_kind,side,completed_at,source,source_provider,source_version,created_at,updated_at";
const setSegmentMetricSelection = "id,segment_id,exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,source,source_provider,source_version,captured_at,created_at,updated_at";
const timelineSelection = "id,workout_session_id,user_id,sequence_number,event_type,occurred_at,source,exercise_log_id,snapshot_item_id,payload_version,payload,created_at";
const prescriptionSetSelection = "id,snapshot_item_id,snapshot_id,workout_session_id,user_id,set_order,performed_order_hint,set_type,target_mode,side_mode,rest_seconds,tempo_target,schema_version,created_at";
const prescriptionTargetSelection = "id,prescription_set_id,snapshot_item_id,workout_session_id,user_id,metric_key,metric_version,side,target_value,minimum_value,maximum_value,target_mode,created_at";
const setupNoteSelection = "id,user_id,exercise_identity,note_body,created_at,updated_at";

const canonicalNutritionExportTables = [
  "nutrition_recipes",
  "nutrition_recipe_versions",
  "nutrition_recipe_drafts",
  "nutrition_recipe_ingredients",
  "nutrition_recipe_actions",
  "nutrition_recipe_equipment",
  "nutrition_saved_meals",
  "nutrition_saved_meal_items",
  "nutrition_target_periods",
  "nutrition_meal_plan_weeks",
  "nutrition_planned_occurrences",
  "nutrition_meal_plan_change_requests",
  "nutrition_log_groups",
  "nutrition_log_group_items",
  "nutrition_cooking_sessions",
  "nutrition_cooking_action_states",
  "nutrition_cooking_timers",
  "food_personal_corrections",
  "food_favorites",
] as const;

type CanonicalNutritionExportTable = (typeof canonicalNutritionExportTables)[number];

const canonicalNutritionExportKeys: Record<CanonicalNutritionExportTable, string> = {
  nutrition_recipes: "recipes",
  nutrition_recipe_versions: "recipe_versions",
  nutrition_recipe_drafts: "recipe_drafts",
  nutrition_recipe_ingredients: "recipe_ingredients",
  nutrition_recipe_actions: "recipe_actions",
  nutrition_recipe_equipment: "recipe_equipment",
  nutrition_saved_meals: "saved_meals_v1",
  nutrition_saved_meal_items: "saved_meal_items_v1",
  nutrition_target_periods: "target_periods",
  nutrition_meal_plan_weeks: "meal_plan_weeks",
  nutrition_planned_occurrences: "planned_occurrences",
  nutrition_meal_plan_change_requests: "meal_plan_change_requests",
  nutrition_log_groups: "log_groups",
  nutrition_log_group_items: "log_group_items",
  nutrition_cooking_sessions: "cooking_sessions",
  nutrition_cooking_action_states: "cooking_action_states",
  nutrition_cooking_timers: "cooking_timers",
  food_personal_corrections: "personal_food_corrections",
  food_favorites: "food_favorites_v1",
};

async function loadAllTimelineRows(supabase: SupabaseClient, userId: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += exportPageSize) {
    const page = await supabase
      .from("workout_session_timeline_events")
      .select(timelineSelection)
      .eq("user_id", userId)
      .order("workout_session_id", { ascending: true })
      .order("sequence_number", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + exportPageSize - 1);
    if (page.error) return { data: null, error: page.error };
    const pageRows = (page.data ?? []) as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < exportPageSize) return { data: rows, error: null };
  }
}

async function loadAllPerformanceMetricValues(supabase: SupabaseClient, userId: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += exportPageSize) {
    const page = await supabase
      .from("exercise_log_metric_values")
      .select(performanceMetricSelection)
      .eq("user_id", userId)
      .order("captured_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + exportPageSize - 1);
    if (page.error) return { data: null, error: page.error };
    const pageRows = (page.data ?? []) as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < exportPageSize) return { data: rows, error: null };
  }
}

async function loadAllOwnedRows(
  supabase: SupabaseClient,
  userId: string,
  table: string,
  selection: string,
  orderColumns: string | string[]
) {
  const rows: Record<string, unknown>[] = [];
  const ordered = Array.isArray(orderColumns) ? orderColumns : [orderColumns];
  for (let from = 0; ; from += exportPageSize) {
    let query = supabase.from(table).select(selection).eq("user_id", userId);
    for (const column of ordered) query = query.order(column, { ascending: true });
    const page = await query.range(from, from + exportPageSize - 1);
    if (page.error) return { data: null, error: page.error };
    const pageRows = (page.data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < exportPageSize) return { data: rows, error: null };
  }
}

async function loadCanonicalNutritionExport(supabase: SupabaseClient, userId: string) {
  const entries = await Promise.all(
    canonicalNutritionExportTables.map(async (table) => {
      const result = await loadAllOwnedRows(supabase, userId, table, "*", "id");
      return [table, result] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<CanonicalNutritionExportTable, Awaited<ReturnType<typeof loadAllOwnedRows>>>;
}

export async function buildCurrentUserDataExport(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email" | "created_at">
) {
  const result = await buildLegacyCurrentUserDataExport(supabase, user);
  const [timelineResult, performanceMetricResult, setDetailResult, setSegmentResult, setSegmentMetricResult, prescriptionSetResult, prescriptionTargetResult, setupNoteResult, canonicalNutrition] = await Promise.all([
    loadAllTimelineRows(supabase, user.id),
    loadAllPerformanceMetricValues(supabase, user.id),
    loadAllOwnedRows(supabase, user.id, "exercise_log_set_details", setDetailSelection, "exercise_log_id"),
    loadAllOwnedRows(supabase, user.id, "exercise_log_set_segments", setSegmentSelection, "id"),
    loadAllOwnedRows(supabase, user.id, "exercise_log_set_segment_metric_values", setSegmentMetricSelection, "id"),
    loadAllOwnedRows(supabase, user.id, "workout_session_prescription_sets", prescriptionSetSelection, ["workout_session_id", "snapshot_item_id", "set_order", "id"]),
    loadAllOwnedRows(supabase, user.id, "workout_session_prescription_metric_targets", prescriptionTargetSelection, ["workout_session_id", "snapshot_item_id", "prescription_set_id", "metric_key", "metric_version", "side", "id"]),
    loadAllOwnedRows(supabase, user.id, "exercise_setup_notes", setupNoteSelection, ["created_at", "id"]),
    loadCanonicalNutritionExport(supabase, user.id),
  ]);

  if (timelineResult.error) result.warnings.push("Workout session timeline events could not be included in this export.");
  if (performanceMetricResult.error) result.warnings.push("Workout performance metric values could not be included in this export.");
  if (setDetailResult.error) result.warnings.push("Workout set details could not be included in this export.");
  if (setSegmentResult.error) result.warnings.push("Workout set segments could not be included in this export.");
  if (setSegmentMetricResult.error) result.warnings.push("Workout set segment metrics could not be included in this export.");
  if (prescriptionSetResult.error) result.warnings.push("Workout prescription sets could not be included in this export.");
  if (prescriptionTargetResult.error) result.warnings.push("Workout prescription targets could not be included in this export.");
  if (setupNoteResult.error) result.warnings.push("Exercise setup notes could not be included in this export.");

  const workouts = result.data.workouts as Record<string, unknown>;
  workouts.timeline_events = timelineResult.data ?? [];
  workouts.performance_metric_values = performanceMetricResult.data ?? [];
  workouts.set_details = setDetailResult.data ?? [];
  workouts.set_segments = setSegmentResult.data ?? [];
  workouts.set_segment_metric_values = setSegmentMetricResult.data ?? [];
  workouts.prescription_sets = prescriptionSetResult.data ?? [];
  workouts.prescription_metric_targets = prescriptionTargetResult.data ?? [];
  result.data.exercise_setup_notes = setupNoteResult.data ?? [];

  const nutrition = result.data.nutrition as Record<string, unknown>;
  for (const table of canonicalNutritionExportTables) {
    const exportResult = canonicalNutrition[table];
    if (exportResult.error) result.warnings.push(`${table} could not be included in this export.`);
    nutrition[canonicalNutritionExportKeys[table]] = exportResult.data ?? [];
  }

  // Canonical consumer rows retain the exact frozen facts used historically.
  // `frozen_snapshot`, `frozen_recipe_snapshot`, and `frozen_item_snapshot`
  // are exported verbatim through the owner-scoped `*` selections above.
  return result;
}
