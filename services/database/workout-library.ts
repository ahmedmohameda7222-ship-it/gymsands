"use client";

import { activityToWorkout, alternativeToWorkout } from "@/lib/activity-catalog/adapter";
import type { ActivitySearchParams, CatalogSourceMetadata, TrainingActivity } from "@/lib/activity-catalog/types";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import {
  createCatalogRequestGroupId,
  getCatalogActivity,
  getCatalogActivityAlternatives,
  getCatalogFilters,
  searchCatalogActivities,
  type CatalogClientRequestOptions
} from "@/services/activity-catalog/client";
import type { ExerciseVideo, UserExerciseVideo, Workout } from "@/types";
import { formatExerciseDisplayValue, resolveExerciseDisplayLanguage, type ExerciseDisplayDomain } from "@/lib/train/exercise-display";

export const WORKOUT_LIBRARY_PAGE_SIZE = 60;

type WorkoutLibraryRequestContext = string | CatalogClientRequestOptions | undefined;

export type WorkoutFilters = {
  category?: string;
  categories?: string[];
  muscleCategories?: string[];
  primaryMuscles?: string[];
  equipment?: string;
  equipmentRequired?: string[];
  difficulty?: string;
  experienceLevels?: string[];
  mechanics?: string[];
  exerciseTypes?: string[];
  forceTypes?: string[];
  secondaryMuscles?: string[];
};

export type WorkoutFilterOptions = {
  muscleCategories: string[];
  primaryMuscles: string[];
  equipmentRequired: string[];
  mechanics: string[];
  exerciseTypes: string[];
  forceTypes: string[];
  experienceLevels: string[];
  secondaryMuscles: string[];
};

export type WorkoutFilterOption = { value: string; label: string; aliases?: string[] };
export type CanonicalWorkoutFilterOptions = {
  [Key in keyof WorkoutFilterOptions]: WorkoutFilterOption[];
};

export type WorkoutLibraryStatus = {
  source: "live" | "fallback" | "partial";
  message?: string;
};

export type WorkoutLibraryResult<T> = {
  data: T;
  status: WorkoutLibraryStatus;
  pagination?: { hasMore: boolean; nextOffset: number | null };
  filterOptions?: CanonicalWorkoutFilterOptions;
};

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

export function normalizeWorkoutFilterText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function selectedValues(...values: Array<string | string[] | undefined>) {
  return Array.from(new Set(values.flatMap((value) => Array.isArray(value) ? value : value ? [value] : []).map(normalizeWorkoutFilterText).filter(Boolean)));
}

function includesSelected(actualValues: Array<string | null | undefined>, selected: string[]) {
  if (!selected.length) return true;
  const actual = new Set(actualValues.map(normalizeWorkoutFilterText).filter(Boolean));
  return selected.some((value) => actual.has(value));
}

function canonicalApiValues(...values: Array<string | string[] | undefined>) {
  return Array.from(new Set(values.flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
    .map((value) => value.trim())
    .filter((value) => /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value))));
}

/**
 * Retain a final bounded safety predicate at the client boundary. Correctness
 * for the Exercise Library does not depend on scanning additional browser
 * pages: the legacy provider applies these same dimensions before pagination.
 */
export function matchesWorkoutFilters(activity: TrainingActivity, filters: WorkoutFilters) {
  const activityTypes = selectedValues(filters.exerciseTypes, filters.categories, filters.category);
  const difficulties = selectedValues(filters.experienceLevels, filters.difficulty);
  const equipment = selectedValues(filters.equipmentRequired, filters.equipment);
  const primaryMuscles = activity.muscles.filter((muscle) => muscle.role === "primary").flatMap((muscle) => [muscle.name, muscle.slug]);
  const secondaryMuscles = activity.muscles.filter((muscle) => muscle.role !== "primary").flatMap((muscle) => [muscle.name, muscle.slug]);
  const muscleCategories = activity.muscles.map((muscle) => muscle.bodyRegion);

  return (
    includesSelected([activity.activityType?.name, activity.activityType?.slug], activityTypes) &&
    includesSelected([activity.difficulty], difficulties) &&
    includesSelected(activity.equipment.flatMap((item) => [item.name, item.slug]), equipment) &&
    includesSelected(muscleCategories, selectedValues(filters.muscleCategories)) &&
    includesSelected(primaryMuscles, selectedValues(filters.primaryMuscles)) &&
    includesSelected([activity.movementPattern], selectedValues(filters.mechanics)) &&
    includesSelected(secondaryMuscles, selectedValues(filters.secondaryMuscles)) &&
    includesSelected([activity.forceType], selectedValues(filters.forceTypes))
  );
}

function statusFromMeta(meta: CatalogSourceMetadata): WorkoutLibraryStatus {
  if (!meta.degraded) return { source: "live" };
  return { source: "fallback", message: "Showing the Plaivra exercise library while the external catalog is unavailable." };
}

function activityToLibraryWorkout(activity: TrainingActivity, meta: CatalogSourceMetadata) {
  const workout = activityToWorkout(activity, meta);
  const muscleCategories = Array.from(new Set(activity.muscles.map((muscle) => muscle.bodyRegion?.trim()).filter(Boolean) as string[]));
  return { ...workout, muscle_category: muscleCategories.join(", ") || null, force_type: activity.forceType ?? workout.force_type };
}

export function emptyCanonicalWorkoutFilterOptions(): CanonicalWorkoutFilterOptions {
  return {
    muscleCategories: [], primaryMuscles: [], equipmentRequired: [], mechanics: [],
    exerciseTypes: [], forceTypes: [], experienceLevels: [], secondaryMuscles: []
  };
}

function filterOption(value: string | null | undefined, label?: string | null, aliases: string[] = []): WorkoutFilterOption | null {
  const cleanValue = value?.trim();
  const cleanLabel = label?.trim() || cleanValue;
  if (!cleanValue || !cleanLabel) return null;
  return { value: cleanValue, label: cleanLabel, aliases: Array.from(new Set(aliases.map((item) => item.trim()).filter(Boolean))) };
}

export function mergeCanonicalWorkoutFilterOptions(
  current: CanonicalWorkoutFilterOptions,
  incoming: CanonicalWorkoutFilterOptions
): CanonicalWorkoutFilterOptions {
  const merge = (left: WorkoutFilterOption[], right: WorkoutFilterOption[]) => {
    const byValue = new Map(left.map((item) => [item.value, item]));
    right.forEach((item) => {
      const existing = byValue.get(item.value);
      byValue.set(item.value, existing
        ? { ...item, aliases: Array.from(new Set([...(existing.aliases ?? []), ...(item.aliases ?? []), existing.label])) }
        : item);
    });
    return Array.from(byValue.values()).sort((leftItem, rightItem) => leftItem.label.localeCompare(rightItem.label));
  };
  return Object.fromEntries((Object.keys(current) as Array<keyof CanonicalWorkoutFilterOptions>)
    .map((key) => [key, merge(current[key], incoming[key])])) as CanonicalWorkoutFilterOptions;
}

function activityFilterOptions(activities: TrainingActivity[], locale?: string): CanonicalWorkoutFilterOptions {
  const options = emptyCanonicalWorkoutFilterOptions();
  const language = resolveExerciseDisplayLanguage(locale);
  const add = (key: keyof CanonicalWorkoutFilterOptions, option: WorkoutFilterOption | null) => { if (option) options[key].push(option); };
  const presented = (value: string | null | undefined, domain: ExerciseDisplayDomain) => value ? formatExerciseDisplayValue(value, language, domain) : value;
  activities.forEach((activity) => {
    add("exerciseTypes", filterOption(activity.activityType?.slug, presented(activity.activityType?.name ?? activity.activityType?.slug, "category")));
    add("experienceLevels", filterOption(activity.difficulty ? normalizeCatalogSlug(activity.difficulty) : null, presented(activity.difficulty, "difficulty")));
    add("mechanics", filterOption(activity.movementPattern ? normalizeCatalogSlug(activity.movementPattern) : null, presented(activity.movementPattern, "movement")));
    add("forceTypes", filterOption(activity.forceType ? normalizeCatalogSlug(activity.forceType) : null, presented(activity.forceType, "force")));
    activity.equipment.forEach((item) => add("equipmentRequired", filterOption(item.slug, presented(item.name || item.slug, "equipment"))));
    activity.muscles.forEach((muscle) => {
      add("muscleCategories", filterOption(muscle.bodyRegion ? normalizeCatalogSlug(muscle.bodyRegion) : null, presented(muscle.bodyRegion, "muscle")));
      add(muscle.role === "primary" ? "primaryMuscles" : "secondaryMuscles", filterOption(muscle.slug, presented(muscle.name || muscle.slug, "muscle")));
    });
  });
  return mergeCanonicalWorkoutFilterOptions(emptyCanonicalWorkoutFilterOptions(), options);
}

function normalizeCatalogSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function resolveCanonicalWorkoutFilterValues(filters: WorkoutFilters, options: CanonicalWorkoutFilterOptions): WorkoutFilters {
  const resolve = (selected: string[] | undefined, available: WorkoutFilterOption[]) => (selected ?? []).map((value) => {
    const normalized = normalizeWorkoutFilterText(value);
    return available.find((option) => [option.value, option.label, ...(option.aliases ?? [])]
      .some((candidate) => normalizeWorkoutFilterText(candidate) === normalized))?.value ?? value;
  });
  return {
    ...filters,
    muscleCategories: resolve(filters.muscleCategories, options.muscleCategories),
    primaryMuscles: resolve(filters.primaryMuscles, options.primaryMuscles),
    equipmentRequired: resolve(filters.equipmentRequired, options.equipmentRequired),
    mechanics: resolve(filters.mechanics, options.mechanics),
    exerciseTypes: resolve(filters.exerciseTypes, options.exerciseTypes),
    forceTypes: resolve(filters.forceTypes, options.forceTypes),
    experienceLevels: resolve(filters.experienceLevels, options.experienceLevels),
    secondaryMuscles: resolve(filters.secondaryMuscles, options.secondaryMuscles)
  };
}

export function matchesWorkoutRecord(
  workout: Workout,
  query: string,
  filters: WorkoutFilters,
  options: CanonicalWorkoutFilterOptions = emptyCanonicalWorkoutFilterOptions()
) {
  const normalizedQuery = normalizeWorkoutFilterText(query);
  const searchable = [workout.name, workout.target_muscle, workout.muscle_category, workout.equipment,
    workout.equipment_required, workout.difficulty, workout.experience_level, workout.mechanics,
    workout.force_type, ...(workout.secondary_muscles ?? [])];
  if (normalizedQuery && !searchable.some((value) => normalizeWorkoutFilterText(value).includes(normalizedQuery))) return false;

  const overlaps = (actualValues: Array<string | null | undefined>, selected: string[] | undefined, available: WorkoutFilterOption[]) => {
    if (!selected?.length) return true;
    const actual = new Set(actualValues.flatMap((value) => (value ?? "").split(",")).map(normalizeWorkoutFilterText).filter(Boolean));
    return selected.some((value) => {
      const normalized = normalizeWorkoutFilterText(value);
      const option = available.find((item) => normalizeWorkoutFilterText(item.value) === normalized);
      return [value, option?.label, ...(option?.aliases ?? [])].some((candidate) => actual.has(normalizeWorkoutFilterText(candidate)));
    });
  };
  return (
    overlaps([workout.muscle_category ?? workout.target_muscle], filters.muscleCategories, options.muscleCategories) &&
    overlaps([workout.target_muscle ?? workout.muscle_category], filters.primaryMuscles, options.primaryMuscles) &&
    overlaps([workout.equipment_required ?? workout.equipment], filters.equipmentRequired, options.equipmentRequired) &&
    overlaps([workout.mechanics], filters.mechanics, options.mechanics) &&
    overlaps([workout.category], filters.exerciseTypes, options.exerciseTypes) &&
    overlaps([workout.force_type], filters.forceTypes, options.forceTypes) &&
    overlaps([workout.experience_level ?? workout.difficulty], filters.experienceLevels, options.experienceLevels) &&
    overlaps(workout.secondary_muscles ?? [], filters.secondaryMuscles, options.secondaryMuscles)
  );
}

export function mergeWorkoutFilterOptions(current: WorkoutFilterOptions, workouts: Workout[]) {
  const values = (items: Array<string | null | undefined>) => Array.from(new Set(
    items.flatMap((item) => (item ?? "").split(",")).map((item) => item.trim()).filter(Boolean)
  )).sort((left, right) => left.localeCompare(right));
  const merge = (existing: string[], discovered: Array<string | null | undefined>) => values([...existing, ...discovered]);
  return {
    muscleCategories: merge(current.muscleCategories, workouts.map((workout) => workout.muscle_category)),
    primaryMuscles: merge(current.primaryMuscles, workouts.map((workout) => workout.target_muscle)),
    equipmentRequired: merge(current.equipmentRequired, workouts.map((workout) => workout.equipment_required ?? workout.equipment)),
    mechanics: merge(current.mechanics, workouts.map((workout) => workout.movement_pattern ?? workout.mechanics)),
    exerciseTypes: merge(current.exerciseTypes, workouts.map((workout) => workout.category)),
    forceTypes: merge(current.forceTypes, workouts.map((workout) => workout.force_type)),
    experienceLevels: merge(current.experienceLevels, workouts.map((workout) => workout.experience_level ?? workout.difficulty)),
    secondaryMuscles: merge(current.secondaryMuscles, workouts.flatMap((workout) => workout.secondary_muscles ?? []))
  };
}

function catalogSearchParams(query: string, filters: WorkoutFilters, limit: number, offset: number, locale?: string): ActivitySearchParams {
  const activityTypes = canonicalApiValues(filters.exerciseTypes, filters.categories, filters.category);
  const difficulties = canonicalApiValues(filters.experienceLevels, filters.difficulty);
  const equipment = canonicalApiValues(filters.equipmentRequired, filters.equipment);
  const primaryMuscles = canonicalApiValues(filters.primaryMuscles);
  const secondaryMuscles = canonicalApiValues(filters.secondaryMuscles);
  const muscleCategories = canonicalApiValues(filters.muscleCategories);
  const movementPatterns = canonicalApiValues(filters.mechanics);
  const forceTypes = canonicalApiValues(filters.forceTypes);
  const singleDifficulty = difficulties.length === 1 && ["beginner", "intermediate", "advanced"].includes(difficulties[0])
    ? difficulties[0] as ActivitySearchParams["difficulty"]
    : undefined;
  return {
    ...(query ? { query } : {}),
    ...(equipment.length ? { equipment } : {}),
    ...(activityTypes.length === 1 ? { activityType: activityTypes[0] } : {}),
    ...(activityTypes.length > 1 ? { activityTypes } : {}),
    ...(singleDifficulty ? { difficulty: singleDifficulty } : {}),
    ...(!singleDifficulty && difficulties.length ? { difficulties } : {}),
    ...(primaryMuscles.length ? { primaryMuscles } : {}),
    ...(secondaryMuscles.length ? { secondaryMuscles } : {}),
    ...(muscleCategories.length ? { muscleCategories } : {}),
    ...(movementPatterns.length ? { movementPatterns } : {}),
    ...(forceTypes.length ? { forceTypes } : {}),
    ...(locale ? { locale } : {}),
    limit,
    offset
  };
}

export async function getWorkoutCategories(locale?: string, context?: WorkoutLibraryRequestContext) {
  const filters = await getCatalogFilters({ locale }, context);
  return Array.from(new Set([
    ...filters.data.activityTypes.map((item) => item.name),
    ...filters.data.equipment.map((item) => item.name)
  ])).sort((left, right) => left.localeCompare(right));
}

export async function getWorkoutFilterOptions(locale?: string, context?: WorkoutLibraryRequestContext) {
  return (await getWorkoutFilterOptionsWithStatus(locale, context)).data;
}

export async function getWorkoutFilterOptionsWithStatus(locale?: string, context?: WorkoutLibraryRequestContext): Promise<WorkoutLibraryResult<WorkoutFilterOptions>> {
  const canonical = await getCanonicalWorkoutFilterOptionsWithStatus(locale, context);
  const labels = (items: WorkoutFilterOption[]) => items.map((item) => item.label);
  return {
    data: Object.fromEntries((Object.keys(canonical.data) as Array<keyof CanonicalWorkoutFilterOptions>)
      .map((key) => [key, labels(canonical.data[key])])) as WorkoutFilterOptions,
    status: canonical.status
  };
}

export async function getCanonicalWorkoutFilterOptionsWithStatus(locale?: string, context?: WorkoutLibraryRequestContext): Promise<WorkoutLibraryResult<CanonicalWorkoutFilterOptions>> {
  const filters = await getCatalogFilters({ locale }, context);
  const data = emptyCanonicalWorkoutFilterOptions();
  const language = resolveExerciseDisplayLanguage(locale);
  const mapTaxonomy = (items: Array<{ slug: string; name: string }> = [], domain: ExerciseDisplayDomain) => items
    .map((item) => filterOption(item.slug, formatExerciseDisplayValue(item.name || item.slug, language, domain)))
    .filter((item): item is WorkoutFilterOption => Boolean(item));
  data.equipmentRequired = mapTaxonomy(filters.data.equipment, "equipment");
  data.exerciseTypes = mapTaxonomy(filters.data.activityTypes, "category");
  data.experienceLevels = filters.data.difficulties
    .map((item) => filterOption(normalizeCatalogSlug(item), formatExerciseDisplayValue(item, language, "difficulty")))
    .filter((option): option is WorkoutFilterOption => Boolean(option));
  data.primaryMuscles = mapTaxonomy(filters.data.primaryMuscles, "muscle");
  data.secondaryMuscles = mapTaxonomy(filters.data.secondaryMuscles, "muscle");
  data.muscleCategories = mapTaxonomy(filters.data.muscleCategories, "muscle");
  data.mechanics = mapTaxonomy(filters.data.movementPatterns, "movement");
  data.forceTypes = mapTaxonomy(filters.data.forceTypes, "force");
  return {
    data,
    status: statusFromMeta(filters.meta)
  };
}

async function loadWorkoutPage(query: string, filters: WorkoutFilters, startOffset: number, locale?: string, context?: WorkoutLibraryRequestContext) {
  const requestOffset = Number.isSafeInteger(startOffset) && startOffset >= 0 ? startOffset : 0;
  const requestContext = context ?? createCatalogRequestGroupId();
  const response = await searchCatalogActivities(
    catalogSearchParams(query, filters, WORKOUT_LIBRARY_PAGE_SIZE, requestOffset, locale),
    requestContext
  );
  const filterOptions = response.meta.source === "legacy"
    ? activityFilterOptions(response.data, locale)
    : emptyCanonicalWorkoutFilterOptions();
  const workouts = response.data
    .filter((activity) => matchesWorkoutFilters(activity, filters))
    .map((activity) => activityToLibraryWorkout(activity, response.meta));
  const providerNextOffset = response.pagination.nextOffset ?? null;
  const nextOffset = response.data.length > 0 && providerNextOffset !== null && providerNextOffset > requestOffset
    ? providerNextOffset
    : null;
  return {
    workouts,
    filterOptions,
    meta: response.meta,
    pagination: { hasMore: nextOffset !== null, nextOffset }
  };
}

export async function getWorkouts(query = "", filters: WorkoutFilters = {}, page = 0, locale?: string, context?: WorkoutLibraryRequestContext) {
  return (await loadWorkoutPage(query.trim(), filters, Math.max(0, page) * WORKOUT_LIBRARY_PAGE_SIZE, locale, context)).workouts;
}

export async function getWorkoutsWithStatus(query = "", filters: WorkoutFilters = {}, providerOffset = 0, locale?: string, context?: WorkoutLibraryRequestContext): Promise<WorkoutLibraryResult<Workout[]>> {
  const result = await loadWorkoutPage(query.trim(), filters, providerOffset, locale, context);
  return { data: result.workouts, status: statusFromMeta(result.meta), pagination: result.pagination, filterOptions: result.filterOptions };
}

export async function getWorkout(id: string, locale?: string, context?: WorkoutLibraryRequestContext) {
  const result = await getCatalogActivity(id, locale, context);
  return activityToLibraryWorkout(result.data, result.meta);
}

export async function getWorkoutAlternatives(id: string, limit = 6, locale?: string, context?: WorkoutLibraryRequestContext) {
  const result = await getCatalogActivityAlternatives(id, { limit: Math.min(Math.max(limit, 1), 20), locale }, context);
  return {
    data: result.data.map((alternative) => alternativeToWorkout(alternative, result.meta)),
    status: statusFromMeta(result.meta)
  };
}

export async function getExerciseVideos(query = "", locale?: string, context?: WorkoutLibraryRequestContext) {
  const result = await searchCatalogActivities({ ...(query.trim() ? { query: query.trim() } : {}), ...(locale ? { locale } : {}), limit: 100, offset: 0 }, context);
  return result.data.map((activity): ExerciseVideo => ({
    id: activity.id,
    exercise_name: activity.name,
    category_type: activity.activityType?.name ?? null,
    category: activity.muscles.find((muscle) => muscle.role === "primary")?.name ?? null,
    exercise_url: activity.guideUrl ?? "",
    video_url: activity.videoUrl ?? null,
    instructions: [...activity.instructions].sort((left, right) => left.order - right.order).map((step) => step.text).join("\n") || null,
    source: result.meta.source,
    muscle_category: Array.from(new Set(activity.muscles.map((muscle) => muscle.bodyRegion?.trim()).filter(Boolean))).join(", ") || null,
    equipment_required: activity.equipment.map((item) => item.name).join(", ") || null,
    mechanics: activity.movementPattern,
    force_type: activity.forceType ?? null,
    experience_level: activity.difficulty,
    secondary_muscles: activity.muscles.filter((muscle) => muscle.role !== "primary").map((muscle) => muscle.name),
    is_global: true
  }));
}

export async function getUserExerciseVideo(userId: string, exerciseId: string) {
  if (!canUseUserData(userId)) return null;
  const { data, error } = await supabase!
    .from("user_exercise_videos")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (error) {
    console.warn("Plaivra could not load custom exercise video.", error.message);
    return null;
  }
  return data as UserExerciseVideo | null;
}

export async function upsertUserExerciseVideo(userId: string, exerciseId: string, customVideoUrl: string) {
  const cleanUrl = customVideoUrl.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(cleanUrl)) throw new Error("Enter a valid http or https video URL.");
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const payload = { user_id: userId, exercise_id: exerciseId, custom_video_url: cleanUrl };
  const { data, error } = await supabase!
    .from("user_exercise_videos")
    .upsert(payload, { onConflict: "user_id,exercise_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as UserExerciseVideo;
}

export async function resetUserExerciseVideo(userId: string, exerciseId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!
    .from("user_exercise_videos")
    .delete()
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
  return true;
}
