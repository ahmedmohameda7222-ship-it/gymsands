"use client";

import { libraryActivityToWorkout, libraryAlternativeToWorkout } from "@/lib/activity-catalog/adapter";
import type { LibraryProviderMeta } from "@/lib/activity-catalog/library-types";
import {
  createCatalogRequestGroupId,
  getLibraryDomainActivity,
  getLibraryDomainActivityAlternatives,
  getLibraryDomainFilters,
  searchLibraryDomainActivities,
  type CatalogClientRequestOptions
} from "@/services/activity-catalog/client";
import type { Workout } from "@/types";
import {
  emptyCanonicalWorkoutFilterOptions,
  getExerciseVideos,
  getUserExerciseVideo,
  matchesWorkoutRecord,
  mergeCanonicalWorkoutFilterOptions,
  normalizeWorkoutFilterText,
  resetUserExerciseVideo,
  resolveCanonicalWorkoutFilterValues as resolveLegacyCanonicalWorkoutFilterValues,
  upsertUserExerciseVideo,
  type CanonicalWorkoutFilterOptions,
  type WorkoutFilterOption,
  type WorkoutFilterOptions,
  type WorkoutFilters,
  type WorkoutLibraryStatus
} from "./workout-library";

export {
  emptyCanonicalWorkoutFilterOptions,
  getExerciseVideos,
  getUserExerciseVideo,
  matchesWorkoutRecord,
  mergeCanonicalWorkoutFilterOptions,
  normalizeWorkoutFilterText,
  resetUserExerciseVideo,
  upsertUserExerciseVideo
};
export type { CanonicalWorkoutFilterOptions, WorkoutFilterOption, WorkoutFilterOptions, WorkoutFilters, WorkoutLibraryStatus };

export const WORKOUT_LIBRARY_PAGE_SIZE = 50;
const STRENGTH_DOMAIN = "strength";
type WorkoutLibraryRequestContext = string | CatalogClientRequestOptions | undefined;
let activeNativeSearchController: AbortController | null = null;

type NativeBrowserPagination = {
  hasMore: boolean;
  nextCursor: string | null;
  restarted: boolean;
};

export type NativeWorkoutLibraryResult<T> = {
  data: T;
  status: WorkoutLibraryStatus;
  pagination?: NativeBrowserPagination;
  filterOptions?: CanonicalWorkoutFilterOptions;
  libraryRelease?: { id: string; version: string; checksum: string } | null;
};

function statusFromMeta(meta: LibraryProviderMeta): WorkoutLibraryStatus {
  if (!meta.degraded) return { source: "live" };
  return { source: "fallback", message: "Showing the Plaivra exercise library while the Activity Catalog is temporarily unavailable." };
}

export function resolveCanonicalWorkoutFilterValues(filters: WorkoutFilters, options: CanonicalWorkoutFilterOptions): WorkoutFilters {
  const resolved = resolveLegacyCanonicalWorkoutFilterValues(filters, options);
  const next = { ...resolved };
  (Object.keys(options) as Array<keyof CanonicalWorkoutFilterOptions>).forEach((key) => {
    if (options[key].length === 0) (next as Record<string, unknown>)[key] = [];
  });
  return next;
}

export async function getCanonicalWorkoutFilterOptionsWithStatus(locale?: string, context?: WorkoutLibraryRequestContext): Promise<NativeWorkoutLibraryResult<CanonicalWorkoutFilterOptions>> {
  const result = await getLibraryDomainFilters(STRENGTH_DOMAIN, locale, context);
  // P10E Strength intentionally publishes no Library filter definitions. Keep
  // the screen shell but do not invent dimensions from legacy or page samples.
  return {
    data: emptyCanonicalWorkoutFilterOptions(),
    status: statusFromMeta(result.meta),
    libraryRelease: result.meta.libraryRelease ? { id: result.meta.libraryRelease.id, version: result.meta.libraryRelease.version, checksum: result.meta.libraryRelease.checksum } : null
  };
}

export async function getWorkoutFilterOptionsWithStatus(locale?: string, context?: WorkoutLibraryRequestContext): Promise<NativeWorkoutLibraryResult<WorkoutFilterOptions>> {
  const canonical = await getCanonicalWorkoutFilterOptionsWithStatus(locale, context);
  return {
    data: { muscleCategories: [], primaryMuscles: [], equipmentRequired: [], mechanics: [], exerciseTypes: [], forceTypes: [], experienceLevels: [], secondaryMuscles: [] },
    status: canonical.status,
    libraryRelease: canonical.libraryRelease
  };
}

export async function getWorkoutFilterOptions(locale?: string, context?: WorkoutLibraryRequestContext) {
  return (await getWorkoutFilterOptionsWithStatus(locale, context)).data;
}

export async function getWorkoutCategories(locale?: string, context?: WorkoutLibraryRequestContext) {
  await getLibraryDomainFilters(STRENGTH_DOMAIN, locale, context);
  return [] as string[];
}

function nativeSearchContext(context?: WorkoutLibraryRequestContext): CatalogClientRequestOptions {
  activeNativeSearchController?.abort();
  activeNativeSearchController = new AbortController();
  if (typeof context === "string") return { requestGroupId: context, signal: activeNativeSearchController.signal };
  return {
    ...(context ?? {}),
    requestGroupId: context?.requestGroupId ?? createCatalogRequestGroupId(),
    signal: activeNativeSearchController.signal
  };
}

export async function getWorkoutsWithStatus(
  query = "",
  _filters: WorkoutFilters = {},
  cursor: string | null = null,
  locale?: string,
  context?: WorkoutLibraryRequestContext
): Promise<NativeWorkoutLibraryResult<Workout[]>> {
  const result = await searchLibraryDomainActivities({
    domain: STRENGTH_DOMAIN,
    ...(query.trim() ? { query: query.trim() } : {}),
    ...(locale ? { locale } : {}),
    limit: WORKOUT_LIBRARY_PAGE_SIZE,
    ...(cursor ? { cursor } : {})
  }, nativeSearchContext(context));

  if (cursor && result.restarted) {
    // A release-bound cursor mismatch must never append a fresh release page to
    // stale rows. Reload once: URL/localStorage preserve the active query and
    // the next mount starts from a clean, cursorless current-release page.
    if (typeof window !== "undefined") window.location.reload();
    return {
      data: [],
      status: statusFromMeta(result.meta),
      pagination: { hasMore: false, nextCursor: null, restarted: true },
      filterOptions: emptyCanonicalWorkoutFilterOptions(),
      libraryRelease: result.meta.libraryRelease ? { id: result.meta.libraryRelease.id, version: result.meta.libraryRelease.version, checksum: result.meta.libraryRelease.checksum } : null
    };
  }

  const nextCursor = result.pagination.nextCursor;
  return {
    data: result.data.map((activity) => libraryActivityToWorkout(activity, result.meta)),
    status: statusFromMeta(result.meta),
    pagination: {
      hasMore: nextCursor !== null,
      nextCursor,
      restarted: Boolean(result.restarted)
    },
    filterOptions: emptyCanonicalWorkoutFilterOptions(),
    libraryRelease: result.meta.libraryRelease ? { id: result.meta.libraryRelease.id, version: result.meta.libraryRelease.version, checksum: result.meta.libraryRelease.checksum } : null
  };
}

export async function getWorkouts(query = "", filters: WorkoutFilters = {}, page = 0, locale?: string, context?: WorkoutLibraryRequestContext) {
  if (page !== 0) throw new Error("Random-access Workout Library pages are not supported by the native cursor contract.");
  return (await getWorkoutsWithStatus(query, filters, null, locale, context)).data;
}

export async function getWorkout(id: string, locale?: string, context?: WorkoutLibraryRequestContext) {
  const result = await getLibraryDomainActivity(STRENGTH_DOMAIN, id, locale, context);
  return libraryActivityToWorkout(result.data, result.meta);
}

export async function getWorkoutAlternatives(id: string, limit = 6, locale?: string, context?: WorkoutLibraryRequestContext) {
  const result = await getLibraryDomainActivityAlternatives(STRENGTH_DOMAIN, id, { limit: Math.min(Math.max(limit, 1), 10), locale }, context);
  return { data: result.data.map((alternative) => libraryAlternativeToWorkout(alternative, result.meta)), status: statusFromMeta(result.meta) };
}
