"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { getCustomExercise } from "@/services/workouts/exercise-library-store";
import type { Workout } from "@/types";

const detailCustomSelect = "id,name,category,target_muscle,equipment,difficulty,sets,reps,rest_seconds,instructions,notes,muscle_category,equipment_required,mechanics,force_type,experience_level,secondary_muscles,exercise_url,is_global";

/**
 * Account-backed custom Detail lookup is a bounded owner+identifier query. The
 * local collection scan remains only as the offline/anonymous compatibility path.
 * Video columns are deliberately excluded from core Detail resolution.
 */
export async function getOwnedCustomExerciseDirect(
  userId: string | null | undefined,
  exerciseId: string,
  signal?: AbortSignal
): Promise<Workout | null> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!supabase || !isUuid(userId)) return getCustomExercise(userId, exerciseId);
  if (!isUuid(exerciseId)) return null;

  const query = supabase
    .from("user_custom_exercises")
    .select(detailCustomSelect)
    .eq("user_id", userId)
    .eq("id", exerciseId)
    .limit(1);
  const result = typeof query.abortSignal === "function" && signal
    ? await query.abortSignal(signal).maybeSingle()
    : await query.maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data as unknown as Workout | null) ?? null;
}

export async function getOwnedCustomExerciseVideoDirect(userId: string, exerciseId: string): Promise<string | null> {
  if (!supabase || !isUuid(userId) || !isUuid(exerciseId)) return null;
  const { data, error } = await supabase
    .from("user_custom_exercises")
    .select("custom_video_url,video_url")
    .eq("user_id", userId)
    .eq("id", exerciseId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { custom_video_url?: string | null; video_url?: string | null } | null;
  return row?.custom_video_url ?? row?.video_url ?? null;
}
