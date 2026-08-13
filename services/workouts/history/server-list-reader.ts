import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PerformedWorkoutHistoryCandidate,
  PerformedWorkoutHistoryRow,
  ScheduledWorkoutHistoryRow,
} from "@/lib/workouts/history/contracts";
import {
  decodeWorkoutHistoryCursor,
  encodeWorkoutHistoryCursor,
  type WorkoutHistoryCursorPayload,
} from "@/lib/workouts/history/cursor";
import { deriveSessionMetrics, type DerivedMetricLog } from "@/lib/workouts/derived-metrics";
import { presentWorkoutHistorySession } from "@/lib/workouts/history/presentation";
import { resolveCanonicalWorkoutActivity } from "@/lib/workouts/history/resolve-activity";
import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";
import { readWorkoutHistoryPersonalRecordSessions } from "@/services/personal-records/server";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type WorkoutHistoryListRequest,
  type WorkoutHistoryListResponse,
  type WorkoutHistoryListSummary,
  type WorkoutHistorySessionSummary,
  type WorkoutHistorySort,
} from "@/types/workout-history";

const IN_FILTER_CHUNK = 100;

type RootPageRow = {
  source_kind: "performed" | "scheduled_fallback";
  root_id: string;
  activity_id: string;
  effective_at: string;
  duration_minutes: number | null;
  lifecycle: "completed" | "partial" | "cancelled" | "skipped";
  completed_set_count: number | string;
  structured_metric_count: number | string;
  actual_snapshot_count: number | string;
  planned_set_count: number | string | null;
};

type SummaryRow = {
  eligible_workout_count: number | string;
  trusted_duration_minutes: number | string | null;
  completed_set_count: number | string | null;
  reliable_volume: number | string | null;
  verified_record_count: number | string | null;
};

type PerformedLogRow = DerivedMetricLog & {
  id: string;
  workout_session_id: string;
  plan_exercise_id: string | null;
  plan_activity_id: string | null;
  exercise_order: number | null;
  exercise_name: string;
  completed_at: string | null;
};

type SnapshotRow = { id: string; workout_session_id: string; workload_model_version: string };
type SnapshotItemRow = {
  snapshot_id: string;
  source_plan_exercise_id: string | null;
  source_plan_activity_id: string | null;
  activity_name_snapshot: string;
  actual_name_snapshot: string | null;
  planned_global_exercise_id: string | null;
  actual_global_exercise_id: string | null;
  planned_custom_exercise_id: string | null;
  actual_custom_exercise_id: string | null;
  planned_provider: string | null;
  actual_provider: string | null;
  planned_provider_activity_id: string | null;
  actual_provider_activity_id: string | null;
  planned_mapping_set_id: string | null;
  actual_mapping_set_id: string | null;
  planned_custom_mapping_entries: unknown;
  actual_custom_mapping_entries: unknown;
  performed_total_sets: number | null;
};
type MappingEntryRow = { mapping_set_id: string; muscle_id: string };
type PageMetadata = {
  logsBySession: Map<string, PerformedLogRow[]>;
  itemsBySession: Map<string, SnapshotItemRow[]>;
  muscleIdsBySession: Map<string, Set<string>>;
  verifiedCountBySession: Map<string, number>;
  resultKindBySession: Map<string, "strength_sets" | "semantic_metrics" | "limited">;
};

function chunks<T>(values: readonly T[]): T[][] {
  return Array.from(
    { length: Math.ceil(values.length / IN_FILTER_CHUNK) },
    (_, index) => values.slice(index * IN_FILTER_CHUNK, (index + 1) * IN_FILTER_CHUNK),
  );
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function numeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function snapshotIdentity(item: SnapshotItemRow): string {
  const provider = item.actual_provider ?? item.planned_provider;
  const providerActivityId = item.actual_provider_activity_id ?? item.planned_provider_activity_id;
  if (provider && providerActivityId) return `provider:${provider}:${providerActivityId}`;
  const globalId = item.actual_global_exercise_id ?? item.planned_global_exercise_id;
  if (globalId) return `global:${globalId}`;
  const customId = item.actual_custom_exercise_id ?? item.planned_custom_exercise_id;
  if (customId) return `custom:${customId}`;
  return `name:${normalizedText(item.actual_name_snapshot ?? item.activity_name_snapshot)}`;
}

async function readInChunks<T>(
  supabase: SupabaseClient,
  table: string,
  selection: string,
  field: string,
  values: string[],
): Promise<T[]> {
  if (!values.length) return [];
  const results = await Promise.all(chunks(values).map((chunk) =>
    supabase.from(table).select(selection).in(field, chunk)));
  const failure = results.find((result) => result.error)?.error;
  if (failure)
    throw new WorkoutHistoryReaderError(
      "history_read_failed",
      "Workout history could not load.",
      503,
    );
  return results.flatMap((result) => (result.data ?? []) as unknown as T[]);
}

function rpcParameters(
  userId: string,
  request: WorkoutHistoryListRequest,
) {
  return {
    p_user_id: userId,
    p_from: request.from,
    p_to: request.to,
    p_statuses: request.statuses?.length
      ? request.statuses
      : ["completed", "partial"],
    p_search: request.search ?? null,
    p_workout_types: request.workoutTypes ?? [],
    p_muscle_ids: request.muscleIds ?? [],
    p_exercise_ids: request.exerciseIds ?? [],
    p_plan_ids: request.planIds ?? [],
    p_progress_only: request.progressOnly === true,
  };
}

function compareSummary(sort: WorkoutHistorySort) {
  return (left: WorkoutHistorySessionSummary, right: WorkoutHistorySessionSummary): number => {
    if (sort === "longest_duration") {
      const leftDuration = left.durationMinutes ?? -1;
      const rightDuration = right.durationMinutes ?? -1;
      if (leftDuration !== rightDuration) return rightDuration - leftDuration;
    }
    const time = Date.parse(left.effectiveAt) - Date.parse(right.effectiveAt);
    if (time !== 0) return sort === "oldest" ? time : -time;
    return sort === "oldest"
      ? left.activityId.localeCompare(right.activityId)
      : right.activityId.localeCompare(left.activityId);
  };
}

function cursorFor(item: WorkoutHistorySessionSummary, sort: WorkoutHistorySort): WorkoutHistoryCursorPayload {
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    sort,
    effectiveAt: item.effectiveAt,
    activityId: item.activityId,
    durationMinutes: item.durationMinutes,
  };
}

async function readRootRows(
  supabase: SupabaseClient,
  userId: string,
  request: WorkoutHistoryListRequest,
  cursorSecret: string,
): Promise<RootPageRow[]> {
  let cursor: WorkoutHistoryCursorPayload | null = null;
  if (request.cursor) {
    try {
      cursor = decodeWorkoutHistoryCursor(request.cursor, cursorSecret);
    } catch {
      throw new WorkoutHistoryReaderError(
        "invalid_cursor",
        "Workout History cursor is invalid.",
        400,
      );
    }
  }
  const sort = request.sort ?? "newest";
  if (cursor && cursor.sort !== sort)
    throw new WorkoutHistoryReaderError(
      "invalid_cursor",
      "Workout History cursor is invalid.",
      400,
    );
  const limit = Math.min(50, Math.max(1, request.limit ?? 20));
  const result = await supabase.rpc("get_workout_history_root_page_v1", {
    ...rpcParameters(userId, request),
    p_sort: sort,
    p_cursor_effective_at: cursor?.effectiveAt ?? null,
    p_cursor_activity_id: cursor?.activityId ?? null,
    p_cursor_duration_minutes: cursor?.durationMinutes ?? null,
    p_limit: limit + 1,
  });
  if (result.error)
    throw new WorkoutHistoryReaderError(
      "history_read_failed",
      "Workout history could not load.",
      503,
    );
  return (result.data ?? []) as unknown as RootPageRow[];
}

async function readSummary(
  supabase: SupabaseClient,
  userId: string,
  request: WorkoutHistoryListRequest,
): Promise<WorkoutHistoryListSummary> {
  const result = await supabase.rpc("get_workout_history_period_context_v2", {
    ...rpcParameters(userId, request),
  });
  if (result.error)
    throw new WorkoutHistoryReaderError(
      "history_read_failed",
      "Workout history could not load.",
      503,
    );
  const row = ((result.data ?? [])[0] ?? {}) as SummaryRow;
  return {
    eligibleWorkoutCount: numeric(row.eligible_workout_count) ?? 0,
    trustedDurationMinutes: numeric(row.trusted_duration_minutes),
    completedSetCount: numeric(row.completed_set_count),
    // Cross-session volume is deliberately omitted until a measured rebuildable
    // projection can provide the shared AW-8 formula without reading every set.
    reliableVolume: null,
    verifiedRecordCount: numeric(row.verified_record_count),
  };
}

async function readPageMetadata(
  supabase: SupabaseClient,
  userId: string,
  sessionIds: string[],
): Promise<PageMetadata> {
  if (!sessionIds.length) return {
    logsBySession: new Map(),
    itemsBySession: new Map(),
    muscleIdsBySession: new Map(),
    verifiedCountBySession: new Map(),
    resultKindBySession: new Map(),
  };
  const [logs, snapshots, personalRecords] = await Promise.all([
    readInChunks<PerformedLogRow>(
      supabase,
      "exercise_logs",
      "id,workout_session_id,plan_exercise_id,plan_activity_id,exercise_order,exercise_name,set_number,reps,weight_kg,completed_at,set_type,performance_metrics:exercise_log_metric_values(metric_key,value,side),set_details:exercise_log_set_details(set_type,rpe,rir),segments:exercise_log_set_segments(segment_order,side,metric_values:exercise_log_set_segment_metric_values(metric_key,value,side))",
      "workout_session_id",
      sessionIds,
    ),
    readInChunks<SnapshotRow>(
      supabase,
      "workout_session_muscle_snapshots",
      "id,workout_session_id,workload_model_version",
      "workout_session_id",
      sessionIds,
    ),
    readWorkoutHistoryPersonalRecordSessions(supabase, userId, sessionIds),
  ]);
  const items = await readInChunks<SnapshotItemRow>(
    supabase,
    "workout_session_muscle_snapshot_items",
    "snapshot_id,source_plan_exercise_id,source_plan_activity_id,activity_name_snapshot,actual_name_snapshot,planned_global_exercise_id,actual_global_exercise_id,planned_custom_exercise_id,actual_custom_exercise_id,planned_provider,actual_provider,planned_provider_activity_id,actual_provider_activity_id,planned_mapping_set_id,actual_mapping_set_id,planned_custom_mapping_entries,actual_custom_mapping_entries,performed_total_sets",
    "snapshot_id",
    snapshots.map((snapshot) => snapshot.id),
  );
  const mappingEntries = await readInChunks<MappingEntryRow>(
    supabase,
    "exercise_muscle_mapping_entries",
    "mapping_set_id,muscle_id",
    "mapping_set_id",
    unique(items.flatMap((item) => [item.actual_mapping_set_id, item.planned_mapping_set_id])),
  );
  const sessionBySnapshot = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot.workout_session_id]));
  const logsBySession = new Map<string, PerformedLogRow[]>();
  const itemsBySession = new Map<string, SnapshotItemRow[]>();
  const muscleIdsBySession = new Map<string, Set<string>>();
  const verifiedCountBySession = new Map<string, number>();
  const resultKindBySession = new Map<string, "strength_sets" | "semantic_metrics" | "limited">();
  const musclesByMapping = new Map<string, string[]>();
  for (const entry of mappingEntries) {
    musclesByMapping.set(entry.mapping_set_id, [
      ...(musclesByMapping.get(entry.mapping_set_id) ?? []),
      entry.muscle_id,
    ]);
  }
  for (const log of logs) {
    logsBySession.set(log.workout_session_id, [
      ...(logsBySession.get(log.workout_session_id) ?? []),
      log,
    ]);
  }
  for (const item of items) {
    const sessionId = sessionBySnapshot.get(item.snapshot_id);
    if (!sessionId) continue;
    itemsBySession.set(sessionId, [...(itemsBySession.get(sessionId) ?? []), item]);
    const muscles = muscleIdsBySession.get(sessionId) ?? new Set<string>();
    const mappingId = item.actual_mapping_set_id ?? item.planned_mapping_set_id;
    for (const muscleId of mappingId ? (musclesByMapping.get(mappingId) ?? []) : [])
      muscles.add(muscleId);
    const customEntries = Array.isArray(item.actual_custom_mapping_entries)
      ? item.actual_custom_mapping_entries
      : item.planned_custom_mapping_entries;
    if (Array.isArray(customEntries)) {
      for (const entry of customEntries) {
        if (!entry || typeof entry !== "object") continue;
        const value = entry as { muscleId?: unknown; muscle_id?: unknown };
        const muscleId = value.muscleId ?? value.muscle_id;
        if (typeof muscleId === "string" && muscleId) muscles.add(muscleId);
      }
    }
    muscleIdsBySession.set(sessionId, muscles);
  }
  for (const sessionId of sessionIds) {
    verifiedCountBySession.set(sessionId, personalRecords.eventsBySessionId[sessionId]?.length ?? 0);
    const sessionLogs = logsBySession.get(sessionId) ?? [];
    const strengthSnapshot = snapshots.some((snapshot) => snapshot.workout_session_id === sessionId && snapshot.workload_model_version === "resistance_sets_v1");
    const strengthValues = sessionLogs.some((log) => log.reps !== null || log.weight_kg !== null);
    const semanticValues = sessionLogs.some((log) => (log.performance_metrics?.length ?? 0) > 0 || (log.segments?.length ?? 0) > 0);
    resultKindBySession.set(sessionId, strengthSnapshot || strengthValues ? "strength_sets" : semanticValues ? "semantic_metrics" : "limited");
  }
  return { logsBySession, itemsBySession, muscleIdsBySession, verifiedCountBySession, resultKindBySession };
}

async function readPerformedRoots(
  supabase: SupabaseClient,
  userId: string,
  rows: RootPageRow[],
): Promise<PerformedWorkoutHistoryRow[]> {
  const ids = rows.filter((row) => row.source_kind === "performed").map((row) => row.root_id);
  if (!ids.length) return [];
  const result = await supabase
    .from("workout_sessions")
    .select("id,user_id,scheduled_session_id,workout_name,workout_day_name,workout_category,started_at,completed_at,skipped_at,cancelled_at,duration_minutes,notes,status,plan_id,plan_day_id,plan_week_id,plan_session_id,deleted_at,history_revision,derived_record_schema_version,derived_record_formula_version,derived_records_evaluated_at")
    .eq("user_id", userId)
    .in("id", ids);
  if (result.error)
    throw new WorkoutHistoryReaderError("history_read_failed", "Workout history could not load.", 503);
  return (result.data ?? []) as unknown as PerformedWorkoutHistoryRow[];
}

async function readScheduledRoots(
  supabase: SupabaseClient,
  userId: string,
  rows: RootPageRow[],
): Promise<ScheduledWorkoutHistoryRow[]> {
  const ids = rows.filter((row) => row.source_kind === "scheduled_fallback").map((row) => row.root_id);
  if (!ids.length) return [];
  const result = await supabase
    .from("user_workout_sessions")
    .select("id,user_id,user_workout_plan_id,plan_day_id,plan_week_id,plan_session_id,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes")
    .eq("user_id", userId)
    .in("id", ids);
  if (result.error)
    throw new WorkoutHistoryReaderError("history_read_failed", "Workout history could not load.", 503);
  return (result.data ?? []) as unknown as ScheduledWorkoutHistoryRow[];
}

function presentationMetadata(
  sessionId: string,
  metadata: PageMetadata,
) {
  const logs = (metadata.logsBySession.get(sessionId) ?? [])
    .filter((log) => Boolean(log.completed_at));
  const items = metadata.itemsBySession.get(sessionId) ?? [];
  const identityNames = new Map<string, string>();
  for (const item of items) {
    identityNames.set(
      snapshotIdentity(item),
      item.actual_name_snapshot ?? item.activity_name_snapshot,
    );
  }
  for (const log of logs) {
    const identity = log.plan_activity_id
      ? `plan_activity:${log.plan_activity_id}`
      : log.plan_exercise_id
        ? `plan_exercise:${log.plan_exercise_id}`
        : `name:${normalizedText(log.exercise_name)}`;
    if (!identityNames.has(identity)) identityNames.set(identity, log.exercise_name);
  }
  const derived = deriveSessionMetrics(logs as DerivedMetricLog[]);
  const reliableVolume = derived.externalLoadVolume > 0
    ? derived.externalLoadVolume
    : null;
  return {
    exerciseCount: identityNames.size,
    completedSetCount: logs.length,
    reliableVolume,
    verifiedRecordCount: metadata.verifiedCountBySession.get(sessionId) ?? 0,
    exerciseIds: [...identityNames.keys()],
    exerciseNames: [...identityNames.values()],
    muscleIds: [...(metadata.muscleIdsBySession.get(sessionId) ?? [])],
    resultKind: metadata.resultKindBySession.get(sessionId) ?? "limited" as const,
    resultFacts: [
      ...(derived.durationSeconds > 0 ? [{ metricKey: "duration_seconds", side: "none" as const, value: derived.durationSeconds, unit: "seconds" }] : []),
      ...(derived.distanceMeters > 0 ? [{ metricKey: "distance_meters", side: "none" as const, value: derived.distanceMeters, unit: "meters" }] : []),
      ...(derived.rounds > 0 ? [{ metricKey: "rounds", side: "none" as const, value: derived.rounds, unit: "rounds" }] : []),
    ],
  };
}

export async function listWorkoutHistoryKeyset(
  supabase: SupabaseClient,
  userId: string,
  request: WorkoutHistoryListRequest,
  cursorSecret: string,
): Promise<WorkoutHistoryListResponse> {
  const limit = Math.min(50, Math.max(1, request.limit ?? 20));
  const [rootRows, summary] = await Promise.all([
    readRootRows(supabase, userId, request, cursorSecret),
    request.cursor ? Promise.resolve(undefined) : readSummary(supabase, userId, request),
  ]);
  const hasMore = rootRows.length > limit;
  const pageRoots = rootRows.slice(0, limit);
  const [performed, scheduled] = await Promise.all([
    readPerformedRoots(supabase, userId, pageRoots),
    readScheduledRoots(supabase, userId, pageRoots),
  ]);
  const performedIds = performed.map((session) => session.id);
  const metadata = await readPageMetadata(supabase, userId, performedIds);
  const metadataById = new Map(pageRoots.map((row) => [row.root_id, row]));
  const candidates: PerformedWorkoutHistoryCandidate[] = performed.map((session) => {
    const root = metadataById.get(session.id);
    return {
      session,
      metadata: {
        completedSetCount: numeric(root?.completed_set_count) ?? 0,
        structuredPerformedMetricCount: numeric(root?.structured_metric_count) ?? 0,
        actualPerformedSnapshotCount: numeric(root?.actual_snapshot_count) ?? 0,
        plannedSetCount: numeric(root?.planned_set_count),
      },
    };
  });
  const activities = resolveCanonicalWorkoutActivity({
    ownerUserId: userId,
    performed: candidates,
    scheduledTerminal: scheduled,
    eligibility: {
      statuses: request.statuses?.length
        ? request.statuses
        : ["completed", "partial"],
      includeMeaningfulCancelled: request.statuses?.includes("cancelled"),
    },
  });
  const sort = request.sort ?? "newest";
  const items = activities.map((activity) => presentWorkoutHistorySession(
    activity,
    activity.canonicalSessionId
      ? presentationMetadata(activity.canonicalSessionId, metadata)
      : undefined,
  )).sort(compareSummary(sort));
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    period: { from: request.from, to: request.to, timezone: request.timezone },
    ...(summary ? { summary } : {}),
    items,
    nextCursor: hasMore && items.length
      ? encodeWorkoutHistoryCursor(cursorFor(items.at(-1)!, sort), cursorSecret)
      : null,
    notices: [],
  };
}

export async function hasAnyWorkoutHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const result = await supabase.rpc("has_any_workout_history_v1", { p_user_id: userId });
  if (result.error) throw new WorkoutHistoryReaderError("history_read_failed", "Workout history could not load.", 503);
  return result.data === true;
}
