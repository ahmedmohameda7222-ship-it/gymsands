"use client";

import { createCatalogRequestGroupId } from "@/services/activity-catalog/client";
import {
  getWorkoutAlternatives,
  getWorkoutsWithStatus,
} from "@/services/database/workout-library";
import { getWorkoutReplacementEligibility } from "@/services/database/workout-replacement-eligibility";
import type {
  ExerciseAlternativeReason,
  UserExerciseAlternative,
  Workout,
} from "@/types";
import {
  rankActiveWorkoutReplacements,
  type RankedReplacement,
  type ReplacementExerciseProfile,
} from "./replacement-ranking";

export type ActiveWorkoutReplacementRecommendationResult = {
  recommendations: RankedReplacement[];
  source: "alternatives" | "catalog" | "combined";
};

function uniqueWorkouts(items: readonly Workout[]) {
  const byId = new Map<string, Workout>();
  for (const item of items) if (item.id) byId.set(item.id, item);
  return [...byId.values()];
}

function filtersFor(original: ReplacementExerciseProfile) {
  return original.targetMuscle ? { primaryMuscles: [original.targetMuscle] } : {};
}

export async function getActiveWorkoutReplacementRecommendations(input: {
  userId: string;
  original: ReplacementExerciseProfile;
  reason: ExerciseAlternativeReason;
  locale: string;
  savedAlternatives: readonly UserExerciseAlternative[];
  sessionExerciseIds: ReadonlySet<string>;
  signal?: AbortSignal;
  limit?: number;
}): Promise<ActiveWorkoutReplacementRecommendationResult> {
  if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const requestGroupId = createCatalogRequestGroupId();
  const requestContext = { requestGroupId, signal: input.signal };

  const [alternativeResult, catalogResult] = await Promise.all([
    input.original.id
      ? getWorkoutAlternatives(input.original.id, 20, input.locale, requestContext)
          .catch((error) => {
            if (input.signal?.aborted) throw error;
            return { data: [] as Workout[], status: { source: "fallback" as const } };
          })
      : Promise.resolve({ data: [] as Workout[], status: { source: "fallback" as const } }),
    getWorkoutsWithStatus("", filtersFor(input.original), 0, input.locale, requestContext)
      .catch((error) => {
        if (input.signal?.aborted) throw error;
        return { data: [] as Workout[], status: { source: "fallback" as const } };
      }),
  ]);

  if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const candidates = uniqueWorkouts([...alternativeResult.data, ...catalogResult.data])
    .filter((candidate) => candidate.id !== input.original.id)
    .slice(0, 80);
  if (!candidates.length) {
    return { recommendations: [], source: "catalog" };
  }

  const eligibility = await getWorkoutReplacementEligibility(
    input.userId,
    candidates.map((workout) => ({ key: workout.id, workout })),
  );
  if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const recommendations = rankActiveWorkoutReplacements({
    original: input.original,
    candidates,
    eligibility,
    savedAlternatives: input.savedAlternatives,
    sessionExerciseIds: input.sessionExerciseIds,
    reason: input.reason,
  }).slice(0, Math.min(Math.max(input.limit ?? 5, 1), 8));

  const hasAlternatives = alternativeResult.data.length > 0;
  const hasCatalog = catalogResult.data.length > 0;
  return {
    recommendations,
    source: hasAlternatives && hasCatalog ? "combined" : hasAlternatives ? "alternatives" : "catalog",
  };
}
