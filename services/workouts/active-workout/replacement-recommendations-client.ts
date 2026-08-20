"use client";

import { libraryAlternativeToWorkout } from "@/lib/activity-catalog/adapter";
import { toCatalogLocaleFromIntlLocale, type CatalogLocale } from "@/lib/activity-catalog/catalog-locale";
import { rankExerciseAlternativesV2 } from "@/lib/exercise-detail/alternatives";
import {
  CatalogClientError,
  createCatalogRequestGroupId,
  getLibraryActivity,
  getLibraryDomainActivityAlternatives,
} from "@/services/activity-catalog/client";
import {
  getWorkout,
  getWorkoutAlternatives,
  getWorkouts,
} from "@/services/database/workout-library";
import { getWorkoutReplacementEligibility } from "@/services/database/workout-replacement-eligibility";
import {
  EXERCISE_ALTERNATIVE_REASONS,
  type ExerciseAlternativeReasonV2,
} from "@/types/exercise-alternative";
import type {
  ExerciseAlternativeReason,
  UserExerciseAlternative,
  Workout,
} from "@/types";
import {
  rankActiveWorkoutReplacements,
  rankAuthorityBackedActiveWorkoutReplacementsV2,
  replacementProfileFromWorkout,
  type RankedReplacement,
  type ReplacementExerciseProfile,
} from "./replacement-ranking";

export type ActiveWorkoutReplacementRecommendationResult = {
  recommendations: RankedReplacement[];
  source: "catalog_relationships_v2" | "alternatives" | "catalog" | "combined";
};

const canonicalReasonSet = new Set<string>(EXERCISE_ALTERNATIVE_REASONS);

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

function toV2Reason(reason: ExerciseAlternativeReason): ExerciseAlternativeReasonV2 | null {
  if (canonicalReasonSet.has(reason)) return reason as ExerciseAlternativeReasonV2;
  // Historical persisted pain rows remain readable, but new UI writes the V2 value.
  if (reason === "pain_or_discomfort") return "pain_discomfort";
  return null;
}

function toLegacyFallbackReason(reason: ExerciseAlternativeReasonV2): ExerciseAlternativeReason | null {
  if (reason === "machine_taken" || reason === "no_equipment" || reason === "too_hard") return reason;
  if (reason === "pain_discomfort") return "pain_or_discomfort";
  // V1 has no honest authority for these intents. Never reinterpret them as `other`.
  return null;
}

async function relationshipRecommendations(input: {
  userId: string;
  original: ReplacementExerciseProfile;
  reason: ExerciseAlternativeReasonV2;
  locale: CatalogLocale;
  requestGroupId: string;
  signal?: AbortSignal;
  savedAlternatives: readonly UserExerciseAlternative[];
  sessionExerciseIds: ReadonlySet<string>;
  limit: number;
}): Promise<ActiveWorkoutReplacementRecommendationResult | null> {
  let detail;
  try {
    detail = await getLibraryActivity(input.original.id, input.locale, { requestGroupId: input.requestGroupId, signal: input.signal });
  } catch (error) {
    abortIfNeeded(input.signal);
    if (error instanceof CatalogClientError && error.status === 404) return null;
    throw error;
  }
  if (detail.meta.source !== "library_v2" || !detail.data.domain) return null;
  const alternatives = await getLibraryDomainActivityAlternatives(
    detail.data.domain,
    detail.data.id,
    { locale: input.locale, limit: Math.min(Math.max(input.limit * 2, 1), 10) },
    { requestGroupId: input.requestGroupId, signal: input.signal },
  );
  abortIfNeeded(input.signal);
  const ranked = rankExerciseAlternativesV2(input.reason, alternatives.data);
  if (!ranked.length) return { recommendations: [], source: "catalog_relationships_v2" };
  const workouts = ranked.map((candidate) => libraryAlternativeToWorkout(candidate, alternatives.meta));
  const eligibility = await getWorkoutReplacementEligibility(
    input.userId,
    workouts.map((workout) => ({ key: workout.id, workout })),
  );
  abortIfNeeded(input.signal);
  return {
    recommendations: rankAuthorityBackedActiveWorkoutReplacementsV2({
      ranked,
      workoutsById: new Map(workouts.map((workout) => [workout.id, workout])),
      eligibility,
      savedAlternatives: input.savedAlternatives,
      sessionExerciseIds: input.sessionExerciseIds,
    }).slice(0, input.limit),
    source: "catalog_relationships_v2",
  };
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
  const reason = toV2Reason(input.reason);
  if (!reason) return { recommendations: [], source: "catalog" };

  const catalogLocale = toCatalogLocaleFromIntlLocale(input.locale);
  const requestGroupId = createCatalogRequestGroupId();
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 8);

  const semantic = await relationshipRecommendations({
    userId: input.userId,
    original: input.original,
    reason,
    locale: catalogLocale,
    requestGroupId,
    signal: input.signal,
    savedAlternatives: input.savedAlternatives,
    sessionExerciseIds: input.sessionExerciseIds,
    limit,
  });
  if (semantic) return semantic;

  const legacyReason = toLegacyFallbackReason(reason);
  if (!legacyReason) return { recommendations: [], source: "catalog" };

  const requestContext = { requestGroupId, signal: input.signal };
  const canonicalOriginal = input.original.id
    ? await getWorkout(input.original.id, catalogLocale, requestContext).catch((error) => {
        abortIfNeeded(input.signal);
        console.warn("Plaivra could not enrich legacy replacement source metadata.", error);
        return null;
      })
    : null;
  abortIfNeeded(input.signal);
  const original = canonicalOriginal ? replacementProfileFromWorkout(canonicalOriginal) : input.original;

  const [alternativeResult, catalogResult] = await Promise.all([
    original.id
      ? getWorkoutAlternatives(original.id, 20, catalogLocale, requestContext).catch((error) => {
          abortIfNeeded(input.signal);
          console.warn("Plaivra could not load legacy catalog alternatives for replacement ranking.", error);
          return null;
        })
      : Promise.resolve(null),
    getWorkouts("", filtersFor(original), 0, catalogLocale, requestContext).catch((error) => {
      abortIfNeeded(input.signal);
      console.warn("Plaivra could not load legacy replacement candidates.", error);
      return null;
    }),
  ]);

  abortIfNeeded(input.signal);
  const alternatives = alternativeResult?.data ?? [];
  const catalog = catalogResult ?? [];
  const candidates = uniqueWorkouts([...alternatives, ...catalog])
    .filter((candidate) => candidate.id !== original.id)
    .slice(0, 80);
  if (!candidates.length) return { recommendations: [], source: alternatives.length ? "alternatives" : "catalog" };

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
    reason: legacyReason,
  }).slice(0, limit);
  const hasAlternatives = alternatives.length > 0;
  const hasCatalog = catalog.length > 0;
  return {
    recommendations,
    source: hasAlternatives && hasCatalog ? "combined" : hasAlternatives ? "alternatives" : "catalog",
  };
}
