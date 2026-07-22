import type {
  WorkoutPerformanceMetricInput,
  WorkoutPerformanceMetricSource
} from "@/types";
import { workoutPerformanceMetricInputToSql } from "./workout-performance";

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
  performanceMetrics?: WorkoutPerformanceMetricInput[];
  metricSource?: WorkoutPerformanceMetricSource;
  metricSourceProvider?: string | null;
  metricSourceVersion?: string | null;
};

export function serializeWorkoutSetLogs(logs: WorkoutSetLogInput[]) {
  return logs.map((log) => {
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
      notes: log.notes ?? null,
      completed_at: log.completedAt ?? null,
      ...(log.metricSource !== undefined ? { metric_source: log.metricSource } : {}),
      ...(log.metricSourceProvider !== undefined ? { metric_source_provider: log.metricSourceProvider } : {}),
      ...(log.metricSourceVersion !== undefined ? { metric_source_version: log.metricSourceVersion } : {})
    };

    if (!Object.prototype.hasOwnProperty.call(log, "performanceMetrics")) return row;
    return {
      ...row,
      performance_metrics: (log.performanceMetrics ?? []).map((metric) =>
        workoutPerformanceMetricInputToSql(metric, {
          source: log.metricSource,
          sourceProvider: log.metricSourceProvider,
          sourceVersion: log.metricSourceVersion
        })
      )
    };
  });
}
