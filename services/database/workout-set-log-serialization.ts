import type {
  WorkoutPerformanceMetricSource,
  WorkoutSetDetailsInput,
  WorkoutSetPerformanceMetricInput,
  WorkoutSetRuntimeSource,
  WorkoutSetSegmentInput,
} from "@/types";
import { workoutPerformanceMetricInputToSql } from "./workout-performance";
import {
  workoutSetDetailsInputToSql,
  workoutSetSegmentsInputToSql
} from "./workout-set-details";

export type WorkoutSetLogInput = {
  planExerciseId?: string | null;
  exerciseOrder?: number | null;
  exerciseName: string;
  exerciseCategory?: string | null;
  plannedSets?: number | null;
  plannedReps?: string | null;
  plannedRestSeconds?: number | null;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  notes?: string | null;
  completedAt?: string | null;
  performanceMetrics?: WorkoutSetPerformanceMetricInput[];
  setDetails?: WorkoutSetDetailsInput | null;
  segments?: WorkoutSetSegmentInput[];
  metricSource?: WorkoutSetRuntimeSource;
  metricSourceProvider?: string | null;
  metricSourceVersion?: string | null;
};

export function serializeWorkoutSetLogs(logs: WorkoutSetLogInput[]) {
  return logs.map((log) => {
    if ((log.metricSource as WorkoutPerformanceMetricSource | undefined) === "backfill") {
      throw new Error("Backfill provenance is reserved for database migrations.");
    }
    if (log.performanceMetrics?.some(
      (metric) => (metric.source as WorkoutPerformanceMetricSource | undefined) === "backfill",
    )) {
      throw new Error("Backfill provenance is reserved for database migrations.");
    }
    const sourceDefaults = {
      source: log.metricSource,
      sourceProvider: log.metricSourceProvider,
      sourceVersion: log.metricSourceVersion
    };
    const hasSetDetails = Object.prototype.hasOwnProperty.call(log, "setDetails")
      && log.setDetails !== undefined;
    const hasSegments = Object.prototype.hasOwnProperty.call(log, "segments")
      && log.segments !== undefined;
    const hasCompatibilityNotes = Object.prototype.hasOwnProperty.call(log, "notes")
      && log.notes !== undefined;
    const setDetails = hasSetDetails && log.setDetails !== null && log.setDetails !== undefined
      ? workoutSetDetailsInputToSql(log.setDetails, sourceDefaults)
      : null;
    const compatibilityNotes = log.notes === "" ? null : log.notes ?? null;
    if (setDetails && hasCompatibilityNotes && compatibilityNotes !== setDetails.notes) {
      throw new Error("Workout set notes disagree with structured set details.");
    }
    const row = {
      plan_exercise_id: log.planExerciseId ?? null,
      exercise_order: log.exerciseOrder ?? null,
      exercise_name: log.exerciseName,
      exercise_category: log.exerciseCategory ?? null,
      planned_sets: log.plannedSets ?? null,
      planned_reps: log.plannedReps ?? null,
      planned_rest_seconds: log.plannedRestSeconds ?? null,
      set_number: log.setNumber,
      reps: log.reps,
      weight_kg: log.weightKg,
      ...(setDetails
        ? { notes: setDetails.notes }
        : hasCompatibilityNotes
          ? { notes: compatibilityNotes }
          : {}),
      completed_at: log.completedAt ?? null,
      ...(log.metricSource !== undefined ? { metric_source: log.metricSource } : {}),
      ...(log.metricSourceProvider !== undefined ? { metric_source_provider: log.metricSourceProvider } : {}),
      ...(log.metricSourceVersion !== undefined ? { metric_source_version: log.metricSourceVersion } : {})
    };

    const structuredRow = {
      ...row,
      ...(Object.prototype.hasOwnProperty.call(log, "performanceMetrics")
        ? {
            performance_metrics: (log.performanceMetrics ?? []).map((metric) =>
              workoutPerformanceMetricInputToSql(metric, sourceDefaults)
            )
          }
        : {}),
      ...(hasSetDetails ? { set_details: setDetails } : {}),
      ...(hasSegments
        ? { segments: workoutSetSegmentsInputToSql(log.segments ?? [], sourceDefaults) }
        : {})
    };
    return structuredRow;
  });
}
