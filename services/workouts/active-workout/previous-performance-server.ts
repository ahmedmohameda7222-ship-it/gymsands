import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveWorkoutPerformanceIdentity =
  | { kind: "plan_activity"; value: string }
  | { kind: "source_workout"; value: string };

export type ActiveWorkoutPreviousPerformanceRead = {
  identity: ActiveWorkoutPerformanceIdentity;
  workoutSessionId: string;
  exerciseLogId: string;
  setNumber: number | null;
  reps: number | null;
  weightKg: number | null;
  performedAt: string;
};

type Row = {
  id: string;
  workout_session_id: string;
  set_number: number | null;
  reps: number | null;
  weight_kg: number | null;
  completed_at: string | null;
  created_at: string;
};

export async function readActiveWorkoutPreviousPerformance(
  supabase: SupabaseClient,
  userId: string,
  identity: ActiveWorkoutPerformanceIdentity,
  options: { excludeSessionId?: string | null; setNumber?: number | null } = {}
): Promise<ActiveWorkoutPreviousPerformanceRead | null> {
  // Deliberately bounded and identity-specific. This is not a Workout History
  // scan and never falls back to display-name matching.
  let query = supabase
    .from("exercise_logs")
    .select("id,workout_session_id,set_number,reps,weight_kg,completed_at,created_at,workout_sessions!inner(user_id,status)")
    .eq("workout_sessions.user_id", userId)
    .eq("workout_sessions.status", "completed")
    .not("completed_at", "is", null);

  query = identity.kind === "plan_activity"
    ? query.eq("plan_activity_id", identity.value)
    : query.eq("source_workout_id", identity.value);

  if (options.excludeSessionId) query = query.neq("workout_session_id", options.excludeSessionId);
  if (options.setNumber && Number.isInteger(options.setNumber) && options.setNumber > 0) {
    query = query.eq("set_number", options.setNumber);
  }

  const result = await query
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  const row = result.data as unknown as Row | null;
  if (!row) return null;
  const performedAt = row.completed_at ?? row.created_at;
  if (!performedAt) return null;
  return {
    identity,
    workoutSessionId: row.workout_session_id,
    exerciseLogId: row.id,
    setNumber: row.set_number,
    reps: row.reps,
    weightKg: row.weight_kg,
    performedAt
  };
}
