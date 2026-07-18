"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { Workout, WorkoutSession } from "@/types";

export type StableWorkoutIdentity = {
  targetType: "global_exercise" | "provider_activity" | "custom_exercise";
  identity: string;
  provider: string | null;
};

export function getStableWorkoutIdentity(workout: Workout): StableWorkoutIdentity {
  if (workout.catalog_source === "custom") {
    return { targetType: "custom_exercise", identity: workout.id, provider: null };
  }
  if (
    workout.catalog_source === "external" ||
    workout.catalog_source === "legacy" ||
    Boolean(workout.catalog_slug) ||
    Boolean(workout.catalog_version)
  ) {
    return {
      targetType: "provider_activity",
      identity: workout.id,
      provider: "plaivra_activity_catalog"
    };
  }
  return { targetType: "global_exercise", identity: workout.id, provider: null };
}

function plannedPrescription(workout: Workout) {
  return {
    ...(workout.sets ? { sets: workout.sets } : {}),
    ...(workout.reps ? { reps: workout.reps } : {}),
    ...(workout.rest_seconds ? { restSeconds: workout.rest_seconds } : {})
  };
}

export async function getOrStartWorkoutSession(
  userId: string,
  workout: Workout,
  candidateSessionId?: string | null
): Promise<WorkoutSession> {
  if (!supabase || !isUuid(userId)) {
    throw new Error("Workout session could not be saved. Please refresh, sign in again, and try once more.");
  }
  const stable = getStableWorkoutIdentity(workout);
  const { data, error } = await supabase.rpc("start_or_resume_direct_workout_session_atomic", {
    p_user_id: userId,
    p_target_type: stable.targetType,
    p_identity: stable.identity,
    p_provider: stable.provider,
    p_display_name: workout.name,
    p_category: workout.category || workout.target_muscle || "Workout",
    p_planned_prescription: plannedPrescription(workout),
    p_candidate_session_id: candidateSessionId && isUuid(candidateSessionId) ? candidateSessionId : null
  });
  if (error) {
    console.warn("Plaivra could not start or resume the direct workout session.", error.message);
    throw error;
  }
  const result = data as { session?: WorkoutSession } | null;
  if (!result?.session) throw new Error("Workout session could not be started.");
  return result.session;
}
