import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MANUAL_RECORD_DEFINITIONS, type ManualPersonalRecordInput } from "@/lib/personal-records/contracts";
import {
  projectExercisePerformance,
  projectPersonalRecordDetail,
  projectPersonalRecordsMain,
  type PersonalRecordRawRow,
} from "@/lib/personal-records/projection";

const PAGE_SIZE = 1000;
const MAX_RAW_EVENTS = 5000;
const fullSelection = "id,exercise_name,record_type,weight_kg,reps,record_date,notes,source_kind,exercise_identity_kind,exercise_identity,workout_session_id,exercise_log_id,derived_record_type,record_value,record_unit,comparison_context_key,schema_version,formula_version,achieved_at,subject_id,sport_domain,sport_name_snapshot,record_definition_id,record_definition_key,record_definition_version,comparison_direction,canonical_value,canonical_unit,comparison_context,semantic_version,effective_achieved_at,event_semantics_version,subject:personal_record_subjects(id,identity_kind,identity_value,name_snapshot,sport_domain,sport_name_snapshot,catalog_revision_id,authority_snapshot)";
const legacySelection = "id,exercise_name,record_type,weight_kg,reps,record_date,notes,source_kind,exercise_identity_kind,exercise_identity,workout_session_id,exercise_log_id,derived_record_type,record_value,record_unit,comparison_context_key,schema_version,formula_version,achieved_at";

export class PersonalRecordsServerError extends Error {
  constructor(readonly code: string, message: string, readonly status = 500) {
    super(message);
    this.name = "PersonalRecordsServerError";
  }
}

function isMissingSemanticSchema(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42703" || error?.code === "PGRST200" || message.includes("personal_record_subjects") || message.includes("record_definition_key");
}

async function readRows(supabase: SupabaseClient, userId: string): Promise<PersonalRecordRawRow[]> {
  const result: PersonalRecordRawRow[] = [];
  let semantic = true;
  for (let offset = 0; offset < MAX_RAW_EVENTS; offset += PAGE_SIZE) {
    let response: { data: unknown[] | null; error: { code?: string; message?: string } | null } = await supabase.from("personal_records").select(semantic ? fullSelection : legacySelection)
      .eq("user_id", userId).order("record_date", { ascending: false }).order("id", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (response.error && semantic && isMissingSemanticSchema(response.error)) {
      semantic = false;
      response = await supabase.from("personal_records").select(legacySelection)
        .eq("user_id", userId).order("record_date", { ascending: false }).order("id", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    }
    if (response.error) throw new PersonalRecordsServerError("personal_records_read_failed", "Personal records could not load.", 503);
    const rows = (response.data ?? []) as unknown as PersonalRecordRawRow[];
    result.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  if (result.length >= MAX_RAW_EVENTS) throw new PersonalRecordsServerError("personal_records_scope_too_large", "Personal records could not be projected safely.", 409);
  return applyHistoricalSessionVolumeTimes(supabase, result);
}

async function applyHistoricalSessionVolumeTimes(supabase: SupabaseClient, rows: PersonalRecordRawRow[]) {
  const historical = rows.filter((row) => row.derived_record_type === "exercise_session_volume" && !row.event_semantics_version && Boolean((row as PersonalRecordRawRow & { exercise_log_id?: string }).exercise_log_id));
  const sourceIds = historical.map((row) => String((row as PersonalRecordRawRow & { exercise_log_id?: string }).exercise_log_id));
  if (!sourceIds.length) return rows;
  const source = await supabase.from("exercise_logs").select("id,workout_session_id,exercise_order,completed_at").in("id", sourceIds);
  if (source.error) return rows;
  const sourceById = new Map((source.data ?? []).map((row) => [String(row.id), row]));
  const sessionIds = [...new Set((source.data ?? []).map((row) => String(row.workout_session_id)))];
  const logs = await supabase.from("exercise_logs").select("workout_session_id,exercise_order,completed_at").in("workout_session_id", sessionIds).not("completed_at", "is", null);
  if (logs.error) return rows;
  const latest = new Map<string, string>();
  for (const log of logs.data ?? []) {
    const key = `${log.workout_session_id}:${log.exercise_order ?? "null"}`;
    const completed = String(log.completed_at);
    if (!latest.has(key) || completed > latest.get(key)!) latest.set(key, completed);
  }
  return rows.map((row) => {
    if (row.derived_record_type !== "exercise_session_volume" || row.event_semantics_version) return row;
    const sourceId = String((row as PersonalRecordRawRow & { exercise_log_id?: string }).exercise_log_id ?? "");
    const log = sourceById.get(sourceId);
    if (!log) return row;
    return { ...row, effective_achieved_at: latest.get(`${log.workout_session_id}:${log.exercise_order ?? "null"}`) ?? row.achieved_at };
  });
}

export async function readPersonalRecordsMain(supabase: SupabaseClient, userId: string, options: { sport?: string | null; cursor?: string | null; limit?: number }) {
  return projectPersonalRecordsMain(await readRows(supabase, userId), options);
}

export async function readPersonalRecordLineage(supabase: SupabaseClient, userId: string, lineageId: string, options: { selectedEventId?: string | null; cursor?: string | null; limit?: number }) {
  return projectPersonalRecordDetail(await readRows(supabase, userId), lineageId, options);
}

export async function readExercisePersonalRecords(supabase: SupabaseClient, userId: string, identities: string[]) {
  const projected = projectExercisePerformance(await readRows(supabase, userId), identities);
  const globalId = identities.map((identity) => identity.startsWith("global:") ? identity.slice("global:".length) : null).find(Boolean);
  if (!globalId) return projected;
  const latest = await supabase.from("exercise_logs")
    .select("workout_session_id,completed_at,created_at,workout_sessions!inner(user_id,status)")
    .eq("source_workout_id", globalId)
    .eq("workout_sessions.user_id", userId)
    .eq("workout_sessions.status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (latest.error || !latest.data) return projected;
  return {
    ...projected,
    performed: true,
    lastPerformedAt: latest.data.completed_at ?? latest.data.created_at ?? projected.lastPerformedAt,
    recentWorkoutId: projected.recentWorkoutId ?? latest.data.workout_session_id,
  };
}

function validateManualInput(input: ManualPersonalRecordInput) {
  const template = MANUAL_RECORD_DEFINITIONS.find((item) => item.key === input.definition.key
    && item.version === input.definition.version
    && item.comparisonDirection === input.definition.comparisonDirection
    && item.canonicalUnit === input.definition.canonicalUnit);
  if (!template || !template.sports.includes(input.subject.sportDomain)) throw new PersonalRecordsServerError("unsupported_record_definition", "This record type is not supported for the selected sport.", 400);
  if (!Number.isFinite(input.value) || input.value <= 0) throw new PersonalRecordsServerError("invalid_record_value", "Enter a valid record value.", 400);
  if (!input.subject.name.trim() || !input.subject.identity.trim() || !input.achievedAt) throw new PersonalRecordsServerError("invalid_record_input", "Complete the required record fields.", 400);
  if (Date.parse(input.achievedAt) > Date.now() + 300_000) throw new PersonalRecordsServerError("future_record_date", "The achieved date cannot be in the future.", 400);
  for (const field of template.contextFields) {
    const value = input.context[field.key];
    const number = Number(value);
    if (field.required && (!Number.isFinite(number) || (field.minimum !== undefined && number < field.minimum) || (field.maximum !== undefined && number > field.maximum))) {
      throw new PersonalRecordsServerError("invalid_record_context", `${field.label} is required.`, 400);
    }
  }
  if (input.subject.identityKind === "catalog_activity") {
    const snapshot = input.subject.authoritySnapshot;
    const definitions = snapshot && Array.isArray(snapshot.recordDefinitions) ? snapshot.recordDefinitions as Array<Record<string, unknown>> : [];
    const authoritative = definitions.some((definition) => (definition.id === input.definition.id || definition.recordKey === input.definition.key)
      && definition.comparisonDirection === input.definition.comparisonDirection
      && definition.canonicalUnit === input.definition.canonicalUnit);
    if (!authoritative) throw new PersonalRecordsServerError("catalog_record_definition_invalid", "The Catalog record definition is not authoritative for this activity.", 400);
  }
}

export async function upsertManualPersonalRecord(supabase: SupabaseClient, input: ManualPersonalRecordInput) {
  validateManualInput(input);
  const { data, error } = await supabase.rpc("upsert_manual_personal_record_atomic", {
    p_event_id: input.eventId ?? null,
    p_subject: input.subject,
    p_definition: input.definition,
    p_value: input.value,
    p_context: input.context,
    p_achieved_at: input.achievedAt,
    p_notes: input.notes?.trim() || null,
  });
  if (error) {
    const nonPr = error.code === "23514" && error.message.includes("not a personal record");
    throw new PersonalRecordsServerError(nonPr ? "not_a_personal_record" : "personal_record_save_failed", nonPr ? "This wasn't a personal record — you already had a better record at this time." : "The personal record could not be saved.", nonPr ? 409 : 503);
  }
  return data;
}

export async function deleteManualPersonalRecord(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase.rpc("delete_manual_personal_record_atomic", { p_event_id: eventId });
  if (error) throw new PersonalRecordsServerError("personal_record_delete_failed", "The personal record could not be deleted.", error.code === "P0002" ? 404 : 503);
  return data;
}
