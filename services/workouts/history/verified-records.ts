import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildPersonalRecordCandidates,
  DERIVED_METRICS_FORMULA_VERSION,
  DERIVED_METRICS_SCHEMA_VERSION,
  type DerivedExerciseIdentityKind,
  type DerivedMetricLog,
  type DerivedPersonalRecord,
} from "@/lib/workouts/derived-metrics";

type SessionRow = {
  id: string;
  user_id: string;
  status: string;
  workout_id: string | null;
};

type SnapshotRow = { id: string };
type SnapshotItemRow = {
  source_plan_exercise_id: string | null;
  source_plan_activity_id: string | null;
  item_order: number;
  actual_global_exercise_id: string | null;
  actual_custom_exercise_id: string | null;
  actual_provider: string | null;
  actual_provider_activity_id: string | null;
  planned_global_exercise_id: string | null;
  planned_custom_exercise_id: string | null;
  planned_provider: string | null;
  planned_provider_activity_id: string | null;
};

type PriorRecordRow = {
  exercise_identity: string;
  derived_record_type: string;
  record_value: number | string;
  record_unit: string;
  comparison_context_key: string;
};

export type VerifiedRecordReplacementResult = {
  session_id: string;
  record_count: number;
  schema_version: number;
  formula_version: string;
  status: "current";
};

export class VerifiedRecordError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "VerifiedRecordError";
    this.code = code;
    this.status = status;
  }
}

function frozenIdentity(
  item: SnapshotItemRow,
  phase: "actual" | "planned",
): { kind: "global" | "custom" | "provider"; identity: string } | null {
  const provider = item[`${phase}_provider`];
  const providerActivityId = item[`${phase}_provider_activity_id`];
  if (provider && providerActivityId) return { kind: "provider", identity: `provider:${provider}:${providerActivityId}` };
  const globalId = item[`${phase}_global_exercise_id`];
  if (globalId) return { kind: "global", identity: `global:${globalId}` };
  const customId = item[`${phase}_custom_exercise_id`];
  if (customId) return { kind: "custom", identity: `custom:${customId}` };
  return null;
}

function matchingSnapshotItem(log: DerivedMetricLog, items: SnapshotItemRow[]): SnapshotItemRow | null {
  const planActivityId = log.planActivityId ?? log.plan_activity_id;
  const planExerciseId = log.planExerciseId ?? log.plan_exercise_id;
  const exerciseOrder = log.exerciseOrder ?? log.exercise_order;
  return items.find((item) =>
    Boolean(planActivityId && item.source_plan_activity_id === planActivityId)
    || Boolean(planExerciseId && item.source_plan_exercise_id === planExerciseId)
    || (exerciseOrder !== null && exerciseOrder !== undefined && item.item_order === exerciseOrder)) ?? null;
}

function withCanonicalIdentity(
  log: DerivedMetricLog,
  session: SessionRow,
  items: SnapshotItemRow[],
): DerivedMetricLog {
  const snapshot = matchingSnapshotItem(log, items);
  const actual = snapshot ? frozenIdentity(snapshot, "actual") : null;
  const planned = snapshot ? frozenIdentity(snapshot, "planned") : null;
  return {
    ...log,
    workoutSessionId: session.id,
    sourceWorkoutId: session.workout_id,
    actualExerciseIdentityKind: actual?.kind ?? null,
    actualExerciseIdentity: actual?.identity ?? null,
    plannedExerciseIdentityKind: planned?.kind ?? null,
    plannedExerciseIdentity: planned?.identity ?? null,
  };
}

function comparisonKey(record: Pick<DerivedPersonalRecord,
  "exerciseIdentity" | "recordType" | "recordUnit" | "comparisonContextKey">): string {
  return [record.exerciseIdentity, record.recordType, record.recordUnit, record.comparisonContextKey].join("::");
}

function priorComparisonKey(record: PriorRecordRow): string {
  return [record.exercise_identity, record.derived_record_type, record.record_unit, record.comparison_context_key].join("::");
}

export async function replaceVerifiedRecordsForSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<VerifiedRecordReplacementResult> {
  const sessionResult = await supabase
    .from("workout_sessions")
    .select("id,user_id,status,workout_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (sessionResult.error) throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
  if (!sessionResult.data) throw new VerifiedRecordError("history_not_found", "Workout history item was not found.", 404);
  const session = sessionResult.data as SessionRow;

  const [logsResult, snapshotResult] = await Promise.all([
    supabase
      .from("exercise_logs")
      .select("id,workout_session_id,plan_exercise_id,plan_activity_id,exercise_order,exercise_name,set_number,reps,weight_kg,completed_at,set_type,performance_metrics:exercise_log_metric_values(metric_key,value,side),set_details:exercise_log_set_details(set_type,rpe,rir),segments:exercise_log_set_segments(segment_order,side,metric_values:exercise_log_set_segment_metric_values(metric_key,value,side))")
      .eq("workout_session_id", sessionId)
      .not("completed_at", "is", null)
      .order("exercise_order", { ascending: true })
      .order("set_number", { ascending: true }),
    supabase
      .from("workout_session_muscle_snapshots")
      .select("id")
      .eq("workout_session_id", sessionId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (logsResult.error || snapshotResult.error) {
    throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
  }
  const snapshot = snapshotResult.data as SnapshotRow | null;
  const itemResult = snapshot
    ? await supabase
        .from("workout_session_muscle_snapshot_items")
        .select("source_plan_exercise_id,source_plan_activity_id,item_order,actual_global_exercise_id,actual_custom_exercise_id,actual_provider,actual_provider_activity_id,planned_global_exercise_id,planned_custom_exercise_id,planned_provider,planned_provider_activity_id")
        .eq("snapshot_id", snapshot.id)
        .eq("user_id", userId)
    : { data: [], error: null };
  if (itemResult.error) throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
  const items = (itemResult.data ?? []) as SnapshotItemRow[];
  const logs = ((logsResult.data ?? []) as unknown as DerivedMetricLog[])
    .map((log) => withCanonicalIdentity(log, session, items));
  const candidates = buildPersonalRecordCandidates(logs);

  let verified = candidates;
  if (candidates.length) {
    const priorResult = await supabase
      .from("current_personal_records")
      .select("exercise_identity,derived_record_type,record_value,record_unit,comparison_context_key")
      .eq("user_id", userId)
      .eq("source_kind", "workout_derived")
      .eq("schema_version", DERIVED_METRICS_SCHEMA_VERSION)
      .eq("formula_version", DERIVED_METRICS_FORMULA_VERSION)
      .neq("workout_session_id", sessionId)
      .in("exercise_identity", [...new Set(candidates.map((record) => record.exerciseIdentity))]);
    if (priorResult.error) throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
    const previousBest = new Map<string, number>();
    for (const row of (priorResult.data ?? []) as unknown as PriorRecordRow[]) {
      const value = Number(row.record_value);
      if (!Number.isFinite(value)) continue;
      const key = priorComparisonKey(row);
      previousBest.set(key, Math.max(previousBest.get(key) ?? -Infinity, value));
    }
    verified = candidates.filter((record) =>
      record.recordValue > (previousBest.get(comparisonKey(record)) ?? -Infinity));
  }

  const payload = verified.map((record) => ({
    exercise_log_id: record.exerciseLogId,
    exercise_identity_kind: record.exerciseIdentityKind as Exclude<DerivedExerciseIdentityKind, "name_degraded">,
    exercise_identity: record.exerciseIdentity,
    record_type: record.recordType,
    record_value: record.recordValue,
    record_unit: record.recordUnit,
    comparison_context_key: record.comparisonContextKey,
    set_type: record.setType,
    achieved_at: record.achievedAt,
  }));
  const replacement = await supabase.rpc("replace_workout_derived_records_atomic", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_schema_version: DERIVED_METRICS_SCHEMA_VERSION,
    p_formula_version: DERIVED_METRICS_FORMULA_VERSION,
    p_records: payload,
  });
  if (replacement.error) throw new VerifiedRecordError("verified_records_write_failed", "Workout records could not be refreshed.", 503);
  return replacement.data as VerifiedRecordReplacementResult;
}
