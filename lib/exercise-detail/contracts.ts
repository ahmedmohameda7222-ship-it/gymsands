import type { CatalogAuthoritySnapshot } from "@/lib/activity-catalog/library-types";

export type ExerciseDetailSource = "catalog_v2" | "catalog_legacy" | "custom";

export type ExercisePrescriptionField = {
  key: string;
  label: string;
  type: "integer" | "number" | "text" | "boolean";
  unit: string | null;
  required: boolean;
  minimum: number | null;
  maximum: number | null;
  options: Array<{ value: string; label: string }>;
};

export type ExerciseDetailViewModel = {
  identity: {
    activityId: string;
    revisionId: string | null;
    revisionNumber: number | null;
    slug: string | null;
    domain: string;
    source: ExerciseDetailSource;
  };
  name: string;
  shortDescription: string | null;
  activityType: string | null;
  equipment: string[];
  difficulty: string | null;
  movementPattern: string | null;
  forceType: string | null;
  instructions: Array<{ order: number; text: string }>;
  instructionProse: string | null;
  guideUrl: string | null;
  sourceVideoUrl: string | null;
  target: {
    kind: "muscle" | "focus" | "none";
    primary: string[];
    secondary: string[];
    focus: string[];
    anatomyAvailable: boolean;
  };
  prescription: {
    key: string;
    version: number;
    fields: ExercisePrescriptionField[];
  } | null;
  performedMetricSchema: Record<string, unknown> | null;
  recordDefinitions: Array<Record<string, unknown>>;
  catalogAuthoritySnapshot: CatalogAuthoritySnapshot | null;
  startHref: string | null;
  stablePerformanceIdentity: string | null;
};

export type PlanExerciseDetailViewModel = {
  planExerciseId: string;
  planId: string;
  planName: string;
  dayId: string;
  dayName: string;
  name: string;
  sourceWorkoutId: string | null;
  canonicalHref: string | null;
  category: string | null;
  targetMuscle: string | null;
  secondaryMuscles: string[];
  equipment: string | null;
  instructions: string | null;
  prescription: Array<{ label: "sets" | "reps" | "rest"; value: string }>;
  note: string | null;
  guideUrl: string | null;
  customVideoUrl: string | null;
};

export type AddToPlanActivityPayload = {
  id: string;
  name: string;
  slug: string | null;
  revisionNumber: number | null;
  activityTypeSlug: string | null;
  activityTypeName: string | null;
  shortDescription: string | null;
  instructions: Array<{ order: number; text: string }>;
  targetText: string | null;
  equipmentText: string | null;
  prescriptionSchema: Record<string, unknown> | null;
  equipment: Array<Record<string, unknown>>;
  taxonomy: Record<string, unknown>;
  catalogAuthoritySnapshot: CatalogAuthoritySnapshot | null;
  catalogSource: "external" | "legacy" | "custom";
};
