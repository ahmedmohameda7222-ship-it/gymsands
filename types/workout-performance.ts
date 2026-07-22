export type WorkoutPerformanceMetricKey =
  | "repetitions"
  | "external_load_kg"
  | "bodyweight_kg"
  | "assistance_load_kg"
  | "duration_seconds"
  | "distance_meters"
  | "rounds";

export type WorkoutPerformanceMetricSide =
  | "none"
  | "bilateral"
  | "left"
  | "right";

export type WorkoutPerformanceMetricSource =
  | "manual"
  | "chatgpt"
  | "device"
  | "import"
  | "backfill";

export type WorkoutPerformanceValueKind = "integer" | "decimal";
export type WorkoutPerformanceCanonicalUnit = "count" | "kg" | "seconds" | "meters";

export type WorkoutPerformanceMetricDefinition = {
  metricKey: WorkoutPerformanceMetricKey;
  metricVersion: number;
  valueKind: WorkoutPerformanceValueKind;
  canonicalUnit: WorkoutPerformanceCanonicalUnit;
  minimumValue: number;
  maximumValue: number;
  supportsSide: boolean;
  sortOrder: number;
  isCurrent: boolean;
  createdAt: string;
};

export type WorkoutPerformanceMetricInput = {
  metricKey: WorkoutPerformanceMetricKey;
  metricVersion?: number;
  value: number;
  side?: WorkoutPerformanceMetricSide;
  source?: WorkoutPerformanceMetricSource;
  sourceProvider?: string | null;
  sourceVersion?: string | null;
  capturedAt?: string | null;
};

export type SavedWorkoutPerformanceMetricValue = {
  id: string;
  exerciseLogId: string;
  workoutSessionId: string;
  userId: string;
  metricKey: WorkoutPerformanceMetricKey;
  metricVersion: number;
  canonicalUnit: WorkoutPerformanceCanonicalUnit;
  value: number;
  side: WorkoutPerformanceMetricSide;
  source: WorkoutPerformanceMetricSource;
  sourceProvider: string | null;
  sourceVersion: string | null;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutPerformanceSetResult = {
  exerciseLogId: string;
  exerciseOrder: number | null;
  exerciseName: string;
  setNumber: number;
  metrics: SavedWorkoutPerformanceMetricValue[];
};

export type WorkoutPerformanceSessionResult = {
  workoutSessionId: string;
  sets: WorkoutPerformanceSetResult[];
};

export type WorkoutPerformanceMetricSqlInput = {
  metric_key: WorkoutPerformanceMetricKey;
  metric_version: number;
  value: number;
  side: WorkoutPerformanceMetricSide;
  source: WorkoutPerformanceMetricSource;
  source_provider: string | null;
  source_version: string | null;
  captured_at: string | null;
};
