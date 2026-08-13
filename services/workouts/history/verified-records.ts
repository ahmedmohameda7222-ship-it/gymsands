import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildPersonalRecordCandidates,
  derivedExerciseIdentityParts,
  DERIVED_METRICS_FORMULA_VERSION,
  DERIVED_METRICS_SCHEMA_VERSION,
  type DerivedExerciseIdentityKind,
  type DerivedMetricLog,
  type DerivedPersonalRecord,
} from "@/lib/workouts/derived-metrics";

const IN_FILTER_CHUNK = 100;
const ROOT_CHUNK = 200;
const MAX_AFFECTED_IDENTITIES = 100;

type SessionRow = {
  id: string;
  user_id: string;
  status: string;
  workout_id: string | null;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  deleted_at: string | null;
};

type SnapshotRow = { id: string; workout_session_id: string };
type SnapshotItemRow = {
  snapshot_id: string;
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

type SessionLogRow = DerivedMetricLog & {
  id: string;
  workout_session_id: string;
  completed_at: string | null;
  exercise_order: number | null;
  set_number: number;
};

type RecordRebuildResult = {
  record_count: number;
  identity_count: number;
  evaluated_session_count: number;
  schema_version: number;
  formula_version: string;
  status: "current";
};

export type VerifiedRecordReplacementResult = RecordRebuildResult & {
  session_id: string;
};

export type VerifiedRecordIdentityScope = {
  sessionId: string;
  identities: string[];
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

function chunks<T>(values: readonly T[], size = IN_FILTER_CHUNK): T[][] {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function frozenIdentity(
  item: SnapshotItemRow,
  phase: "actual" | "planned",
): { kind: "global" | "custom" | "provider"; identity: string } | null {
  const provider = item[`${phase}_provider`];
  const providerActivityId = item[`${phase}_provider_activity_id`];
  if (provider && providerActivityId)
    return { kind: "provider", identity: `provider:${provider}:${providerActivityId}` };
  const globalId = item[`${phase}_global_exercise_id`];
  if (globalId) return { kind: "global", identity: `global:${globalId}` };
  const customId = item[`${phase}_custom_exercise_id`];
  if (customId) return { kind: "custom", identity: `custom:${customId}` };
  return null;
}

function matchingSnapshotItem(
  log: DerivedMetricLog,
  items: readonly SnapshotItemRow[],
): SnapshotItemRow | null {
  const planActivityId = log.planActivityId ?? log.plan_activity_id;
  const planExerciseId = log.planExerciseId ?? log.plan_exercise_id;
  const exerciseOrder = log.exerciseOrder ?? log.exercise_order;
  const candidates = items.filter((item) =>
    Boolean(planActivityId && item.source_plan_activity_id === planActivityId)
    || Boolean(planExerciseId && item.source_plan_exercise_id === planExerciseId)
    || (exerciseOrder !== null && exerciseOrder !== undefined && item.item_order === exerciseOrder));
  return candidates.length === 1 ? candidates[0] : candidates[0] ?? null;
}

function withCanonicalIdentity(
  log: DerivedMetricLog,
  session: SessionRow,
  items: readonly SnapshotItemRow[],
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

function effectiveAt(session: SessionRow): number {
  return Date.parse(
    session.completed_at
      ?? session.cancelled_at
      ?? session.started_at,
  );
}

function parseIdentityScope(identities: readonly string[]) {
  const globalIds: string[] = [];
  const customIds: string[] = [];
  const providerNames: string[] = [];
  const planActivityIds: string[] = [];
  const planExerciseIds: string[] = [];
  const sourceWorkoutIds: string[] = [];
  for (const identity of identities) {
    const separator = identity.indexOf(":");
    const kind = separator >= 0 ? identity.slice(0, separator) : "";
    const value = separator >= 0 ? identity.slice(separator + 1) : "";
    if (!value) continue;
    if (kind === "global") globalIds.push(value);
    else if (kind === "custom") customIds.push(value);
    else if (kind === "provider") providerNames.push(value.split(":", 1)[0] ?? "");
    else if (kind === "plan_activity") planActivityIds.push(value);
    else if (kind === "plan_exercise") planExerciseIds.push(value);
    else if (kind === "source_workout") sourceWorkoutIds.push(value);
  }
  return {
    globalIds: unique(globalIds),
    customIds: unique(customIds),
    providerNames: unique(providerNames),
    planActivityIds: unique(planActivityIds),
    planExerciseIds: unique(planExerciseIds),
    sourceWorkoutIds: unique(sourceWorkoutIds),
  };
}

async function readSessionRoots(
  supabase: SupabaseClient,
  userId: string,
  sessionIds: string[],
): Promise<SessionRow[]> {
  const results = await Promise.all(chunks(sessionIds, ROOT_CHUNK).map((chunk) =>
    supabase
      .from("workout_sessions")
      .select("id,user_id,status,workout_id,started_at,completed_at,cancelled_at,deleted_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("status", ["completed", "cancelled"])
      .in("id", chunk)));
  const failure = results.find((result) => result.error)?.error;
  if (failure)
    throw new VerifiedRecordError(
      "verified_records_read_failed",
      "Workout records could not be refreshed.",
      503,
    );
  return results.flatMap((result) => (result.data ?? []) as unknown as SessionRow[]);
}

async function readSnapshots(
  supabase: SupabaseClient,
  userId: string,
  sessionIds: string[],
): Promise<SnapshotRow[]> {
  const results = await Promise.all(chunks(sessionIds).map((chunk) =>
    supabase
      .from("workout_session_muscle_snapshots")
      .select("id,workout_session_id")
      .eq("user_id", userId)
      .in("workout_session_id", chunk)));
  const failure = results.find((result) => result.error)?.error;
  if (failure)
    throw new VerifiedRecordError(
      "verified_records_read_failed",
      "Workout records could not be refreshed.",
      503,
    );
  return results.flatMap((result) => (result.data ?? []) as unknown as SnapshotRow[]);
}

async function readSnapshotItems(
  supabase: SupabaseClient,
  userId: string,
  snapshotIds: string[],
): Promise<SnapshotItemRow[]> {
  if (!snapshotIds.length) return [];
  const selection = "snapshot_id,source_plan_exercise_id,source_plan_activity_id,item_order,actual_global_exercise_id,actual_custom_exercise_id,actual_provider,actual_provider_activity_id,planned_global_exercise_id,planned_custom_exercise_id,planned_provider,planned_provider_activity_id";
  const results = await Promise.all(chunks(snapshotIds).map((chunk) =>
    supabase
      .from("workout_session_muscle_snapshot_items")
      .select(selection)
      .eq("user_id", userId)
      .in("snapshot_id", chunk)));
  const failure = results.find((result) => result.error)?.error;
  if (failure)
    throw new VerifiedRecordError(
      "verified_records_read_failed",
      "Workout records could not be refreshed.",
      503,
    );
  return results.flatMap((result) => (result.data ?? []) as unknown as SnapshotItemRow[]);
}

async function readLogs(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<SessionLogRow[]> {
  const selection = "id,workout_session_id,plan_exercise_id,plan_activity_id,exercise_order,exercise_name,set_number,reps,weight_kg,completed_at,set_type,performance_metrics:exercise_log_metric_values(metric_key,value,side),set_details:exercise_log_set_details(set_type,rpe,rir),segments:exercise_log_set_segments(segment_order,side,metric_values:exercise_log_set_segment_metric_values(metric_key,value,side))";
  const results = await Promise.all(chunks(sessionIds).map((chunk) =>
    supabase
      .from("exercise_logs")
      .select(selection)
      .in("workout_session_id", chunk)
      .not("completed_at", "is", null)
      .order("exercise_order", { ascending: true })
      .order("set_number", { ascending: true })));
  const failure = results.find((result) => result.error)?.error;
  if (failure)
    throw new VerifiedRecordError(
      "verified_records_read_failed",
      "Workout records could not be refreshed.",
      503,
    );
  return results.flatMap((result) => (result.data ?? []) as unknown as SessionLogRow[]);
}

async function discoverCandidateSessionIds(
  supabase: SupabaseClient,
  userId: string,
  identities: string[],
  seedSessionId: string,
): Promise<string[]> {
  const sessionIds = new Set<string>([seedSessionId]);
  const snapshotIds = new Set<string>();
  const scope = parseIdentityScope(identities);
  const itemSelection = "snapshot_id,actual_global_exercise_id,planned_global_exercise_id,actual_custom_exercise_id,planned_custom_exercise_id,actual_provider,actual_provider_activity_id,planned_provider,planned_provider_activity_id";

  for (const idChunk of chunks(scope.globalIds, 40)) {
    const result = await supabase
      .from("workout_session_muscle_snapshot_items")
      .select(itemSelection)
      .eq("user_id", userId)
      .or(`actual_global_exercise_id.in.(${idChunk.join(",")}),planned_global_exercise_id.in.(${idChunk.join(",")})`);
    if (result.error)
      throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
    for (const row of result.data ?? []) snapshotIds.add(String(row.snapshot_id));
  }
  for (const idChunk of chunks(scope.customIds, 40)) {
    const result = await supabase
      .from("workout_session_muscle_snapshot_items")
      .select(itemSelection)
      .eq("user_id", userId)
      .or(`actual_custom_exercise_id.in.(${idChunk.join(",")}),planned_custom_exercise_id.in.(${idChunk.join(",")})`);
    if (result.error)
      throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
    for (const row of result.data ?? []) snapshotIds.add(String(row.snapshot_id));
  }
  for (const providerChunk of chunks(scope.providerNames, 20)) {
    const quoted = providerChunk.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",");
    const result = await supabase
      .from("workout_session_muscle_snapshot_items")
      .select(itemSelection)
      .eq("user_id", userId)
      .or(`actual_provider.in.(${quoted}),planned_provider.in.(${quoted})`);
    if (result.error)
      throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
    for (const raw of result.data ?? []) {
      const row = raw as unknown as SnapshotItemRow;
      const actual = frozenIdentity(row, "actual")?.identity;
      const planned = frozenIdentity(row, "planned")?.identity;
      if ((actual && identities.includes(actual)) || (planned && identities.includes(planned)))
        snapshotIds.add(String(row.snapshot_id));
    }
  }

  for (const idChunk of chunks([...snapshotIds])) {
    const result = await supabase
      .from("workout_session_muscle_snapshots")
      .select("id,workout_session_id")
      .eq("user_id", userId)
      .in("id", idChunk);
    if (result.error)
      throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
    for (const row of result.data ?? []) sessionIds.add(String(row.workout_session_id));
  }

  for (const idChunk of chunks(scope.planActivityIds)) {
    const result = await supabase
      .from("exercise_logs")
      .select("workout_session_id")
      .in("plan_activity_id", idChunk);
    if (result.error)
      throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
    for (const row of result.data ?? []) sessionIds.add(String(row.workout_session_id));
  }
  for (const idChunk of chunks(scope.planExerciseIds)) {
    const result = await supabase
      .from("exercise_logs")
      .select("workout_session_id")
      .in("plan_exercise_id", idChunk);
    if (result.error)
      throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
    for (const row of result.data ?? []) sessionIds.add(String(row.workout_session_id));
  }
  for (const idChunk of chunks(scope.sourceWorkoutIds)) {
    const result = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("user_id", userId)
      .in("workout_id", idChunk);
    if (result.error)
      throw new VerifiedRecordError("verified_records_read_failed", "Workout records could not be refreshed.", 503);
    for (const row of result.data ?? []) sessionIds.add(String(row.id));
  }

  return [...sessionIds];
}

async function readCanonicalSessionGraph(
  supabase: SupabaseClient,
  userId: string,
  sessionIds: string[],
) {
  const sessions = await readSessionRoots(supabase, userId, sessionIds);
  const validSessionIds = sessions.map((session) => session.id);
  const [snapshots, logs] = await Promise.all([
    readSnapshots(supabase, userId, validSessionIds),
    readLogs(supabase, validSessionIds),
  ]);
  const items = await readSnapshotItems(
    supabase,
    userId,
    snapshots.map((snapshot) => snapshot.id),
  );
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const snapshotSessionById = new Map(
    snapshots.map((snapshot) => [snapshot.id, snapshot.workout_session_id]),
  );
  const itemsBySession = new Map<string, SnapshotItemRow[]>();
  for (const item of items) {
    const sessionId = snapshotSessionById.get(item.snapshot_id);
    if (!sessionId) continue;
    itemsBySession.set(sessionId, [...(itemsBySession.get(sessionId) ?? []), item]);
  }
  const logsBySession = new Map<string, DerivedMetricLog[]>();
  for (const log of logs) {
    const session = sessionById.get(log.workout_session_id);
    if (!session) continue;
    const canonical = withCanonicalIdentity(log, session, itemsBySession.get(session.id) ?? []);
    logsBySession.set(session.id, [...(logsBySession.get(session.id) ?? []), canonical]);
  }
  return { sessions, logsBySession };
}

export async function readVerifiedRecordIdentityScope(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<VerifiedRecordIdentityScope> {
  const graph = await readCanonicalSessionGraph(supabase, userId, [sessionId]);
  const session = graph.sessions[0];
  if (!session)
    throw new VerifiedRecordError(
      "history_not_found",
      "Workout history item was not found.",
      404,
    );
  const identities = unique((graph.logsBySession.get(session.id) ?? []).map((log) => {
    const identity = derivedExerciseIdentityParts(log);
    return identity.degraded ? null : identity.identity;
  }));
  if (identities.length > MAX_AFFECTED_IDENTITIES)
    throw new VerifiedRecordError(
      "verified_records_scope_too_large",
      "Workout records could not be refreshed.",
      409,
    );
  return { sessionId, identities };
}

function recordPayload(record: DerivedPersonalRecord) {
  return {
    exercise_log_id: record.exerciseLogId,
    exercise_identity_kind: record.exerciseIdentityKind as Exclude<DerivedExerciseIdentityKind, "name_degraded">,
    exercise_identity: record.exerciseIdentity,
    record_type: record.recordType,
    record_value: record.recordValue,
    record_unit: record.recordUnit,
    comparison_context_key: record.comparisonContextKey,
    set_type: record.setType,
    achieved_at: record.achievedAt,
    event_semantics_version: record.eventSemanticsVersion,
  };
}

export async function rebuildVerifiedRecordsForIdentities(
  supabase: SupabaseClient,
  userId: string,
  identities: string[],
  seedSessionId: string,
): Promise<RecordRebuildResult> {
  const scope = unique(identities).sort();
  if (scope.length > MAX_AFFECTED_IDENTITIES)
    throw new VerifiedRecordError(
      "verified_records_scope_too_large",
      "Workout records could not be refreshed.",
      409,
    );
  const candidateSessionIds = scope.length
    ? await discoverCandidateSessionIds(supabase, userId, scope, seedSessionId)
    : [seedSessionId];
  const graph = await readCanonicalSessionGraph(
    supabase,
    userId,
    candidateSessionIds,
  );
  const identitySet = new Set(scope);
  const orderedSessions = [...graph.sessions].sort((left, right) =>
    effectiveAt(left) - effectiveAt(right) || left.id.localeCompare(right.id));
  const historicalLogs: DerivedMetricLog[] = [];
  const records: DerivedPersonalRecord[] = [];
  const evaluatedSessionIds: string[] = [];

  for (const session of orderedSessions) {
    const current = (graph.logsBySession.get(session.id) ?? [])
      .filter((log) => identitySet.has(derivedExerciseIdentityParts(log).identity))
      .sort((left, right) => {
        const leftTime = Date.parse(String(left.completedAt ?? left.completed_at ?? ""));
        const rightTime = Date.parse(String(right.completedAt ?? right.completed_at ?? ""));
        return leftTime - rightTime || String(left.id ?? "").localeCompare(String(right.id ?? ""));
      });
    if (!current.length) continue;
    records.push(...buildPersonalRecordCandidates(current, historicalLogs));
    historicalLogs.push(...current);
    evaluatedSessionIds.push(session.id);
  }

  if (!evaluatedSessionIds.includes(seedSessionId)
      && orderedSessions.some((session) => session.id === seedSessionId)) {
    evaluatedSessionIds.push(seedSessionId);
  }
  const replacement = await supabase.rpc(
    "replace_workout_derived_records_for_identities_atomic",
    {
      p_user_id: userId,
      p_exercise_identities: scope,
      p_evaluated_session_ids: unique(evaluatedSessionIds),
      p_schema_version: DERIVED_METRICS_SCHEMA_VERSION,
      p_formula_version: DERIVED_METRICS_FORMULA_VERSION,
      p_records: records.map(recordPayload),
    },
  );
  if (replacement.error)
    throw new VerifiedRecordError(
      "verified_records_write_failed",
      "Workout records could not be refreshed.",
      503,
    );
  return replacement.data as RecordRebuildResult;
}

export async function replaceVerifiedRecordsForSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<VerifiedRecordReplacementResult> {
  const scope = await readVerifiedRecordIdentityScope(supabase, userId, sessionId);
  const result = await rebuildVerifiedRecordsForIdentities(
    supabase,
    userId,
    scope.identities,
    sessionId,
  );
  return { ...result, session_id: sessionId };
}
