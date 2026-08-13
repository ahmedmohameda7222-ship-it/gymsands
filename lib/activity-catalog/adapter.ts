import type { ActivityAlternative, CatalogSourceMetadata, LocalizedActivityContent, TrainingActivity } from "./types";
import type { LibraryActivity, LibraryActivityDetail, LibraryAlternative, LibraryProviderMeta } from "./library-types";
import type { Workout } from "@/types";

function localizedContent(activity: TrainingActivity, locale: string | undefined): LocalizedActivityContent | null {
  if (!locale) return null;
  const normalized = locale.toLowerCase();
  const baseLanguage = normalized.split("-")[0];
  const entry = Object.entries(activity.translations).find(([key]) => key.toLowerCase() === normalized)
    ?? Object.entries(activity.translations).find(([key]) => key.toLowerCase() === baseLanguage);
  return entry?.[1] ?? null;
}

function orderedInstructionText(instructions: Array<{ order: number; text: string }>) {
  return [...instructions].sort((left, right) => left.order - right.order).map((step) => step.text.trim()).filter(Boolean).join("\n");
}

export function activityToWorkout(activity: TrainingActivity, source: CatalogSourceMetadata): Workout {
  const localized = localizedContent(activity, source.locale);
  const instructions = localized?.instructions?.length ? localized.instructions : activity.instructions;
  const name = localized?.name?.trim() || activity.name;
  const shortDescription = localized?.shortDescription?.trim() || activity.shortDescription;
  const primaryMuscles = activity.muscles.filter((muscle) => muscle.role === "primary").map((muscle) => muscle.name);
  const bodyRegions = Array.from(new Set(activity.muscles.map((muscle) => muscle.bodyRegion?.trim()).filter(Boolean) as string[]));
  const secondaryMuscles = activity.muscles.filter((muscle) => muscle.role !== "primary").map((muscle) => muscle.name);
  const equipment = activity.equipment.map((item) => item.name).filter(Boolean);
  return {
    id: activity.id, name, category: activity.activityType?.name ?? "", target_muscle: primaryMuscles.join(", "), equipment: equipment.join(", "),
    difficulty: activity.difficulty ?? "", sets: null, reps: null, rest_seconds: null, instructions: orderedInstructionText(instructions), notes: null,
    muscle_category: bodyRegions.join(", ") || null, equipment_required: equipment.join(", ") || null, mechanics: activity.movementPattern,
    force_type: null, experience_level: activity.difficulty, secondary_muscles: secondaryMuscles, exercise_url: activity.guideUrl ?? null,
    video_url: activity.videoUrl ?? null, is_global: true, catalog_slug: activity.slug, catalog_version: activity.version === null ? null : String(activity.version),
    catalog_source: source.source, catalog_degraded: source.degraded, short_description: shortDescription ?? null, movement_pattern: activity.movementPattern,
    instruction_steps: [...instructions].sort((left, right) => left.order - right.order), metric_schema: activity.metricSchema ?? null
  };
}

function executionValue(activity: LibraryActivity, key: string) {
  for (const profile of activity.executionProfiles) {
    const filter = profile.filterProfile;
    if (filter && typeof filter === "object" && key in filter && typeof (filter as Record<string, unknown>)[key] === "string") {
      return String((filter as Record<string, unknown>)[key]);
    }
  }
  return null;
}

function anatomy(detail: LibraryActivity) {
  const primary: string[] = [];
  const secondary: string[] = [];
  const regions: string[] = [];
  for (const item of detail.coverage) {
    const name = typeof item.name === "string" ? item.name : typeof item.muscleName === "string" ? item.muscleName : null;
    const role = typeof item.role === "string" ? item.role : null;
    const region = typeof item.bodyRegion === "string" ? item.bodyRegion : typeof item.broadGroup === "string" ? item.broadGroup : null;
    if (region) regions.push(region);
    if (name) (role === "primary" ? primary : secondary).push(name);
  }
  const heatMap = (detail as LibraryActivityDetail).heatMap;
  if (heatMap && typeof heatMap === "object" && Array.isArray((heatMap as Record<string, unknown>).mapping)) {
    for (const entry of (heatMap as Record<string, unknown>).mapping as Array<Record<string, unknown>>) {
      const name = typeof entry.muscleName === "string" ? entry.muscleName : null;
      const role = typeof entry.role === "string" ? entry.role : null;
      const region = typeof entry.broadGroup === "string" ? entry.broadGroup : null;
      if (region) regions.push(region);
      if (name) (role === "primary" ? primary : secondary).push(name);
    }
  }
  return { primary: Array.from(new Set(primary)), secondary: Array.from(new Set(secondary)), regions: Array.from(new Set(regions)) };
}

export function libraryActivityToWorkout(activity: LibraryActivity, meta: LibraryProviderMeta): Workout {
  const muscles = anatomy(activity);
  const equipment = activity.equipment.map((item) => item.name || item.slug).filter((value): value is string => Boolean(value));
  const metric = (activity as LibraryActivityDetail).prescriptionSchema;
  return {
    id: activity.id,
    name: activity.name,
    category: activity.activityType?.name ?? "Strength",
    target_muscle: muscles.primary.join(", "),
    equipment: equipment.join(", "),
    difficulty: activity.difficulty ?? executionValue(activity, "difficulty") ?? "",
    sets: null,
    reps: null,
    rest_seconds: null,
    instructions: orderedInstructionText(activity.instructions),
    notes: null,
    muscle_category: muscles.regions.join(", ") || null,
    equipment_required: equipment.join(", ") || null,
    mechanics: activity.movementPattern ?? executionValue(activity, "movementFamily"),
    force_type: null,
    experience_level: activity.difficulty ?? executionValue(activity, "difficulty"),
    secondary_muscles: muscles.secondary,
    exercise_url: null,
    video_url: null,
    is_global: true,
    catalog_slug: activity.slug,
    catalog_version: String(activity.revisionNumber),
    catalog_source: meta.source === "legacy" ? "legacy" : "external",
    catalog_degraded: meta.degraded,
    short_description: activity.shortDescription,
    movement_pattern: activity.movementPattern ?? executionValue(activity, "movementFamily"),
    instruction_steps: [...activity.instructions].sort((left, right) => left.order - right.order),
    metric_schema: metric ? { slug: metric.key, name: metric.key, fields: Array.isArray(metric.fields) ? metric.fields as any : [] } : null
  };
}

export function alternativeToWorkout(alternative: ActivityAlternative, source: CatalogSourceMetadata): Workout {
  return {
    id: alternative.alternativeActivityId, name: alternative.alternativeName, category: alternative.alternativeActivityTypeSlug ?? "", target_muscle: "", equipment: "",
    difficulty: alternative.alternativeDifficulty ?? "", sets: null, reps: null, rest_seconds: null, instructions: "", notes: null, is_global: true,
    catalog_slug: alternative.alternativeSlug, catalog_version: source.catalogVersion, catalog_source: source.source, catalog_degraded: source.degraded
  };
}

export function libraryAlternativeToWorkout(alternative: LibraryAlternative, meta: LibraryProviderMeta): Workout {
  return libraryActivityToWorkout(alternative.activity, meta);
}
