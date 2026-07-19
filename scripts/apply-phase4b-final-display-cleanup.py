from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


editor = "components/workouts/workout-plan-editor.tsx"
replace_once(
    editor,
    'import { useTrainTranslation, type TrainKey } from "@/lib/i18n/train";\n',
    'import { useTrainTranslation, type TrainKey } from "@/lib/i18n/train";\nimport { formatExerciseDisplayList } from "@/lib/train/exercise-display";\n'
)
replace_once(
    editor,
    '{exercise.target_muscle || tr("general")} · {exercise.equipment || tr("noEquipment")}',
    '{formatExerciseDisplayList(exercise.target_muscle, language, "muscle") || tr("general")} · {formatExerciseDisplayList(exercise.equipment, language, "equipment") || tr("noEquipment")}'
)
replace_once(
    editor,
    'value={exercise.target_muscle ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { target_muscle: event.target.value || null })}',
    'value={formatExerciseDisplayList(exercise.target_muscle, language, "muscle")} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { target_muscle: event.target.value || null })}'
)
replace_once(
    editor,
    'value={exercise.equipment ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { equipment: event.target.value || null })}',
    'value={formatExerciseDisplayList(exercise.equipment, language, "equipment")} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { equipment: event.target.value || null })}'
)

detail = "components/workouts/workout-plan-detail.tsx"
replace_once(
    detail,
    'import { useTrainTranslation } from "@/lib/i18n/train";\n',
    'import { useTrainTranslation } from "@/lib/i18n/train";\nimport { formatExerciseDisplayList } from "@/lib/train/exercise-display";\n'
)
replace_once(
    detail,
    '  const { dir, locale, tr } = useTrainTranslation();',
    '  const { language, dir, locale, tr } = useTrainTranslation();'
)
replace_once(
    detail,
    '{exercise.target_muscle || tr("general")} · {exercise.equipment || tr("noEquipment")}',
    '{formatExerciseDisplayList(exercise.target_muscle, language, "muscle") || tr("general")} · {formatExerciseDisplayList(exercise.equipment, language, "equipment") || tr("noEquipment")}'
)

test = "lib/train/exercise-display.test.ts"
replace_once(
    test,
    '  "components/workouts/workout-plan-builder.tsx"\n];',
    '  "components/workouts/workout-plan-builder.tsx",\n  "components/workouts/workout-plan-editor.tsx",\n  "components/workouts/workout-plan-detail.tsx"\n];'
)

Path(__file__).unlink(missing_ok=True)
