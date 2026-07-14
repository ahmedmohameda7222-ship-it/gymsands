import type { Workout } from "@/types";
import { activityCatalogSlug } from "./adapters";
import type { ActivityCatalogFilterOptions, ActivityCatalogSearchParams, TrainingActivity } from "./types";

export type LegacyWorkoutFilters = {
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

export type LegacyWorkoutFilterOptions = {
  muscleCategories: string[];
  primaryMuscles: string[];
  equipmentRequired: string[];
  mechanics: string[];
  exerciseTypes: string[];
  forceTypes: string[];
  experienceLevels: string[];
  secondaryMuscles: string[];
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function selectedMatch(values: Array<string | null | undefined>, selected: string[] | undefined) {
  if (!selected?.length) return true;
  const normalized = values.map(normalize).filter(Boolean);
  return selected.some((item) => normalized.includes(normalize(item)));
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right));
}

function selectedValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function equipmentSelections(filters: LegacyWorkoutFilters) {
  return selectedValues([...(filters.equipmentRequired ?? []), filters.equipment]);
}

function difficultySelections(filters: LegacyWorkoutFilters) {
  return selectedValues([...(filters.experienceLevels ?? []), filters.difficulty]);
}

function activityTypeSelections(filters: LegacyWorkoutFilters) {
  return selectedValues([...(filters.exerciseTypes ?? []), ...(filters.categories ?? []), filters.category]);
}

export function legacyFiltersRequireCompatibilityScan(filters: LegacyWorkoutFilters) {
  return Boolean(
    filters.muscleCategories?.length ||
    filters.primaryMuscles?.length ||
    filters.mechanics?.length ||
    filters.forceTypes?.length ||
    filters.secondaryMuscles?.length ||
    equipmentSelections(filters).length > 1 ||
    difficultySelections(filters).length > 1 ||
    activityTypeSelections(filters).length > 1
  );
}

export function legacyFiltersToCatalogSearch(
  query: string,
  filters: LegacyWorkoutFilters,
  page: number,
  pageSize = 100,
  locale = "en"
): ActivityCatalogSearchParams {
  const equipment = equipmentSelections(filters);
  const difficulties = difficultySelections(filters);
  const activityTypes = activityTypeSelections(filters);
  const normalizedDifficulty = difficulties.length === 1 ? difficulties[0].toLowerCase() : undefined;
  return {
    ...(query.trim() ? { query: query.trim() } : {}),
    ...(equipment.length === 1 ? { equipment: [activityCatalogSlug(equipment[0])] } : {}),
    ...(activityTypes.length === 1 ? { activityType: activityCatalogSlug(activityTypes[0]) } : {}),
    ...(difficulties.length === 1 && ["beginner", "intermediate", "advanced"].includes(normalizedDifficulty ?? "")
      ? { difficulty: normalizedDifficulty as ActivityCatalogSearchParams["difficulty"] }
      : {}),
    limit: Math.max(1, Math.min(100, pageSize)),
    offset: Math.max(0, page) * Math.max(1, Math.min(100, pageSize)),
    locale
  };
}

export function matchesLegacyWorkoutFilters(workout: Workout, query = "", filters: LegacyWorkoutFilters = {}) {
  const secondary = workout.secondary_muscles ?? [];
  const matchesQuery = !normalize(query) || [
    workout.name, workout.target_muscle, workout.muscle_category, workout.equipment, workout.equipment_required,
    workout.category, workout.mechanics, workout.force_type, workout.difficulty, workout.experience_level, ...secondary
  ].some((value) => normalize(value).includes(normalize(query)));
  const equipment = equipmentSelections(filters);
  const experience = difficultySelections(filters);
  const activityTypes = activityTypeSelections(filters);
  return matchesQuery
    && selectedMatch([workout.muscle_category], filters.muscleCategories)
    && selectedMatch([workout.target_muscle, workout.muscle_category], filters.primaryMuscles)
    && selectedMatch([workout.equipment_required, workout.equipment], equipment)
    && selectedMatch([workout.mechanics, workout.category], filters.mechanics)
    && selectedMatch([workout.category, workout.mechanics], activityTypes)
    && selectedMatch([workout.force_type], filters.forceTypes)
    && selectedMatch([workout.experience_level, workout.difficulty], experience)
    && selectedMatch(secondary, filters.secondaryMuscles);
}

export function catalogFiltersToLegacyOptions(
  filters: ActivityCatalogFilterOptions,
  activities: TrainingActivity[] = []
): LegacyWorkoutFilterOptions {
  const muscles = activities.flatMap((activity) => activity.muscles);
  return {
    muscleCategories: uniqueSorted(muscles.map((muscle) => muscle.bodyRegion)),
    primaryMuscles: uniqueSorted(muscles.filter((muscle) => muscle.role === "primary").map((muscle) => muscle.name)),
    equipmentRequired: uniqueSorted([
      ...filters.equipment.map((item) => item.name),
      ...activities.flatMap((activity) => activity.equipment.filter((item) => item.isRequired).map((item) => item.name))
    ]),
    mechanics: uniqueSorted(activities.map((activity) => activity.movementPattern)),
    exerciseTypes: uniqueSorted(filters.activityTypes.map((item) => item.name)),
    forceTypes: [],
    experienceLevels: uniqueSorted(filters.difficulties),
    secondaryMuscles: uniqueSorted(muscles.filter((muscle) => muscle.role !== "primary").map((muscle) => muscle.name))
  };
}
