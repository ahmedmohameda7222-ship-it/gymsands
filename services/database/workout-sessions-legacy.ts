"use client";

export * from "./workout-sessions-legacy-implementation";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { serializeWorkoutSetLogs } from "./workout-set-log-serialization";
import type { WorkoutSetLogInput } from "./workout-set-log-serialization";

function requireWorkoutPersistence(value: string | null | undefined, label: string) {
  if (!supabase || !isUuid(value)) {
    throw new Error(`${label} could not be saved. Please refresh, sign in again, and try once more.`);
  }
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
    p_logs: serializeWorkoutSetLogs(logs)
  });
  if (error) throw error;
  return true;
}
