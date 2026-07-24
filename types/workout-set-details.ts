import type {
  WorkoutPerformanceMetricInput,
  WorkoutPerformanceMetricSource,
  WorkoutPerformanceMetricSqlInput,
} from "./workout-performance";

export type WorkoutSetType =
  | "warmup"
  | "working"
  | "normal"
  | "failure"
  | "drop"
  | "backoff"
  | "amrap"
  | "timed"
  | "other";

export type WorkoutSetSideMode =
  "none" | "bilateral" | "left" | "right" | "alternating";

export type WorkoutSetTempoAdherence =
  "not_recorded" | "adhered" | "adjusted" | "missed";

export type WorkoutSetSegmentKind = "primary" | "drop" | "rest_pause" | "other";

export type WorkoutSetRuntimeSource = Exclude<
  WorkoutPerformanceMetricSource,
  "backfill"
>;

export type WorkoutSetPerformanceMetricInput = Omit<
  WorkoutPerformanceMetricInput,
  "source"
> & {
  source?: WorkoutSetRuntimeSource;
};

export type WorkoutSetPerformanceMetricSqlInput = Omit<
  WorkoutPerformanceMetricSqlInput,
  "source"
> & {
  source: WorkoutSetRuntimeSource;
};

export type WorkoutSetDetailsInput = {
  schemaVersion?: 1;
  setType: WorkoutSetType;
  rpe?: number | null;
  rir?: number | null;
  notes?: string | null;
  sideMode?: WorkoutSetSideMode;
  plannedTempo?: string | null;
  performedTempo?: string | null;
  tempoAdherence?: WorkoutSetTempoAdherence;
  source?: WorkoutSetRuntimeSource;
  sourceProvider?: string | null;
  sourceVersion?: string | null;
};

export type WorkoutSetSegmentInput = {
  segmentOrder: number;
  segmentKind: WorkoutSetSegmentKind;
  side?: WorkoutSetSideMode;
  completedAt?: string | null;
  source?: WorkoutSetRuntimeSource;
  sourceProvider?: string | null;
  sourceVersion?: string | null;
  performanceMetrics?: WorkoutSetPerformanceMetricInput[];
};

export type WorkoutSetDetailsSqlInput = {
  schema_version: 1;
  set_type: WorkoutSetType;
  rpe: number | null;
  rir: number | null;
  notes: string | null;
  side_mode: WorkoutSetSideMode;
  planned_tempo: string | null;
  performed_tempo: string | null;
  tempo_adherence: WorkoutSetTempoAdherence;
  source: WorkoutSetRuntimeSource;
  source_provider: string | null;
  source_version: string | null;
};

export type WorkoutSetSegmentSqlInput = {
  segment_order: number;
  segment_kind: WorkoutSetSegmentKind;
  side: WorkoutSetSideMode;
  completed_at: string | null;
  source: WorkoutSetRuntimeSource;
  source_provider: string | null;
  source_version: string | null;
  performance_metrics: WorkoutSetPerformanceMetricSqlInput[];
};

export type WorkoutSetDetailsRow = {
  exercise_log_id: string;
  workout_session_id: string;
  user_id: string;
  schema_version: number;
  set_type: WorkoutSetType;
  rpe: number | string | null;
  rir: number | string | null;
  notes: string | null;
  side_mode: WorkoutSetSideMode;
  planned_tempo: string | null;
  performed_tempo: string | null;
  tempo_adherence: WorkoutSetTempoAdherence;
  source: WorkoutPerformanceMetricSource;
  source_provider: string | null;
  source_version: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutSetSegmentMetricValueRow = {
  id: string;
  segment_id: string;
  exercise_log_id: string;
  workout_session_id: string;
  user_id: string;
  metric_key: string;
  metric_version: number;
  side: "none" | "bilateral" | "left" | "right";
  value: number | string;
  source: WorkoutPerformanceMetricSource;
  source_provider: string | null;
  source_version: string | null;
  captured_at: string;
  created_at: string;
  updated_at: string;
};

export type WorkoutSetSegmentRow = {
  id: string;
  exercise_log_id: string;
  workout_session_id: string;
  user_id: string;
  segment_order: number;
  segment_kind: WorkoutSetSegmentKind;
  side: WorkoutSetSideMode;
  completed_at: string | null;
  source: WorkoutPerformanceMetricSource;
  source_provider: string | null;
  source_version: string | null;
  created_at: string;
  updated_at: string;
  metric_values?: WorkoutSetSegmentMetricValueRow[];
};
