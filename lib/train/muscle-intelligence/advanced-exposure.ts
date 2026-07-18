import {
  ADVANCED_MUSCLE_TARGETS,
  compareAdvancedMuscleTargets,
  isAdvancedMuscleTargetId,
  type AdvancedMuscleTargetId
} from "./advanced-atlas";
import {
  MUSCLE_CONTRIBUTIONS,
  MUSCLE_ROLES,
  MUSCLE_SIDE_SCOPES,
  isValidRoleContribution,
  type MuscleContribution,
  type MuscleRole,
  type MuscleSideScope
} from "./contracts";
import {
  ADVANCED_MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION,
  ADVANCED_MUSCLE_ATLAS_VERSION,
  ADVANCED_MUSCLE_CALCULATION_ENGINE_VERSION,
  ADVANCED_MUSCLE_HEAT_SCALE_VERSION,
  ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION,
  RESISTANCE_SETS_WORKLOAD_MODEL
} from "./versions";
import type { BroadCompatibilityResult } from "./compatibility-projection";

export const ADVANCED_EXPOSURE_SCOPES = ["single_session", "plan_cycle", "exercise_preview"] as const;
export const ADVANCED_HEAT_LEVELS = ["none", "light", "moderate", "high"] as const;

export type AdvancedExposureScope = (typeof ADVANCED_EXPOSURE_SCOPES)[number];
export type AdvancedHeatLevel = (typeof ADVANCED_HEAT_LEVELS)[number];

export type AdvancedMuscleMappingEntry = {
  muscleId: AdvancedMuscleTargetId;
  role: MuscleRole;
  contribution: MuscleContribution;
  sideScope: MuscleSideScope;
  sortOrder: number;
};

export type AdvancedMuscleMappingReference = {
  mappingSetId: string;
  targetId: string;
  targetType: "global_exercise" | "custom_exercise";
  mappingVersion: number;
  schemaVersion: typeof ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION;
  checksum: string;
  entries: readonly AdvancedMuscleMappingEntry[];
};

export type AdvancedMuscleWorkItem = {
  itemId: string;
  mapping: AdvancedMuscleMappingReference | null;
  qualifyingSets: number;
  displayContext?: { exerciseName?: string; dayName?: string };
};

export type AdvancedExposureTarget = {
  targetId: AdvancedMuscleTargetId;
  rawExposure: number;
  heatLevel: AdvancedHeatLevel;
  previewRole?: "primary" | "co_primary" | "secondary" | "stabilizer" | "none";
};

export type AdvancedExposureResult = {
  kind: "advanced";
  schemaVersion: typeof ADVANCED_MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION;
  atlasVersion: typeof ADVANCED_MUSCLE_ATLAS_VERSION;
  mappingSchemaVersion: typeof ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION;
  engineVersion: typeof ADVANCED_MUSCLE_CALCULATION_ENGINE_VERSION;
  heatScaleVersion: typeof ADVANCED_MUSCLE_HEAT_SCALE_VERSION;
  workloadModelVersion: typeof RESISTANCE_SETS_WORKLOAD_MODEL;
  scope: AdvancedExposureScope;
  completeness: "complete" | "partial" | "unavailable";
  targets: AdvancedExposureTarget[];
  mappingVersionsUsed: Array<Omit<AdvancedMuscleMappingReference, "entries">>;
  coverage: { totalItemCount: number; includedItemCount: number; unmappedItemCount: number };
  warnings: Array<"no_items" | "unmapped_items">;
  compatibility?: BroadCompatibilityResult;
};

export class AdvancedExposureInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvancedExposureInputError";
  }
}

function normalize(value: number): number {
  return Number(value.toFixed(6));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function getAdvancedHeatLevel(score: number, scope: Exclude<AdvancedExposureScope, "exercise_preview">): AdvancedHeatLevel {
  if (score === 0) return "none";
  if (scope === "single_session") return score < 2 ? "light" : score < 5 ? "moderate" : "high";
  return score < 4 ? "light" : score < 9 ? "moderate" : "high";
}

export function validateAdvancedMuscleMappingEntries(
  values: readonly unknown[],
  options: { requirePrimary?: boolean } = {}
): AdvancedMuscleMappingEntry[] {
  if (!Array.isArray(values)) throw new AdvancedExposureInputError("Mapping entries must be an array.");
  const muscleIds = new Set<AdvancedMuscleTargetId>();
  const sortOrders = new Set<number>();
  const entries = values.map((value) => {
    if (!value || typeof value !== "object") throw new AdvancedExposureInputError("Mapping entry must be an object.");
    const entry = value as Record<string, unknown>;
    if (!isAdvancedMuscleTargetId(entry.muscleId)) throw new AdvancedExposureInputError("Unknown advanced muscle target.");
    if (!MUSCLE_ROLES.includes(entry.role as MuscleRole)) throw new AdvancedExposureInputError("Unknown muscle role.");
    if (!MUSCLE_CONTRIBUTIONS.includes(entry.contribution as MuscleContribution)) throw new AdvancedExposureInputError("Unknown contribution.");
    if (!isValidRoleContribution(entry.role as MuscleRole, entry.contribution as MuscleContribution)) {
      throw new AdvancedExposureInputError("Role and contribution are incompatible.");
    }
    if (!MUSCLE_SIDE_SCOPES.includes(entry.sideScope as MuscleSideScope)) throw new AdvancedExposureInputError("Unknown side scope.");
    if (!Number.isSafeInteger(entry.sortOrder) || Number(entry.sortOrder) <= 0) throw new AdvancedExposureInputError("Sort order must be a positive integer.");
    const validated: AdvancedMuscleMappingEntry = {
      muscleId: entry.muscleId,
      role: entry.role as MuscleRole,
      contribution: entry.contribution as MuscleContribution,
      sideScope: entry.sideScope as MuscleSideScope,
      sortOrder: Number(entry.sortOrder)
    };
    if (muscleIds.has(validated.muscleId)) throw new AdvancedExposureInputError(`Duplicate target: ${validated.muscleId}.`);
    if (sortOrders.has(validated.sortOrder)) throw new AdvancedExposureInputError(`Duplicate sort order: ${validated.sortOrder}.`);
    muscleIds.add(validated.muscleId);
    sortOrders.add(validated.sortOrder);
    return validated;
  });
  if (options.requirePrimary && !entries.some((entry) => entry.role === "primary")) {
    throw new AdvancedExposureInputError("A mapping requires at least one primary target.");
  }
  return entries.sort((left, right) => compareAdvancedMuscleTargets(left.muscleId, right.muscleId));
}

function assertMapping(mapping: AdvancedMuscleMappingReference): AdvancedMuscleMappingEntry[] {
  if (mapping.schemaVersion !== ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION) {
    throw new AdvancedExposureInputError("Unsupported advanced mapping schema.");
  }
  if (!mapping.mappingSetId || !mapping.targetId || !mapping.checksum || !Number.isSafeInteger(mapping.mappingVersion) || mapping.mappingVersion <= 0) {
    throw new AdvancedExposureInputError("Advanced mapping reference is incomplete.");
  }
  return validateAdvancedMuscleMappingEntries(mapping.entries, { requirePrimary: true });
}

function previewTargets(mapping: AdvancedMuscleMappingReference): AdvancedExposureTarget[] {
  const entries = assertMapping(mapping);
  const highestPrimary = Math.max(...entries.filter((entry) => entry.role === "primary").map((entry) => entry.contribution));
  const byTarget = new Map(entries.map((entry) => {
    const previewRole = entry.role === "primary"
      ? entry.contribution === highestPrimary ? "primary" as const : "co_primary" as const
      : entry.role;
    const heatLevel = previewRole === "primary" ? "high" as const : previewRole === "stabilizer" ? "light" as const : "moderate" as const;
    return [entry.muscleId, { targetId: entry.muscleId, rawExposure: 0, heatLevel, previewRole }];
  }));
  return ADVANCED_MUSCLE_TARGETS.map((target) => byTarget.get(target.id) ?? {
    targetId: target.id,
    rawExposure: 0,
    heatLevel: "none",
    previewRole: "none"
  });
}

export function calculateAdvancedExposure(input: {
  scope: AdvancedExposureScope;
  items: readonly AdvancedMuscleWorkItem[];
}): AdvancedExposureResult {
  if (!ADVANCED_EXPOSURE_SCOPES.includes(input.scope)) {
    throw new AdvancedExposureInputError("Unsupported advanced exposure scope.");
  }
  const itemIds = new Set<string>();
  for (const item of input.items) {
    if (itemIds.has(item.itemId)) throw new AdvancedExposureInputError(`Duplicate work item ID: ${JSON.stringify(item.itemId)}.`);
    itemIds.add(item.itemId);
  }
  if (input.scope === "exercise_preview" && input.items.length > 1) {
    throw new AdvancedExposureInputError("Exercise preview accepts at most one mapping.");
  }

  const rawScores = new Map<AdvancedMuscleTargetId, number>(ADVANCED_MUSCLE_TARGETS.map((target) => [target.id, 0]));
  const mappingVersions = new Map<string, Omit<AdvancedMuscleMappingReference, "entries">>();
  let includedItemCount = 0;
  let unmappedItemCount = 0;
  let preview: AdvancedExposureTarget[] | null = null;

  for (const item of [...input.items].sort((left, right) => compareText(left.itemId, right.itemId))) {
    if (!Number.isFinite(item.qualifyingSets) || item.qualifyingSets < 0) {
      throw new AdvancedExposureInputError(`Qualifying sets for ${JSON.stringify(item.itemId)} must be finite and non-negative.`);
    }
    if (!item.mapping) {
      unmappedItemCount += 1;
      continue;
    }
    const entries = assertMapping(item.mapping);
    includedItemCount += 1;
    const { entries: _entries, ...mappingVersion } = item.mapping;
    mappingVersions.set(item.mapping.mappingSetId, { ...mappingVersion });
    if (input.scope === "exercise_preview") {
      preview = previewTargets(item.mapping);
      continue;
    }
    for (const entry of entries) {
      rawScores.set(entry.muscleId, normalize((rawScores.get(entry.muscleId) ?? 0) + item.qualifyingSets * entry.contribution));
    }
  }

  const targets = preview ?? ADVANCED_MUSCLE_TARGETS.map((target) => {
    const rawExposure = rawScores.get(target.id) ?? 0;
    return { targetId: target.id, rawExposure, heatLevel: getAdvancedHeatLevel(rawExposure, input.scope as "single_session" | "plan_cycle") };
  });
  const warnings: AdvancedExposureResult["warnings"] = [];
  if (input.items.length === 0) warnings.push("no_items");
  if (unmappedItemCount > 0) warnings.push("unmapped_items");

  return {
    kind: "advanced",
    schemaVersion: ADVANCED_MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION,
    atlasVersion: ADVANCED_MUSCLE_ATLAS_VERSION,
    mappingSchemaVersion: ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION,
    engineVersion: ADVANCED_MUSCLE_CALCULATION_ENGINE_VERSION,
    heatScaleVersion: ADVANCED_MUSCLE_HEAT_SCALE_VERSION,
    workloadModelVersion: RESISTANCE_SETS_WORKLOAD_MODEL,
    scope: input.scope,
    completeness: input.items.length === 0 || includedItemCount === input.items.length
      ? "complete"
      : includedItemCount > 0 ? "partial" : "unavailable",
    targets,
    mappingVersionsUsed: [...mappingVersions.values()].sort((left, right) => compareText(left.mappingSetId, right.mappingSetId)),
    coverage: { totalItemCount: input.items.length, includedItemCount, unmappedItemCount },
    warnings
  };
}

export function getAdvancedExercisePreview(mapping: AdvancedMuscleMappingReference): AdvancedExposureResult {
  return calculateAdvancedExposure({
    scope: "exercise_preview",
    items: [{ itemId: mapping.targetId, mapping, qualifyingSets: 0 }]
  });
}
