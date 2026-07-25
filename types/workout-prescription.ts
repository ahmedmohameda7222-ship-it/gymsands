export type PlannedPrescriptionScalar = string | number | boolean | null;
export type PlannedPrescriptionValue =
  | PlannedPrescriptionScalar
  | readonly PlannedPrescriptionValue[]
  | { readonly [key: string]: PlannedPrescriptionValue };

export type WorkoutPrescriptionSetType =
  | "warmup"
  | "working"
  | "normal"
  | "failure"
  | "drop"
  | "backoff"
  | "amrap"
  | "timed"
  | "other";

export type WorkoutPrescriptionSetTargetMode =
  | "exact"
  | "range"
  | "minimum"
  | "maximum"
  | "amrap"
  | "timed"
  | "distance"
  | "rounds"
  | "mixed"
  | "custom";

export type WorkoutPrescriptionMetricTargetMode = Exclude<WorkoutPrescriptionSetTargetMode, "mixed">;
export type WorkoutPrescriptionSide = "none" | "bilateral" | "left" | "right";
export type WorkoutPrescriptionSideMode = WorkoutPrescriptionSide | "alternating";
export type WorkoutPrescriptionNormalizationStatus = "complete" | "partial" | "unavailable";

export type PlannedPrescriptionMetricTargetDescriptor = {
  metric_key: string;
  metric_version: number;
  side?: WorkoutPrescriptionSide;
  target_mode: WorkoutPrescriptionMetricTargetMode;
  target_value?: number | string | null;
  minimum_value?: number | string | null;
  maximum_value?: number | string | null;
};

export type PlannedPrescriptionSetDescriptor = {
  set_order: number;
  performed_order_hint?: number | null;
  set_type?: WorkoutPrescriptionSetType;
  side_mode?: WorkoutPrescriptionSideMode;
  rest_seconds?: number | string | null;
  tempo?: string | null;
  targets?: PlannedPrescriptionMetricTargetDescriptor[];
};

export type PlannedActivityPrescription = {
  sets?: number | string;
  reps?: number | string;
  rest_seconds?: number | string;
  /** Released direct-workout compatibility alias. New callers use rest_seconds. */
  restSeconds?: number | string;
  tempo?: string;
  set_type?: WorkoutPrescriptionSetType;
  side_mode?: WorkoutPrescriptionSideMode;
  set_targets?: PlannedPrescriptionSetDescriptor[];
  duration_seconds?: number | string;
  durationSeconds?: number | string;
  distance_meters?: number | string;
  distanceMeters?: number | string;
  rounds?: number | string;
  external_load_kg?: number | string;
  externalLoadKg?: number | string;
  bodyweight_kg?: number | string;
  bodyweightKg?: number | string;
  assistance_load_kg?: number | string;
  assistanceLoadKg?: number | string;
  readonly [compatibilityKey: string]:
    | PlannedPrescriptionValue
    | PlannedPrescriptionSetDescriptor[]
    | undefined;
};

export type FrozenWorkoutPrescriptionMetricTarget = {
  id: string;
  prescriptionSetId: string;
  snapshotItemId: string;
  workoutSessionId: string;
  userId: string;
  metricKey: string;
  metricVersion: number;
  side: WorkoutPrescriptionSide;
  targetValue: number | null;
  minimumValue: number | null;
  maximumValue: number | null;
  targetMode: WorkoutPrescriptionMetricTargetMode;
  createdAt: string;
};

export type FrozenWorkoutPrescriptionSet = {
  id: string;
  snapshotItemId: string;
  snapshotId: string;
  workoutSessionId: string;
  userId: string;
  setOrder: number;
  performedOrderHint: number | null;
  setType: WorkoutPrescriptionSetType;
  targetMode: WorkoutPrescriptionSetTargetMode;
  sideMode: WorkoutPrescriptionSideMode;
  restSeconds: number | null;
  tempoTarget: string | null;
  schemaVersion: 1;
  createdAt: string;
  targets: FrozenWorkoutPrescriptionMetricTarget[];
};

export type WorkoutSessionPrescriptionItem = {
  snapshotId: string;
  id: string;
  workoutSessionId: string;
  userId: string;
  itemOrder: number;
  sourcePlanExerciseId: string | null;
  sourcePlanActivityId: string | null;
  activityName: string;
  rawCompatibilityPrescription: PlannedActivityPrescription;
  plannedSets: number | null;
  normalizationStatus: WorkoutPrescriptionNormalizationStatus;
  prescriptionSets: FrozenWorkoutPrescriptionSet[];
};
