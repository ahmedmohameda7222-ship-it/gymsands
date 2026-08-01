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
import { resolveCanonicalWorkoutActivity } from "@/lib/workouts/history/resolve-activity";
import { readCanonicalWorkoutActivityWithClient } from "@/services/workouts/history/reader";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type CanonicalWorkoutActivity,
  type WorkoutHistoryExerciseDetail,
  type WorkoutHistoryListRequest,
  type WorkoutHistoryListResponse,
  type WorkoutHistorySessionDetailResponse,
  type WorkoutHistorySessionSummary,
  type WorkoutHistorySort,
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
  planned_mapping_set_id?: string | null;
  actual_mapping_set_id?: string | null;
  planned_custom_mapping_entries?: unknown;
  actual_custom_mapping_entries?: unknown;
  planned_sets: number | null;
  performed_total_sets?: number | null;
};
type SnapshotMappingEntryRow = { mapping_set_id: string; muscle_id: string };

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
        .select("id,user_id,scheduled_session_id,workout_name,workout_day_name,workout_category,started_at,completed_at,skipped_at,cancelled_at,duration_minutes,status,plan_id,plan_day_id,plan_week_id,plan_session_id")
        .eq("user_id", userId)
        .eq("status", status)
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
        .select("id,user_id,user_workout_plan_id,plan_day_id,plan_week_id,plan_session_id,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes")
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

  const [completed, skipped, cancelled, scheduledCompleted, scheduledSkipped] = await Promise.all([
    readPerformedStatus("completed", ["completed_at", "started_at"]),
    readPerformedStatus("skipped", ["skipped_at", "completed_at", "started_at"]),
    readPerformedStatus("cancelled", ["cancelled_at", "completed_at", "started_at"]),
    readScheduledStatus("completed", ["completed_at", "started_at"]),
    readScheduledStatus("skipped", ["skipped_at", "completed_at", "started_at"]),
  ]);
  const performedError = completed.error ?? skipped.error ?? cancelled.error;
  const scheduledError = scheduledCompleted.error ?? scheduledSkipped.error;
  const performed = performedError
    ? { data: null, error: performedError }
    : { data: [...(completed.data ?? []), ...(skipped.data ?? []), ...(cancelled.data ?? [])], error: null };
  const scheduled = scheduledError
    ? { data: null, error: scheduledError }
    : { data: [...(scheduledCompleted.data ?? []), ...(scheduledSkipped.data ?? [])], error: null };
  return { performed, scheduled };
}

async function buildPerformedCandidates(
  supabase: SupabaseClient,
  sessions: PerformedWorkoutHistoryRow[],
) {
  const sessionIds = sessions.map((session) => session.id);
  const [logs, metrics, prescriptions, snapshots] = await Promise.all([
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
  ]);
  const snapshotItems = await readRowsInChunks<SnapshotItemRow>(
    supabase,
    "workout_session_muscle_snapshot_items",
    "snapshot_id,source_plan_exercise_id,source_plan_activity_id,activity_name_snapshot,planned_global_exercise_id,actual_global_exercise_id,planned_mapping_set_id,actual_mapping_set_id,planned_custom_mapping_entries,actual_custom_mapping_entries,planned_sets,performed_total_sets",
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
    for (const mappingSetId of [item.actual_mapping_set_id, item.planned_mapping_set_id]) {
      if (!mappingSetId) continue;
      for (const muscleId of muscleIdsByMappingSet.get(mappingSetId) ?? []) {
        muscleIds.add(muscleId);
      }
    }
    for (const customEntries of [
      item.actual_custom_mapping_entries,
      item.planned_custom_mapping_entries,
    ]) {
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
  return { candidates, logsBySession, snapshotItemsBySession, muscleIdsBySession };
}

function metadataForActivity(
  activity: CanonicalWorkoutActivity,
  logsBySession: Map<string, PerformedLogRow[]>,
  snapshotItemsBySession: Map<string, SnapshotItemRow[]>,
  muscleIdsBySession: Map<string, Set<string>>,
) {
  if (!activity.canonicalSessionId) return undefined;
  const logs = logsBySession.get(activity.canonicalSessionId) ?? [];
  const completedLogs = logs.filter((log) => Boolean(log.completed_at));
  const snapshotItems = snapshotItemsBySession.get(activity.canonicalSessionId) ?? [];
  const identities = unique([
    ...completedLogs.map((log) => log.plan_activity_id ?? log.plan_exercise_id),
    ...snapshotItems.flatMap((item) => [
      item.actual_global_exercise_id,
      item.planned_global_exercise_id,
    ]),
  ]);
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
    verifiedRecordCount: null,
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

function matchesRequest(item: WorkoutHistorySessionSummary, request: WorkoutHistoryListRequest): boolean {
  const effective = Date.parse(item.effectiveAt);
  if (effective < Date.parse(request.from) || effective >= Date.parse(request.to)) return false;
  if (request.search) {
    const query = normalizedText(request.search);
    const searchable = normalizedText([item.title, item.category, ...item.exerciseNames].filter(Boolean).join(" "));
    if (!searchable.includes(query)) return false;
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

  let candidates: PerformedWorkoutHistoryCandidate[] = [];
  let logsBySession = new Map<string, PerformedLogRow[]>();
  let snapshotItemsBySession = new Map<string, SnapshotItemRow[]>();
  let muscleIdsBySession = new Map<string, Set<string>>();
  if (!performedFailed) {
    const performedMetadata = await buildPerformedCandidates(
      supabase,
      (sourceResults.performed.data ?? []) as unknown as PerformedWorkoutHistoryRow[],
    );
    candidates = performedMetadata.candidates;
    logsBySession = performedMetadata.logsBySession;
    snapshotItemsBySession = performedMetadata.snapshotItemsBySession;
    muscleIdsBySession = performedMetadata.muscleIdsBySession;
  }
  const scheduled = scheduledFailed
    ? []
    : ((sourceResults.scheduled.data ?? []) as unknown as ScheduledWorkoutHistoryRow[]);
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
  const allItems = activities
    .map((activity) => presentWorkoutHistorySession(
      activity,
      metadataForActivity(
        activity,
        logsBySession,
        snapshotItemsBySession,
        muscleIdsBySession,
      ),
    ))
    .filter((item) => matchesRequest(item, request))
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
    summary: summarizeWorkoutHistory(allItems),
    items,
    nextCursor: hasMore && items.length
      ? encodeWorkoutHistoryCursor(cursorForItem(items.at(-1)!, sort), cursorSecret)
      : null,
    notices: performedFailed || scheduledFailed ? ["partial-availability"] : [],
  };
}

function groupExerciseDetail(logs: PerformedLogRow[]): WorkoutHistoryExerciseDetail[] {
  const groups = new Map<string, PerformedLogRow[]>();
  for (const log of logs) {
    const identity = log.plan_activity_id ?? log.plan_exercise_id ?? `${log.exercise_order ?? "none"}:${normalizedText(log.exercise_name)}`;
    groups.set(identity, [...(groups.get(identity) ?? []), log]);
  }
  return [...groups.entries()].map(([identity, group]) => ({
    identity,
    exerciseId: group[0]?.plan_activity_id ?? group[0]?.plan_exercise_id ?? null,
    name: group[0]?.exercise_name ?? "Workout exercise",
    category: group[0]?.exercise_category ?? null,
    plannedSetCount: null,
    performedSets: group
      .filter((log) => Boolean(log.completed_at))
      .sort((left, right) => left.set_number - right.set_number || left.id.localeCompare(right.id))
      .map((log) => ({
        id: log.id,
        setNumber: log.set_number,
        reps: log.reps,
        weightKg: log.weight_kg,
        completedAt: log.completed_at,
        notes: log.notes,
      })),
  }));
}

export async function getWorkoutHistorySessionDetail(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<WorkoutHistorySessionDetailResponse> {
  const root = await supabase
    .from("workout_sessions")
    .select("id,user_id,scheduled_session_id,workout_name,workout_day_name,workout_category,started_at,completed_at,skipped_at,cancelled_at,duration_minutes,notes,status,plan_id,plan_day_id,plan_week_id,plan_session_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (root.error) throw new WorkoutHistoryReaderError("history_detail_unavailable", "Workout details could not load.", 503);
  if (!root.data) throw new WorkoutHistoryReaderError("history_not_found", "Workout history item was not found.", 404);
  const [logs, prescriptions] = await Promise.all([
    readRowsInChunks<PerformedLogRow>(supabase, "exercise_logs", "id,workout_session_id,plan_exercise_id,plan_activity_id,exercise_order,exercise_name,exercise_category,set_number,reps,weight_kg,notes,completed_at", "workout_session_id", [sessionId]),
    readRowsInChunks<PrescriptionSetRow>(supabase, "workout_session_prescription_sets", "workout_session_id", "workout_session_id", [sessionId]),
  ]);
  const candidates: PerformedWorkoutHistoryCandidate[] = [{
    session: root.data as unknown as PerformedWorkoutHistoryRow,
    metadata: {
      completedSetCount: logs.filter((log) => Boolean(log.completed_at)).length,
      structuredPerformedMetricCount: 0,
      actualPerformedSnapshotCount: 0,
      plannedSetCount: prescriptions.length || null,
    },
  }];
  const [activity] = resolveCanonicalWorkoutActivity({
    ownerUserId: userId,
    performed: candidates,
    scheduledTerminal: [],
    eligibility: { statuses: ["completed", "partial", "cancelled", "skipped"], includeMeaningfulCancelled: true },
  });
  if (!activity) throw new WorkoutHistoryReaderError("history_not_found", "Workout history item was not found.", 404);
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activity,
    exercises: groupExerciseDetail(logs),
    notices: [],
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
    exercises: [],
    notices: ["partial-availability"],
  };
}
