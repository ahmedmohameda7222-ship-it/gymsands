import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PerformedWorkoutHistoryCandidate,
  PerformedWorkoutHistoryRow,
  ScheduledWorkoutHistoryRow,
  WorkoutHistoryEligibilityOptions,
} from "@/lib/workouts/history/contracts";
import {
  decodeWorkoutHistoryCursor,
  encodeWorkoutHistoryCursor,
  type WorkoutHistoryCursorPayload,
} from "@/lib/workouts/history/cursor";
import { summarizeWorkoutHistory } from "@/lib/workouts/history/metrics";
import { presentWorkoutHistorySession } from "@/lib/workouts/history/presentation";
import { resolveWorkoutHistoryResultKind } from "@/lib/workouts/history/result-kind";
import { resolveCanonicalWorkoutActivity } from "@/lib/workouts/history/resolve-activity";
import { isSupportedWorkoutMetricKey } from "@/lib/workouts/metric-presentation";
import {
  presentWorkoutHistoryTimeline,
  type WorkoutHistoryTimelineSourceRow,
} from "@/lib/workouts/history/timeline-presentation";
import { readCanonicalWorkoutActivityWithClient } from "@/services/workouts/history/reader";
import { readWorkoutHistoryPersonalRecordSessions } from "@/services/personal-records/server";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type CanonicalWorkoutActivity,
  type WorkoutHistoryExerciseDetail,
  type WorkoutHistoryFilterOptions,
  type WorkoutHistoryMetricValue,
  type WorkoutHistoryPlannedSet,
  type WorkoutHistoryListRequest,
  type WorkoutHistoryListResponse,
  type WorkoutHistorySessionDetailResponse,
  type WorkoutHistorySessionSummary,
  type WorkoutHistorySort,
  type WorkoutHistoryVerifiedRecord,
} from "@/types/workout-history";

const PERIOD_ROOT_PAGE_SIZE = 1_000;
const IN_FILTER_CHUNK = 200;

type PerformedLogRow = {
  id: string;
  workout_session_id: string;
  plan_exercise_id: string | null;
  plan_activity_id: string | null;
  exercise_order: number | null;
  exercise_name: string;
  exercise_category: string | null;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  notes: string | null;
  completed_at: string | null;
  set_type?: string | null;
};

type StructuredMetricRow = { workout_session_id: string };
type PrescriptionSetRow = { workout_session_id: string };
type SnapshotRow = { id: string; workout_session_id: string };
type SnapshotItemRow = {
  snapshot_id: string;
  source_plan_exercise_id: string | null;
  source_plan_activity_id: string | null;
  activity_name_snapshot: string;
  planned_global_exercise_id?: string | null;
  actual_global_exercise_id?: string | null;
  planned_custom_exercise_id?: string | null;
  actual_custom_exercise_id?: string | null;
  planned_provider?: string | null;
  actual_provider?: string | null;
  planned_provider_activity_id?: string | null;
  actual_provider_activity_id?: string | null;
  actual_name_snapshot?: string | null;
  planned_mapping_set_id?: string | null;
  actual_mapping_set_id?: string | null;
  planned_custom_mapping_entries?: unknown;
  actual_custom_mapping_entries?: unknown;
  planned_sets: number | null;
  performed_total_sets?: number | null;
};
type SnapshotMappingEntryRow = { mapping_set_id: string; muscle_id: string };
type PlanNameRow = { id: string; name: string };
type ScheduledSearchRow = { user_workout_session_id: string; exercise_name: string; notes: string | null };
type SetNoteRow = { workout_session_id: string; notes: string | null };
type DetailSnapshotRow = {
  id: string;
  workout_session_id: string;
  snapshot_schema_version: string;
  frozen_at: string;
  workload_model_version: string;
};
type DetailSnapshotItemRow = {
  id: string;
  snapshot_id: string;
  source_plan_exercise_id: string | null;
  source_plan_activity_id: string | null;
  item_order: number;
  activity_name_snapshot: string;
  actual_name_snapshot: string | null;
  state: "planned" | "replaced" | "skipped" | "adjusted" | "completed";
  performed_total_sets: number | null;
};
type DetailPrescriptionSetRow = {
  id: string;
  snapshot_item_id: string;
  set_order: number;
  performed_order_hint: number | null;
  set_type: string;
  target_mode: string;
  side_mode: string;
  rest_seconds: number | null;
  tempo_target: string | null;
};
type DetailPrescriptionTargetRow = {
  prescription_set_id: string;
  metric_key: string;
  side: "none" | "bilateral" | "left" | "right";
  target_mode: string;
  target_value: number | string | null;
  minimum_value: number | string | null;
  maximum_value: number | string | null;
};
type DetailMetricRow = {
  exercise_log_id: string;
  metric_key: string;
  side: "none" | "bilateral" | "left" | "right";
  value: number | string;
};
type DetailSetRow = {
  exercise_log_id: string;
  set_type: string;
  rpe: number | string | null;
  rir: number | string | null;
  notes: string | null;
};
type DetailSegmentRow = {
  id: string;
  exercise_log_id: string;
  segment_order: number;
  segment_kind: string;
  side: string;
};
type DetailSegmentMetricRow = DetailMetricRow & { segment_id: string };
type ScheduledExerciseLabelRow = { exercise_order: number; exercise_name: string };

export class WorkoutHistoryReaderError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "WorkoutHistoryReaderError";
    this.code = code;
    this.status = status;
  }
}

export function readCanonicalWorkoutActivity(input: {
  supabase: SupabaseClient;
  userId: string;
  limit?: number;
  eligibility?: WorkoutHistoryEligibilityOptions;
}) {
  return readCanonicalWorkoutActivityWithClient(input);
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function snapshotExerciseIdentity(item: SnapshotItemRow): string {
  const provider = item.actual_provider ?? item.planned_provider;
  const providerActivityId = item.actual_provider_activity_id ?? item.planned_provider_activity_id;
  if (provider && providerActivityId) return `provider:${provider}:${providerActivityId}`;
  const globalId = item.actual_global_exercise_id ?? item.planned_global_exercise_id;
  if (globalId) return `global:${globalId}`;
  const customId = item.actual_custom_exercise_id ?? item.planned_custom_exercise_id;
  if (customId) return `custom:${customId}`;
  return `name:${normalizedText(item.actual_name_snapshot ?? item.activity_name_snapshot)}`;
}

function humanizeIdentityLabel(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

async function readPlanNames(
  supabase: SupabaseClient,
  userId: string,
  planIds: string[],
): Promise<Map<string, string>> {
  if (!planIds.length) return new Map();
  const results = await Promise.all(Array.from(
    { length: Math.ceil(planIds.length / IN_FILTER_CHUNK) },
    (_, index) => supabase
      .from("user_workout_plans")
      .select("id,name")
      .eq("user_id", userId)
      .in("id", planIds.slice(index * IN_FILTER_CHUNK, (index + 1) * IN_FILTER_CHUNK)),
  ));
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new WorkoutHistoryReaderError("history_read_failed", "Workout history could not load.", 503);
  return new Map(results.flatMap((result) => (result.data ?? []) as unknown as PlanNameRow[]).map((plan) => [plan.id, plan.name]));
}

async function readRowsInChunks<T>(
  supabase: SupabaseClient,
  table: string,
  selection: string,
  field: string,
  values: string[],
): Promise<T[]> {
  if (!values.length) return [];
  const chunks = Array.from(
    { length: Math.ceil(values.length / IN_FILTER_CHUNK) },
    (_, index) => values.slice(index * IN_FILTER_CHUNK, (index + 1) * IN_FILTER_CHUNK),
  );
  const results = await Promise.all(
    chunks.map((chunk) => supabase.from(table).select(selection).in(field, chunk)),
  );
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new WorkoutHistoryReaderError("history_read_failed", "Workout history could not load.", 503);
  return results.flatMap((result) => (result.data ?? []) as unknown as T[]);
}

async function readPeriodSources(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string,
) {
  function effectiveFilter(
    columns: string[],
    fallbackDateColumn?: string,
  ): string {
    const filters = columns.map((column, index) => {
      const nullPreconditions = columns
        .slice(0, index)
        .map((previous) => `${previous}.is.null`);
      return `and(${[
        ...nullPreconditions,
        `${column}.gte.${from}`,
        `${column}.lt.${to}`,
      ].join(",")})`;
    });
    if (fallbackDateColumn) {
      filters.push(`and(${[
        ...columns.map((column) => `${column}.is.null`),
        `${fallbackDateColumn}.gte.${from.slice(0, 10)}`,
        `${fallbackDateColumn}.lte.${to.slice(0, 10)}`,
      ].join(",")})`);
    }
    return filters.join(",");
  }

  async function readPerformedStatus(
    status: "completed" | "skipped" | "cancelled",
    timestampColumns: string[],
  ) {
    const data: PerformedWorkoutHistoryRow[] = [];
    for (let offset = 0; ; offset += PERIOD_ROOT_PAGE_SIZE) {
      const page = await supabase
        .from("workout_sessions")
        .select("id,user_id,scheduled_session_id,workout_name,workout_day_name,workout_category,started_at,completed_at,skipped_at,cancelled_at,duration_minutes,notes,status,plan_id,plan_day_id,plan_week_id,plan_session_id,deleted_at,history_revision,derived_record_schema_version,derived_record_formula_version,derived_records_evaluated_at")
        .eq("user_id", userId)
        .eq("status", status)
        .is("deleted_at", null)
        .or(effectiveFilter(timestampColumns))
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + PERIOD_ROOT_PAGE_SIZE - 1);
      if (page.error) return { data: null, error: page.error };
      const rows = (page.data ?? []) as unknown as PerformedWorkoutHistoryRow[];
      data.push(...rows);
      if (rows.length < PERIOD_ROOT_PAGE_SIZE) return { data, error: null };
    }
  }

  async function readScheduledStatus(
    status: "completed" | "skipped",
    timestampColumns: string[],
  ) {
    const data: ScheduledWorkoutHistoryRow[] = [];
    for (let offset = 0; ; offset += PERIOD_ROOT_PAGE_SIZE) {
      const page = await supabase
        .from("user_workout_sessions")
        .select("id,user_id,user_workout_plan_id,plan_day_id,plan_week_id,plan_session_id,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes")
        .eq("user_id", userId)
        .eq("status", status)
        .or(effectiveFilter(timestampColumns, "scheduled_date"))
        .order("scheduled_date", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + PERIOD_ROOT_PAGE_SIZE - 1);
      if (page.error) return { data: null, error: page.error };
      const rows = (page.data ?? []) as unknown as ScheduledWorkoutHistoryRow[];
      data.push(...rows);
      if (rows.length < PERIOD_ROOT_PAGE_SIZE) return { data, error: null };
    }
  }

  async function readSuppressedScheduledIds() {
    const ids = new Set<string>();
    for (let offset = 0; ; offset += PERIOD_ROOT_PAGE_SIZE) {
      const page = await supabase.from("workout_sessions").select("scheduled_session_id")
        .eq("user_id", userId).not("scheduled_session_id", "is", null)
        .range(offset, offset + PERIOD_ROOT_PAGE_SIZE - 1);
      if (page.error) return { ids, error: page.error };
      for (const row of page.data ?? []) if (row.scheduled_session_id) ids.add(row.scheduled_session_id);
      if ((page.data ?? []).length < PERIOD_ROOT_PAGE_SIZE) return { ids, error: null };
    }
  }

  const [completed, skipped, cancelled, scheduledCompleted, scheduledSkipped, suppression] = await Promise.all([
    readPerformedStatus("completed", ["completed_at", "started_at"]),
    readPerformedStatus("skipped", ["skipped_at", "completed_at", "started_at"]),
    readPerformedStatus("cancelled", ["cancelled_at", "completed_at", "started_at"]),
    readScheduledStatus("completed", ["completed_at", "started_at"]),
    readScheduledStatus("skipped", ["skipped_at", "completed_at", "started_at"]),
    readSuppressedScheduledIds(),
  ]);
  const performedError = completed.error ?? skipped.error ?? cancelled.error;
  const scheduledError = scheduledCompleted.error ?? scheduledSkipped.error ?? suppression.error;
  const performed = performedError
    ? { data: null, error: performedError }
    : { data: [...(completed.data ?? []), ...(skipped.data ?? []), ...(cancelled.data ?? [])], error: null };
  const scheduled = scheduledError
    ? { data: null, error: scheduledError }
    : { data: [...(scheduledCompleted.data ?? []), ...(scheduledSkipped.data ?? [])].filter((row) => !suppression.ids.has(row.id)), error: null };
  return { performed, scheduled };
}

async function buildPerformedCandidates(
  supabase: SupabaseClient,
  userId: string,
  sessions: PerformedWorkoutHistoryRow[],
) {
  const sessionIds = sessions.map((session) => session.id);
  const [logs, metrics, prescriptions, snapshots, personalRecords] = await Promise.all([
    readRowsInChunks<PerformedLogRow>(
      supabase,
      "exercise_logs",
      "id,workout_session_id,plan_exercise_id,plan_activity_id,exercise_order,exercise_name,exercise_category,set_number,reps,weight_kg,notes,completed_at",
      "workout_session_id",
      sessionIds,
    ),
    readRowsInChunks<StructuredMetricRow>(supabase, "exercise_log_metric_values", "workout_session_id", "workout_session_id", sessionIds),
    readRowsInChunks<PrescriptionSetRow>(supabase, "workout_session_prescription_sets", "workout_session_id", "workout_session_id", sessionIds),
    readRowsInChunks<SnapshotRow>(supabase, "workout_session_muscle_snapshots", "id,workout_session_id", "workout_session_id", sessionIds),
    readWorkoutHistoryPersonalRecordSessions(supabase, userId, sessionIds),
  ]);
  const snapshotItems = await readRowsInChunks<SnapshotItemRow>(
    supabase,
    "workout_session_muscle_snapshot_items",
    "snapshot_id,source_plan_exercise_id,source_plan_activity_id,activity_name_snapshot,actual_name_snapshot,planned_global_exercise_id,actual_global_exercise_id,planned_custom_exercise_id,actual_custom_exercise_id,planned_provider,actual_provider,planned_provider_activity_id,actual_provider_activity_id,planned_mapping_set_id,actual_mapping_set_id,planned_custom_mapping_entries,actual_custom_mapping_entries,planned_sets,performed_total_sets",
    "snapshot_id",
    snapshots.map((snapshot) => snapshot.id),
  );
  const mappingEntries = await readRowsInChunks<SnapshotMappingEntryRow>(
    supabase,
    "exercise_muscle_mapping_entries",
    "mapping_set_id,muscle_id",
    "mapping_set_id",
    unique(snapshotItems.flatMap((item) => [
      item.planned_mapping_set_id,
      item.actual_mapping_set_id,
    ])),
  );

  const completedSetCount = new Map<string, number>();
  const metricCount = new Map<string, number>();
  const plannedSetCount = new Map<string, number>();
  const performedSnapshotCount = new Map<string, number>();
  const logsBySession = new Map<string, PerformedLogRow[]>();
  const snapshotSessionById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot.workout_session_id]));
  const snapshotItemsBySession = new Map<string, SnapshotItemRow[]>();
  const muscleIdsBySession = new Map<string, Set<string>>();
  const muscleIdsByMappingSet = new Map<string, string[]>();
  const verifiedRecordCountBySession = new Map<string, number>();
  for (const sessionId of sessionIds) {
    verifiedRecordCountBySession.set(sessionId, personalRecords.eventsBySessionId[sessionId]?.length ?? 0);
  }
  for (const entry of mappingEntries) {
    muscleIdsByMappingSet.set(entry.mapping_set_id, [
      ...(muscleIdsByMappingSet.get(entry.mapping_set_id) ?? []),
      entry.muscle_id,
    ]);
  }

  for (const log of logs) {
    logsBySession.set(log.workout_session_id, [...(logsBySession.get(log.workout_session_id) ?? []), log]);
    if (log.completed_at) increment(completedSetCount, log.workout_session_id);
  }
  for (const metric of metrics) increment(metricCount, metric.workout_session_id);
  for (const set of prescriptions) increment(plannedSetCount, set.workout_session_id);
  for (const item of snapshotItems) {
    const sessionId = snapshotSessionById.get(item.snapshot_id);
    if (!sessionId) continue;
    snapshotItemsBySession.set(sessionId, [...(snapshotItemsBySession.get(sessionId) ?? []), item]);
    const muscleIds = muscleIdsBySession.get(sessionId) ?? new Set<string>();
    for (const mappingSetId of [item.actual_mapping_set_id ?? item.planned_mapping_set_id]) {
      if (!mappingSetId) continue;
      for (const muscleId of muscleIdsByMappingSet.get(mappingSetId) ?? []) {
        muscleIds.add(muscleId);
      }
    }
    for (const customEntries of [Array.isArray(item.actual_custom_mapping_entries)
      ? item.actual_custom_mapping_entries
      : item.planned_custom_mapping_entries]) {
      if (!Array.isArray(customEntries)) continue;
      for (const entry of customEntries) {
        if (!entry || typeof entry !== "object") continue;
        const value = entry as { muscleId?: unknown; muscle_id?: unknown };
        const muscleId = value.muscleId ?? value.muscle_id;
        if (typeof muscleId === "string" && muscleId) muscleIds.add(muscleId);
      }
    }
    muscleIdsBySession.set(sessionId, muscleIds);
    if ((item.performed_total_sets ?? 0) > 0) increment(performedSnapshotCount, sessionId, item.performed_total_sets ?? 0);
  }

  const candidates: PerformedWorkoutHistoryCandidate[] = sessions.map((session) => ({
    session,
    metadata: {
      completedSetCount: completedSetCount.get(session.id) ?? 0,
      structuredPerformedMetricCount: metricCount.get(session.id) ?? 0,
      actualPerformedSnapshotCount: performedSnapshotCount.get(session.id) ?? 0,
      plannedSetCount: plannedSetCount.has(session.id) ? (plannedSetCount.get(session.id) ?? 0) : null,
    },
  }));
  return { candidates, logsBySession, snapshotItemsBySession, muscleIdsBySession, verifiedRecordCountBySession };
}

function metadataForActivity(
  activity: CanonicalWorkoutActivity,
  logsBySession: Map<string, PerformedLogRow[]>,
  snapshotItemsBySession: Map<string, SnapshotItemRow[]>,
  muscleIdsBySession: Map<string, Set<string>>,
  verifiedRecordCountBySession: Map<string, number>,
) {
  if (!activity.canonicalSessionId) return undefined;
  const logs = logsBySession.get(activity.canonicalSessionId) ?? [];
  const completedLogs = logs.filter((log) => Boolean(log.completed_at));
  const snapshotItems = snapshotItemsBySession.get(activity.canonicalSessionId) ?? [];
  const identities = unique(snapshotItems.map(snapshotExerciseIdentity));
  const performedExerciseIdentities = unique([
    ...completedLogs.map((log) =>
      log.plan_activity_id ?? log.plan_exercise_id ?? `name:${normalizedText(log.exercise_name)}`),
    ...snapshotItems
      .filter((item) => (item.performed_total_sets ?? 0) > 0)
      .map((item) =>
        item.source_plan_activity_id ??
        item.source_plan_exercise_id ??
        `name:${normalizedText(item.activity_name_snapshot)}`),
  ]);
  const names = unique([
    ...completedLogs.map((log) => log.exercise_name),
    ...snapshotItems.map((item) => item.activity_name_snapshot),
  ]);
  const reliableVolumeValues = completedLogs
    .filter((log) => log.reps !== null && log.weight_kg !== null)
    .map((log) => Number(log.reps) * Number(log.weight_kg));
  return {
    exerciseCount: performedExerciseIdentities.length,
    completedSetCount: completedLogs.length,
    reliableVolume: reliableVolumeValues.length
      ? reliableVolumeValues.reduce((sum, value) => sum + value, 0)
      : null,
    verifiedRecordCount: verifiedRecordCountBySession.get(activity.canonicalSessionId) ?? 0,
    exerciseIds: identities,
    exerciseNames: names,
    muscleIds: [...(muscleIdsBySession.get(activity.canonicalSessionId) ?? [])],
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

function matchesRequest(
  item: WorkoutHistorySessionSummary,
  request: WorkoutHistoryListRequest,
  searchText: string,
): boolean {
  const effective = Date.parse(item.effectiveAt);
  if (effective < Date.parse(request.from) || effective >= Date.parse(request.to)) return false;
  if (request.search) {
    const query = normalizedText(request.search);
    if (!searchText.includes(query)) return false;
  }
  if (request.workoutTypes?.length && !request.workoutTypes.some((type) => normalizedText(type) === normalizedText(item.category))) return false;
  if (request.planIds?.length && (!item.planId || !request.planIds.includes(item.planId))) return false;
  if (request.exerciseIds?.length && !request.exerciseIds.some((id) => item.exerciseIds.includes(id))) return false;
  if (request.muscleIds?.length && !request.muscleIds.some((id) => item.muscleIds.includes(id))) return false;
  if (request.progressOnly && !item.hasMeaningfulPerformance) return false;
  return true;
}

function cursorForItem(item: WorkoutHistorySessionSummary, sort: WorkoutHistorySort): WorkoutHistoryCursorPayload {
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    sort,
    effectiveAt: item.effectiveAt,
    activityId: item.activityId,
    durationMinutes: item.durationMinutes,
  };
}

function cursorStartIndex(
  items: WorkoutHistorySessionSummary[],
  cursor: WorkoutHistoryCursorPayload | null,
): number {
  if (!cursor) return 0;
  const exact = items.findIndex((item) =>
    item.activityId === cursor.activityId &&
    item.effectiveAt === cursor.effectiveAt &&
    item.durationMinutes === cursor.durationMinutes,
  );
  if (exact >= 0) return exact + 1;
  const synthetic = {
    ...items[0],
    activityId: cursor.activityId,
    effectiveAt: cursor.effectiveAt,
    durationMinutes: cursor.durationMinutes,
  } as WorkoutHistorySessionSummary;
  const compare = compareSummary(cursor.sort);
  const index = items.findIndex((item) => compare(item, synthetic) > 0);
  return index < 0 ? items.length : index;
}

export async function listWorkoutHistory(
  supabase: SupabaseClient,
  userId: string,
  request: WorkoutHistoryListRequest,
  cursorSecret: string,
): Promise<WorkoutHistoryListResponse> {
  const sourceResults = await readPeriodSources(
    supabase,
    userId,
    request.from,
    request.to,
  );
  const performedFailed = Boolean(sourceResults.performed.error);
  const scheduledFailed = Boolean(sourceResults.scheduled.error);
  if (performedFailed && scheduledFailed) {
    throw new WorkoutHistoryReaderError("history_unavailable", "Workout history could not load.", 503);
  }

  const performedRoots = ((sourceResults.performed.data ?? []) as unknown as PerformedWorkoutHistoryRow[])
    .filter((session) => !request.workoutTypes?.length || request.workoutTypes.some((type) => normalizedText(type) === normalizedText(session.workout_category)))
    .filter((session) => !request.planIds?.length || Boolean(session.plan_id && request.planIds.includes(session.plan_id)));
  const scheduledRoots = ((sourceResults.scheduled.data ?? []) as unknown as ScheduledWorkoutHistoryRow[])
    .filter(() => !request.workoutTypes?.length)
    .filter((session) => !request.planIds?.length || request.planIds.includes(session.user_workout_plan_id));
  const planNamesById = await readPlanNames(supabase, userId, unique([
    ...performedRoots.map((session) => session.plan_id),
    ...scheduledRoots.map((session) => session.user_workout_plan_id),
  ]));
  let candidates: PerformedWorkoutHistoryCandidate[] = [];
  let logsBySession = new Map<string, PerformedLogRow[]>();
  let snapshotItemsBySession = new Map<string, SnapshotItemRow[]>();
  let muscleIdsBySession = new Map<string, Set<string>>();
  let verifiedRecordCountBySession = new Map<string, number>();
  if (!performedFailed) {
    const performedMetadata = await buildPerformedCandidates(
      supabase,
      userId,
      performedRoots,
    );
    candidates = performedMetadata.candidates;
    logsBySession = performedMetadata.logsBySession;
    snapshotItemsBySession = performedMetadata.snapshotItemsBySession;
    muscleIdsBySession = performedMetadata.muscleIdsBySession;
    verifiedRecordCountBySession = performedMetadata.verifiedRecordCountBySession;
  }
  const scheduled = scheduledFailed
    ? []
    : scheduledRoots;
  const scheduledSearchRows = request.search
    ? await readRowsInChunks<ScheduledSearchRow>(
        supabase,
        "user_exercise_logs",
        "user_workout_session_id,exercise_name,notes",
        "user_workout_session_id",
        scheduled.map((session) => session.id),
      )
    : [];
  const setNoteRows = request.search
    ? await readRowsInChunks<SetNoteRow>(
        supabase,
        "exercise_log_set_details",
        "workout_session_id,notes",
        "workout_session_id",
        candidates.map((candidate) => candidate.session.id),
      )
    : [];
  const setNotesBySession = new Map<string, string[]>();
  for (const row of setNoteRows) {
    if (!row.notes) continue;
    setNotesBySession.set(row.workout_session_id, [
      ...(setNotesBySession.get(row.workout_session_id) ?? []),
      row.notes,
    ]);
  }
  const scheduledSearchById = new Map<string, string[]>();
  for (const row of scheduledSearchRows) {
    scheduledSearchById.set(row.user_workout_session_id, [
      ...(scheduledSearchById.get(row.user_workout_session_id) ?? []),
      row.exercise_name,
      row.notes ?? "",
    ]);
  }
  const statuses = request.statuses?.length
    ? request.statuses
    : (["completed", "partial"] as const);
  const activities = resolveCanonicalWorkoutActivity({
    ownerUserId: userId,
    performed: candidates,
    scheduledTerminal: scheduled,
    eligibility: { statuses },
  });
  const sort = request.sort ?? "newest";
  const unfilteredItems = activities
    .map((activity) => presentWorkoutHistorySession(
      activity,
      metadataForActivity(
        activity,
        logsBySession,
        snapshotItemsBySession,
        muscleIdsBySession,
        verifiedRecordCountBySession,
      ),
    ));
  const searchTextByActivity = new Map(unfilteredItems.map((item) => {
    const logs = item.canonicalSessionId ? (logsBySession.get(item.canonicalSessionId) ?? []) : [];
    const scheduledSearch = item.scheduledSessionId ? (scheduledSearchById.get(item.scheduledSessionId) ?? []) : [];
    return [item.activityId, normalizedText([
      item.title,
      item.planId ? planNamesById.get(item.planId) : "",
      ...item.exerciseNames,
      item.notes,
      ...logs.flatMap((log) => [log.exercise_name, log.notes]),
      ...(item.canonicalSessionId ? (setNotesBySession.get(item.canonicalSessionId) ?? []) : []),
      ...scheduledSearch,
    ].filter(Boolean).join(" "))];
  }));
  const filterOptions: WorkoutHistoryFilterOptions = {
    workoutTypes: unique(unfilteredItems.map((item) => item.category)).sort().map((value) => ({ value, label: humanizeIdentityLabel(value) })),
    muscles: unique(unfilteredItems.flatMap((item) => item.muscleIds)).sort().map((value) => ({ value, label: humanizeIdentityLabel(value) })),
    exercises: [...new Map(unfilteredItems.flatMap((item) => item.exerciseIds.map((value, index) => [
      value,
      { value, label: item.exerciseNames[index] ?? humanizeIdentityLabel(value.replace(/^[^:]+:/, "")), degraded: value.startsWith("name:") || undefined },
    ]))).values()].sort((left, right) => left.label.localeCompare(right.label)),
    plans: [...planNamesById].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label)),
  };
  const allItems = unfilteredItems
    .filter((item) => matchesRequest(item, request, searchTextByActivity.get(item.activityId) ?? ""))
    .sort(compareSummary(sort));
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
  if (cursor && cursor.sort !== sort) {
    throw new WorkoutHistoryReaderError("invalid_cursor", "Workout History cursor is invalid.", 400);
  }
  const limit = Math.min(50, Math.max(1, request.limit ?? 20));
  const start = cursorStartIndex(allItems, cursor);
  const items = allItems.slice(start, start + limit);
  const hasMore = start + items.length < allItems.length;
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    period: { from: request.from, to: request.to, timezone: request.timezone },
    ...(request.cursor ? {} : { summary: summarizeWorkoutHistory(allItems) }),
    items,
    nextCursor: hasMore && items.length
      ? encodeWorkoutHistoryCursor(cursorForItem(items.at(-1)!, sort), cursorSecret)
      : null,
    notices: performedFailed || scheduledFailed ? ["partial-availability"] : [],
    filterOptions,
  };
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const metricUnits: Record<string, string> = {
  repetitions: "count",
  external_load_kg: "kg",
  bodyweight_kg: "kg",
  assistance_load_kg: "kg",
  duration_seconds: "seconds",
  distance_meters: "meters",
  rounds: "count",
};

function presentMetric(row: DetailMetricRow): WorkoutHistoryMetricValue | null {
  const value = numberOrNull(row.value);
  return value === null ? null : {
    metricKey: row.metric_key,
    side: row.side,
    value,
    unit: metricUnits[row.metric_key] ?? null,
  };
}

function snapshotItemForLog(
  log: PerformedLogRow,
  items: readonly DetailSnapshotItemRow[],
): DetailSnapshotItemRow | null {
  const candidates = log.plan_activity_id
    ? items.filter((item) => item.source_plan_activity_id === log.plan_activity_id)
    : log.plan_exercise_id
      ? items.filter((item) => item.source_plan_exercise_id === log.plan_exercise_id)
      : items.filter((item) => item.item_order === log.exercise_order);
  return candidates.length === 1 ? candidates[0] : null;
}

function presentPlannedSet(
  row: DetailPrescriptionSetRow,
  targetsBySet: ReadonlyMap<string, DetailPrescriptionTargetRow[]>,
): WorkoutHistoryPlannedSet {
  return {
    id: row.id,
    setOrder: row.set_order,
    setType: row.set_type,
    targetMode: row.target_mode,
    sideMode: row.side_mode,
    restSeconds: row.rest_seconds,
    tempoTarget: row.tempo_target,
    targets: (targetsBySet.get(row.id) ?? []).map((target) => ({
      metricKey: target.metric_key,
      side: target.side,
      targetMode: target.target_mode,
      targetValue: numberOrNull(target.target_value),
      minimumValue: numberOrNull(target.minimum_value),
      maximumValue: numberOrNull(target.maximum_value),
    })),
  };
}

function groupExerciseDetail(input: {
  logs: PerformedLogRow[];
  snapshotItems: DetailSnapshotItemRow[];
  prescriptions: DetailPrescriptionSetRow[];
  prescriptionTargets: DetailPrescriptionTargetRow[];
  metrics: DetailMetricRow[];
  setDetails: DetailSetRow[];
  segments: DetailSegmentRow[];
  segmentMetrics: DetailSegmentMetricRow[];
  verifiedRecordsByLog: Map<string, WorkoutHistoryVerifiedRecord[]>;
  resultKind: "strength_sets" | "semantic_metrics" | "limited";
}): WorkoutHistoryExerciseDetail[] {
  type Group = { identity: string; item: DetailSnapshotItemRow | null; logs: PerformedLogRow[] };
  const groups = new Map<string, Group>();
  for (const item of [...input.snapshotItems].sort((left, right) => left.item_order - right.item_order || left.id.localeCompare(right.id))) {
    groups.set(item.id, { identity: item.id, item, logs: [] });
  }
  for (const log of input.logs) {
    const item = snapshotItemForLog(log, input.snapshotItems);
    const identity = item?.id ?? log.plan_activity_id ?? log.plan_exercise_id ?? `${log.exercise_order ?? "none"}:${normalizedText(log.exercise_name)}`;
    const group = groups.get(identity) ?? { identity, item, logs: [] };
    group.logs.push(log);
    groups.set(identity, group);
  }

  const targetsBySet = new Map<string, DetailPrescriptionTargetRow[]>();
  for (const target of input.prescriptionTargets) {
    targetsBySet.set(target.prescription_set_id, [...(targetsBySet.get(target.prescription_set_id) ?? []), target]);
  }
  const prescriptionsByItem = new Map<string, DetailPrescriptionSetRow[]>();
  for (const set of input.prescriptions) {
    prescriptionsByItem.set(set.snapshot_item_id, [...(prescriptionsByItem.get(set.snapshot_item_id) ?? []), set]);
  }
  const metricsByLog = new Map<string, WorkoutHistoryMetricValue[]>();
  for (const metric of input.metrics) {
    const presented = presentMetric(metric);
    if (presented) metricsByLog.set(metric.exercise_log_id, [...(metricsByLog.get(metric.exercise_log_id) ?? []), presented]);
  }
  const detailsByLog = new Map(input.setDetails.map((detail) => [detail.exercise_log_id, detail]));
  const segmentMetricsBySegment = new Map<string, WorkoutHistoryMetricValue[]>();
  for (const metric of input.segmentMetrics) {
    const presented = presentMetric(metric);
    if (presented) segmentMetricsBySegment.set(metric.segment_id, [...(segmentMetricsBySegment.get(metric.segment_id) ?? []), presented]);
  }
  const segmentsByLog = new Map<string, DetailSegmentRow[]>();
  for (const segment of input.segments) {
    segmentsByLog.set(segment.exercise_log_id, [...(segmentsByLog.get(segment.exercise_log_id) ?? []), segment]);
  }

  return [...groups.values()].map((group) => {
    const plannedRows = group.item
      ? [...(prescriptionsByItem.get(group.item.id) ?? [])].sort((left, right) => left.set_order - right.set_order || left.id.localeCompare(right.id))
      : [];
    const unmatched = new Set(plannedRows.map((set) => set.id));
    const performedSets = group.logs
      .filter((log) => Boolean(log.completed_at))
      .sort((left, right) => left.set_number - right.set_number || left.id.localeCompare(right.id))
      .map((log) => {
        const hinted = plannedRows.filter((set) => unmatched.has(set.id) && set.performed_order_hint === log.set_number);
        const ordered = plannedRows.filter((set) => unmatched.has(set.id) && set.set_order === log.set_number);
        const matched = hinted.length === 1 ? hinted[0] : hinted.length === 0 && ordered.length === 1 ? ordered[0] : null;
        if (matched) unmatched.delete(matched.id);
        const detail = detailsByLog.get(log.id);
        return {
          id: log.id,
          setNumber: log.set_number,
          reps: log.reps,
          weightKg: log.weight_kg,
          completedAt: log.completed_at,
          notes: detail?.notes ?? log.notes,
          setType: detail?.set_type ?? log.set_type ?? null,
          rpe: detail ? numberOrNull(detail.rpe) : null,
          rir: detail ? numberOrNull(detail.rir) : null,
          matchState: matched ? "matched" as const : "unplanned" as const,
          plannedSet: matched ? presentPlannedSet(matched, targetsBySet) : null,
          metrics: metricsByLog.get(log.id) ?? [],
          segments: (segmentsByLog.get(log.id) ?? [])
            .sort((left, right) => left.segment_order - right.segment_order || left.id.localeCompare(right.id))
            .map((segment) => ({
              id: segment.id,
              segmentOrder: segment.segment_order,
              segmentKind: segment.segment_kind,
              side: segment.side,
              metrics: segmentMetricsBySegment.get(segment.id) ?? [],
            })),
          verifiedRecords: input.verifiedRecordsByLog.get(log.id) ?? [],
        };
      });
    const firstLog = group.logs[0];
    return {
      identity: group.identity,
      exerciseId: group.item?.source_plan_activity_id ?? group.item?.source_plan_exercise_id ?? firstLog?.plan_activity_id ?? firstLog?.plan_exercise_id ?? null,
      snapshotItemId: group.item?.id ?? null,
      name: group.item?.actual_name_snapshot ?? group.item?.activity_name_snapshot ?? firstLog?.exercise_name ?? "Workout exercise",
      plannedName: group.item?.activity_name_snapshot ?? null,
      state: group.item?.state ?? null,
      category: firstLog?.exercise_category ?? null,
      plannedSetCount: group.item ? plannedRows.length : null,
      performedSets,
      missingPlannedSets: plannedRows.filter((set) => unmatched.has(set.id)).map((set) => presentPlannedSet(set, targetsBySet)),
      resultKind: input.resultKind,
    };
  });
}

export async function getWorkoutHistorySessionDetail(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<WorkoutHistorySessionDetailResponse> {
  const root = await supabase
    .from("workout_sessions")
    .select("id,user_id,scheduled_session_id,workout_name,workout_day_name,workout_category,started_at,completed_at,skipped_at,cancelled_at,duration_minutes,notes,status,plan_id,plan_day_id,plan_week_id,plan_session_id,deleted_at,history_revision,derived_record_schema_version,derived_record_formula_version,derived_records_evaluated_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (root.error) throw new WorkoutHistoryReaderError("history_detail_unavailable", "Workout details could not load.", 503);
  if (!root.data) throw new WorkoutHistoryReaderError("history_not_found", "Workout history item was not found.", 404);
  const rootSession = root.data as unknown as PerformedWorkoutHistoryRow;
  const [logs, prescriptions, prescriptionTargets, metrics, setDetails, segments, segmentMetrics, snapshots, timelineRows, personalRecords] = await Promise.all([
    readRowsInChunks<PerformedLogRow>(supabase, "exercise_logs", "id,workout_session_id,plan_exercise_id,plan_activity_id,exercise_order,exercise_name,exercise_category,set_number,reps,weight_kg,notes,completed_at,set_type", "workout_session_id", [sessionId]),
    readRowsInChunks<DetailPrescriptionSetRow>(supabase, "workout_session_prescription_sets", "id,snapshot_item_id,set_order,performed_order_hint,set_type,target_mode,side_mode,rest_seconds,tempo_target", "workout_session_id", [sessionId]),
    readRowsInChunks<DetailPrescriptionTargetRow>(supabase, "workout_session_prescription_metric_targets", "prescription_set_id,metric_key,side,target_mode,target_value,minimum_value,maximum_value", "workout_session_id", [sessionId]),
    readRowsInChunks<DetailMetricRow>(supabase, "exercise_log_metric_values", "exercise_log_id,metric_key,side,value", "workout_session_id", [sessionId]),
    readRowsInChunks<DetailSetRow>(supabase, "exercise_log_set_details", "exercise_log_id,set_type,rpe,rir,notes", "workout_session_id", [sessionId]),
    readRowsInChunks<DetailSegmentRow>(supabase, "exercise_log_set_segments", "id,exercise_log_id,segment_order,segment_kind,side", "workout_session_id", [sessionId]),
    readRowsInChunks<DetailSegmentMetricRow>(supabase, "exercise_log_set_segment_metric_values", "segment_id,exercise_log_id,metric_key,side,value", "workout_session_id", [sessionId]),
    readRowsInChunks<DetailSnapshotRow>(supabase, "workout_session_muscle_snapshots", "id,workout_session_id,snapshot_schema_version,frozen_at,workload_model_version", "workout_session_id", [sessionId]),
    readRowsInChunks<WorkoutHistoryTimelineSourceRow & { sequence_number: number }>(supabase, "workout_session_timeline_events", "id,event_type,occurred_at,exercise_log_id,snapshot_item_id,sequence_number", "workout_session_id", [sessionId]),
    readWorkoutHistoryPersonalRecordSessions(supabase, userId, [sessionId]),
  ]);
  const snapshot = snapshots.length === 1 ? snapshots[0] : null;
  const snapshotItems = snapshot
    ? await readRowsInChunks<DetailSnapshotItemRow>(
      supabase,
      "workout_session_muscle_snapshot_items",
      "id,snapshot_id,source_plan_exercise_id,source_plan_activity_id,item_order,activity_name_snapshot,actual_name_snapshot,state,performed_total_sets",
      "snapshot_id",
      [snapshot.id],
    )
    : [];
  const currentVerifiedRecords = personalRecords.eventsBySessionId[sessionId] ?? [];
  const verifiedRecordsByLog = new Map<string, WorkoutHistoryVerifiedRecord[]>();
  for (const record of currentVerifiedRecords) {
    const logId = record.event.sourceExerciseLogId;
    if (!logId) continue;
    verifiedRecordsByLog.set(logId, [
      ...(verifiedRecordsByLog.get(logId) ?? []),
      record,
    ]);
  }
  const candidates: PerformedWorkoutHistoryCandidate[] = [{
    session: root.data as unknown as PerformedWorkoutHistoryRow,
    metadata: {
      completedSetCount: logs.filter((log) => Boolean(log.completed_at)).length,
      structuredPerformedMetricCount: metrics.length,
      actualPerformedSnapshotCount: snapshotItems.reduce((sum, item) => sum + (item.performed_total_sets ?? 0), 0),
      plannedSetCount: snapshot ? prescriptions.length : null,
    },
  }];
  const [activity] = resolveCanonicalWorkoutActivity({
    ownerUserId: userId,
    performed: candidates,
    scheduledTerminal: [],
    eligibility: { statuses: ["completed", "partial", "cancelled", "skipped"], includeMeaningfulCancelled: true },
  });
  if (!activity) throw new WorkoutHistoryReaderError("history_not_found", "Workout history item was not found.", 404);
  const resultKind = resolveWorkoutHistoryResultKind({
    authoritativeWorkloadModelVersion: snapshot?.workload_model_version,
    hasSupportedStructuredMetrics: [...metrics, ...segmentMetrics]
      .some((metric) => isSupportedWorkoutMetricKey(metric.metric_key)),
    hasLegacyStrengthValues: logs.some((log) => log.reps !== null || log.weight_kg !== null),
  });
  const presentedActivity = {
    ...activity,
    capabilities: presentWorkoutHistorySession(activity, {
      exerciseCount: null,
      completedSetCount: null,
      reliableVolume: null,
      resultKind,
    }).capabilities,
  };
  const exercises = groupExerciseDetail({
    logs,
    snapshotItems,
    prescriptions,
    prescriptionTargets,
    metrics,
    setDetails,
    segments,
    segmentMetrics,
    verifiedRecordsByLog,
    resultKind,
  });
  const completedLogs = logs.filter((log) => Boolean(log.completed_at));
  const reliableVolumeValues = completedLogs
    .filter((log) => log.reps !== null && log.weight_kg !== null)
    .map((log) => Number(log.reps) * Number(log.weight_kg));
  const exerciseNameByLogId = new Map(logs.map((log) => [log.id, log.exercise_name]));
  const exerciseNameBySnapshotItemId = new Map(snapshotItems.map((item) => [
    item.id,
    item.actual_name_snapshot ?? item.activity_name_snapshot,
  ]));
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activity: presentedActivity,
    historyRevision: rootSession.history_revision ?? 0,
    summary: {
      exerciseCount: exercises.filter((exercise) => exercise.performedSets.length > 0).length,
      completedSetCount: completedLogs.length,
      reliableVolume: reliableVolumeValues.length ? reliableVolumeValues.reduce((sum, value) => sum + value, 0) : null,
      verifiedRecordCount: currentVerifiedRecords.length,
    },
    snapshot: snapshot ? {
      id: snapshot.id,
      schemaVersion: snapshot.snapshot_schema_version,
      frozenAt: snapshot.frozen_at,
    } : null,
    exercises,
    timeline: presentWorkoutHistoryTimeline(
      [...timelineRows].sort((left, right) => left.sequence_number - right.sequence_number || left.id.localeCompare(right.id)),
      exerciseNameByLogId,
      exerciseNameBySnapshotItemId,
    ),
    notices: [],
    resultKind,
  };
}

export async function getScheduledWorkoutHistoryDetail(
  supabase: SupabaseClient,
  userId: string,
  scheduledSessionId: string,
): Promise<WorkoutHistorySessionDetailResponse> {
  const root = await supabase
    .from("user_workout_sessions")
    .select("id,user_id,user_workout_plan_id,plan_day_id,plan_week_id,plan_session_id,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes")
    .eq("id", scheduledSessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (root.error) throw new WorkoutHistoryReaderError("history_detail_unavailable", "Workout details could not load.", 503);
  if (!root.data) throw new WorkoutHistoryReaderError("history_not_found", "Workout history item was not found.", 404);
  let labels: ScheduledExerciseLabelRow[] = [];
  try {
    labels = await readRowsInChunks<ScheduledExerciseLabelRow>(
      supabase,
      "user_exercise_logs",
      "exercise_order,exercise_name",
      "user_workout_session_id",
      [scheduledSessionId],
    );
  } catch {
    // Compatibility labels are optional. The owner-scoped scheduled root remains useful
    // and deliberately reduced when legacy label storage is temporarily unavailable.
  }
  const [activity] = resolveCanonicalWorkoutActivity({
    ownerUserId: userId,
    performed: [],
    scheduledTerminal: [root.data as unknown as ScheduledWorkoutHistoryRow],
    eligibility: { statuses: ["completed", "skipped"] },
  });
  if (!activity) throw new WorkoutHistoryReaderError("history_not_found", "Workout history item was not found.", 404);
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activity,
    summary: {
      exerciseCount: null,
      completedSetCount: null,
      reliableVolume: null,
      verifiedRecordCount: null,
    },
    snapshot: null,
    exercises: [...new Map(
      [...labels]
        .sort((left, right) => left.exercise_order - right.exercise_order || left.exercise_name.localeCompare(right.exercise_name))
        .map((label) => [`${label.exercise_order}:${normalizedText(label.exercise_name)}`, label]),
    ).entries()].map(([identity, label]) => ({
      identity,
      exerciseId: null,
      snapshotItemId: null,
      name: label.exercise_name,
      plannedName: label.exercise_name,
      state: null,
      category: null,
      plannedSetCount: null,
      performedSets: [],
      missingPlannedSets: [],
      resultKind: "limited",
    })),
    timeline: [],
    notices: ["partial-availability"],
    resultKind: "limited",
  };
}
