"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { getCustomExercise } from "@/services/workouts/exercise-library-store";
import type { Workout } from "@/types";

/**
 * Account-backed custom Detail lookup is a bounded owner+identifier query. The
 * local collection scan remains only as the offline/anonymous compatibility path.
 */
export async function getOwnedCustomExerciseDirect(
  userId: string | null | undefined,
  exerciseId: string,
  signal?: AbortSignal
): Promise<Workout | null> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!supabase || !isUuid(userId) || !isUuid(exerciseId)) {
    return getCustomExercise(userId, exerciseId);
  }

  const query = supabase
    .from("user_custom_exercises")
    .select("*")
    .eq("user_id", userId)
    .eq("id", exerciseId)
    .limit(1);
  const result = typeof query.abortSignal === "function" && signal
    ? await query.abortSignal(signal).maybeSingle()
    : await query.maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data as Workout | null) ?? null;
}
