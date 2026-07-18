"use client";

import { supabase } from "@/lib/supabase/client";
import type { Workout } from "@/types";
import { getStableWorkoutIdentity } from "./direct-workout-sessions";

export type ReplacementEligibility = {
  eligible: boolean;
  reason: string | null;
};

export async function getWorkoutReplacementEligibility(
  userId: string,
  candidates: Array<{ key: string; workout: Workout }>
): Promise<Map<string, ReplacementEligibility>> {
  if (!supabase) throw new Error("Replacement eligibility could not be verified.");
  if (!candidates.length) return new Map();
  const { data, error } = await supabase.rpc("get_workout_replacement_candidate_eligibility", {
    p_user_id: userId,
    p_candidates: candidates.map(({ key, workout }) => {
      const stable = getStableWorkoutIdentity(workout);
      return {
        key,
        targetType: stable.targetType,
        identity: stable.identity,
        provider: stable.provider
      };
    })
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return new Map(rows.map((row: { key?: unknown; eligible?: unknown; reason?: unknown }) => [
    String(row.key ?? ""),
    {
      eligible: row.eligible === true,
      reason: typeof row.reason === "string" ? row.reason : null
    }
  ]));
}

export function replacementEligibilityMessage(reason: string | null | undefined) {
  switch (reason) {
    case "provider_bridge_unavailable":
      return "This catalog activity is not yet linked to an authoritative Plaivra exercise.";
    case "published_mapping_unavailable":
      return "This exercise does not yet have an authoritative published muscle mapping.";
    case "custom_exercise_unavailable":
      return "This custom exercise is unavailable for this account.";
    case "canonical_exercise_unavailable":
      return "This canonical exercise is currently unavailable.";
    default:
      return "This exercise cannot be used as a tracked replacement yet.";
  }
}

export function isReplacementCandidateActionable(
  result: ReplacementEligibility | undefined,
  loading: boolean,
  error: string
) {
  return !loading && !error && result?.eligible === true;
}

export function shouldClosePickerAfterAdd(replacementMode: boolean) {
  return !replacementMode;
}
