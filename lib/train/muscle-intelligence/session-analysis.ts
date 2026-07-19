import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateMuscleLoad, type MuscleLoadAnalysisResult } from "./calculate-muscle-load";
import { buildAdvancedSessionMuscleAnalysis } from "./advanced-session-analysis";
import type { AdvancedExposureResult } from "./advanced-exposure";
import type { BroadCompatibilityResult } from "./compatibility-projection";
import { validateMuscleMappingEntries, type MuscleAnalysisMode, type MuscleMappingReference } from "./contracts";
import { SessionMuscleAnalysisError } from "./session-analysis-error";
import {
  MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION,
  MUSCLE_CALCULATION_ENGINE_VERSION,
  MUSCLE_MAPPING_SCHEMA_VERSION,
  MUSCLE_TAXONOMY_VERSION,
  MUSCLE_THRESHOLD_PROFILE_VERSION,
  RESISTANCE_SETS_WORKLOAD_MODEL
} from "./versions";
import {
  ADVANCED_MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION,
  ADVANCED_MUSCLE_ATLAS_VERSION,
  ADVANCED_MUSCLE_CALCULATION_ENGINE_VERSION,
  ADVANCED_MUSCLE_HEAT_SCALE_VERSION,
  ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION,
  ADVANCED_SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION
} from "./versions";

export { SessionMuscleAnalysisError } from "./session-analysis-error";
export type { SessionAnalysisReasonCode } from "./session-analysis-error";

export const SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION = "workout_session_muscle_snapshot_v1" as const;

export type SessionMuscleSnapshotEnvelope = {
  id: string;
  workout_session_id: string;
  snapshot_schema_version: string;
  taxonomy_version: string;
  mapping_schema_version: string;
  calculation_engine_version: string;
  threshold_profile_version: string;
  result_schema_version: string;
  workload_model_version: string;
  completeness: "complete" | "partial" | "unavailable";
  reason_codes: string[];
  source: "session_start" | "terminal_insert" | "legacy_backfill";
  frozen_at: string;
};

export type SessionMuscleSnapshotItem = {
  id: string;
  source_plan_exercise_id: string | null;
  item_order: number;
  planned_target_type: "global_exercise" | "custom_exercise" | null;
  planned_global_exercise_id: string | null;
  planned_custom_exercise_id: string | null;
  planned_mapping_set_id: string | null;
  planned_custom_mapping_set_id: string | null;
  planned_mapping_version: number | null;
  planned_mapping_schema_version: string | null;
  planned_mapping_checksum: string | null;
  planned_custom_mapping_entries: unknown;
  planned_sets: number | null;
  state: "planned" | "replaced" | "skipped" | "adjusted" | "completed";
  actual_target_type: "global_exercise" | "custom_exercise" | null;
  actual_global_exercise_id: string | null;
  actual_custom_exercise_id: string | null;
  actual_mapping_set_id: string | null;
  actual_custom_mapping_set_id: string | null;
  actual_mapping_version: number | null;
  actual_mapping_schema_version: string | null;
  actual_mapping_checksum: string | null;
  actual_custom_mapping_entries: unknown;
  performed_total_sets?: number | null;
  performed_qualifying_sets?: number | null;
  performed_frozen_at?: string | null;
};

export type FrozenGlobalMapping = {
  id: string;
  exercise_id: string;
  mapping_version: number;
  schema_version: string;
  checksum: string;
  entries: readonly unknown[];
};

export type CompletedLog = {
  plan_exercise_id: string | null;
  exercise_order: number | null;
  completed_at: string | null;
};

export type BuildSessionMuscleAnalysisInput = {
  mode: MuscleAnalysisMode;
  snapshot: SessionMuscleSnapshotEnvelope;
  items: SessionMuscleSnapshotItem[];
  globalMappings: FrozenGlobalMapping[];
  completedLogs: CompletedLog[];
};

export type SessionMuscleAnalysis = {
  sessionId: string;
  snapshotId: string;
  snapshotSchemaVersion: typeof SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION;
  frozenAt: string;
  source: SessionMuscleSnapshotEnvelope["source"];
  snapshotCompleteness: SessionMuscleSnapshotEnvelope["completeness"];
  reasonCodes: string[];
  analysis: MuscleLoadAnalysisResult;
};

export type AdvancedSessionMuscleAnalysis = Omit<SessionMuscleAnalysis, "snapshotSchemaVersion" | "analysis"> & {
  snapshotSchemaVersion: typeof ADVANCED_SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION;
  analysis: AdvancedExposureResult | BroadCompatibilityResult | null;
};

export type VersionedSessionMuscleAnalysis = SessionMuscleAnalysis | AdvancedSessionMuscleAnalysis;

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function supportedSnapshotVersion(snapshot: SessionMuscleSnapshotEnvelope): "v1" | "v2" {
  if (
    snapshot.snapshot_schema_version !== SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION ||
    snapshot.taxonomy_version !== MUSCLE_TAXONOMY_VERSION ||
    snapshot.mapping_schema_version !== MUSCLE_MAPPING_SCHEMA_VERSION ||
    snapshot.calculation_engine_version !== MUSCLE_CALCULATION_ENGINE_VERSION ||
    snapshot.threshold_profile_version !== MUSCLE_THRESHOLD_PROFILE_VERSION ||
    snapshot.result_schema_version !== MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION ||
    snapshot.workload_model_version !== RESISTANCE_SETS_WORKLOAD_MODEL
  ) {
    if (
      snapshot.snapshot_schema_version === ADVANCED_SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION &&
      snapshot.taxonomy_version === ADVANCED_MUSCLE_ATLAS_VERSION &&
      snapshot.mapping_schema_version === ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION &&
      snapshot.calculation_engine_version === ADVANCED_MUSCLE_CALCULATION_ENGINE_VERSION &&
      snapshot.threshold_profile_version === ADVANCED_MUSCLE_HEAT_SCALE_VERSION &&
      snapshot.result_schema_version === ADVANCED_MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION &&
      snapshot.workload_model_version === RESISTANCE_SETS_WORKLOAD_MODEL
    ) return "v2";
    throw new SessionMuscleAnalysisError("unsupported_snapshot_version", "This historical analysis uses an unsupported version.", 409);
  }
  return "v1";
}

function globalMappingFor(
  item: SessionMuscleSnapshotItem,
  actual: boolean,
  mappings: Map<string, FrozenGlobalMapping>
): MuscleMappingReference | null {
  const mappingSetId = actual ? item.actual_mapping_set_id : item.planned_mapping_set_id;
  if (!mappingSetId) return null;
  const mapping = mappings.get(mappingSetId);
  const targetId = actual ? item.actual_global_exercise_id : item.planned_global_exercise_id;
  const version = actual ? item.actual_mapping_version : item.planned_mapping_version;
  const schemaVersion = actual ? item.actual_mapping_schema_version : item.planned_mapping_schema_version;
  const checksum = actual ? item.actual_mapping_checksum : item.planned_mapping_checksum;
  if (!mapping || mapping.exercise_id !== targetId || mapping.mapping_version !== version || mapping.schema_version !== schemaVersion || mapping.checksum !== checksum) {
    throw new SessionMuscleAnalysisError("snapshot_mapping_drift", "A frozen global mapping reference no longer matches its recorded version.", 409);
  }
  return {
    mappingSetId: mapping.id,
    targetId: mapping.exercise_id,
    targetType: "global_exercise",
    mappingVersion: mapping.mapping_version,
    schemaVersion: MUSCLE_MAPPING_SCHEMA_VERSION,
    checksum: mapping.checksum,
    entries: validateMuscleMappingEntries(mapping.entries, { requirePrimary: true })
  };
}

function customMappingFor(item: SessionMuscleSnapshotItem, actual: boolean): MuscleMappingReference | null {
  const mappingSetId = actual ? item.actual_custom_mapping_set_id : item.planned_custom_mapping_set_id;
  const targetId = actual ? item.actual_custom_exercise_id : item.planned_custom_exercise_id;
  const mappingVersion = actual ? item.actual_mapping_version : item.planned_mapping_version;
  const schemaVersion = actual ? item.actual_mapping_schema_version : item.planned_mapping_schema_version;
  const checksum = actual ? item.actual_mapping_checksum : item.planned_mapping_checksum;
  const entries = actual ? item.actual_custom_mapping_entries : item.planned_custom_mapping_entries;
  const hasFrozenReference = mappingSetId !== null || mappingVersion !== null || schemaVersion !== null || checksum !== null || entries !== null;
  if (!hasFrozenReference) return null;
  if (!mappingSetId || !targetId || mappingVersion === null || !checksum || schemaVersion !== MUSCLE_MAPPING_SCHEMA_VERSION || !Array.isArray(entries)) {
    throw new SessionMuscleAnalysisError("snapshot_mapping_drift", "A frozen custom mapping is incomplete.", 409);
  }
  return {
    mappingSetId,
    targetId,
    targetType: "custom_exercise",
    mappingVersion,
    schemaVersion: MUSCLE_MAPPING_SCHEMA_VERSION,
    checksum,
    entries: validateMuscleMappingEntries(entries, { requirePrimary: true })
  };
}

function completedSetCount(item: SessionMuscleSnapshotItem, logs: CompletedLog[]) {
  return logs.filter((log) => Boolean(log.completed_at) && (
    item.source_plan_exercise_id
      ? log.plan_exercise_id === item.source_plan_exercise_id
      : log.plan_exercise_id === null && log.exercise_order === item.item_order
  )).length;
}

function buildV1SessionMuscleAnalysis(input: BuildSessionMuscleAnalysisInput): SessionMuscleAnalysis {
  const mappings = new Map(input.globalMappings.map((mapping) => [mapping.id, mapping]));
  const workItems = [...input.items].sort((left, right) => left.item_order - right.item_order || compareText(left.id, right.id)).map((item) => {
    const useActual = input.mode === "completed" && item.actual_target_type !== null;
    const targetType = useActual ? item.actual_target_type : item.planned_target_type;
    const mapping = targetType === "global_exercise"
      ? globalMappingFor(item, useActual, mappings)
      : targetType === "custom_exercise"
        ? customMappingFor(item, useActual)
        : null;
    const completedSets = input.mode === "completed" ? completedSetCount(item, input.completedLogs) : 0;
    const hasSupportedSetWorkload = input.mode === "planned"
      ? item.planned_sets !== null
      : item.state === "skipped" || item.planned_sets !== null || completedSets > 0;
    const qualifyingSets = input.mode === "planned"
      ? item.planned_sets ?? 0
      : item.state === "skipped" ? 0 : completedSets;
    return {
      itemId: item.id,
      mapping,
      workload: hasSupportedSetWorkload
        ? { model: RESISTANCE_SETS_WORKLOAD_MODEL, qualifyingSets }
        : { model: "unsupported_session_prescription" }
    };
  });
  return {
    sessionId: input.snapshot.workout_session_id,
    snapshotId: input.snapshot.id,
    snapshotSchemaVersion: SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION,
    frozenAt: input.snapshot.frozen_at,
    source: input.snapshot.source,
    snapshotCompleteness: input.snapshot.completeness,
    reasonCodes: [...input.snapshot.reason_codes].sort(compareText),
    analysis: calculateMuscleLoad({ mode: input.mode, period: { kind: "session" }, items: workItems })
  };
}

export function buildVersionedSessionMuscleAnalysis(input: BuildSessionMuscleAnalysisInput): VersionedSessionMuscleAnalysis {
  const version = supportedSnapshotVersion(input.snapshot);
  if (version === "v1") return buildV1SessionMuscleAnalysis(input);
  return {
    sessionId: input.snapshot.workout_session_id,
    snapshotId: input.snapshot.id,
    snapshotSchemaVersion: ADVANCED_SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION,
    frozenAt: input.snapshot.frozen_at,
    source: input.snapshot.source,
    snapshotCompleteness: input.snapshot.completeness,
    reasonCodes: [...input.snapshot.reason_codes].sort(compareText),
    analysis: buildAdvancedSessionMuscleAnalysis(input)
  };
}

export function buildSessionMuscleAnalysis(input: BuildSessionMuscleAnalysisInput): SessionMuscleAnalysis {
  if (supportedSnapshotVersion(input.snapshot) !== "v1") {
    throw new SessionMuscleAnalysisError("unsupported_snapshot_version", "This analyzer accepts version-one snapshots only.", 409);
  }
  return buildV1SessionMuscleAnalysis(input);
}

export async function getWorkoutSessionMuscleAnalysis(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  mode: MuscleAnalysisMode
): Promise<VersionedSessionMuscleAnalysis> {
  const snapshotResult = await supabase
    .from("workout_session_muscle_snapshots")
    .select("id,workout_session_id,snapshot_schema_version,taxonomy_version,mapping_schema_version,calculation_engine_version,threshold_profile_version,result_schema_version,workload_model_version,completeness,reason_codes,source,frozen_at")
    .eq("user_id", userId)
    .eq("workout_session_id", sessionId)
    .maybeSingle();
  if (snapshotResult.error) throw new SessionMuscleAnalysisError("snapshot_read_failed", "Historical muscle analysis could not be loaded.", 503);
  if (!snapshotResult.data) throw new SessionMuscleAnalysisError("snapshot_not_found", "No historical muscle snapshot exists for this workout.", 404);

  const snapshot = snapshotResult.data as SessionMuscleSnapshotEnvelope;
  const snapshotVersion = supportedSnapshotVersion(snapshot);
  const sessionResult = await supabase.from("workout_sessions").select("status").eq("id", sessionId).eq("user_id", userId).maybeSingle();
  if (sessionResult.error) throw new SessionMuscleAnalysisError("snapshot_read_failed", "Workout state could not be verified.", 503);
  if (mode === "completed" && !["completed", "skipped"].includes(sessionResult.data?.status ?? "")) {
    throw new SessionMuscleAnalysisError("session_not_terminal", "Completed analysis is available after the workout is completed or skipped.", 409);
  }

  const itemsResult = await supabase
    .from("workout_session_muscle_snapshot_items")
    .select("id,source_plan_exercise_id,item_order,planned_target_type,planned_global_exercise_id,planned_custom_exercise_id,planned_mapping_set_id,planned_custom_mapping_set_id,planned_mapping_version,planned_mapping_schema_version,planned_mapping_checksum,planned_custom_mapping_entries,planned_sets,state,actual_target_type,actual_global_exercise_id,actual_custom_exercise_id,actual_mapping_set_id,actual_custom_mapping_set_id,actual_mapping_version,actual_mapping_schema_version,actual_mapping_checksum,actual_custom_mapping_entries,performed_total_sets,performed_qualifying_sets,performed_frozen_at")
    .eq("snapshot_id", snapshot.id)
    .eq("user_id", userId)
    .order("item_order", { ascending: true });
  if (itemsResult.error) throw new SessionMuscleAnalysisError("snapshot_read_failed", "Historical snapshot items could not be loaded.", 503);
  const items = (itemsResult.data ?? []) as SessionMuscleSnapshotItem[];
  const globalMappingIds = Array.from(new Set(items.flatMap((item) => [item.planned_mapping_set_id, item.actual_mapping_set_id]).filter((id): id is string => Boolean(id))));
  let globalMappings: FrozenGlobalMapping[] = [];
  if (globalMappingIds.length) {
    const mappingsResult = await supabase.rpc("get_workout_session_frozen_global_mappings", {
      p_user_id: userId,
      p_session_id: sessionId
    });
    if (mappingsResult.error) throw new SessionMuscleAnalysisError("snapshot_read_failed", "Frozen mapping versions could not be loaded.", 503);
    globalMappings = (mappingsResult.data ?? []).filter((mapping: Record<string, unknown>) => globalMappingIds.includes(String(mapping.id))).map((mapping: Record<string, unknown>) => ({
      id: mapping.id,
      exercise_id: mapping.exercise_id,
      mapping_version: mapping.mapping_version,
      schema_version: mapping.schema_version,
      checksum: mapping.checksum,
      entries: mapping.entries as readonly unknown[]
    })) as FrozenGlobalMapping[];
  }

  let completedLogs: CompletedLog[] = [];
  if (mode === "completed" && snapshotVersion === "v1") {
    const logsResult = await supabase
      .from("exercise_logs")
      .select("plan_exercise_id,exercise_order,completed_at")
      .eq("workout_session_id", sessionId);
    if (logsResult.error) throw new SessionMuscleAnalysisError("snapshot_read_failed", "Completed workout sets could not be loaded.", 503);
    completedLogs = (logsResult.data ?? []) as CompletedLog[];
  }

  return buildVersionedSessionMuscleAnalysis({
    mode,
    snapshot,
    items,
    globalMappings,
    completedLogs
  });
}
