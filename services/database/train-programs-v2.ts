"use client";

import type { MetricField, MetricSchema } from "@/lib/activity-catalog/types";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type {
  PlannedActivityPrescription,
  PlannedTrainingActivity,
  TrainingProgram,
  TrainingProgramPhase,
  TrainingProgramSession,
  TrainingProgramSource,
  TrainingProgramWeek,
  TrainingProgramWeekTemplate
} from "@/types/train-program";

const NON_NEGATIVE_KEY_PATTERN = /(?:^|_)(?:sets?|reps?|rounds?|duration|time|rest|distance|speed|pace|weight|load|resistance|heart_rate|bpm|power|watts?|calories?|energy|height|length|count|percent|percentage|rpe|rir)(?:_|$)/i;
const NON_NEGATIVE_UNIT_PATTERN = /^(?:ms|milliseconds?|s|sec|seconds?|min|minutes?|h|hours?|reps?|sets?|rounds?|kg|g|lb|lbs|pounds?|m|meter|meters|km|kilometers?|mi|miles?|m\/s|km\/h|mph|bpm|w|watts?|kcal|calories?|%|percent)$/i;

type JsonRecord = Record<string, unknown>;

type RawActivity = {
  id: string;
  plan_phase_id: string;
  source_legacy_plan_exercise_id: string | null;
  legacy_source_workout_id: string | null;
  catalog_activity_id: string | null;
  catalog_slug: string | null;
  catalog_version: string | null;
  catalog_source: PlannedTrainingActivity["catalog"]["source"];
  activity_name_snapshot: string;
  short_description_snapshot: string | null;
  activity_type_slug: string | null;
  activity_type_name_snapshot: string | null;
  instructions_snapshot: PlannedTrainingActivity["snapshots"]["instructions"];
  metric_schema_snapshot: MetricSchema | null;
  planned_prescription: unknown;
  equipment_snapshot: PlannedTrainingActivity["snapshots"]["equipment"];
  taxonomy_snapshot: JsonRecord | null;
  sort_order: number;
  notes: string | null;
  archived_at: string | null;
};

type RawPhase = {
  id: string;
  plan_session_id: string;
  phase_slug: string;
  phase_name_snapshot: string;
  is_optional: boolean;
  source_legacy_block_type: string | null;
  sort_order: number;
  notes: string | null;
  archived_at: string | null;
  user_workout_plan_activities?: RawActivity[] | null;
};

type RawSession = {
  id: string;
  week_template_id: string;
  source_legacy_plan_day_id: string | null;
  source: TrainingProgramSource;
  title: string;
  day_offset: number;
  weekday: string | null;
  sport_slug: string | null;
  sport_name_snapshot: string;
  session_type_slug: string | null;
  session_type_name_snapshot: string | null;
  duration_minutes: number | null;
  sort_order: number;
  notes: string | null;
  archived_at: string | null;
  user_workout_plan_phases?: RawPhase[] | null;
};

type RawTemplate = {
  id: string;
  plan_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  source: TrainingProgramSource;
  derived_from_template_id: string | null;
  archived_at: string | null;
  user_workout_plan_sessions?: RawSession[] | null;
};

type RawWeek = {
  id: string;
  plan_id: string;
  week_template_id: string;
  week_number: number;
  name_override: string | null;
  notes: string | null;
  is_detached: boolean;
  archived_at: string | null;
};

type RawProgram = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  user_workout_plan_weeks?: RawWeek[] | null;
  user_workout_plan_week_templates?: RawTemplate[] | null;
};

export type DetachTrainingProgramWeekResult = {
  plan_week_id: string;
  original_template_id: string;
  detached_template_id: string;
  clone_created: boolean;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericBoundary(field: MetricField, key: "minimum" | "min" | "maximum" | "max") {
  const value = field[key];
  return finiteNumber(value) ? value : null;
}

function schemaDisallowsNegative(field: MetricField) {
  if (field.allowNegative === true) return false;
  if (field.allowNegative === false) return true;
  const minimum = numericBoundary(field, "minimum") ?? numericBoundary(field, "min");
  if (minimum !== null) return minimum >= 0;
  return NON_NEGATIVE_KEY_PATTERN.test(field.key) || NON_NEGATIVE_UNIT_PATTERN.test(String(field.unit ?? "").trim());
}

export function validatePlannedActivityPrescription(
  metricSchema: MetricSchema | null | undefined,
  prescription: unknown
): asserts prescription is PlannedActivityPrescription {
  if (prescription === null || typeof prescription !== "object" || Array.isArray(prescription)) {
    throw new Error("Planned activity prescription must be a JSON object.");
  }

  const values = prescription as Record<string, unknown>;
  const fields = metricSchema?.fields ?? [];
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));

  for (const key of Object.keys(values)) {
    if (!fieldByKey.has(key)) {
      throw new Error(`Unknown planned prescription field: ${key}.`);
    }
  }

  for (const field of fields) {
    const value = values[field.key];
    const omitted = value === undefined || value === null || value === "";
    if (field.required && omitted) {
      throw new Error(`Missing required planned prescription field: ${field.key}.`);
    }
    if (omitted) continue;

    if (field.type === "integer" && (!finiteNumber(value) || !Number.isInteger(value))) {
      throw new Error(`Planned prescription field ${field.key} must be an integer.`);
    }
    if (field.type === "number" && !finiteNumber(value)) {
      throw new Error(`Planned prescription field ${field.key} must be a finite number.`);
    }
    if (field.type === "text" && typeof value !== "string") {
      throw new Error(`Planned prescription field ${field.key} must be text.`);
    }
    if (field.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Planned prescription field ${field.key} must be boolean.`);
    }

    if ((field.type === "integer" || field.type === "number") && finiteNumber(value)) {
      const minimum = numericBoundary(field, "minimum") ?? numericBoundary(field, "min");
      const maximum = numericBoundary(field, "maximum") ?? numericBoundary(field, "max");
      if (minimum !== null && value < minimum) {
        throw new Error(`Planned prescription field ${field.key} is below its minimum.`);
      }
      if (maximum !== null && value > maximum) {
        throw new Error(`Planned prescription field ${field.key} exceeds its maximum.`);
      }
      if (value < 0 && schemaDisallowsNegative(field)) {
        throw new Error(`Planned prescription field ${field.key} cannot be negative.`);
      }
    }
  }
}

function bySortOrder<T extends { sort_order: number; id: string }>(left: T, right: T) {
  return left.sort_order - right.sort_order || left.id.localeCompare(right.id);
}

function activeRows<T extends { archived_at: string | null }>(rows: T[] | null | undefined) {
  return (rows ?? []).filter((row) => row.archived_at === null);
}

function mapActivity(row: RawActivity): PlannedTrainingActivity {
  validatePlannedActivityPrescription(row.metric_schema_snapshot, row.planned_prescription);
  return {
    id: row.id,
    planPhaseId: row.plan_phase_id,
    sourceLegacyPlanExerciseId: row.source_legacy_plan_exercise_id,
    legacySourceWorkoutId: row.legacy_source_workout_id,
    catalog: {
      id: row.catalog_activity_id,
      slug: row.catalog_slug,
      version: row.catalog_version,
      source: row.catalog_source
    },
    snapshots: {
      name: row.activity_name_snapshot,
      shortDescription: row.short_description_snapshot,
      activityTypeSlug: row.activity_type_slug,
      activityTypeName: row.activity_type_name_snapshot,
      instructions: row.instructions_snapshot,
      metricSchema: row.metric_schema_snapshot,
      equipment: row.equipment_snapshot,
      taxonomy: row.taxonomy_snapshot
    },
    plannedPrescription: row.planned_prescription,
    sortOrder: row.sort_order,
    notes: row.notes
  };
}

function mapPhase(row: RawPhase): TrainingProgramPhase {
  return {
    id: row.id,
    planSessionId: row.plan_session_id,
    phaseSlug: row.phase_slug,
    phaseNameSnapshot: row.phase_name_snapshot,
    isOptional: row.is_optional,
    sourceLegacyBlockType: row.source_legacy_block_type,
    sortOrder: row.sort_order,
    notes: row.notes,
    activities: activeRows(row.user_workout_plan_activities).sort(bySortOrder).map(mapActivity)
  };
}

function mapSession(row: RawSession): TrainingProgramSession {
  return {
    id: row.id,
    weekTemplateId: row.week_template_id,
    sourceLegacyPlanDayId: row.source_legacy_plan_day_id,
    source: row.source,
    title: row.title,
    dayOffset: row.day_offset,
    weekday: row.weekday,
    sportSlug: row.sport_slug,
    sportNameSnapshot: row.sport_name_snapshot,
    sessionTypeSlug: row.session_type_slug,
    sessionTypeNameSnapshot: row.session_type_name_snapshot,
    durationMinutes: row.duration_minutes,
    sortOrder: row.sort_order,
    notes: row.notes,
    phases: activeRows(row.user_workout_plan_phases).sort(bySortOrder).map(mapPhase)
  };
}

function mapTemplate(row: RawTemplate): TrainingProgramWeekTemplate {
  return {
    id: row.id,
    planId: row.plan_id,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    source: row.source,
    derivedFromTemplateId: row.derived_from_template_id,
    sessions: activeRows(row.user_workout_plan_sessions).sort(bySortOrder).map(mapSession)
  };
}

export function mapTrainingProgramV2(row: RawProgram): TrainingProgram {
  const weeks: TrainingProgramWeek[] = activeRows(row.user_workout_plan_weeks)
    .sort((left, right) => left.week_number - right.week_number || left.id.localeCompare(right.id))
    .map((week) => ({
      id: week.id,
      planId: week.plan_id,
      weekTemplateId: week.week_template_id,
      weekNumber: week.week_number,
      nameOverride: week.name_override,
      notes: week.notes,
      isDetached: week.is_detached
    }));

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    weeks,
    weekTemplates: activeRows(row.user_workout_plan_week_templates).sort(bySortOrder).map(mapTemplate)
  };
}

export async function getUserTrainingProgramV2(userId: string, planId: string): Promise<TrainingProgram | null> {
  if (!supabase || !isUuid(userId) || !isUuid(planId)) return null;

  const { data, error } = await supabase
    .from("user_workout_plans")
    .select(`
      id,user_id,name,description,
      user_workout_plan_weeks(
        id,plan_id,week_template_id,week_number,name_override,notes,is_detached,archived_at
      ),
      user_workout_plan_week_templates(
        id,plan_id,name,description,sort_order,source,derived_from_template_id,archived_at,
        user_workout_plan_sessions(
          id,week_template_id,source_legacy_plan_day_id,source,title,day_offset,weekday,
          sport_slug,sport_name_snapshot,session_type_slug,session_type_name_snapshot,
          duration_minutes,sort_order,notes,archived_at,
          user_workout_plan_phases(
            id,plan_session_id,phase_slug,phase_name_snapshot,is_optional,
            source_legacy_block_type,sort_order,notes,archived_at,
            user_workout_plan_activities(
              id,plan_phase_id,source_legacy_plan_exercise_id,legacy_source_workout_id,
              catalog_activity_id,catalog_slug,catalog_version,catalog_source,
              activity_name_snapshot,short_description_snapshot,activity_type_slug,
              activity_type_name_snapshot,instructions_snapshot,metric_schema_snapshot,
              planned_prescription,equipment_snapshot,taxonomy_snapshot,sort_order,notes,archived_at
            )
          )
        )
      )
    `)
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load the saved training program structure.");
  }
  return data ? mapTrainingProgramV2(data as unknown as RawProgram) : null;
}

function isDetachResult(value: unknown): value is DetachTrainingProgramWeekResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.plan_week_id === "string"
    && typeof row.original_template_id === "string"
    && typeof row.detached_template_id === "string"
    && typeof row.clone_created === "boolean";
}

export async function detachUserTrainingProgramWeek(
  userId: string,
  planWeekId: string
): Promise<DetachTrainingProgramWeekResult> {
  if (!supabase || !isUuid(userId) || !isUuid(planWeekId)) {
    throw new Error("Training program week is invalid.");
  }

  const { data, error } = await supabase.rpc("detach_workout_plan_week_atomic", {
    p_user_id: userId,
    p_plan_week_id: planWeekId
  });

  if (error || !isDetachResult(data)) {
    throw new Error("Could not detach the selected training program week.");
  }
  return data;
}
