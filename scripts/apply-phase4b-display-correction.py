from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        print(f"SKIP {path}: {old[:80]!r}")
        return
    file.write_text(text.replace(old, new, 1))


# Friendly fallback should preserve already-readable provider/localized text.
replace(
    "lib/train/exercise-display.ts",
    '  if (!/[_.-]/.test(value) && /[^\\x00-\\x7F]/.test(value)) return clean;',
    '  if (!/[_.-]/.test(value)) return clean;'
)

# Exercise Details: one clean member-facing summary and no repeated raw identifiers.
path = "app/(private)/workouts/[id]/page.tsx"
replace(path, 'import { useTrainTranslation } from "@/lib/i18n/train";\n', 'import { useTrainTranslation } from "@/lib/i18n/train";\nimport { formatExerciseDisplayList, formatExerciseDisplayValue } from "@/lib/train/exercise-display";\n')
replace(path, '  const { dir, locale, tr } = useTrainTranslation();', '  const { language, dir, locale, tr } = useTrainTranslation();')
replace(path, '  const secondaryMuscles = workout.secondary_muscles ?? video?.secondary_muscles ?? [];\n  const favorite = favoriteIds.includes(workout.id);', '  const secondaryMuscles = workout.secondary_muscles ?? video?.secondary_muscles ?? [];\n  const displayTarget = formatExerciseDisplayList(workout.muscle_category || workout.target_muscle, language, "muscle");\n  const displayEquipment = formatExerciseDisplayList(workout.equipment_required || workout.equipment, language, "equipment");\n  const displayDifficulty = formatExerciseDisplayValue(workout.experience_level || workout.difficulty, language, "difficulty");\n  const displayMovement = formatExerciseDisplayValue(workout.movement_pattern || workout.mechanics || workout.category, language, "movement");\n  const displayForce = formatExerciseDisplayValue(workout.force_type, language, "force");\n  const displaySecondary = formatExerciseDisplayList(secondaryMuscles, language, "muscle");\n  const favorite = favoriteIds.includes(workout.id);')
replace(path, '        description={metadataLine(workout.target_muscle, workout.equipment, workout.difficulty)}', '        description={metadataLine(displayTarget, displayEquipment, displayDifficulty)}')
replace(path, '''              <div className="flex flex-wrap gap-2">
                <Badge>{workout.muscle_category || workout.target_muscle}</Badge>
                <Badge variant="outline">{workout.equipment_required || workout.equipment}</Badge>
                <Badge variant="outline">{workout.experience_level || workout.difficulty}</Badge>
                {!workout.is_global ? <Badge variant="success">{tr("custom")}</Badge> : null}
                {workout.mechanics ? <Badge variant="outline">{workout.mechanics}</Badge> : null}
                {workout.force_type ? <Badge variant="outline">{workout.force_type}</Badge> : null}
              </div>''', '''              <div className="flex flex-wrap gap-2">
                {displayTarget ? <Badge>{displayTarget}</Badge> : null}
                {displayEquipment ? <Badge variant="outline">{displayEquipment}</Badge> : null}
                {displayDifficulty ? <Badge variant="outline">{displayDifficulty}</Badge> : null}
                {!workout.is_global ? <Badge variant="success">{tr("custom")}</Badge> : null}
              </div>''')
replace(path, '''              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label={tr("exerciseName")} value={workout.name} />
                <Detail label={tr("target")} value={workout.muscle_category || workout.target_muscle} />
                <Detail label={tr("secondaryMuscle")} value={secondaryMuscles.length ? secondaryMuscles.join(", ") : tr("noneSaved")} />
                <Detail label={tr("equipment")} value={workout.equipment_required || workout.equipment} />
                <Detail label={tr("mechanics")} value={workout.mechanics || workout.category} />
                <Detail label={tr("forceType")} value={workout.force_type || tr("noneSaved")} />
                <Detail label={tr("difficulty")} value={workout.experience_level || workout.difficulty} />
              </div>''', '''              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label={tr("primaryMuscle")} value={displayTarget || tr("noneSaved")} />
                <Detail label={tr("secondaryMuscle")} value={displaySecondary || tr("noneSaved")} />
                <Detail label={tr("equipment")} value={displayEquipment || tr("noneSaved")} />
                <Detail label={tr("mechanics")} value={displayMovement || tr("noneSaved")} />
                <Detail label={tr("forceType")} value={displayForce || tr("noneSaved")} />
                <Detail label={tr("difficulty")} value={displayDifficulty || tr("noneSaved")} />
              </div>''')
replace(path, '                const metadata = metadataLine(item.target_muscle, item.equipment);', '                const metadata = metadataLine(formatExerciseDisplayList(item.target_muscle, language, "muscle"), formatExerciseDisplayList(item.equipment, language, "equipment"));')

# Exercise Library cards.
path = "components/workouts/workout-browser.tsx"
replace(path, 'import { useTrainTranslation } from "@/lib/i18n/train";\n', 'import { useTrainTranslation } from "@/lib/i18n/train";\nimport { formatExerciseDisplayList, formatExerciseDisplayValue } from "@/lib/train/exercise-display";\n')
replace(path, '  const { dir, locale, tr } = useTrainTranslation();', '  const { language, dir, locale, tr } = useTrainTranslation();')
replace(path, '<p className="mt-0.5 text-sm text-muted-foreground">{workout.muscle_category || workout.target_muscle}</p>', '<p className="mt-0.5 text-sm text-muted-foreground">{formatExerciseDisplayList(workout.muscle_category || workout.target_muscle, language, "muscle")}</p>')
replace(path, '<Badge>{workout.experience_level || workout.difficulty}</Badge>', '<Badge>{formatExerciseDisplayValue(workout.experience_level || workout.difficulty, language, "difficulty")}</Badge>')
replace(path, '<Badge variant="outline">{workout.equipment_required || workout.equipment}</Badge>', '<Badge variant="outline">{formatExerciseDisplayList(workout.equipment_required || workout.equipment, language, "equipment")}</Badge>')
replace(path, '{workout.mechanics ? <Badge variant="outline">{workout.mechanics}</Badge> : null}', '{workout.mechanics ? <Badge variant="outline">{formatExerciseDisplayValue(workout.movement_pattern || workout.mechanics, language, "movement")}</Badge> : null}')
replace(path, '{workout.force_type ? <Badge variant="outline">{workout.force_type}</Badge> : null}', '{workout.force_type ? <Badge variant="outline">{formatExerciseDisplayValue(workout.force_type, language, "force")}</Badge> : null}')
replace(path, 'tr("secondaryMusclesNamed", { names: workout.secondary_muscles.join(", ") })', 'tr("secondaryMusclesNamed", { names: formatExerciseDisplayList(workout.secondary_muscles, language, "muscle") })')

# Exercise Picker cards and filter chips.
path = "components/workouts/exercise-picker-dialog.tsx"
replace(path, 'import { useTrainTranslation } from "@/lib/i18n/train";\n', 'import { useTrainTranslation } from "@/lib/i18n/train";\nimport { formatExerciseDisplayList, formatExerciseDisplayValue, type ExerciseDisplayDomain } from "@/lib/train/exercise-display";\n')
replace(path, '''function optionLabel(options: WorkoutFilterOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}''', '''function optionLabel(options: WorkoutFilterOption[], value: string, language: "en" | "de" | "ar", domain: ExerciseDisplayDomain) {
  return options.find((option) => option.value === value)?.label ?? formatExerciseDisplayValue(value, language, domain);
}''')
for old, new in [
    ('optionLabel(muscleOptions, muscle)', 'optionLabel(muscleOptions, muscle, language, "muscle")'),
    ('optionLabel(equipmentOptions, equipment)', 'optionLabel(equipmentOptions, equipment, language, "equipment")'),
    ('optionLabel(difficultyOptions, difficulty)', 'optionLabel(difficultyOptions, difficulty, language, "difficulty")'),
    ('optionLabel(muscleCategoryOptions, muscleCategory)', 'optionLabel(muscleCategoryOptions, muscleCategory, language, "muscle")'),
    ('optionLabel(secondaryMuscleOptions, secondaryMuscle)', 'optionLabel(secondaryMuscleOptions, secondaryMuscle, language, "muscle")'),
    ('optionLabel(forceTypeOptions, forceType)', 'optionLabel(forceTypeOptions, forceType, language, "force")'),
    ('optionLabel(exerciseTypeOptions, exerciseType)', 'optionLabel(exerciseTypeOptions, exerciseType, language, "category")'),
    ('optionLabel(mechanicsOptions, mechanics)', 'optionLabel(mechanicsOptions, mechanics, language, "movement")')
]:
    replace(path, old, new)
replace(path, '{exercise.target_muscle} · {exercise.equipment}', '{formatExerciseDisplayList(exercise.target_muscle, language, "muscle")} · {formatExerciseDisplayList(exercise.equipment, language, "equipment")}')
replace(path, '{exercise.difficulty}</Badge>', '{formatExerciseDisplayValue(exercise.difficulty, language, "difficulty")}</Badge>')

# Builder, plan exercise details, Train overview, and legacy Today surface.
path = "components/workouts/workout-plan-builder.tsx"
replace(path, 'import { useTrainTranslation, type TrainKey } from "@/lib/i18n/train";\n', 'import { useTrainTranslation, type TrainKey } from "@/lib/i18n/train";\nimport { formatExerciseDisplayList } from "@/lib/train/exercise-display";\n')
replace(path, '{exercise.target_muscle} · {exercise.equipment}', '{formatExerciseDisplayList(exercise.target_muscle, language, "muscle")} · {formatExerciseDisplayList(exercise.equipment, language, "equipment")}')

path = "app/(private)/my-workout/exercises/[exerciseId]/page.tsx"
replace(path, 'import { userSafeError } from "@/lib/error-formatting";\n', 'import { userSafeError } from "@/lib/error-formatting";\nimport { useTrainTranslation } from "@/lib/i18n/train";\nimport { formatExerciseDisplayList } from "@/lib/train/exercise-display";\n')
replace(path, '  const { user } = useAuth();\n', '  const { user } = useAuth();\n  const { language, dir } = useTrainTranslation();\n')
replace(path, '    <div className="space-y-5">', '    <div className="space-y-5" dir={dir}>')
replace(path, '<Badge variant="outline">{exercise.target_muscle}</Badge>', '<Badge variant="outline">{formatExerciseDisplayList(exercise.target_muscle, language, "muscle")}</Badge>')
replace(path, '<Badge variant="outline">{exercise.equipment}</Badge>', '<Badge variant="outline">{formatExerciseDisplayList(exercise.equipment, language, "equipment")}</Badge>')

path = "components/workouts/my-workout-plans.tsx"
replace(path, 'import { useTrainTranslation } from "@/lib/i18n/train";\n', 'import { useTrainTranslation } from "@/lib/i18n/train";\nimport { formatExerciseDisplayValue } from "@/lib/train/exercise-display";\n')
replace(path, '  const { locale, tr } = useTrainTranslation();\n  const preview = day?.exercises.slice(0, 3) ?? [];', '  const { language, locale, tr } = useTrainTranslation();\n  const preview = day?.exercises.slice(0, 3) ?? [];')
replace(path, '{exercise.target_muscle ? ` · ${exercise.target_muscle}` : ""}', '{exercise.target_muscle ? ` · ${formatExerciseDisplayValue(exercise.target_muscle, language, "muscle")}` : ""}')

path = "components/workouts/todays-workout.tsx"
replace(path, 'import { useTranslation } from "@/lib/i18n/use-translation";\n', 'import { useTranslation } from "@/lib/i18n/use-translation";\nimport { formatExerciseDisplayList } from "@/lib/train/exercise-display";\n')
replace(path, '  const { t, dir } = useTranslation();', '  const { language, t, dir } = useTranslation();')
replace(path, '{exercise.muscle_category || exercise.target_muscle} | {exercise.equipment_required || exercise.equipment}', '{formatExerciseDisplayList(exercise.muscle_category || exercise.target_muscle, language, "muscle")} · {formatExerciseDisplayList(exercise.equipment_required || exercise.equipment, language, "equipment")}')

# Filter labels: canonical values remain unchanged; only labels are presented.
path = "services/database/workout-library.ts"
replace(path, 'import type { ExerciseVideo, UserExerciseVideo, Workout } from "@/types";\n', 'import type { ExerciseVideo, UserExerciseVideo, Workout } from "@/types";\nimport { formatExerciseDisplayValue, resolveExerciseDisplayLanguage, type ExerciseDisplayDomain } from "@/lib/train/exercise-display";\n')
replace(path, 'function activityFilterOptions(activities: TrainingActivity[]): CanonicalWorkoutFilterOptions {', 'function activityFilterOptions(activities: TrainingActivity[], locale?: string): CanonicalWorkoutFilterOptions {')
replace(path, '  const options = emptyCanonicalWorkoutFilterOptions();\n  const add = (key: keyof CanonicalWorkoutFilterOptions, option: WorkoutFilterOption | null) => { if (option) options[key].push(option); };', '  const options = emptyCanonicalWorkoutFilterOptions();\n  const language = resolveExerciseDisplayLanguage(locale);\n  const add = (key: keyof CanonicalWorkoutFilterOptions, option: WorkoutFilterOption | null) => { if (option) options[key].push(option); };\n  const presented = (value: string | null | undefined, domain: ExerciseDisplayDomain) => value ? formatExerciseDisplayValue(value, language, domain) : value;')
replace(path, 'filterOption(activity.activityType?.slug, activity.activityType?.name)', 'filterOption(activity.activityType?.slug, presented(activity.activityType?.name ?? activity.activityType?.slug, "category"))')
replace(path, 'filterOption(activity.difficulty ? normalizeCatalogSlug(activity.difficulty) : null, activity.difficulty)', 'filterOption(activity.difficulty ? normalizeCatalogSlug(activity.difficulty) : null, presented(activity.difficulty, "difficulty"))')
replace(path, 'filterOption(activity.movementPattern ? normalizeCatalogSlug(activity.movementPattern) : null, activity.movementPattern)', 'filterOption(activity.movementPattern ? normalizeCatalogSlug(activity.movementPattern) : null, presented(activity.movementPattern, "movement"))')
replace(path, 'filterOption(activity.forceType ? normalizeCatalogSlug(activity.forceType) : null, activity.forceType)', 'filterOption(activity.forceType ? normalizeCatalogSlug(activity.forceType) : null, presented(activity.forceType, "force"))')
replace(path, 'filterOption(item.slug, item.name)', 'filterOption(item.slug, presented(item.name || item.slug, "equipment"))')
replace(path, 'filterOption(muscle.bodyRegion ? normalizeCatalogSlug(muscle.bodyRegion) : null, muscle.bodyRegion)', 'filterOption(muscle.bodyRegion ? normalizeCatalogSlug(muscle.bodyRegion) : null, presented(muscle.bodyRegion, "muscle"))')
replace(path, 'filterOption(muscle.slug, muscle.name)', 'filterOption(muscle.slug, presented(muscle.name || muscle.slug, "muscle"))')
replace(path, '    ? activityFilterOptions(response.data)', '    ? activityFilterOptions(response.data, locale)')
replace(path, '  const mapTaxonomy = (items: Array<{ slug: string; name: string }> = []) => items\n    .map((item) => filterOption(item.slug, item.name))', '  const language = resolveExerciseDisplayLanguage(locale);\n  const mapTaxonomy = (items: Array<{ slug: string; name: string }> = [], domain: ExerciseDisplayDomain) => items\n    .map((item) => filterOption(item.slug, formatExerciseDisplayValue(item.name || item.slug, language, domain)))')
for old, new in [
    ('mapTaxonomy(filters.data.equipment)', 'mapTaxonomy(filters.data.equipment, "equipment")'),
    ('mapTaxonomy(filters.data.activityTypes)', 'mapTaxonomy(filters.data.activityTypes, "category")'),
    ('filterOption(normalizeCatalogSlug(item), item)', 'filterOption(normalizeCatalogSlug(item), formatExerciseDisplayValue(item, language, "difficulty"))'),
    ('mapTaxonomy(filters.data.primaryMuscles)', 'mapTaxonomy(filters.data.primaryMuscles, "muscle")'),
    ('mapTaxonomy(filters.data.secondaryMuscles)', 'mapTaxonomy(filters.data.secondaryMuscles, "muscle")'),
    ('mapTaxonomy(filters.data.muscleCategories)', 'mapTaxonomy(filters.data.muscleCategories, "muscle")'),
    ('mapTaxonomy(filters.data.movementPatterns)', 'mapTaxonomy(filters.data.movementPatterns, "movement")'),
    ('mapTaxonomy(filters.data.forceTypes)', 'mapTaxonomy(filters.data.forceTypes, "force")')
]:
    replace(path, old, new)

# Reconcile stale implementation metadata and include the regression suite in the Phase 4B command.
replace("data/muscle-intelligence/v1/registry.json", '  "status": "approved_planning_input_not_implemented",', '  "status": "implemented_and_published",')
replace("package.json", '"test:muscle-intelligence:phase4b": "vitest run --config vitest.unit.config.mjs lib/train/muscle-intelligence/advanced-mapping-registry.test.ts lib/train/muscle-intelligence/plan-advanced-analysis.test.ts lib/product/muscle-intelligence-phase4b.test.ts"', '"test:muscle-intelligence:phase4b": "vitest run --config vitest.unit.config.mjs lib/train/exercise-display.test.ts lib/train/muscle-intelligence/advanced-mapping-registry.test.ts lib/train/muscle-intelligence/plan-advanced-analysis.test.ts lib/product/muscle-intelligence-phase4b.test.ts"')

Path(".github/workflows/phase4b-exercise-display-correction.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
