import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalizePersonalRecordRows, type PersonalRecordRawRow } from "@/lib/personal-records/projection";
import { STRENGTH_DETAIL_RECORD_KEYS, type ExercisePerformanceBest, type ExercisePerformanceModel } from "@/lib/exercise-detail/performance";
import { listWorkoutHistoryKeyset } from "@/services/workouts/history/server-list-reader";

const PR_LIMIT = 500;
const fullSelection = "id,exercise_name,record_type,weight_kg,reps,record_date,notes,source_kind,exercise_identity_kind,exercise_identity,workout_session_id,exercise_log_id,derived_record_type,record_value,record_unit,comparison_context_key,schema_version,formula_version,achieved_at,subject_id,sport_domain,sport_name_snapshot,record_definition_id,record_definition_key,record_definition_version,comparison_direction,canonical_value,canonical_unit,comparison_context,semantic_version,effective_achieved_at,event_semantics_version,subject:personal_record_subjects(id,identity_kind,identity_value,name_snapshot,sport_domain,sport_name_snapshot,catalog_revision_id,authority_snapshot)";

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

async function readIdentityRecordRows(supabase: SupabaseClient, userId: string, identities: string[]) {
  const subjects = await supabase.from("personal_record_subjects").select("id").eq("user_id", userId).in("identity_value", identities).limit(50);
  if (subjects.error) throw new Error("exercise_performance_records_failed");
  const subjectIds = (subjects.data ?? []).map((row) => String(row.id));
  const directPromise = supabase.from("personal_records").select(fullSelection).eq("user_id", userId).in("exercise_identity", identities).order("record_date", { ascending: false }).limit(PR_LIMIT);
  const subjectPromise = subjectIds.length
    ? supabase.from("personal_records").select(fullSelection).eq("user_id", userId).in("subject_id", subjectIds).order("record_date", { ascending: false }).limit(PR_LIMIT)
    : Promise.resolve({ data: [], error: null });
  const [direct, subject] = await Promise.all([directPromise, subjectPromise]);
  if (direct.error || subject.error) throw new Error("exercise_performance_records_failed");
  const byId = new Map<string, PersonalRecordRawRow>();
  for (const row of [...(direct.data ?? []), ...(subject.data ?? [])] as unknown as PersonalRecordRawRow[]) byId.set(row.id, row);
  if (byId.size >= PR_LIMIT * 2) throw new Error("exercise_performance_records_scope_too_large");
  return [...byId.values()];
}

function currentRecordBests(rows: PersonalRecordRawRow[], identities: string[]): ExercisePerformanceBest[] {
  const wanted = new Set(identities);
  const allowed = new Set<string>(STRENGTH_DETAIL_RECORD_KEYS);
  const canonical = canonicalizePersonalRecordRows(rows).filter((event) => wanted.has(event.subject.identity) && allowed.has(event.definition.key));
  const currentByLineage = new Map<string, typeof canonical[number]>();
  for (const event of canonical) {
    const current = currentByLineage.get(event.lineageId);
    if (!current || event.achievedAt > current.achievedAt || (event.achievedAt === current.achievedAt && event.eventId > current.eventId)) currentByLineage.set(event.lineageId, event);
  }
  return [...currentByLineage.values()]
    .sort((left, right) => STRENGTH_DETAIL_RECORD_KEYS.indexOf(left.definition.key as never) - STRENGTH_DETAIL_RECORD_KEYS.indexOf(right.definition.key as never) || right.achievedAt.localeCompare(left.achievedAt))
    .map((event) => ({ key: event.definition.key as ExercisePerformanceBest["key"], event }));
}

export async function readExercisePerformance(input: {
  supabase: SupabaseClient;
  userId: string;
  identities: string[];
  limit: number;
  cursorSecret: string;
  timezone: string;
}): Promise<ExercisePerformanceModel> {
  const identities = unique(input.identities);
  const [rows, history] = await Promise.all([
    readIdentityRecordRows(input.supabase, input.userId, identities),
    listWorkoutHistoryKeyset(input.supabase, input.userId, {
      from: "2000-01-01T00:00:00.000Z",
      to: new Date(Date.now() + 86_400_000).toISOString(),
      timezone: input.timezone,
      exerciseIds: identities,
      statuses: ["completed", "partial"],
      limit: input.limit,
      sort: "newest"
    }, input.cursorSecret)
  ]);
  const recentSessions = history.items.map((item) => ({
    activityId: item.activityId,
    canonicalSessionId: item.canonicalSessionId,
    title: item.title,
    effectiveAt: item.effectiveAt,
    completedSetCount: item.completedSetCount,
    reliableVolume: item.reliableVolume,
    resultKind: item.resultKind,
    resultFacts: item.resultFacts
  }));
  const last = recentSessions[0] ?? null;
  return {
    performed: recentSessions.length > 0,
    lastPerformedAt: last?.effectiveAt ?? null,
    recentWorkoutId: last?.canonicalSessionId ?? null,
    recentSessions,
    bests: currentRecordBests(rows, identities)
  };
}
