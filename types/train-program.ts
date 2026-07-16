import type {
  ActivityEquipment,
  ActivitySessionPhase,
  ActivitySessionType,
  InstructionStep,
  MetricSchema,
  Sport,
  TrainingActivity
} from "@/lib/activity-catalog/types";

export type PlannedPrescriptionValue = string | number | boolean;
export type PlannedActivityPrescription = Record<string, PlannedPrescriptionValue>;
export type TrainingProgramSource = "manual" | "chatgpt" | "imported" | "legacy_backfill";
export type PlannedActivityCatalogSource = "external" | "legacy" | "custom" | "manual";

export type CatalogActivityIdentity = {
  id: string | null;
  slug: string | null;
  version: string | null;
  source: PlannedActivityCatalogSource;
};

export type SavedActivitySnapshots = {
  name: string;
  shortDescription: string | null;
  activityTypeSlug: string | null;
  activityTypeName: string | null;
  instructions: InstructionStep[] | null;
  metricSchema: MetricSchema | null;
  equipment: Array<ActivityEquipment | string> | Record<string, unknown> | null;
  taxonomy: Record<string, unknown> | null;
};

export type PlannedTrainingActivity = {
  id: string;
  planPhaseId: string;
  sourceLegacyPlanExerciseId: string | null;
  legacySourceWorkoutId: string | null;
  catalog: CatalogActivityIdentity;
  snapshots: SavedActivitySnapshots;
  plannedPrescription: PlannedActivityPrescription;
  sortOrder: number;
  notes: string | null;
};

export type TrainingProgramPhase = {
  id: string;
  planSessionId: string;
  phaseSlug: ActivitySessionPhase["slug"] | string;
  phaseNameSnapshot: string;
  isOptional: boolean;
  sourceLegacyBlockType: string | null;
  sortOrder: number;
  notes: string | null;
  activities: PlannedTrainingActivity[];
};

export type TrainingProgramSession = {
  id: string;
  weekTemplateId: string;
  sourceLegacyPlanDayId: string | null;
  source: TrainingProgramSource;
  title: string;
  dayOffset: number;
  weekday: string | null;
  sportSlug: Sport["slug"] | null;
  sportNameSnapshot: string;
  sessionTypeSlug: ActivitySessionType["slug"] | null;
  sessionTypeNameSnapshot: string | null;
  durationMinutes: number | null;
  sortOrder: number;
  notes: string | null;
  phases: TrainingProgramPhase[];
};

export type TrainingProgramWeekTemplate = {
  id: string;
  planId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  source: TrainingProgramSource;
  derivedFromTemplateId: string | null;
  sessions: TrainingProgramSession[];
};

export type TrainingProgramWeek = {
  id: string;
  planId: string;
  weekTemplateId: string;
  weekNumber: number;
  nameOverride: string | null;
  notes: string | null;
  isDetached: boolean;
};

export type TrainingProgram = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  weeks: TrainingProgramWeek[];
  weekTemplates: TrainingProgramWeekTemplate[];
};

/**
 * Phase 2A stores catalog identity, immutable saved snapshots, and planned
 * prescription separately. Performed results intentionally remain outside this
 * model until a later approved execution phase.
 */
export type TrainingProgramCatalogContracts = {
  activity: TrainingActivity;
  metricSchema: MetricSchema;
  sport: Sport;
  sessionType: ActivitySessionType;
  sessionPhase: ActivitySessionPhase;
};

export type {
  ActivitySessionPhase,
  ActivitySessionType,
  MetricSchema,
  Sport,
  TrainingActivity
};
