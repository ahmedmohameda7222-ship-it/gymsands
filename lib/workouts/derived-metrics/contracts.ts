import type {
  WorkoutPerformanceMetricKey,
  WorkoutSetType,
} from "@/types";

export const DERIVED_METRICS_SCHEMA_VERSION = 1 as const;
export const DERIVED_METRICS_FORMULA_VERSION = "aw8-v1" as const;

export type DerivedMetricValue = {
  metricKey?: WorkoutPerformanceMetricKey | string;
  metric_key?: WorkoutPerformanceMetricKey | string;
  value: number | string;
  side?: string | null;
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
  setNumber?: number | null;
  set_number?: number | null;
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
  | "session_volume"
  | "max_repetitions";

export type DerivedPersonalRecord = {
  exerciseIdentity: string;
  exerciseName: string;
  type: DerivedPersonalRecordType;
  value: number;
  externalLoadKg: number | null;
  repetitions: number | null;
  setType: string;
  comparableContext: string;
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
