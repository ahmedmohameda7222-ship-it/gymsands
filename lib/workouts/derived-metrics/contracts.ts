import type {
  WorkoutPerformanceMetricKey,
  WorkoutSetType,
} from "@/types";

export const DERIVED_METRICS_SCHEMA_VERSION = 1 as const;
export const DERIVED_METRICS_FORMULA_VERSION = "wh6-v1" as const;
export const DERIVED_RECORD_EVENT_SEMANTICS_VERSION = "wh6-session-volume-latest-set-v2" as const;

export type DerivedMetricValue = {
  metricKey?: WorkoutPerformanceMetricKey | string;
  metric_key?: WorkoutPerformanceMetricKey | string;
  value: number | string;
  side?: string | null;
  unit?: "kg" | "lb" | string | null;
};

export type DerivedMetricSegment = {
  metricValues?: readonly DerivedMetricValue[] | null;
};

export type DerivedMetricSetDetails = {
  setType?: WorkoutSetType | string | null;
  set_type?: WorkoutSetType | string | null;
  rpe?: number | string | null;
  rir?: number | string | null;
};

export type DerivedMetricLog = {
  id?: string | null;
  workoutSessionId?: string | null;
  workout_session_id?: string | null;
  exerciseName?: string | null;
  exercise_name?: string | null;
  planActivityId?: string | null;
  plan_activity_id?: string | null;
  planExerciseId?: string | null;
  plan_exercise_id?: string | null;
  sourceWorkoutId?: string | null;
  source_workout_id?: string | null;
  actualExerciseIdentityKind?: "global" | "custom" | "provider" | null;
  actualExerciseIdentity?: string | null;
  plannedExerciseIdentityKind?: "global" | "custom" | "provider" | null;
  plannedExerciseIdentity?: string | null;
  resistanceMode?: "external" | "bodyweight" | "bodyweight_added" | "assisted" | null;
  weightUnit?: "kg" | "lb" | null;
  setNumber?: number | null;
  set_number?: number | null;
  exerciseOrder?: number | null;
  exercise_order?: number | null;
  reps?: number | string | null;
  weightKg?: number | string | null;
  weight_kg?: number | string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  draft?: boolean | null;
  performanceMetrics?: readonly DerivedMetricValue[] | null;
  performance_metrics?: readonly DerivedMetricValue[] | null;
  segments?: readonly (
    | DerivedMetricSegment
    | {
        metric_values?: readonly DerivedMetricValue[] | null;
      }
  )[] | null;
  setDetails?: DerivedMetricSetDetails | null;
  set_details?: DerivedMetricSetDetails | null;
  setType?: WorkoutSetType | string | null;
  set_type?: WorkoutSetType | string | null;
  rpe?: number | string | null;
  rir?: number | string | null;
};

export type DerivedPersonalRecordType =
  | "highest_load"
  | "estimated_one_rep_max"
  | "exercise_session_volume"
  | "same_load_max_repetitions";

export type DerivedExerciseIdentityKind =
  | "global"
  | "custom"
  | "provider"
  | "plan_activity"
  | "plan_exercise"
  | "source_workout"
  | "name_degraded";

export type DerivedPersonalRecord = {
  workoutSessionId: string;
  exerciseLogId: string;
  exerciseIdentityKind: DerivedExerciseIdentityKind;
  exerciseIdentity: string;
  exerciseName: string;
  recordType: DerivedPersonalRecordType;
  recordValue: number;
  recordUnit: "kg" | "repetitions" | "kg_repetitions";
  externalLoadKg: number | null;
  repetitions: number | null;
  setType: string;
  comparisonContextKey: string;
  schemaVersion: typeof DERIVED_METRICS_SCHEMA_VERSION;
  formulaVersion: typeof DERIVED_METRICS_FORMULA_VERSION;
  eventSemanticsVersion: typeof DERIVED_RECORD_EVENT_SEMANTICS_VERSION;
  achievedAt: string;
};

export type DerivedExerciseMetrics = {
  exerciseIdentity: string;
  exerciseName: string;
  completedSetCount: number;
  externalLoadVolume: number;
  averageRpe: number | null;
  rpeCount: number;
  averageRir: number | null;
  rirCount: number;
  setTypeDistribution: Record<string, number>;
  durationSeconds: number;
  distanceMeters: number;
  rounds: number;
  paceSecondsPerMeter: number | null;
  heaviestExternalLoadKg: number | null;
  maxRepetitions: number | null;
  bestEstimatedOneRepMaxKg: number | null;
  performanceChangePercent: number | null;
};

export type DerivedSessionMetrics = {
  schemaVersion: typeof DERIVED_METRICS_SCHEMA_VERSION;
  formulaVersion: typeof DERIVED_METRICS_FORMULA_VERSION;
  completedSetCount: number;
  completedExerciseCount: number;
  externalLoadVolume: number;
  averageRpe: number | null;
  rpeCount: number;
  averageRir: number | null;
  rirCount: number;
  setTypeDistribution: Record<string, number>;
  durationSeconds: number;
  distanceMeters: number;
  rounds: number;
  paceSecondsPerMeter: number | null;
  eligiblePersonalRecordCount: number;
  personalRecords: DerivedPersonalRecord[];
  highlights: string[];
  exercises: DerivedExerciseMetrics[];
};
