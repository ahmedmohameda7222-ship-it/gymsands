"use client";

import { trainingActivityToWorkout } from "@/lib/activity-catalog/adapters";
import {
  catalogFiltersToLegacyOptions,
  legacyFiltersToCatalogSearch,
  matchesLegacyWorkoutFilters,
  type LegacyWorkoutFilterOptions,
  type LegacyWorkoutFilters
} from "@/lib/activity-catalog/filter-compatibility";
import type { ActivityCatalogResultMeta, TrainingActivity } from "@/lib/activity-catalog/types";
import {
  getActivityCatalogActivity,
  getActivityCatalogAlternatives,
  getActivityCatalogFilters,
  searchActivityCatalog
} from "@/services/activity-catalog/client";
import type { Workout } from "@/types";

export const workoutPageSize = 100;
const compatibilityPageWindow = 3;

export type WorkoutFilters = LegacyWorkoutFilters;
export type WorkoutFilterOptions = LegacyWorkoutFilterOptions;

export type WorkoutLibraryStatus = {
  source: "live" | "fallback" | "partial";
  catalogSource?: "external" | "legacy";
  degraded?: boolean;
  message?: string;
};

export type WorkoutLibraryResult<T> = {
  data: T;
  status: WorkoutLibraryStatus;
};

function statusFromMetadata(metadata: ActivityCatalogResultMeta[]): WorkoutLibraryStatus {
  const degraded = metadata.some((item) => item.degraded);
  const catalogSource = metadata.some((item) => item.source === "legacy") ? "legacy" : "external";
  return {
    source: degraded ? "fallback" : "live",
    catalogSource,
    degraded,
    ...(degraded ? { message: "Showing the legacy exercise library because the external catalog is temporarily unavailable." } : {})
  };
}

function dedupeWorkouts(workouts: Workout[]) {
  const seen = new Set<string>();
  return workouts.filter((workout) => {
    const key = workout.id || workout.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function needsCompatibilityWindow(filters: WorkoutFilters) {
  return Boolean(
    filters.muscleCategories?.length ||
    filters.primaryMuscles?.length ||
    filters.mechanics?.length ||
    filters.forceTypes?.length ||
    filters.secondaryMuscles?.length ||
    (filters.categories?.length ?? 0) > 1 ||
    (filters.equipmentRequired?.length ?? 0) > 1 ||
    (filters.experienceLevels?.length ?? 0) > 1
  );
}

export async function getWorkoutFilterOptionsWithStatus(signal?: AbortSignal): Promise<WorkoutLibraryResult<WorkoutFilterOptions>> {
  const [filters, sample] = await Promise.all([
    getActivityCatalogFilters({ signal }),
    searchActivityCatalog({ limit: workoutPageSize, offset: 0, locale: "en", signal })
  ]);
  return {
    data: catalogFiltersToLegacyOptions(filters.data, sample.data),
    status: statusFromMetadata([filters.meta, sample.meta])
  };
}

export async function getWorkoutFilterOptions(signal?: AbortSignal) {
  return (await getWorkoutFilterOptionsWithStatus(signal)).data;
}

export async function getWorkoutCategories(signal?: AbortSignal) {
  const options = await getWorkoutFilterOptions(signal);
  return Array.from(new Set([
    ...options.muscleCategories,
    ...options.primaryMuscles,
    ...options.equipmentRequired,
    ...options.exerciseTypes
  ])).sort((left, right) => left.localeCompare(right));
}

export async function getWorkoutsWithStatus(
  query = "",
  filters: WorkoutFilters = {},
  page = 0,
  signal?: AbortSignal
): Promise<WorkoutLibraryResult<Workout[]>> {
  const windowSize = needsCompatibilityWindow(filters) ? compatibilityPageWindow : 1;
  const metadata: ActivityCatalogResultMeta[] = [];
  const activities: Array<{ activity: TrainingActivity; source: ActivityCatalogResultMeta["source"] }> = [];
  const firstOffset = Math.max(0, page) * workoutPageSize * windowSize;

  for (let index = 0; index < windowSize; index += 1) {
    const params = legacyFiltersToCatalogSearch(query, filters, 0, workoutPageSize, "en");
    const result = await searchActivityCatalog({
      ...params,
      offset: firstOffset + index * workoutPageSize,
      signal
    });
    metadata.push(result.meta);
    activities.push(...result.data.map((activity) => ({ activity, source: result.meta.source })));
    if (result.pagination?.nextOffset == null || result.data.length < workoutPageSize) break;
  }

  const workouts = dedupeWorkouts(
    activities
      .map(({ activity, source }) => trainingActivityToWorkout(activity, source))
      .filter((workout) => matchesLegacyWorkoutFilters(workout, query, filters))
  ).slice(0, workoutPageSize);

  return { data: workouts, status: statusFromMetadata(metadata) };
}

export async function getWorkouts(query = "", filters: WorkoutFilters = {}, page = 0, signal?: AbortSignal) {
  return (await getWorkoutsWithStatus(query, filters, page, signal)).data;
}

export async function getWorkout(identifier: string, signal?: AbortSignal) {
  const result = await getActivityCatalogActivity(identifier, { signal });
  return trainingActivityToWorkout(result.data, result.meta.source);
}

export async function getWorkoutAlternatives(
  identifier: string,
  options: { limit?: number; locale?: string; signal?: AbortSignal } = {}
): Promise<WorkoutLibraryResult<Workout[]>> {
  const alternatives = await getActivityCatalogAlternatives(identifier, {
    limit: Math.max(1, Math.min(20, options.limit ?? 6)),
    locale: options.locale,
    signal: options.signal
  });
  if (!alternatives.data.length) return { data: [], status: statusFromMetadata([alternatives.meta]) };

  const details = await Promise.allSettled(
    alternatives.data.slice(0, options.limit ?? 6).map((alternative) =>
      getActivityCatalogActivity(alternative.alternativeActivityId, { locale: options.locale, signal: options.signal })
    )
  );
  const workouts = details.flatMap((detail) => {
    if (detail.status !== "fulfilled" || detail.value.meta.source !== alternatives.meta.source) return [];
    return [trainingActivityToWorkout(detail.value.data, detail.value.meta.source)];
  });
  const resolved = dedupeWorkouts(workouts);
  const missingDetails = details.length - resolved.length;
  if (missingDetails > 0) {
    return {
      data: resolved,
      status: {
        ...statusFromMetadata([alternatives.meta]),
        source: "partial",
        message: resolved.length
          ? "Some alternative exercises could not load."
          : "Alternative exercise details could not load."
      }
    };
  }
  return { data: resolved, status: statusFromMetadata([alternatives.meta]) };
}
