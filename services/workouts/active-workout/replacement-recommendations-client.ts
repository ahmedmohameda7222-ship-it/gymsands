"use client";

import { createCatalogRequestGroupId } from "@/services/activity-catalog/client";
import {
  getWorkout,
  getWorkoutAlternatives,
  getWorkouts,
} from "@/services/database/workout-library";
import { getWorkoutReplacementEligibility } from "@/services/database/workout-replacement-eligibility";
import type {
  ExerciseAlternativeReason,
  UserExerciseAlternative,
  Workout,
} from "@/types";
import {
  rankActiveWorkoutReplacements,
  replacementProfileFromWorkout,
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

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
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
  abortIfNeeded(input.signal);
  const requestGroupId = createCatalogRequestGroupId();
  const requestContext = { requestGroupId, signal: input.signal };

  const canonicalOriginal = input.original.id
    ? await getWorkout(input.original.id, input.locale, requestContext).catch((error) => {
        abortIfNeeded(input.signal);
        console.warn("Plaivra could not enrich replacement source metadata.", error);
        return null;
      })
    : null;
  abortIfNeeded(input.signal);
  const original = canonicalOriginal ? replacementProfileFromWorkout(canonicalOriginal) : input.original;

  const [alternativeResult, catalogResult] = await Promise.all([
    original.id
      ? getWorkoutAlternatives(original.id, 20, input.locale, requestContext).catch((error) => {
          abortIfNeeded(input.signal);
          console.warn("Plaivra could not load catalog alternatives for replacement ranking.", error);
          return null;
        })
      : Promise.resolve(null),
    getWorkouts("", filtersFor(original), 0, input.locale, requestContext).catch((error) => {
      abortIfNeeded(input.signal);
      console.warn("Plaivra could not load replacement candidates.", error);
      return null;
    }),
  ]);

  abortIfNeeded(input.signal);
  const alternatives = alternativeResult?.data ?? [];
  const catalog = catalogResult ?? [];
  const candidates = uniqueWorkouts([...alternatives, ...catalog])
    .filter((candidate) => candidate.id !== original.id)
    .slice(0, 80);
  if (!candidates.length) {
    return { recommendations: [], source: alternatives.length ? "alternatives" : "catalog" };
  }

  const eligibility = await getWorkoutReplacementEligibility(
    input.userId,
    candidates.map((workout) => ({ key: workout.id, workout })),
  );
  abortIfNeeded(input.signal);

  const recommendations = rankActiveWorkoutReplacements({
    original,
    candidates,
    eligibility,
    savedAlternatives: input.savedAlternatives,
    sessionExerciseIds: input.sessionExerciseIds,
    reason: input.reason,
  }).slice(0, Math.min(Math.max(input.limit ?? 5, 1), 8));

  const hasAlternatives = alternatives.length > 0;
  const hasCatalog = catalog.length > 0;
  return {
    recommendations,
    source: hasAlternatives && hasCatalog ? "combined" : hasAlternatives ? "alternatives" : "catalog",
  };
}
