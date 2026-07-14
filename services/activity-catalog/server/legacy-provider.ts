import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultExerciseInstructions, sampleExerciseVideos, sampleWorkouts } from "@/data/workouts";
import { ActivityCatalogError } from "@/lib/activity-catalog/errors";
import {
  activityCatalogSlug,
  legacyWorkoutToTrainingActivity,
  trainingActivityAlternativeFromActivity
} from "@/lib/activity-catalog/adapters";
import type {
  ActivityCatalogAlternative,
  ActivityCatalogAlternativesOptions,
  ActivityCatalogFilterOptions,
  ActivityCatalogRequestOptions,
  ActivityCatalogResult,
  ActivityCatalogSearchParams,
  ActivityCatalogSport,
  ActivityCatalogSportSessionTemplate,
  ActivityCatalogTaxonomyItem,
  TrainingActivity
} from "@/lib/activity-catalog/types";
import {
  validateActivityCatalogLocale,
  validateActivityCatalogSearchParams,
  validateActivityCatalogSlug,
  validateActivityIdentifier
} from "@/lib/activity-catalog/validation";
import type { ExerciseVideo, Workout } from "@/types";
import type { ActivityCatalogProvider } from "./provider";

type ActiveExerciseRow = {
  id: string;
  name: string;
  source?: string | null;
  source_url?: string | null;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  equipment: string[] | null;
  difficulty: string | null;
  mechanics: string | null;
  movement_pattern: string | null;
  force_type: string | null;
  instructions: string | null;
  video_url: string | null;
  is_global: boolean;
};

type LegacyLoadResult = { activities: TrainingActivity[]; degraded: boolean };

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function hydrateWorkout(workout: Workout): Workout {
  return {
    ...workout,
    muscle_category: workout.muscle_category ?? workout.target_muscle,
    equipment_required: workout.equipment_required ?? workout.equipment,
    experience_level: workout.experience_level ?? workout.difficulty,
    secondary_muscles: workout.secondary_muscles ?? [],
    activity_catalog: workout.activity_catalog ?? {
      source: "legacy",
      activityId: workout.id,
      slug: activityCatalogSlug(`${workout.name}_${workout.id}`),
      version: 1,
      metricSchema: null
    }
  };
}

function videoToWorkout(video: ExerciseVideo): Workout {
  return hydrateWorkout({
    id: video.id,
    name: video.exercise_name,
    category: video.category_type ?? "Exercise",
    target_muscle: video.muscle_category ?? video.category ?? "General",
    equipment: video.equipment_required ?? (video.category_type === "Equipment" ? video.category ?? "Varies" : "Varies"),
    difficulty: video.experience_level ?? "Unspecified",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: video.instructions || defaultExerciseInstructions,
    notes: null,
    muscle_category: video.muscle_category ?? video.category,
    equipment_required: video.equipment_required ?? null,
    mechanics: video.mechanics ?? null,
    force_type: video.force_type ?? null,
    experience_level: video.experience_level ?? "Unspecified",
    secondary_muscles: video.secondary_muscles ?? [],
    exercise_url: video.exercise_url,
    video_url: video.video_url,
    is_global: video.is_global
  });
}

function activeExerciseToWorkout(exercise: ActiveExerciseRow): Workout {
  const equipment = exercise.equipment?.length ? exercise.equipment.join(", ") : "Varies";
  return hydrateWorkout({
    id: exercise.id,
    name: exercise.name,
    category: exercise.mechanics || exercise.movement_pattern || "Exercise",
    target_muscle: exercise.primary_muscle || "General",
    equipment,
    difficulty: exercise.difficulty || "Unspecified",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: exercise.instructions || defaultExerciseInstructions,
    notes: exercise.source ? `Source: ${exercise.source}` : null,
    muscle_category: exercise.primary_muscle,
    equipment_required: equipment,
    mechanics: exercise.mechanics || exercise.movement_pattern,
    force_type: exercise.force_type,
    experience_level: exercise.difficulty || "Unspecified",
    secondary_muscles: exercise.secondary_muscles ?? [],
    exercise_url: exercise.source_url,
    video_url: exercise.video_url,
    is_global: exercise.is_global
  });
}

function localActivities() {
  return uniqueBy(
    [...sampleWorkouts.map(hydrateWorkout), ...sampleExerciseVideos.map(videoToWorkout)].map(legacyWorkoutToTrainingActivity),
    (activity) => activity.id
  );
}

function legacyMeta(locale: string, degraded: boolean, fallbackReason?: ActivityCatalogResult<unknown>["meta"]["fallbackReason"]) {
  return {
    source: "legacy" as const,
    degraded,
    apiVersion: "legacy-v1",
    locale,
    ...(fallbackReason ? { fallbackReason } : {})
  };
}

function matchesSearch(activity: TrainingActivity, params: ActivityCatalogSearchParams) {
  const query = normalize(params.query);
  if (query && ![
    activity.name,
    activity.shortDescription,
    activity.activityType.name,
    activity.movementPattern,
    ...activity.equipment.map((item) => item.name),
    ...activity.muscles.map((item) => item.name)
  ].some((value) => normalize(value).includes(query))) return false;
  if (params.sport || params.sessionType || params.phase || params.goal) return false;
  if (params.activityType && activity.activityType.slug !== params.activityType) return false;
  if (params.difficulty && normalize(activity.difficulty) !== params.difficulty) return false;
  if (params.equipment?.length && !params.equipment.some((slug) => activity.equipment.some((item) => item.slug === slug))) return false;
  return true;
}

function filterOptions(activities: TrainingActivity[]): ActivityCatalogFilterOptions {
  const dedupeTaxonomy = (items: ActivityCatalogTaxonomyItem[]) => uniqueBy(items, (item) => item.slug).sort((a, b) => a.name.localeCompare(b.name));
  return {
    sports: [],
    activityTypes: dedupeTaxonomy(activities.map((activity) => activity.activityType)),
    sessionTypes: [],
    sessionPhases: [],
    equipment: dedupeTaxonomy(activities.flatMap((activity) => activity.equipment.map(({ isRequired: _required, ...item }) => item))),
    trainingGoals: [],
    difficulties: Array.from(new Set(activities.map((activity) => activity.difficulty).filter((value): value is string => Boolean(value)))).sort()
  };
}

export class LegacyActivityCatalogProvider implements ActivityCatalogProvider {
  constructor(private readonly supabase: SupabaseClient | null) {}

  private async loadActivities(): Promise<LegacyLoadResult> {
    const local = localActivities();
    if (!this.supabase) return { activities: local, degraded: true };
    const [workoutResult, videoResult, exerciseResult] = await Promise.all([
      this.supabase.from("workouts").select("*").eq("is_global", true).limit(5000),
      this.supabase.from("exercise_videos").select("*").eq("is_global", true).limit(5000),
      this.supabase
        .from("exercises")
        .select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global")
        .eq("is_global", true)
        .eq("is_approved", true)
        .limit(5000)
    ]);
    if (workoutResult.error || videoResult.error) return { activities: local, degraded: true };
    const workouts = ((workoutResult.data ?? []) as Workout[]).map(hydrateWorkout);
    const videos = ((videoResult.data ?? []) as ExerciseVideo[]).map(videoToWorkout);
    const active = exerciseResult.error ? [] : ((exerciseResult.data ?? []) as ActiveExerciseRow[]).map(activeExerciseToWorkout);
    const databaseActivities = [...active, ...workouts, ...videos].map(legacyWorkoutToTrainingActivity);
    return {
      activities: uniqueBy([...databaseActivities, ...local], (activity) => activity.id),
      degraded: Boolean(exerciseResult.error)
    };
  }

  async listSports(options: ActivityCatalogRequestOptions = {}): Promise<ActivityCatalogResult<ActivityCatalogSport[]>> {
    const locale = validateActivityCatalogLocale(options.locale);
    return { data: [], meta: legacyMeta(locale, false) };
  }

  async getSportSessionTemplate(
    sportSlug: string,
    options: ActivityCatalogRequestOptions = {}
  ): Promise<ActivityCatalogResult<ActivityCatalogSportSessionTemplate>> {
    validateActivityCatalogSlug(sportSlug, "sport");
    validateActivityCatalogLocale(options.locale);
    throw new ActivityCatalogError("not_found");
  }

  async getFilters(options: ActivityCatalogRequestOptions & { sport?: string } = {}): Promise<ActivityCatalogResult<ActivityCatalogFilterOptions>> {
    const locale = validateActivityCatalogLocale(options.locale);
    if (options.sport) validateActivityCatalogSlug(options.sport, "sport");
    const loaded = await this.loadActivities();
    return {
      data: options.sport ? filterOptions([]) : filterOptions(loaded.activities),
      meta: legacyMeta(locale, loaded.degraded)
    };
  }

  async searchActivities(params: ActivityCatalogSearchParams): Promise<ActivityCatalogResult<TrainingActivity[]>> {
    const validated = validateActivityCatalogSearchParams(params);
    const loaded = await this.loadActivities();
    const filtered = loaded.activities.filter((activity) => matchesSearch(activity, validated));
    const offset = validated.offset ?? 0;
    const limit = validated.limit ?? 30;
    const data = filtered.slice(offset, offset + limit);
    return {
      data,
      pagination: {
        limit,
        offset,
        returned: data.length,
        nextOffset: offset + data.length < filtered.length ? offset + data.length : null
      },
      meta: legacyMeta(validated.locale ?? "en", loaded.degraded)
    };
  }

  async getActivity(identifier: string, options: ActivityCatalogRequestOptions = {}): Promise<ActivityCatalogResult<TrainingActivity>> {
    const cleanIdentifier = validateActivityIdentifier(identifier);
    const locale = validateActivityCatalogLocale(options.locale);
    const loaded = await this.loadActivities();
    const activity = loaded.activities.find((item) => item.id === cleanIdentifier || item.slug === cleanIdentifier);
    if (!activity) throw new ActivityCatalogError("not_found");
    return { data: activity, meta: legacyMeta(locale, loaded.degraded) };
  }

  async getActivityAlternatives(
    identifier: string,
    options: ActivityCatalogAlternativesOptions = {}
  ): Promise<ActivityCatalogResult<ActivityCatalogAlternative[]>> {
    const cleanIdentifier = validateActivityIdentifier(identifier);
    const locale = validateActivityCatalogLocale(options.locale);
    const limit = options.limit ?? 4;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new ActivityCatalogError("invalid_request");
    const loaded = await this.loadActivities();
    const source = loaded.activities.find((item) => item.id === cleanIdentifier || item.slug === cleanIdentifier);
    if (!source) throw new ActivityCatalogError("not_found");
    const primary = source.muscles.find((muscle) => muscle.role === "primary")?.slug;
    const equipment = new Set(source.equipment.map((item) => item.slug));
    const matches = loaded.activities
      .filter((item) => item.id !== source.id)
      .filter((item) => item.muscles.some((muscle) => muscle.role === "primary" && muscle.slug === primary)
        || item.equipment.some((entry) => equipment.has(entry.slug))
        || Boolean(source.movementPattern && item.movementPattern === source.movementPattern))
      .slice(0, limit)
      .map((item, index) => trainingActivityAlternativeFromActivity(source.id, item, index));
    return { data: matches, meta: legacyMeta(locale, loaded.degraded) };
  }
}
