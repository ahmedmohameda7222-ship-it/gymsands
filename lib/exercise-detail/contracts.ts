import type {
  CatalogAuthoritySnapshot,
  CatalogSchemaField,
  LibraryCoverage,
  LibraryHeatMap,
  LibraryRecordDefinition
} from "@/lib/activity-catalog/library-types";
import type { CanonicalExerciseIdentity } from "./identity";

export type ExerciseDetailSource = "catalog_v2" | "catalog_legacy" | "custom";
export type ExerciseTargetRole = "primary" | "secondary" | "stabilizer" | "focus";

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

export type ExerciseEquipmentView = {
  slug: string | null;
  name: string;
  requirement: string | null;
};

export type ExerciseTrackingSchema = {
  key: string;
  version: number;
  fields: CatalogSchemaField[];
};

export type ExerciseExecutionCapability = {
  executable: boolean;
  contract: "strength_reps_weight_v1" | null;
  reason: "supported" | "unsupported_execution_contract" | "missing_prescription" | "unsupported_metrics";
  startHref: string | null;
};

export type ExerciseAnatomyAuthority = {
  source: "catalog_v2" | "legacy_registry" | "text_only";
  coverage: LibraryCoverage[];
  heatMap: LibraryHeatMap | null;
};

export type ExerciseFormAuthority = {
  setup: string[];
  techniqueCues: string[];
  commonMistakes: string[];
  safety: string[];
};

export type ExerciseDetailViewModel = {
  identity: {
    activityId: string;
    revisionId: string | null;
    revisionNumber: number | null;
    slug: string | null;
    domain: string;
    source: ExerciseDetailSource;
    performance: CanonicalExerciseIdentity;
  };
  name: string;
  shortDescription: string | null;
  activityType: string | null;
  difficulty: string | null;
  movementPattern: string | null;
  mechanics: string | null;
  forceType: string | null;
  equipment: ExerciseEquipmentView[];
  instructions: Array<{ order: number; text: string }>;
  instructionProse: string | null;
  guideUrl: string | null;
  sourceVideoUrl: string | null;
  target: {
    kind: "muscle" | "focus" | "none";
    primary: string[];
    secondary: string[];
    stabilizer: string[];
    focus: string[];
    anatomyAvailable: boolean;
  };
  anatomyAuthority: ExerciseAnatomyAuthority;
  formAuthority: ExerciseFormAuthority;
  prescription: {
    key: string;
    version: number;
    fields: ExercisePrescriptionField[];
  } | null;
  performedMetricSchema: ExerciseTrackingSchema | null;
  recordDefinitions: LibraryRecordDefinition[];
  catalogAuthoritySnapshot: CatalogAuthoritySnapshot | null;
  execution: ExerciseExecutionCapability;
};

export type PlanExerciseDetailViewModel = {
  planExerciseId: string;
  planId: string;
  planName: string;
  dayId: string;
  dayName: string;
  name: string;
  sourceWorkoutId: string | null;
  performanceIdentity: CanonicalExerciseIdentity | null;
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
