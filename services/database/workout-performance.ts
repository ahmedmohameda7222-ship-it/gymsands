import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/utils";
import type {
  SavedWorkoutPerformanceMetricValue,
  WorkoutPerformanceCanonicalUnit,
  WorkoutPerformanceMetricDefinition,
  WorkoutPerformanceMetricInput,
  WorkoutPerformanceMetricKey,
  WorkoutPerformanceMetricSide,
  WorkoutPerformanceMetricSource,
  WorkoutPerformanceMetricSqlInput,
  WorkoutPerformanceSessionResult,
  WorkoutPerformanceSetResult,
  WorkoutPerformanceValueKind
} from "@/types/workout-performance";

type DefinitionSeed = Omit<WorkoutPerformanceMetricDefinition, "createdAt">;

export const CURRENT_WORKOUT_PERFORMANCE_METRIC_DEFINITIONS: readonly DefinitionSeed[] = [
  { metricKey: "repetitions", metricVersion: 1, valueKind: "integer", canonicalUnit: "count", minimumValue: 0, maximumValue: 100000, supportsSide: true, sortOrder: 10, isCurrent: true },
  { metricKey: "external_load_kg", metricVersion: 1, valueKind: "decimal", canonicalUnit: "kg", minimumValue: 0, maximumValue: 10000, supportsSide: true, sortOrder: 20, isCurrent: true },
  { metricKey: "bodyweight_kg", metricVersion: 1, valueKind: "decimal", canonicalUnit: "kg", minimumValue: 0, maximumValue: 1000, supportsSide: false, sortOrder: 30, isCurrent: true },
  { metricKey: "assistance_load_kg", metricVersion: 1, valueKind: "decimal", canonicalUnit: "kg", minimumValue: 0, maximumValue: 1000, supportsSide: true, sortOrder: 40, isCurrent: true },
  { metricKey: "duration_seconds", metricVersion: 1, valueKind: "decimal", canonicalUnit: "seconds", minimumValue: 0, maximumValue: 604800, supportsSide: true, sortOrder: 50, isCurrent: true },
  { metricKey: "distance_meters", metricVersion: 1, valueKind: "decimal", canonicalUnit: "meters", minimumValue: 0, maximumValue: 10000000, supportsSide: true, sortOrder: 60, isCurrent: true },
  { metricKey: "rounds", metricVersion: 1, valueKind: "integer", canonicalUnit: "count", minimumValue: 0, maximumValue: 100000, supportsSide: false, sortOrder: 70, isCurrent: true }
] as const;

const metricDefinitionByIdentity = new Map(
  CURRENT_WORKOUT_PERFORMANCE_METRIC_DEFINITIONS.map((definition) => [
    `${definition.metricKey}:${definition.metricVersion}`,
    definition
  ])
);

const metricKeys = new Set<WorkoutPerformanceMetricKey>(
  CURRENT_WORKOUT_PERFORMANCE_METRIC_DEFINITIONS.map((definition) => definition.metricKey)
);
const metricSides = new Set<WorkoutPerformanceMetricSide>(["none", "bilateral", "left", "right"]);
const metricSources = new Set<WorkoutPerformanceMetricSource>(["manual", "chatgpt", "device", "import", "backfill"]);
const providerPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function isWorkoutPerformanceMetricKey(value: unknown): value is WorkoutPerformanceMetricKey {
  return typeof value === "string" && metricKeys.has(value as WorkoutPerformanceMetricKey);
}

export function isWorkoutPerformanceMetricSide(value: unknown): value is WorkoutPerformanceMetricSide {
  return typeof value === "string" && metricSides.has(value as WorkoutPerformanceMetricSide);
}

export function isWorkoutPerformanceMetricSource(value: unknown): value is WorkoutPerformanceMetricSource {
  return typeof value === "string" && metricSources.has(value as WorkoutPerformanceMetricSource);
}

function normalizeOptionalMachineValue(value: string | null | undefined, pattern: RegExp, label: string) {
  if (value === undefined || value === null || value === "") return null;
  if (!pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

export function normalizeWorkoutPerformanceMetricInput(
  input: WorkoutPerformanceMetricInput,
  defaults?: {
    source?: WorkoutPerformanceMetricSource;
    sourceProvider?: string | null;
    sourceVersion?: string | null;
  }
): Required<Pick<WorkoutPerformanceMetricInput, "metricKey" | "metricVersion" | "value" | "side" | "source">> &
  Pick<WorkoutPerformanceMetricInput, "sourceProvider" | "sourceVersion" | "capturedAt"> {
  const metricVersion = input.metricVersion ?? 1;
  const side = input.side ?? "none";
  const source = input.source ?? defaults?.source ?? "manual";
  const definition = metricDefinitionByIdentity.get(`${input.metricKey}:${metricVersion}`);

  if (!definition) throw new Error("Workout performance metric definition is unsupported.");
  if (!Number.isFinite(input.value)) throw new Error("Workout performance metric value must be finite.");
  if (input.value < definition.minimumValue || input.value > definition.maximumValue) {
    throw new Error("Workout performance metric value is outside the approved range.");
  }
  if (definition.valueKind === "integer" && !Number.isInteger(input.value)) {
    throw new Error("Workout performance metric requires an integer value.");
  }
  if (!isWorkoutPerformanceMetricSide(side)) throw new Error("Workout performance metric side is invalid.");
  if (!definition.supportsSide && side !== "none") {
    throw new Error("Workout performance metric does not support a side.");
  }
  if (!isWorkoutPerformanceMetricSource(source)) throw new Error("Workout performance metric source is invalid.");

  const sourceProvider = normalizeOptionalMachineValue(
    input.sourceProvider ?? defaults?.sourceProvider,
    providerPattern,
    "Workout performance metric source provider"
  );
  const sourceVersion = normalizeOptionalMachineValue(
    input.sourceVersion ?? defaults?.sourceVersion,
    versionPattern,
    "Workout performance metric source version"
  );
  if ((source === "device" || source === "import") && !sourceProvider) {
    throw new Error("Device and import metrics require a source provider.");
  }

  const capturedAt = input.capturedAt ?? null;
  if (capturedAt !== null) {
    const timestamp = Date.parse(capturedAt);
    if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60 * 1000) {
      throw new Error("Workout performance metric capture time is invalid.");
    }
  }

  return {
    metricKey: input.metricKey,
    metricVersion,
    value: input.value,
    side,
    source,
    sourceProvider,
    sourceVersion,
    capturedAt
  };
}

export function workoutPerformanceMetricInputToSql(
  input: WorkoutPerformanceMetricInput,
  defaults?: {
    source?: WorkoutPerformanceMetricSource;
    sourceProvider?: string | null;
    sourceVersion?: string | null;
  }
): WorkoutPerformanceMetricSqlInput {
  const normalized = normalizeWorkoutPerformanceMetricInput(input, defaults);
  return {
    metric_key: normalized.metricKey,
    metric_version: normalized.metricVersion,
    value: normalized.value,
    side: normalized.side,
    source: normalized.source,
    source_provider: normalized.sourceProvider ?? null,
    source_version: normalized.sourceVersion ?? null,
    captured_at: normalized.capturedAt ?? null
  };
}

type DefinitionRow = {
  metric_key: string;
  metric_version: number;
  value_kind: string;
  canonical_unit: string;
  minimum_value: number | string;
  maximum_value: number | string;
  supports_side: boolean;
  sort_order: number;
  is_current: boolean;
  created_at: string;
};

function mapDefinition(row: DefinitionRow): WorkoutPerformanceMetricDefinition {
  if (!isWorkoutPerformanceMetricKey(row.metric_key)) throw new Error("Workout performance metric definition is invalid.");
  return {
    metricKey: row.metric_key,
    metricVersion: Number(row.metric_version),
    valueKind: row.value_kind as WorkoutPerformanceValueKind,
    canonicalUnit: row.canonical_unit as WorkoutPerformanceCanonicalUnit,
    minimumValue: Number(row.minimum_value),
    maximumValue: Number(row.maximum_value),
    supportsSide: Boolean(row.supports_side),
    sortOrder: Number(row.sort_order),
    isCurrent: Boolean(row.is_current),
    createdAt: row.created_at
  };
}

export async function getCurrentWorkoutPerformanceMetricDefinitions(
  supabase: SupabaseClient
): Promise<WorkoutPerformanceMetricDefinition[]> {
  const { data, error } = await supabase
    .from("workout_performance_metric_definitions")
    .select("metric_key,metric_version,value_kind,canonical_unit,minimum_value,maximum_value,supports_side,sort_order,is_current,created_at")
    .eq("is_current", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("Workout performance metric definitions could not be loaded.");
  return ((data ?? []) as DefinitionRow[]).map(mapDefinition);
}

type MetricValueRow = {
  id: string;
  exercise_log_id: string;
  workout_session_id: string;
  user_id: string;
  metric_key: string;
  metric_version: number;
  side: string;
  value: number | string;
  source: string;
  source_provider: string | null;
  source_version: string | null;
  captured_at: string;
  created_at: string;
  updated_at: string;
  workout_performance_metric_definitions?: { canonical_unit?: string; sort_order?: number } | Array<{ canonical_unit?: string; sort_order?: number }> | null;
  exercise_logs?: { exercise_order?: number | null; exercise_name?: string; set_number?: number } | Array<{ exercise_order?: number | null; exercise_name?: string; set_number?: number }> | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapMetricValue(row: MetricValueRow): SavedWorkoutPerformanceMetricValue {
  if (!isWorkoutPerformanceMetricKey(row.metric_key) || !isWorkoutPerformanceMetricSide(row.side) || !isWorkoutPerformanceMetricSource(row.source)) {
    throw new Error("Workout performance metric data is invalid.");
  }
  const definition = firstRelation(row.workout_performance_metric_definitions);
  return {
    id: row.id,
    exerciseLogId: row.exercise_log_id,
    workoutSessionId: row.workout_session_id,
    userId: row.user_id,
    metricKey: row.metric_key,
    metricVersion: Number(row.metric_version),
    canonicalUnit: (definition?.canonical_unit ?? metricDefinitionByIdentity.get(`${row.metric_key}:${row.metric_version}`)?.canonicalUnit) as WorkoutPerformanceCanonicalUnit,
    value: Number(row.value),
    side: row.side,
    source: row.source,
    sourceProvider: row.source_provider,
    sourceVersion: row.source_version,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function compareSides(a: WorkoutPerformanceMetricSide, b: WorkoutPerformanceMetricSide) {
  const order: Record<WorkoutPerformanceMetricSide, number> = { none: 0, bilateral: 1, left: 2, right: 3 };
  return order[a] - order[b];
}

function safeUuid(value: string, label: string) {
  if (!isUuid(value)) throw new Error(`${label} is invalid.`);
}

async function readMetricRows(
  supabase: SupabaseClient,
  userId: string,
  filters: { workoutSessionId?: string; exerciseLogId?: string }
): Promise<MetricValueRow[]> {
  safeUuid(userId, "User");
  if (filters.workoutSessionId) safeUuid(filters.workoutSessionId, "Workout session");
  if (filters.exerciseLogId) safeUuid(filters.exerciseLogId, "Exercise log");

  let query = supabase
    .from("exercise_log_metric_values")
    .select("id,exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,source,source_provider,source_version,captured_at,created_at,updated_at,workout_performance_metric_definitions!inner(canonical_unit,sort_order),exercise_logs!inner(exercise_order,exercise_name,set_number)")
    .eq("user_id", userId)
    .limit(8000);
  if (filters.workoutSessionId) query = query.eq("workout_session_id", filters.workoutSessionId);
  if (filters.exerciseLogId) query = query.eq("exercise_log_id", filters.exerciseLogId);
  const { data, error } = await query;
  if (error) throw new Error("Workout performance metrics could not be loaded.");
  return (data ?? []) as unknown as MetricValueRow[];
}

export async function getExerciseLogPerformanceMetrics(
  supabase: SupabaseClient,
  userId: string,
  exerciseLogId: string
): Promise<SavedWorkoutPerformanceMetricValue[]> {
  const rows = await readMetricRows(supabase, userId, { exerciseLogId });
  return rows
    .map(mapMetricValue)
    .sort((a, b) => {
      const definitionA = metricDefinitionByIdentity.get(`${a.metricKey}:${a.metricVersion}`);
      const definitionB = metricDefinitionByIdentity.get(`${b.metricKey}:${b.metricVersion}`);
      return (definitionA?.sortOrder ?? 9999) - (definitionB?.sortOrder ?? 9999)
        || compareSides(a.side, b.side)
        || a.id.localeCompare(b.id);
    });
}

export async function getWorkoutSessionPerformance(
  supabase: SupabaseClient,
  userId: string,
  workoutSessionId: string
): Promise<WorkoutPerformanceSessionResult> {
  const rows = await readMetricRows(supabase, userId, { workoutSessionId });
  const grouped = new Map<string, WorkoutPerformanceSetResult>();

  const sortedRows = [...rows].sort((a, b) => {
    const logA = firstRelation(a.exercise_logs);
    const logB = firstRelation(b.exercise_logs);
    const definitionA = firstRelation(a.workout_performance_metric_definitions);
    const definitionB = firstRelation(b.workout_performance_metric_definitions);
    return Number(logA?.exercise_order ?? Number.MAX_SAFE_INTEGER) - Number(logB?.exercise_order ?? Number.MAX_SAFE_INTEGER)
      || Number(logA?.set_number ?? 0) - Number(logB?.set_number ?? 0)
      || Number(definitionA?.sort_order ?? 9999) - Number(definitionB?.sort_order ?? 9999)
      || compareSides(a.side as WorkoutPerformanceMetricSide, b.side as WorkoutPerformanceMetricSide)
      || a.id.localeCompare(b.id);
  });

  for (const row of sortedRows) {
    const log = firstRelation(row.exercise_logs);
    let set = grouped.get(row.exercise_log_id);
    if (!set) {
      set = {
        exerciseLogId: row.exercise_log_id,
        exerciseOrder: log?.exercise_order ?? null,
        exerciseName: log?.exercise_name ?? "",
        setNumber: Number(log?.set_number ?? 0),
        metrics: []
      };
      grouped.set(row.exercise_log_id, set);
    }
    set.metrics.push(mapMetricValue(row));
  }

  return { workoutSessionId, sets: [...grouped.values()] };
}
