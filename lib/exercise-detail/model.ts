import { buildCatalogAuthoritySnapshot } from "@/lib/activity-catalog/snapshot";
import type { LibraryActivityDetail, LibraryProviderMeta } from "@/lib/activity-catalog/library-types";
import type { Workout } from "@/types";
import { formatExerciseDisplayList, formatExerciseDisplayValue, resolveExerciseDisplayLanguage } from "@/lib/train/exercise-display";
import type { AddToPlanActivityPayload, ExerciseDetailViewModel, ExercisePrescriptionField, PlanExerciseDetailViewModel } from "./contracts";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function prescriptionField(value: unknown): ExercisePrescriptionField | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = value as Record<string, unknown>;
  const key = text(field.key) ?? text(field.slug);
  if (!key) return null;
  const rawType = text(field.type);
  const type = rawType === "integer" || rawType === "number" || rawType === "boolean" ? rawType : "text";
  const rawOptions = Array.isArray(field.options) ? field.options : [];
  return {
    key,
    label: text(field.label) ?? key.replaceAll("_", " "),
    type,
    unit: text(field.unit),
    required: field.required === true,
    minimum: number(field.minimum) ?? number(field.min),
    maximum: number(field.maximum) ?? number(field.max),
    options: rawOptions.flatMap((option) => {
      if (typeof option === "string") return [{ value: option, label: option }];
      if (!option || typeof option !== "object" || Array.isArray(option)) return [];
      const item = option as Record<string, unknown>;
      const optionValue = text(item.value) ?? text(item.key);
      return optionValue ? [{ value: optionValue, label: text(item.label) ?? optionValue }] : [];
    })
  };
}

function catalogTargets(detail: LibraryActivityDetail) {
  const primary: string[] = [];
  const secondary: string[] = [];
  const focus: string[] = [];
  for (const item of detail.coverage) {
    const name = text(item.name) ?? text(item.muscleName) ?? text(item.label);
    const role = text(item.role);
    if (!name) continue;
    if (role === "primary") primary.push(name);
    else if (role === "secondary" || role === "stabilizer") secondary.push(name);
    else focus.push(name);
  }
  const heatMapping = detail.heatMap && Array.isArray(detail.heatMap.mapping)
    ? detail.heatMap.mapping as Array<Record<string, unknown>>
    : [];
  for (const item of heatMapping) {
    const name = text(item.muscleName) ?? text(item.name);
    const role = text(item.role);
    if (!name) continue;
    if (role === "primary") primary.push(name);
    else secondary.push(name);
  }
  return { primary: unique(primary), secondary: unique(secondary), focus: unique(focus), anatomyAvailable: heatMapping.length > 0 };
}

export function catalogActivityDetailModel(
  detail: LibraryActivityDetail,
  meta: LibraryProviderMeta,
  domain: string
): ExerciseDetailViewModel {
  const targets = catalogTargets(detail);
  const muscleRelevant = targets.primary.length > 0 || targets.secondary.length > 0;
  const isNativeV2 = meta.source === "library_v2" && Boolean(detail.authority);
  const snapshot = isNativeV2 ? buildCatalogAuthoritySnapshot(detail) : null;
  const fields = (detail.prescriptionSchema?.fields ?? []).map(prescriptionField).filter((field): field is ExercisePrescriptionField => Boolean(field));
  return {
    identity: {
      activityId: detail.id,
      revisionId: detail.revisionId || null,
      revisionNumber: detail.revisionNumber || null,
      slug: detail.slug || null,
      domain,
      source: isNativeV2 ? "catalog_v2" : "catalog_legacy"
    },
    name: detail.name,
    shortDescription: detail.shortDescription,
    activityType: detail.activityType?.name ?? null,
    equipment: unique(detail.equipment.map((item) => text(item.name) ?? text(item.slug))),
    difficulty: detail.difficulty,
    movementPattern: detail.movementPattern,
    forceType: null,
    instructions: [...detail.instructions].filter((step) => text(step.text)).sort((left, right) => left.order - right.order),
    instructionProse: null,
    guideUrl: null,
    sourceVideoUrl: null,
    target: {
      kind: muscleRelevant ? "muscle" : targets.focus.length ? "focus" : "none",
      ...targets
    },
    prescription: detail.prescriptionSchema ? { key: detail.prescriptionSchema.key, version: detail.prescriptionSchema.version, fields } : null,
    performedMetricSchema: detail.performedMetricSchema ? { ...detail.performedMetricSchema } : null,
    recordDefinitions: structuredClone(detail.recordDefinitions ?? []),
    catalogAuthoritySnapshot: snapshot,
    // The legacy Strength route is the only direct execution path proven by the current runtime.
    startHref: meta.source === "legacy" && domain === "strength" ? `/workouts/session/${encodeURIComponent(detail.id)}` : null,
    stablePerformanceIdentity: `global:${detail.id}`
  };
}

export function customExerciseDetailModel(workout: Workout, locale = "en"): ExerciseDetailViewModel {
  const language = resolveExerciseDisplayLanguage(locale);
  const primarySource = workout.target_muscle || workout.muscle_category || "";
  const primary = unique(primarySource.split(",").map(text)).map((value) => formatExerciseDisplayValue(value, language, "muscle"));
  const secondary = unique((workout.secondary_muscles ?? []).map(text)).map((value) => formatExerciseDisplayValue(value, language, "muscle"));
  const prose = text(workout.instructions);
  return {
    identity: { activityId: workout.id, revisionId: null, revisionNumber: null, slug: null, domain: "strength", source: "custom" },
    name: workout.name,
    shortDescription: null,
    activityType: text(workout.category) ? formatExerciseDisplayValue(workout.category!, language, "category") : null,
    equipment: formatExerciseDisplayList(workout.equipment, language, "equipment").split(", ").filter(Boolean),
    difficulty: text(workout.difficulty) ? formatExerciseDisplayValue(workout.difficulty!, language, "difficulty") : null,
    movementPattern: text(workout.movement_pattern ?? workout.mechanics) ? formatExerciseDisplayValue((workout.movement_pattern ?? workout.mechanics)!, language, "movement") : null,
    forceType: text(workout.force_type) ? formatExerciseDisplayValue(workout.force_type!, language, "force") : null,
    instructions: [],
    instructionProse: prose,
    guideUrl: text(workout.exercise_url),
    sourceVideoUrl: null,
    target: { kind: primary.length || secondary.length ? "muscle" : "none", primary, secondary, focus: [], anatomyAvailable: false },
    prescription: null,
    performedMetricSchema: null,
    recordDefinitions: [],
    catalogAuthoritySnapshot: null,
    startHref: `/workouts/session/${encodeURIComponent(workout.id)}`,
    stablePerformanceIdentity: null
  };
}

export function planExerciseDetailModel(input: {
  exercise: Workout;
  planId: string;
  planName: string;
  dayId: string;
  dayName: string;
}, locale = "en"): PlanExerciseDetailViewModel {
  const exercise = input.exercise;
  const language = resolveExerciseDisplayLanguage(locale);
  const prescription: PlanExerciseDetailViewModel["prescription"] = [];
  if (exercise.sets !== null) prescription.push({ label: "sets", value: String(exercise.sets) });
  if (text(exercise.reps)) prescription.push({ label: "reps", value: exercise.reps! });
  if (exercise.rest_seconds !== null) prescription.push({ label: "rest", value: String(exercise.rest_seconds) });
  return {
    planExerciseId: exercise.plan_exercise_id ?? exercise.id,
    planId: input.planId,
    planName: input.planName,
    dayId: input.dayId,
    dayName: input.dayName,
    name: exercise.name,
    sourceWorkoutId: exercise.id !== (exercise.plan_exercise_id ?? exercise.id) ? exercise.id : null,
    canonicalHref: exercise.id !== (exercise.plan_exercise_id ?? exercise.id) ? `/workouts/${encodeURIComponent(exercise.id)}` : null,
    category: text(exercise.category) ? formatExerciseDisplayValue(exercise.category!, language, "category") : null,
    targetMuscle: text(exercise.target_muscle || exercise.muscle_category)
      ? formatExerciseDisplayList(exercise.target_muscle || exercise.muscle_category, language, "muscle")
      : null,
    secondaryMuscles: formatExerciseDisplayList(exercise.secondary_muscles ?? [], language, "muscle").split(", ").filter(Boolean),
    equipment: text(exercise.equipment) ? formatExerciseDisplayList(exercise.equipment, language, "equipment") : null,
    instructions: text(exercise.instructions),
    prescription,
    note: text(exercise.notes),
    guideUrl: text(exercise.exercise_url),
    customVideoUrl: text(exercise.custom_video_url) ?? text(exercise.video_url)
  };
}

export function addToPlanActivityPayload(resolved: {
  core: ExerciseDetailViewModel;
  catalog: { detail: LibraryActivityDetail; meta: LibraryProviderMeta; domain: string } | null;
}): AddToPlanActivityPayload {
  const { core, catalog } = resolved;
  return {
    id: core.identity.activityId,
    name: core.name,
    slug: core.identity.slug,
    revisionNumber: core.identity.revisionNumber,
    activityTypeSlug: catalog?.detail.activityType?.slug ?? null,
    activityTypeName: core.activityType,
    shortDescription: core.shortDescription,
    instructions: core.instructions.length ? core.instructions : core.instructionProse ? [{ order: 1, text: core.instructionProse }] : [],
    targetText: core.target.primary.join(", ") || null,
    equipmentText: core.equipment.join(", ") || null,
    prescriptionSchema: catalog?.detail.prescriptionSchema ? structuredClone(catalog.detail.prescriptionSchema) : null,
    equipment: catalog ? structuredClone(catalog.detail.equipment) : [],
    taxonomy: { domain: core.identity.domain, coverage: catalog ? structuredClone(catalog.detail.coverage) : [] },
    catalogAuthoritySnapshot: core.catalogAuthoritySnapshot,
    catalogSource: core.identity.source === "catalog_v2" ? "external" : core.identity.source === "custom" ? "custom" : "legacy"
  };
}
