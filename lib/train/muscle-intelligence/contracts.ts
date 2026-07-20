import { getCanonicalMuscle, isCanonicalMuscleId, type CanonicalMuscleId } from "./taxonomy";
import { MUSCLE_MAPPING_SCHEMA_VERSION, RESISTANCE_SETS_WORKLOAD_MODEL } from "./versions";

export const MUSCLE_ROLES = ["primary", "secondary", "stabilizer"] as const;
export const MUSCLE_CONTRIBUTIONS = [1, 0.75, 0.5, 0.25, 0] as const;
export const MUSCLE_SIDE_SCOPES = ["bilateral", "left", "right"] as const;
export const MUSCLE_ANALYSIS_MODES = ["planned", "active", "completed"] as const;
export const MUSCLE_ANALYSIS_COMPLETENESS = ["complete", "partial", "limited", "unavailable"] as const;
export const MUSCLE_LOAD_LEVELS = ["inactive", "low", "medium", "high", "very_high"] as const;

export type MuscleRole = (typeof MUSCLE_ROLES)[number];
export type MuscleContribution = (typeof MUSCLE_CONTRIBUTIONS)[number];
export type MuscleSideScope = (typeof MUSCLE_SIDE_SCOPES)[number];
export type MuscleAnalysisMode = (typeof MUSCLE_ANALYSIS_MODES)[number];
export type MuscleAnalysisCompleteness = (typeof MUSCLE_ANALYSIS_COMPLETENESS)[number];
export type MuscleLoadLevel = (typeof MUSCLE_LOAD_LEVELS)[number];

export type MuscleMappingEntry = {
  muscleId: CanonicalMuscleId;
  role: MuscleRole;
  contribution: MuscleContribution;
  sideScope: MuscleSideScope;
  sortOrder: number;
};

export type MuscleMappingReference = {
  mappingSetId: string;
  targetId: string;
  targetType: "global_exercise" | "custom_exercise";
  mappingVersion: number;
  schemaVersion: typeof MUSCLE_MAPPING_SCHEMA_VERSION;
  checksum: string;
  entries: readonly MuscleMappingEntry[];
};

export type ResistanceSetsWorkload = {
  model: typeof RESISTANCE_SETS_WORKLOAD_MODEL;
  qualifyingSets: number;
};

export type UnsupportedWorkload = {
  model: string;
  value?: unknown;
};

export type MuscleLoadWorkItem = {
  itemId: string;
  mapping?: MuscleMappingReference | null;
  workload: ResistanceSetsWorkload | UnsupportedWorkload;
};

export type MuscleAnalysisPeriod =
  | { kind: "session" }
  | { kind: "week" }
  | { kind: "long_period"; weekCount: number };

export type CalculateMuscleLoadInput = {
  mode: MuscleAnalysisMode;
  period: MuscleAnalysisPeriod;
  items: readonly MuscleLoadWorkItem[];
};

export class MuscleMappingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MuscleMappingValidationError";
  }
}

export class MuscleCalculationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MuscleCalculationInputError";
  }
}

function includes<T extends readonly unknown[]>(values: T, value: unknown): value is T[number] {
  return values.includes(value as never);
}

export function isMuscleRole(value: unknown): value is MuscleRole {
  return includes(MUSCLE_ROLES, value);
}

export function isMuscleContribution(value: unknown): value is MuscleContribution {
  return typeof value === "number" && includes(MUSCLE_CONTRIBUTIONS, value);
}

export function isMuscleSideScope(value: unknown): value is MuscleSideScope {
  return includes(MUSCLE_SIDE_SCOPES, value);
}

export function isValidRoleContribution(role: MuscleRole, contribution: MuscleContribution): boolean {
  if (role === "primary") return contribution === 1 || contribution === 0.75;
  if (role === "secondary") return contribution === 0.5 || contribution === 0.25;
  return contribution === 0;
}

export function validateMuscleMappingEntry(value: unknown): MuscleMappingEntry {
  if (!value || typeof value !== "object") throw new MuscleMappingValidationError("Mapping entry must be an object.");
  const entry = value as Record<string, unknown>;
  if (!isCanonicalMuscleId(entry.muscleId)) throw new MuscleMappingValidationError("Unknown canonical muscle ID.");
  if (!isMuscleRole(entry.role)) throw new MuscleMappingValidationError("Unknown muscle role.");
  if (!isMuscleContribution(entry.contribution)) throw new MuscleMappingValidationError("Contribution must be an approved discrete value.");
  if (!isValidRoleContribution(entry.role, entry.contribution)) throw new MuscleMappingValidationError("Role and contribution are incompatible.");
  if (!isMuscleSideScope(entry.sideScope)) throw new MuscleMappingValidationError("Unknown side scope.");
  if (!Number.isSafeInteger(entry.sortOrder) || (entry.sortOrder as number) <= 0) throw new MuscleMappingValidationError("Sort order must be a positive integer.");
  return {
    muscleId: entry.muscleId,
    role: entry.role,
    contribution: entry.contribution,
    sideScope: entry.sideScope,
    sortOrder: entry.sortOrder as number
  };
}

export function sortMuscleMappingEntries(entries: readonly MuscleMappingEntry[]): MuscleMappingEntry[] {
  return [...entries].sort((left, right) => {
    const displayOrder = getCanonicalMuscle(left.muscleId).displayOrder - getCanonicalMuscle(right.muscleId).displayOrder;
    return displayOrder || left.muscleId.localeCompare(right.muscleId);
  });
}

export function validateMuscleMappingEntries(
  values: readonly unknown[],
  options: { requirePrimary?: boolean } = {}
): MuscleMappingEntry[] {
  if (!Array.isArray(values)) throw new MuscleMappingValidationError("Mapping entries must be an array.");
  const entries = values.map(validateMuscleMappingEntry);
  const muscleIds = new Set<CanonicalMuscleId>();
  const sortOrders = new Set<number>();
  for (const entry of entries) {
    if (muscleIds.has(entry.muscleId)) throw new MuscleMappingValidationError(`Duplicate muscle: ${entry.muscleId}.`);
    if (sortOrders.has(entry.sortOrder)) throw new MuscleMappingValidationError(`Duplicate sort order: ${entry.sortOrder}.`);
    muscleIds.add(entry.muscleId);
    sortOrders.add(entry.sortOrder);
  }
  if (options.requirePrimary && !entries.some((entry) => entry.role === "primary")) {
    throw new MuscleMappingValidationError("A published mapping requires at least one primary muscle.");
  }
  return sortMuscleMappingEntries(entries);
}
