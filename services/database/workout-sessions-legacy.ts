"use client";

export * from "./workout-sessions-legacy-implementation";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { WorkoutSetLogInput } from "./workout-sessions-legacy-implementation";

function requireWorkoutPersistence(value: string | null | undefined, label: string) {
  if (!supabase || !isUuid(value)) {
    throw new Error(`${label} could not be saved. Please refresh, sign in again, and try once more.`);
  }
}

function workoutSetLogRows(logs: WorkoutSetLogInput[]) {
  return logs.map((log) => ({
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
    completed_at: log.completedAt ?? null
  }));
}

export async function saveWorkoutSetLogs(sessionId: string, logs: WorkoutSetLogInput[]) {
  requireWorkoutPersistence(sessionId, "Workout sets");
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
