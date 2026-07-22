"use client";

export * from "./workout-sessions-legacy";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type {
  Weekday,
  Workout,
  WorkoutPerformanceMetricInput,
  WorkoutPerformanceMetricSource,
  WorkoutSession
} from "@/types";
import {
  getOrStartWorkoutSession as startOrResumeDirectWorkoutSession
} from "./direct-workout-sessions";
import type { WorkoutSetLogInput as LegacyWorkoutSetLogInput } from "./workout-sessions-legacy";
import { workoutPerformanceMetricInputToSql } from "./workout-performance";

export type WorkoutSetLogInput = LegacyWorkoutSetLogInput & {
  performanceMetrics?: WorkoutPerformanceMetricInput[];
  metricSource?: WorkoutPerformanceMetricSource;
  metricSourceProvider?: string | null;
  metricSourceVersion?: string | null;
};

export type SkipWorkoutDayInput = {
  id: string;
  plan_id?: string | null;
  planId?: string | null;
  day_name?: string;
  dayName?: string;
  weekday: Weekday | null;
  exercises: Array<{
    category?: string | null;
    target_muscle?: string | null;
    equipment?: string | null;
  }>;
};

function requireSessionIdentity(value: string, label: string) {
  if (!supabase || !isUuid(value)) throw new Error(`${label} is invalid.`);
}

function workoutSetLogRows(logs: WorkoutSetLogInput[]) {
  return logs.map((log) => {
    const base = {
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

    if (!Object.prototype.hasOwnProperty.call(log, "performanceMetrics")) return base;
    return {
      ...base,
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

function directWorkoutIdentity(workout: Workout, resolvedWorkoutId?: string | null): Workout {
  if (resolvedWorkoutId === undefined || resolvedWorkoutId === null) return workout;
  if (!isUuid(resolvedWorkoutId)) throw new Error("Resolved workout identity is invalid.");
  return {
    ...workout,
    id: resolvedWorkoutId,
    catalog_source: null,
    catalog_slug: null,
    catalog_version: null,
    is_global: true
  };
}

export async function startWorkoutSession(
  userId: string,
  workout: Workout,
  resolvedWorkoutId?: string | null
): Promise<WorkoutSession> {
  return startOrResumeDirectWorkoutSession(
    userId,
    directWorkoutIdentity(workout, resolvedWorkoutId),
    null
  );
}

export async function getOrStartWorkoutSession(
  userId: string,
  workout: Workout,
  candidateSessionId?: string | null
): Promise<WorkoutSession> {
  return startOrResumeDirectWorkoutSession(userId, workout, candidateSessionId);
}

export async function saveWorkoutSetLogs(sessionId: string, logs: WorkoutSetLogInput[]) {
  requireSessionIdentity(sessionId, "Workout session");
  if (!logs.length) return true;
  const sessionResult = await supabase!
    .from("workout_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();
  if (sessionResult.error) throw sessionResult.error;
  const { error } = await supabase!.rpc("upsert_workout_set_logs_atomic", {
    p_user_id: sessionResult.data.user_id,
    p_session_id: sessionId,
    p_logs: workoutSetLogRows(logs)
  });
  if (error) throw error;
  return true;
}

export async function skipWorkoutDay(userId: string, day: SkipWorkoutDayInput, notes = "") {
  requireSessionIdentity(userId, "User session");
  if (!isUuid(day.id)) throw new Error("Workout day is invalid.");
  const { data, error } = await supabase!.rpc("skip_workout_day_atomic", {
    p_user_id: userId,
    p_plan_day_id: day.id,
    p_reason: null,
    p_followup_action: null,
    p_notes: notes.trim() || null
  });
  if (error) throw error;
  const result = data as { session?: WorkoutSession } | null;
  if (!result?.session) throw new Error("Workout day could not be skipped.");
  return result.session;
}

export async function cancelWorkoutSession(sessionId: string) {
  requireSessionIdentity(sessionId, "Workout session");
  const sessionResult = await supabase!
    .from("workout_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();
  if (sessionResult.error) throw sessionResult.error;
  const { error } = await supabase!.rpc("cancel_workout_session_atomic", {
    p_user_id: sessionResult.data.user_id,
    p_session_id: sessionId,
    p_reason: "user_cancelled"
  });
  if (error) throw error;
  return true;
}
