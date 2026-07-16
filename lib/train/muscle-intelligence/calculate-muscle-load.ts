import {
  MuscleCalculationInputError,
  validateMuscleMappingEntries,
  type CalculateMuscleLoadInput,
  type MuscleAnalysisCompleteness,
  type MuscleContribution,
  type MuscleLoadLevel,
  type MuscleMappingReference,
  type MuscleRole,
  type MuscleSideScope
} from "./contracts";
import { CANONICAL_MUSCLES, type CanonicalMuscleId } from "./taxonomy";
import { getSessionMuscleLoadLevel, getWeeklyMuscleLoadLevel } from "./thresholds";
import {
  MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION,
  MUSCLE_CALCULATION_ENGINE_VERSION,
  MUSCLE_TAXONOMY_VERSION,
  MUSCLE_THRESHOLD_PROFILE_VERSION,
  RESISTANCE_SETS_WORKLOAD_MODEL
} from "./versions";

export type MuscleLoadWarning = "no_items" | "unmapped_items" | "unsupported_workload";

export type MuscleContributionBreakdown = {
  itemId: string;
  mappingSetId: string;
  mappingVersion: number;
  muscleId: CanonicalMuscleId;
  role: MuscleRole;
  contribution: MuscleContribution;
  sideScope: MuscleSideScope;
  qualifyingSets: number;
  rawScore: number;
};

export type MuscleLoadScore = {
  muscleId: CanonicalMuscleId;
  rawScore: number;
  levelInputScore: number;
  averageWeeklyRawScore?: number;
  level: MuscleLoadLevel;
};

export type MuscleMappingVersionUsed = Pick<
  MuscleMappingReference,
  "mappingSetId" | "targetId" | "targetType" | "mappingVersion" | "schemaVersion" | "checksum"
>;

export type MuscleLoadAnalysisResult = {
  schemaVersion: typeof MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION;
  taxonomyVersion: typeof MUSCLE_TAXONOMY_VERSION;
  engineVersion: typeof MUSCLE_CALCULATION_ENGINE_VERSION;
  thresholdVersion: typeof MUSCLE_THRESHOLD_PROFILE_VERSION;
  mode: CalculateMuscleLoadInput["mode"];
  period: CalculateMuscleLoadInput["period"];
  completeness: MuscleAnalysisCompleteness;
  muscles: MuscleLoadScore[];
  contributionBreakdown: MuscleContributionBreakdown[];
  mappingVersionsUsed: MuscleMappingVersionUsed[];
  coverage: {
    totalItemCount: number;
    includedItemCount: number;
    unmappedItemCount: number;
    unsupportedItemCount: number;
  };
  warnings: MuscleLoadWarning[];
};

function normalizeScore(value: number): number {
  return Number(value.toFixed(6));
}

function compareStableText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizePeriod(period: CalculateMuscleLoadInput["period"]): CalculateMuscleLoadInput["period"] {
  switch (period.kind) {
    case "session":
      return { kind: "session" };
    case "week":
      return { kind: "week" };
    case "long_period":
      return { kind: "long_period", weekCount: period.weekCount };
  }
}

function completenessFor(total: number, included: number, unmapped: number, unsupported: number): MuscleAnalysisCompleteness {
  if (total === 0 || included === total) return "complete";
  if (included > 0) return "partial";
  if (unsupported > 0) return "limited";
  if (unmapped > 0) return "unavailable";
  return "complete";
}

function validatePeriod(period: CalculateMuscleLoadInput["period"]): void {
  if (period.kind === "long_period" && (!Number.isFinite(period.weekCount) || period.weekCount <= 0)) {
    throw new RangeError("Long-period weekCount must be finite and greater than zero.");
  }
}

function validateUniqueItemIds(input: CalculateMuscleLoadInput): void {
  const itemIds = new Set<string>();
  for (const item of input.items) {
    if (itemIds.has(item.itemId)) {
      throw new MuscleCalculationInputError(`Duplicate work item ID: ${JSON.stringify(item.itemId)}.`);
    }
    itemIds.add(item.itemId);
  }
}

export function getExerciseMuscleFocus(mapping: MuscleMappingReference) {
  return validateMuscleMappingEntries(mapping.entries, { requirePrimary: true }).map((entry) => ({
    muscleId: entry.muscleId,
    role: entry.role,
    contribution: entry.contribution,
    sideScope: entry.sideScope
  }));
}

export function calculateMuscleLoad(input: CalculateMuscleLoadInput): MuscleLoadAnalysisResult {
  const period = normalizePeriod(input.period);
  validatePeriod(period);
  validateUniqueItemIds(input);
  const rawScores = new Map<CanonicalMuscleId, number>(CANONICAL_MUSCLES.map((muscle) => [muscle.id, 0]));
  const contributionBreakdown: MuscleContributionBreakdown[] = [];
  const mappingVersions = new Map<string, MuscleMappingVersionUsed>();
  let includedItemCount = 0;
  let unmappedItemCount = 0;
  let unsupportedItemCount = 0;

  for (const item of [...input.items].sort((left, right) => compareStableText(left.itemId, right.itemId))) {
    if (!item.mapping) {
      unmappedItemCount += 1;
      continue;
    }
    if (item.workload.model !== RESISTANCE_SETS_WORKLOAD_MODEL || !("qualifyingSets" in item.workload)) {
      unsupportedItemCount += 1;
      continue;
    }
    const qualifyingSets = item.workload.qualifyingSets;
    if (!Number.isFinite(qualifyingSets) || qualifyingSets < 0) {
      throw new RangeError(`Qualifying sets for ${item.itemId} must be finite and non-negative.`);
    }
    const entries = validateMuscleMappingEntries(item.mapping.entries, { requirePrimary: true });
    includedItemCount += 1;
    mappingVersions.set(item.mapping.mappingSetId, {
      mappingSetId: item.mapping.mappingSetId,
      targetId: item.mapping.targetId,
      targetType: item.mapping.targetType,
      mappingVersion: item.mapping.mappingVersion,
      schemaVersion: item.mapping.schemaVersion,
      checksum: item.mapping.checksum
    });
    for (const entry of entries) {
      const rawScore = normalizeScore(qualifyingSets * entry.contribution);
      rawScores.set(entry.muscleId, normalizeScore((rawScores.get(entry.muscleId) ?? 0) + rawScore));
      contributionBreakdown.push({
        itemId: item.itemId,
        mappingSetId: item.mapping.mappingSetId,
        mappingVersion: item.mapping.mappingVersion,
        muscleId: entry.muscleId,
        role: entry.role,
        contribution: entry.contribution,
        sideScope: entry.sideScope,
        qualifyingSets,
        rawScore
      });
    }
  }

  const muscles = CANONICAL_MUSCLES.map<MuscleLoadScore>((muscle) => {
    const rawScore = rawScores.get(muscle.id) ?? 0;
    const levelInputScore = period.kind === "long_period"
      ? normalizeScore(rawScore / period.weekCount)
      : rawScore;
    const level = period.kind === "session"
      ? getSessionMuscleLoadLevel(levelInputScore)
      : getWeeklyMuscleLoadLevel(levelInputScore);
    return {
      muscleId: muscle.id,
      rawScore,
      levelInputScore,
      ...(period.kind === "long_period" ? { averageWeeklyRawScore: levelInputScore } : {}),
      level
    };
  });

  const warnings: MuscleLoadWarning[] = [];
  if (input.items.length === 0) warnings.push("no_items");
  if (unmappedItemCount > 0) warnings.push("unmapped_items");
  if (unsupportedItemCount > 0) warnings.push("unsupported_workload");

  return {
    schemaVersion: MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION,
    taxonomyVersion: MUSCLE_TAXONOMY_VERSION,
    engineVersion: MUSCLE_CALCULATION_ENGINE_VERSION,
    thresholdVersion: MUSCLE_THRESHOLD_PROFILE_VERSION,
    mode: input.mode,
    period,
    completeness: completenessFor(input.items.length, includedItemCount, unmappedItemCount, unsupportedItemCount),
    muscles,
    contributionBreakdown,
    mappingVersionsUsed: [...mappingVersions.values()].sort((left, right) => compareStableText(left.mappingSetId, right.mappingSetId)),
    coverage: {
      totalItemCount: input.items.length,
      includedItemCount,
      unmappedItemCount,
      unsupportedItemCount
    },
    warnings
  };
}
