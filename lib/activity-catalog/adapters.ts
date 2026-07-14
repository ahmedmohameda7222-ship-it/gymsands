import type { Workout } from "@/types";
import type {
  ActivityCatalogAlternative,
  ActivityCatalogSource,
  ActivityCatalogTaxonomyItem,
  TrainingActivity,
  TrainingActivityInstruction
} from "./types";

const compatibilityDefaults = { sets: 3, reps: "8-12", restSeconds: 75 } as const;

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function activityCatalogSlug(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "legacy_activity";
}

function legacyTaxonomy(value: string, prefix: string): ActivityCatalogTaxonomyItem {
  const slug = activityCatalogSlug(value);
  return { id: `${prefix}:${slug}`, slug, name: value.trim() };
}

function orderedInstructions(instructions: TrainingActivityInstruction[]) {
  return [...instructions]
    .sort((left, right) => left.order - right.order || left.text.localeCompare(right.text))
    .map((instruction, index) => `${index + 1}. ${instruction.text.trim()}`)
    .join("\n");
}

function requiredEquipment(activity: TrainingActivity) {
  const names = unique(activity.equipment.filter((item) => item.isRequired).map((item) => item.name));
  return names.length ? names.join(", ") : "Varies";
}

export function resolveWorkoutVideoUrl(workout: Workout, customVideoUrl: string | null | undefined) {
  return customVideoUrl?.trim() || workout.video_url || null;
}

export function trainingActivityToWorkout(activity: TrainingActivity, source: ActivityCatalogSource = "external"): Workout {
  const primaryMuscle = activity.muscles.find((muscle) => muscle.role === "primary");
  const secondaryMuscles = unique(
    activity.muscles
      .filter((muscle) => muscle.role === "secondary" || muscle.role === "stabilizer")
      .map((muscle) => muscle.name)
  );
  const equipment = requiredEquipment(activity);
  const difficulty = activity.difficulty || "Unspecified";
  const legacyMedia = source === "legacy" ? activity.legacyMediaCompatibility : undefined;
  return {
    id: activity.id,
    name: activity.name,
    category: activity.activityType.name,
    target_muscle: primaryMuscle?.name || "General",
    muscle_category: primaryMuscle?.bodyRegion || primaryMuscle?.name || "General",
    equipment,
    equipment_required: equipment,
    difficulty,
    experience_level: difficulty,
    mechanics: activity.movementPattern,
    force_type: null,
    secondary_muscles: secondaryMuscles,
    instructions: orderedInstructions(activity.instructions),
    notes: activity.shortDescription,
    sets: compatibilityDefaults.sets,
    reps: compatibilityDefaults.reps,
    rest_seconds: compatibilityDefaults.restSeconds,
    exercise_url: legacyMedia?.exerciseUrl ?? null,
    video_url: legacyMedia?.videoUrl ?? null,
    custom_video_url: null,
    is_global: true,
    activity_catalog: {
      source,
      activityId: activity.id,
      slug: activity.slug,
      version: activity.version,
      metricSchema: activity.metricSchema
    }
  };
}

function instructionSteps(value: string | null | undefined) {
  const lines = (value ?? "")
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z])/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  return lines.map((text, index) => ({ order: index + 1, text }));
}

export function legacyWorkoutToTrainingActivity(workout: Workout): TrainingActivity {
  const category = workout.category?.trim() || "Exercise";
  const targetMuscle = workout.target_muscle?.trim() || workout.muscle_category?.trim();
  const equipment = workout.equipment_required?.trim() || workout.equipment?.trim();
  const secondary = unique(workout.secondary_muscles ?? []);
  const muscles = [
    ...(targetMuscle ? [{ ...legacyTaxonomy(targetMuscle, "legacy-muscle"), bodyRegion: workout.muscle_category || null, role: "primary" as const }] : []),
    ...secondary.map((name) => ({ ...legacyTaxonomy(name, "legacy-muscle"), bodyRegion: null, role: "secondary" as const }))
  ];
  return {
    id: workout.id,
    slug: workout.activity_catalog?.slug || activityCatalogSlug(`${workout.name}_${workout.id}`),
    name: workout.name,
    shortDescription: workout.notes && !/^https?:\/\//i.test(workout.notes) ? workout.notes : null,
    instructions: instructionSteps(workout.instructions),
    difficulty: workout.experience_level || workout.difficulty || null,
    movementPattern: workout.mechanics || null,
    version: workout.activity_catalog?.version || 1,
    activityType: legacyTaxonomy(category, "legacy-activity-type"),
    metricSchema: workout.activity_catalog?.metricSchema || null,
    sports: [],
    sessionTypes: [],
    sessionPhases: [],
    equipment: equipment && equipment !== "Varies"
      ? [{ ...legacyTaxonomy(equipment, "legacy-equipment"), isRequired: true }]
      : [],
    muscles,
    trainingGoals: [],
    translations: {},
    publishedAt: null,
    updatedAt: null,
    legacyMediaCompatibility: {
      exerciseUrl: workout.exercise_url ?? null,
      videoUrl: workout.video_url ?? null
    }
  };
}

export function trainingActivityAlternativeFromActivity(
  sourceActivityId: string,
  activity: TrainingActivity,
  priority: number
): ActivityCatalogAlternative {
  return {
    sourceActivityId,
    alternativeActivityId: activity.id,
    alternativeSlug: activity.slug,
    alternativeName: activity.name,
    alternativeActivityTypeSlug: activity.activityType.slug,
    alternativeDifficulty: activity.difficulty,
    reasonCode: "legacy_compatibility_match",
    differenceSummary: null,
    prescriptionTransfer: "partial",
    compatibilityScore: Math.max(0, 1 - priority * 0.05),
    priority
  };
}
