import type { ActivityAlternative, CatalogSourceMetadata, LocalizedActivityContent, TrainingActivity } from "./types";
import type { Workout } from "@/types";

function localizedContent(activity: TrainingActivity, locale: string | undefined): LocalizedActivityContent | null {
  if (!locale) return null;
  const normalized = locale.toLowerCase();
  const baseLanguage = normalized.split("-")[0];
  const entry = Object.entries(activity.translations).find(([key]) => key.toLowerCase() === normalized)
    ?? Object.entries(activity.translations).find(([key]) => key.toLowerCase() === baseLanguage);
  return entry?.[1] ?? null;
}

function orderedInstructionText(instructions: TrainingActivity["instructions"]) {
  return [...instructions]
    .sort((left, right) => left.order - right.order)
    .map((step) => step.text.trim())
    .filter(Boolean)
    .join("\n");
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
    id: activity.id,
    name,
    category: activity.activityType?.name ?? "",
    target_muscle: primaryMuscles.join(", "),
    equipment: equipment.join(", "),
    difficulty: activity.difficulty ?? "",
    sets: null,
    reps: null,
    rest_seconds: null,
    instructions: orderedInstructionText(instructions),
    notes: null,
    muscle_category: bodyRegions.join(", ") || null,
    equipment_required: equipment.join(", ") || null,
    mechanics: activity.movementPattern,
    force_type: null,
    experience_level: activity.difficulty,
    secondary_muscles: secondaryMuscles,
    exercise_url: activity.guideUrl ?? null,
    video_url: activity.videoUrl ?? null,
    is_global: true,
    catalog_slug: activity.slug,
    catalog_version: activity.version === null ? null : String(activity.version),
    catalog_source: source.source,
    catalog_degraded: source.degraded,
    short_description: shortDescription ?? null,
    movement_pattern: activity.movementPattern,
    instruction_steps: [...instructions].sort((left, right) => left.order - right.order),
    metric_schema: activity.metricSchema ?? null
  };
}

export function alternativeToWorkout(alternative: ActivityAlternative, source: CatalogSourceMetadata): Workout {
  return {
    id: alternative.alternativeActivityId,
    name: alternative.alternativeName,
    category: alternative.alternativeActivityTypeSlug ?? "",
    target_muscle: "",
    equipment: "",
    difficulty: alternative.alternativeDifficulty ?? "",
    sets: null,
    reps: null,
    rest_seconds: null,
    instructions: "",
    notes: null,
    is_global: true,
    catalog_slug: alternative.alternativeSlug,
    catalog_version: source.catalogVersion,
    catalog_source: source.source,
    catalog_degraded: source.degraded
  };
}
