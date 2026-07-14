"use client";

import { trainingActivityToWorkout } from "@/lib/activity-catalog/adapters";
import {
  catalogFiltersToLegacyOptions,
  legacyFiltersRequireCompatibilityScan,
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
const compatibilityScanPageLimit = 3;
const canonicalCatalogLocale = "en";

export type WorkoutFilters = LegacyWorkoutFilters;
export type WorkoutFilterOptions = LegacyWorkoutFilterOptions;

export type WorkoutLibraryStatus = {
  source: "live" | "fallback" | "partial";
  catalogSource?: "external" | "legacy";
  degraded?: boolean;
  message?: string;
};

export type WorkoutLibraryPagination = {
  page: number;
  pageSize: number;
  hasMore: boolean;
  bounded: boolean;
};

export type WorkoutLibraryResult<T> = {
  data: T;
  status: WorkoutLibraryStatus;
  pagination?: WorkoutLibraryPagination;
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

function boundedStatus(status: WorkoutLibraryStatus): WorkoutLibraryStatus {
  const boundedMessage = "Results are limited to the approved bounded compatibility scan; additional matching catalog records may exist.";
  return {
    ...status,
    source: status.source === "live" ? "partial" : status.source,
    message: [status.message, boundedMessage].filter(Boolean).join(" ")
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

function mapActivities(
  activities: Array<{ activity: TrainingActivity; source: ActivityCatalogResultMeta["source"] }>,
  query: string,
  filters: WorkoutFilters
) {
  return dedupeWorkouts(
    activities
      .map(({ activity, source }) => trainingActivityToWorkout(activity, source))
      .filter((workout) => matchesLegacyWorkoutFilters(workout, query, filters))
  );
}

export async function getWorkoutFilterOptionsWithStatus(signal?: AbortSignal): Promise<WorkoutLibraryResult<WorkoutFilterOptions>> {
  const [filters, sample] = await Promise.all([
    getActivityCatalogFilters({ locale: canonicalCatalogLocale, signal }),
    searchActivityCatalog({ limit: workoutPageSize, offset: 0, locale: canonicalCatalogLocale, signal })
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
  const logicalPage = Math.max(0, page);
  const directParams = legacyFiltersToCatalogSearch(
    query,
    filters,
    logicalPage,
    workoutPageSize,
    canonicalCatalogLocale
  );

  if (!legacyFiltersRequireCompatibilityScan(filters)) {
    const result = await searchActivityCatalog({ ...directParams, signal });
    const data = mapActivities(
      result.data.map((activity) => ({ activity, source: result.meta.source })),
      query,
      filters
    );
    return {
      data,
      status: statusFromMetadata([result.meta]),
      pagination: {
        page: logicalPage,
        pageSize: workoutPageSize,
        hasMore: result.pagination?.nextOffset != null,
        bounded: false
      }
    };
  }

  const logicalStart = logicalPage * workoutPageSize;
  const logicalEnd = logicalStart + workoutPageSize;
  const targetMatchCount = logicalEnd + 1;
  const metadata: ActivityCatalogResultMeta[] = [];
  const matches: Workout[] = [];
  const seenIds = new Set<string>();
  let nextOffset: number | null = 0;
  let scannedPages = 0;

  while (nextOffset != null && scannedPages < compatibilityScanPageLimit && matches.length < targetMatchCount) {
    const scanParams = legacyFiltersToCatalogSearch(
      query,
      filters,
      0,
      workoutPageSize,
      canonicalCatalogLocale
    );
    const result = await searchActivityCatalog({ ...scanParams, offset: nextOffset, signal });
    metadata.push(result.meta);
    scannedPages += 1;

    const pageMatches = mapActivities(
      result.data.map((activity) => ({ activity, source: result.meta.source })),
      query,
      filters
    );
    for (const workout of pageMatches) {
      if (seenIds.has(workout.id)) continue;
      seenIds.add(workout.id);
      matches.push(workout);
    }
    nextOffset = result.pagination?.nextOffset ?? null;
  }

  const data = matches.slice(logicalStart, logicalEnd);
  const hasMore = matches.length > logicalEnd;
  const bounded = !hasMore && nextOffset != null && scannedPages >= compatibilityScanPageLimit;
  const status = bounded ? boundedStatus(statusFromMetadata(metadata)) : statusFromMetadata(metadata);

  return {
    data,
    status,
    pagination: {
      page: logicalPage,
      pageSize: workoutPageSize,
      hasMore,
      bounded
    }
  };
}

export async function getWorkouts(query = "", filters: WorkoutFilters = {}, page = 0, signal?: AbortSignal) {
  return (await getWorkoutsWithStatus(query, filters, page, signal)).data;
}

export async function getWorkout(identifier: string, signal?: AbortSignal) {
  const result = await getActivityCatalogActivity(identifier, { locale: canonicalCatalogLocale, signal });
  return trainingActivityToWorkout(result.data, result.meta.source);
}

export async function getWorkoutAlternatives(
  identifier: string,
  options: { limit?: number; locale?: string; signal?: AbortSignal } = {}
): Promise<WorkoutLibraryResult<Workout[]>> {
  const alternatives = await getActivityCatalogAlternatives(identifier, {
    limit: Math.max(1, Math.min(20, options.limit ?? 6)),
    locale: canonicalCatalogLocale,
    signal: options.signal
  });
  if (!alternatives.data.length) return { data: [], status: statusFromMetadata([alternatives.meta]) };

  const details = await Promise.allSettled(
    alternatives.data.slice(0, options.limit ?? 6).map((alternative) =>
      getActivityCatalogActivity(alternative.alternativeActivityId, { locale: canonicalCatalogLocale, signal: options.signal })
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
