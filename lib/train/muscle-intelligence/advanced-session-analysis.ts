import { calculateMuscleLoad } from "./calculate-muscle-load";
import {
  calculateAdvancedExposure,
  validateAdvancedMuscleMappingEntries,
  type AdvancedMuscleMappingReference,
  type AdvancedMuscleWorkItem
} from "./advanced-exposure";
import { projectBroadMuscleCompatibility } from "./compatibility-projection";
import { validateMuscleMappingEntries, type MuscleLoadWorkItem, type MuscleMappingReference } from "./contracts";
import type {
  BuildSessionMuscleAnalysisInput,
  FrozenGlobalMapping,
  SessionMuscleSnapshotItem
} from "./session-analysis";
import { SessionMuscleAnalysisError } from "./session-analysis-error";
import {
  ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION,
  ADVANCED_SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION,
  MUSCLE_MAPPING_SCHEMA_VERSION,
  RESISTANCE_SETS_WORKLOAD_MODEL
} from "./versions";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function completedSetCount(item: SessionMuscleSnapshotItem, input: BuildSessionMuscleAnalysisInput): number {
  if (input.snapshot.snapshot_schema_version === ADVANCED_SESSION_MUSCLE_SNAPSHOT_SCHEMA_VERSION) {
    if (item.performed_qualifying_sets === null || item.performed_frozen_at === null) {
      throw new SessionMuscleAnalysisError(
        "snapshot_workload_not_frozen",
        "Completed muscle workload was not frozen with this workout.",
        409
      );
    }
    return item.performed_qualifying_sets;
  }
  return input.completedLogs.filter((log) => Boolean(log.completed_at) && (
    item.source_plan_exercise_id
      ? log.plan_exercise_id === item.source_plan_exercise_id
      : log.plan_exercise_id === null && log.exercise_order === item.item_order
  )).length;
}

function frozenFields(item: SessionMuscleSnapshotItem, actual: boolean) {
  return {
    targetType: actual ? item.actual_target_type : item.planned_target_type,
    globalTargetId: actual ? item.actual_global_exercise_id : item.planned_global_exercise_id,
    customTargetId: actual ? item.actual_custom_exercise_id : item.planned_custom_exercise_id,
    globalMappingSetId: actual ? item.actual_mapping_set_id : item.planned_mapping_set_id,
    customMappingSetId: actual ? item.actual_custom_mapping_set_id : item.planned_custom_mapping_set_id,
    mappingVersion: actual ? item.actual_mapping_version : item.planned_mapping_version,
    schemaVersion: actual ? item.actual_mapping_schema_version : item.planned_mapping_schema_version,
    checksum: actual ? item.actual_mapping_checksum : item.planned_mapping_checksum,
    customEntries: actual ? item.actual_custom_mapping_entries : item.planned_custom_mapping_entries
  };
}

function assertReferenceBase(fields: ReturnType<typeof frozenFields>) {
  if (!fields.mappingVersion || !fields.schemaVersion || !fields.checksum) {
    throw new SessionMuscleAnalysisError("snapshot_mapping_drift", "A frozen mapping reference is incomplete.", 409);
  }
}

function mappingFor(
  item: SessionMuscleSnapshotItem,
  actual: boolean,
  mappings: Map<string, FrozenGlobalMapping>
): MuscleMappingReference | AdvancedMuscleMappingReference | null {
  const fields = frozenFields(item, actual);
  if (!fields.targetType) return null;
  assertReferenceBase(fields);
  let targetId: string;
  let mappingSetId: string;
  let entries: readonly unknown[];
  if (fields.targetType === "global_exercise") {
    if (!fields.globalTargetId || !fields.globalMappingSetId) {
      throw new SessionMuscleAnalysisError("snapshot_mapping_drift", "A frozen global mapping reference is incomplete.", 409);
    }
    const mapping = mappings.get(fields.globalMappingSetId);
    if (
      !mapping || mapping.exercise_id !== fields.globalTargetId || mapping.mapping_version !== fields.mappingVersion ||
      mapping.schema_version !== fields.schemaVersion || mapping.checksum !== fields.checksum
    ) {
      throw new SessionMuscleAnalysisError("snapshot_mapping_drift", "A frozen global mapping reference no longer matches its recorded version.", 409);
    }
    targetId = fields.globalTargetId;
    mappingSetId = fields.globalMappingSetId;
    entries = mapping.entries;
  } else {
    if (!fields.customTargetId || !fields.customMappingSetId || !Array.isArray(fields.customEntries)) {
      throw new SessionMuscleAnalysisError("snapshot_mapping_drift", "A frozen custom mapping reference is incomplete.", 409);
    }
    targetId = fields.customTargetId;
    mappingSetId = fields.customMappingSetId;
    entries = fields.customEntries;
  }

  if (fields.schemaVersion === ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION) {
    return {
      mappingSetId,
      targetId,
      targetType: fields.targetType,
      mappingVersion: fields.mappingVersion!,
      schemaVersion: ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION,
      checksum: fields.checksum!,
      entries: validateAdvancedMuscleMappingEntries(entries, { requirePrimary: true })
    };
  }
  if (fields.schemaVersion === MUSCLE_MAPPING_SCHEMA_VERSION) {
    return {
      mappingSetId,
      targetId,
      targetType: fields.targetType,
      mappingVersion: fields.mappingVersion!,
      schemaVersion: MUSCLE_MAPPING_SCHEMA_VERSION,
      checksum: fields.checksum!,
      entries: validateMuscleMappingEntries(entries, { requirePrimary: true })
    };
  }
  throw new SessionMuscleAnalysisError("unsupported_snapshot_version", "This historical analysis uses an unsupported version.", 409);
}

export function buildAdvancedSessionMuscleAnalysis(input: BuildSessionMuscleAnalysisInput) {
  const mappings = new Map(input.globalMappings.map((mapping) => [mapping.id, mapping]));
  const advancedItems: AdvancedMuscleWorkItem[] = [];
  const broadItems: MuscleLoadWorkItem[] = [];
  for (const item of [...input.items].sort((left, right) => left.item_order - right.item_order || compareText(left.id, right.id))) {
    const useActual = input.mode === "completed" && item.actual_target_type !== null;
    const mapping = mappingFor(item, useActual, mappings);
    const completedSets = input.mode === "completed" ? completedSetCount(item, input) : 0;
    const qualifyingSets = input.mode === "planned" ? item.planned_sets ?? 0 : item.state === "skipped" ? 0 : completedSets;
    if (!mapping || mapping.schemaVersion === ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION) {
      advancedItems.push({ itemId: item.id, mapping: mapping as AdvancedMuscleMappingReference | null, qualifyingSets });
    } else {
      broadItems.push({
        itemId: item.id,
        mapping,
        workload: { model: RESISTANCE_SETS_WORKLOAD_MODEL, qualifyingSets }
      });
    }
  }

  const compatibility = broadItems.length
    ? projectBroadMuscleCompatibility(calculateMuscleLoad({ mode: input.mode, period: { kind: "session" }, items: broadItems }))
    : null;
  if (advancedItems.length === 0) return compatibility;
  const advanced = calculateAdvancedExposure({ scope: "single_session", items: advancedItems });
  return compatibility ? { ...advanced, compatibility } : advanced;
}
