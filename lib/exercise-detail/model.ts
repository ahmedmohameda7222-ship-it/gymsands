import { buildCatalogAuthoritySnapshot } from "@/lib/activity-catalog/snapshot";
import type { CatalogSchemaField, LibraryActivityDetail, LibraryProviderMeta } from "@/lib/activity-catalog/library-types";
import type { Workout } from "@/types";
import {
  CURATED_EXERCISE_DISPLAY_VOCABULARY,
  formatExerciseDisplayList,
  formatExerciseDisplayValue,
  resolveExerciseDisplayLanguage,
  type ExerciseDisplayDomain,
} from "@/lib/train/exercise-display";
import { resolveExerciseIdentity, resolveFrozenPlanExerciseIdentity } from "./identity";
import { isCompatibleExerciseHeatMap } from "./anatomy-contract";
import { fallbackExerciseName, userFacingCatalogText } from "./user-facing-content";
import type {
  AddToPlanActivityPayload,
  ExerciseDetailViewModel,
  ExerciseEquipmentView,
  ExercisePrescriptionField,
  PlanExerciseDetailViewModel
} from "./contracts";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function canonicalDisplayKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

type ReviewedDomain = "muscle" | "equipment" | "difficulty" | "mechanics" | "movement" | "force";
const reviewedVocabulary: Record<ReviewedDomain, ReadonlySet<string>> = {
  muscle: new Set(CURATED_EXERCISE_DISPLAY_VOCABULARY.muscles),
  equipment: new Set(CURATED_EXERCISE_DISPLAY_VOCABULARY.equipment),
  difficulty: new Set(CURATED_EXERCISE_DISPLAY_VOCABULARY.difficulty),
  mechanics: new Set(CURATED_EXERCISE_DISPLAY_VOCABULARY.mechanics),
  movement: new Set(CURATED_EXERCISE_DISPLAY_VOCABULARY.movement),
  force: new Set(CURATED_EXERCISE_DISPLAY_VOCABULARY.force),
};

function reviewedCatalogDisplay(
  values: Array<string | null>,
  language: ReturnType<typeof resolveExerciseDisplayLanguage>,
  domain: ReviewedDomain,
) {
  for (const value of values) {
    if (!value) continue;
    const key = canonicalDisplayKey(value);
    if (reviewedVocabulary[domain].has(key)) return formatExerciseDisplayValue(key, language, domain);
  }
  // English Catalog values are already the requested-locale authority. For DE/AR,
  // unknown machine vocabulary stays hidden rather than leaking an English slug.
  if (language === "en") {
    const fallback = values.find(Boolean);
    return fallback ? formatExerciseDisplayValue(fallback, language, domain as ExerciseDisplayDomain) : null;
  }
  return null;
}

const activityTypeLabels = {
  strength_exercise: { en: "Strength exercise", de: "Kraftübung", ar: "تمرين قوة" },
  strength: { en: "Strength Training", de: "Krafttraining", ar: "تمارين مقاومة" },
  resistance: { en: "Strength Training", de: "Krafttraining", ar: "تمارين مقاومة" },
  bodyweight: { en: "Bodyweight", de: "Körpergewicht", ar: "وزن الجسم" },
  mobility: { en: "Mobility", de: "Mobilität", ar: "مرونة وحركة" },
  cardio: { en: "Cardio", de: "Ausdauer", ar: "كارديو" },
} as const;

function catalogActivityType(detail: LibraryActivityDetail, language: ReturnType<typeof resolveExerciseDisplayLanguage>) {
  const slug = text(detail.activityType?.slug);
  if (slug) {
    const reviewed = activityTypeLabels[canonicalDisplayKey(slug) as keyof typeof activityTypeLabels];
    if (reviewed) return reviewed[language];
  }
  return language === "en" ? text(detail.activityType?.name) : null;
}

function prescriptionField(value: unknown): ExercisePrescriptionField | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = value as CatalogSchemaField;
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

function catalogTargets(detail: LibraryActivityDetail, language: ReturnType<typeof resolveExerciseDisplayLanguage>) {
  const primary: string[] = [];
  const secondary: string[] = [];
  const stabilizer: string[] = [];
  const focus: string[] = [];
  const classify = (name: string | null, role: string | null) => {
    if (!name) return;
    if (role === "primary") primary.push(name);
    else if (role === "secondary") secondary.push(name);
    else if (role === "stabilizer") stabilizer.push(name);
    else focus.push(name);
  };
  for (const item of detail.coverage) {
    classify(reviewedCatalogDisplay([
      text(item.slug), text(item.name), text(item.muscleName), text(item.label),
    ], language, "muscle"), text(item.role));
  }
  const heatMapping = isCompatibleExerciseHeatMap(detail.heatMap) ? detail.heatMap.mapping : [];
  return {
    primary: unique(primary),
    secondary: unique(secondary),
    stabilizer: unique(stabilizer),
    focus: unique(focus),
    anatomyAvailable: heatMapping.length > 0
  };
}

function catalogEquipment(detail: LibraryActivityDetail, language: ReturnType<typeof resolveExerciseDisplayLanguage>): ExerciseEquipmentView[] {
  const seen = new Set<string>();
  return detail.equipment.flatMap((item) => {
    const slug = text(item.slug);
    const name = reviewedCatalogDisplay([slug, text(item.name)], language, "equipment");
    if (!name) return [];
    const key = `${slug ?? ""}:${name}:${text(item.requirement) ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ slug, name, requirement: text(item.requirement) }];
  });
}

function executionCapability(source: ExerciseDetailViewModel["identity"]["source"], domain: string, activityId: string) {
  if (source === "catalog_v2") {
    return { executable: false, contract: null, reason: "unsupported_execution_contract", startHref: null } as const;
  }
  if ((source === "catalog_legacy" && domain === "strength") || source === "custom") {
    return { executable: true, contract: "strength_reps_weight_v1", reason: "supported", startHref: `/workouts/session/${encodeURIComponent(activityId)}` } as const;
  }
  return { executable: false, contract: null, reason: "unsupported_execution_contract", startHref: null } as const;
}

export function catalogActivityDetailModel(
  detail: LibraryActivityDetail,
  meta: LibraryProviderMeta,
  domainInput?: string
): ExerciseDetailViewModel {
  const domain = detail.domain ?? domainInput;
  if (!domain) throw new Error("Library activity detail is missing canonical domain authority.");
  const language = resolveExerciseDisplayLanguage(meta.locale);
  const targets = catalogTargets(detail, language);
  const muscleRelevant = targets.primary.length > 0 || targets.secondary.length > 0 || targets.stabilizer.length > 0;
  const isNativeV2 = meta.source === "library_v2" && Boolean(detail.authority);
  const source = isNativeV2 ? "catalog_v2" as const : "catalog_legacy" as const;
  const snapshot = isNativeV2 ? buildCatalogAuthoritySnapshot(detail) : null;
  const fields = (detail.prescriptionSchema?.fields ?? []).map(prescriptionField).filter((field): field is ExercisePrescriptionField => Boolean(field));
  return {
    identity: {
      activityId: detail.id,
      revisionId: detail.revisionId || null,
      revisionNumber: detail.revisionNumber || null,
      slug: detail.slug || null,
      domain,
      source,
      performance: resolveExerciseIdentity({ source, activityId: detail.id })
    },
    // Prose comes directly from the requested-locale Catalog resolver. Do not
    // synthesize or client-translate editorial content here.
    name: userFacingCatalogText(detail.name) ?? fallbackExerciseName(meta.locale),
    shortDescription: userFacingCatalogText(detail.shortDescription),
    activityType: catalogActivityType(detail, language),
    difficulty: reviewedCatalogDisplay([text(detail.difficulty)], language, "difficulty"),
    movementPattern: reviewedCatalogDisplay([text(detail.movementPattern)], language, "movement"),
    mechanics: reviewedCatalogDisplay([text(detail.mechanics)], language, "mechanics"),
    forceType: reviewedCatalogDisplay([text(detail.forceType)], language, "force"),
    equipment: catalogEquipment(detail, language),
    instructions: [...detail.instructions]
      .flatMap((step) => {
        const safeText = userFacingCatalogText(step.text);
        return safeText ? [{ order: step.order, text: safeText }] : [];
      })
      .sort((left, right) => left.order - right.order),
    instructionProse: null,
    guideUrl: null,
    sourceVideoUrl: null,
    target: {
      kind: muscleRelevant ? "muscle" : targets.focus.length ? "focus" : "none",
      ...targets
    },
    anatomyAuthority: { source: isNativeV2 ? "catalog_v2" : "legacy_registry", coverage: structuredClone(detail.coverage), heatMap: detail.heatMap ? structuredClone(detail.heatMap) : null },
    formAuthority: { setup: [], techniqueCues: [], commonMistakes: [], safety: [] },
    prescription: detail.prescriptionSchema ? { key: detail.prescriptionSchema.key, version: detail.prescriptionSchema.version, fields } : null,
    performedMetricSchema: detail.performedMetricSchema ? { key: detail.performedMetricSchema.key, version: detail.performedMetricSchema.version, fields: structuredClone(detail.performedMetricSchema.fields ?? []) } : null,
    recordDefinitions: structuredClone(detail.recordDefinitions ?? []),
    catalogAuthoritySnapshot: snapshot,
    execution: executionCapability(source, domain, detail.id)
  };
}

export function customExerciseDetailModel(workout: Workout, locale = "en"): ExerciseDetailViewModel {
  const language = resolveExerciseDisplayLanguage(locale);
  const primarySource = workout.target_muscle || workout.muscle_category || "";
  const primary = unique(primarySource.split(",").map(text)).map((value) => formatExerciseDisplayValue(value, language, "muscle"));
  const secondary = unique((workout.secondary_muscles ?? []).map(text)).map((value) => formatExerciseDisplayValue(value, language, "muscle"));
  const prose = text(workout.instructions);
  const equipmentNames = formatExerciseDisplayList(workout.equipment, language, "equipment").split(", ").filter(Boolean);
  const source = "custom" as const;
  return {
    identity: { activityId: workout.id, revisionId: null, revisionNumber: null, slug: null, domain: "strength", source, performance: resolveExerciseIdentity({ source, activityId: workout.id }) },
    name: workout.name,
    shortDescription: null,
    activityType: text(workout.category) ? formatExerciseDisplayValue(workout.category!, language, "category") : null,
    difficulty: text(workout.difficulty) ? formatExerciseDisplayValue(workout.difficulty!, language, "difficulty") : null,
    movementPattern: text(workout.movement_pattern ?? workout.mechanics) ? formatExerciseDisplayValue((workout.movement_pattern ?? workout.mechanics)!, language, "movement") : null,
    mechanics: text(workout.mechanics) ? formatExerciseDisplayValue(workout.mechanics!, language, "mechanics") : null,
    forceType: text(workout.force_type) ? formatExerciseDisplayValue(workout.force_type!, language, "force") : null,
    equipment: equipmentNames.map((name) => ({ slug: null, name, requirement: null })),
    instructions: [],
    instructionProse: prose,
    guideUrl: text(workout.exercise_url),
    sourceVideoUrl: null,
    target: { kind: primary.length || secondary.length ? "muscle" : "none", primary, secondary, stabilizer: [], focus: [], anatomyAvailable: false },
    anatomyAuthority: { source: "text_only", coverage: [], heatMap: null },
    formAuthority: { setup: [], techniqueCues: [], commonMistakes: [], safety: [] },
    prescription: null,
    performedMetricSchema: null,
    recordDefinitions: [],
    catalogAuthoritySnapshot: null,
    execution: executionCapability(source, "strength", workout.id)
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
  const sourceWorkoutId = exercise.id !== (exercise.plan_exercise_id ?? exercise.id) ? exercise.id : null;
  return {
    planExerciseId: exercise.plan_exercise_id ?? exercise.id,
    planId: input.planId,
    planName: input.planName,
    dayId: input.dayId,
    dayName: input.dayName,
    name: exercise.name,
    sourceWorkoutId,
    performanceIdentity: resolveFrozenPlanExerciseIdentity({ activityId: sourceWorkoutId, catalogSource: exercise.catalog_source, isGlobal: exercise.is_global }),
    canonicalHref: sourceWorkoutId ? `/workouts/${encodeURIComponent(sourceWorkoutId)}` : null,
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
    equipmentText: core.equipment.map((item) => item.name).join(", ") || null,
    prescriptionSchema: catalog?.detail.prescriptionSchema ? structuredClone(catalog.detail.prescriptionSchema) : null,
    equipment: catalog ? structuredClone(catalog.detail.equipment) : [],
    taxonomy: { domain: core.identity.domain, coverage: catalog ? structuredClone(catalog.detail.coverage) : [] },
    catalogAuthoritySnapshot: core.catalogAuthoritySnapshot,
    catalogSource: core.identity.source === "catalog_v2" ? "external" : core.identity.source === "custom" ? "custom" : "legacy"
  };
}
