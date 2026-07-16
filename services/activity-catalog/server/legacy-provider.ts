import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sampleExerciseVideos, sampleWorkouts } from "@/data/workouts";
import { CatalogError } from "@/lib/activity-catalog/errors";
import type {
  ActivityCatalogFilters,
  ActivitySearchParams,
  CatalogRequestOptions,
  CatalogResult,
  CatalogSourceMetadata,
  SportSessionTemplate,
  TaxonomyItem,
  TrainingActivity
} from "@/lib/activity-catalog/types";
import type { ExerciseVideo, Workout } from "@/types";
import type { ActivityCatalogProvider } from "./provider";

type LegacyRow = Record<string, unknown>;
type LegacySnapshot = { activities: TrainingActivity[]; degraded: boolean };
type CachedLegacySnapshot = { activities: TrainingActivity[]; expiresAt: number };

export const LEGACY_CATALOG_SNAPSHOT_TTL_MS = 60_000;

let cachedLegacySnapshot: CachedLegacySnapshot | null = null;
let legacySnapshotInFlight: Promise<LegacySnapshot> | null = null;

const legacyMeta = (degraded = false): CatalogSourceMetadata => ({
  source: "legacy",
  degraded,
  catalogVersion: "legacy"
});

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function texts(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : [];
}

function stableSlug(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "legacy_activity";
}

function taxonomy(name: string | null, prefix: string): TaxonomyItem | null {
  if (!name) return null;
  const slug = stableSlug(name);
  return { id: `${prefix}:${slug}`, slug, name };
}

function instructions(value: unknown) {
  const instruction = text(value);
  return instruction ? [{ order: 1, text: instruction }] : [];
}

function workoutRow(activity: Workout | LegacyRow): TrainingActivity | null {
  const row = activity as LegacyRow;
  const id = text(row.id);
  const name = text(row.name);
  if (!id || !name) return null;
  const category = text(row.category) ?? text(row.mechanics) ?? text(row.movement_pattern);
  const primary = text(row.target_muscle) ?? text(row.primary_muscle) ?? text(row.muscle_category);
  const bodyRegion = text(row.muscle_category);
  const secondary = texts(row.secondary_muscles);
  const equipment = texts(row.equipment).length
    ? texts(row.equipment)
    : [text(row.equipment_required) ?? text(row.equipment)].filter((item): item is string => Boolean(item));
  const activityType = taxonomy(category, "legacy-type");
  return {
    id,
    legacyIdentifier: id,
    slug: text(row.slug) ?? stableSlug(name),
    name,
    ...(row.short_description !== undefined ? { shortDescription: text(row.short_description) } : {}),
    instructions: instructions(row.instructions),
    difficulty: text(row.difficulty) ?? text(row.experience_level),
    movementPattern: text(row.movement_pattern) ?? text(row.mechanics),
    forceType: text(row.force_type),
    version: typeof row.version === "number" && Number.isInteger(row.version) ? row.version : null,
    activityType,
    sports: [],
    sessionTypes: [],
    sessionPhases: [],
    equipment: equipment.map((equipmentName) => ({ ...(taxonomy(equipmentName, "legacy-equipment") as TaxonomyItem), isRequired: true })),
    muscles: [
      ...(primary ? [{ ...(taxonomy(primary, "legacy-muscle") as TaxonomyItem), ...(bodyRegion ? { bodyRegion } : {}), role: "primary" as const }] : []),
      ...secondary.map((muscleName) => ({ ...(taxonomy(muscleName, "legacy-muscle") as TaxonomyItem), role: "secondary" as const }))
    ],
    trainingGoals: [],
    translations: {},
    publishedAt: text(row.published_at),
    updatedAt: text(row.updated_at),
    guideUrl: text(row.exercise_url) ?? text(row.source_url) ?? (text(row.notes)?.match(/^https?:\/\//i) ? text(row.notes) : null),
    videoUrl: text(row.video_url)
  };
}

function videoRow(video: ExerciseVideo | LegacyRow): TrainingActivity | null {
  const row = video as LegacyRow;
  return workoutRow({
    id: row.id,
    name: row.exercise_name,
    category: row.category_type ?? row.category,
    target_muscle: row.muscle_category ?? row.category,
    muscle_category: row.muscle_category,
    equipment_required: row.equipment_required,
    difficulty: row.experience_level,
    mechanics: row.mechanics,
    force_type: row.force_type,
    secondary_muscles: row.secondary_muscles,
    instructions: row.instructions,
    exercise_url: row.exercise_url,
    video_url: row.video_url,
    updated_at: row.updated_at
  });
}

function matches(activity: TrainingActivity, params: ActivitySearchParams) {
  const normalized = params.query?.trim().toLowerCase();
  if (normalized) {
    const haystack = [
      activity.name,
      activity.shortDescription,
      activity.activityType?.name,
      activity.movementPattern,
      activity.forceType,
      ...activity.equipment.map((item) => item.name),
      ...activity.muscles.flatMap((item) => [item.name, item.bodyRegion])
    ].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(normalized)) return false;
  }
  if (params.activityType && activity.activityType?.slug !== params.activityType) return false;
  if (params.difficulty && activity.difficulty?.toLowerCase() !== params.difficulty) return false;
  if (params.equipment?.length && !params.equipment.some((slug) => activity.equipment.some((item) => item.slug === slug))) return false;
  if (params.sport && !activity.sports.some((item) => item.slug === params.sport)) return false;
  if (params.sessionType && !activity.sessionTypes.some((item) => item.slug === params.sessionType)) return false;
  if (params.phase && !activity.sessionPhases.some((item) => item.slug === params.phase)) return false;
  if (params.goal && !activity.trainingGoals.some((item) => item.slug === params.goal)) return false;
  if (params.primaryMuscle && !activity.muscles.some((item) => item.role === "primary" && item.slug === params.primaryMuscle)) return false;
  if (params.secondaryMuscle && !activity.muscles.some((item) => item.role !== "primary" && item.slug === params.secondaryMuscle)) return false;
  if (params.muscleCategory && !activity.muscles.some((item) => item.bodyRegion && stableSlug(item.bodyRegion) === params.muscleCategory)) return false;
  if (params.movementPattern && (!activity.movementPattern || stableSlug(activity.movementPattern) !== params.movementPattern)) return false;
  if (params.forceType && (!activity.forceType || stableSlug(activity.forceType) !== params.forceType)) return false;
  return true;
}

function uniqueActivities(activities: TrainingActivity[]) {
  const keys = new Set<string>();
  return activities.filter((activity) => {
    const key = activity.id || `${activity.slug}:${activity.name.toLowerCase()}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

async function loadLegacySnapshot(supabase: SupabaseClient): Promise<LegacySnapshot> {
  const now = Date.now();
  if (cachedLegacySnapshot && cachedLegacySnapshot.expiresAt > now) {
    return { activities: cachedLegacySnapshot.activities, degraded: false };
  }
  if (cachedLegacySnapshot) cachedLegacySnapshot = null;
  if (legacySnapshotInFlight) return legacySnapshotInFlight;

  const loadPromise = (async () => {
    const [workoutResult, videoResult, exerciseResult] = await Promise.all([
      supabase.from("workouts").select("*").eq("is_global", true).order("name").limit(5000),
      supabase.from("exercise_videos").select("*").eq("is_global", true).order("exercise_name").limit(5000),
      supabase.from("exercises").select("*").eq("is_global", true).eq("is_approved", true).order("name").limit(5000)
    ]);
    const degraded = Boolean(workoutResult.error || videoResult.error || exerciseResult.error);
    const activities = uniqueActivities([
      ...((exerciseResult.data ?? []) as LegacyRow[]).map(workoutRow),
      ...((workoutResult.data ?? []) as LegacyRow[]).map(workoutRow),
      ...((videoResult.data ?? []) as LegacyRow[]).map(videoRow),
      ...(workoutResult.error ? sampleWorkouts.map(workoutRow) : []),
      ...(videoResult.error ? sampleExerciseVideos.map(videoRow) : [])
    ].filter((activity): activity is TrainingActivity => Boolean(activity)));

    if (!degraded) {
      cachedLegacySnapshot = { activities, expiresAt: Date.now() + LEGACY_CATALOG_SNAPSHOT_TTL_MS };
    }
    return { activities, degraded };
  })();

  legacySnapshotInFlight = loadPromise;
  try {
    return await loadPromise;
  } finally {
    if (legacySnapshotInFlight === loadPromise) legacySnapshotInFlight = null;
  }
}

export function __resetLegacyCatalogSnapshotCacheForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("Legacy catalog cache reset is test-only.");
  cachedLegacySnapshot = null;
  legacySnapshotInFlight = null;
}

export class LegacyActivityCatalogProvider implements ActivityCatalogProvider {
  constructor(private readonly supabase: SupabaseClient) {}

  async listSports() {
    return { data: [], meta: legacyMeta() };
  }

  async getSportSessionTemplate(): Promise<CatalogResult<SportSessionTemplate>> {
    throw new CatalogError("catalog_not_found");
  }

  async getFilters(options: CatalogRequestOptions & { sport?: string } = {}): Promise<CatalogResult<ActivityCatalogFilters>> {
    const result = await loadLegacySnapshot(this.supabase);
    const activities = options.sport ? result.activities.filter((activity) => activity.sports.some((sport) => sport.slug === options.sport)) : result.activities;
    return {
      data: {
        sports: uniqueTaxonomy(activities.flatMap((activity) => activity.sports)),
        activityTypes: uniqueTaxonomy(activities.flatMap((activity) => activity.activityType ? [activity.activityType] : [])),
        sessionTypes: uniqueTaxonomy(activities.flatMap((activity) => activity.sessionTypes)),
        sessionPhases: uniqueTaxonomy(activities.flatMap((activity) => activity.sessionPhases)),
        equipment: uniqueTaxonomy(activities.flatMap((activity) => activity.equipment)),
        trainingGoals: uniqueTaxonomy(activities.flatMap((activity) => activity.trainingGoals)),
        difficulties: Array.from(new Set(activities.map((activity) => activity.difficulty).filter((value): value is string => Boolean(value)))).sort(),
        primaryMuscles: uniqueTaxonomy(activities.flatMap((activity) => activity.muscles.filter((muscle) => muscle.role === "primary"))),
        secondaryMuscles: uniqueTaxonomy(activities.flatMap((activity) => activity.muscles.filter((muscle) => muscle.role !== "primary"))),
        muscleCategories: uniqueTaxonomy(activities.flatMap((activity) => activity.muscles.map((muscle) => taxonomy(muscle.bodyRegion ?? null, "legacy-region")).filter((item): item is TaxonomyItem => Boolean(item)))),
        movementPatterns: uniqueTaxonomy(activities.map((activity) => taxonomy(activity.movementPattern, "legacy-movement")).filter((item): item is TaxonomyItem => Boolean(item))),
        forceTypes: uniqueTaxonomy(activities.map((activity) => taxonomy(activity.forceType ?? null, "legacy-force")).filter((item): item is TaxonomyItem => Boolean(item)))
      },
      meta: legacyMeta(result.degraded)
    };
  }

  async searchActivities(params: ActivitySearchParams) {
    const result = await loadLegacySnapshot(this.supabase);
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 30;
    const filtered = result.activities.filter((activity) => matches(activity, params));
    const activities = filtered.slice(offset, offset + limit);
    const nextOffset = offset + activities.length < filtered.length ? offset + activities.length : null;
    return {
      data: { activities, pagination: { limit, offset, returned: activities.length, nextOffset } },
      meta: legacyMeta(result.degraded)
    };
  }

  async getActivity(identifier: string) {
    const result = await loadLegacySnapshot(this.supabase);
    const activity = result.activities.find((item) => item.id === identifier || item.slug === identifier || item.legacyIdentifier === identifier);
    if (!activity) throw new CatalogError("catalog_not_found");
    return { data: activity, meta: legacyMeta(result.degraded) };
  }

  async getActivityAlternatives() {
    return { data: [], meta: legacyMeta() };
  }
}

function uniqueTaxonomy<T extends TaxonomyItem>(items: T[]): T[] {
  const slugs = new Set<string>();
  return items.filter((item) => {
    if (slugs.has(item.slug)) return false;
    slugs.add(item.slug);
    return true;
  }).sort((left, right) => left.name.localeCompare(right.name));
}
