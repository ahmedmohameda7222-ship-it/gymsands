from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


editor_path = "components/workouts/workout-plan-editor.tsx"
replace_once(
    editor_path,
    'value={formatExerciseDisplayList(exercise.target_muscle, language, "muscle")} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { target_muscle: event.target.value || null })}',
    'value={formatExerciseDisplayList(exercise.target_muscle, language, "muscle")} readOnly={Boolean(exercise.source_workout_id || exercise.workout_id)} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { target_muscle: event.target.value || null })}'
)
replace_once(
    editor_path,
    'value={formatExerciseDisplayList(exercise.equipment, language, "equipment")} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { equipment: event.target.value || null })}',
    'value={formatExerciseDisplayList(exercise.equipment, language, "equipment")} readOnly={Boolean(exercise.source_workout_id || exercise.workout_id)} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { equipment: event.target.value || null })}'
)

test_path = "lib/train/exercise-display.test.ts"
replace_once(
    test_path,
    '    expect(editor).toContain("source_workout_id: workout.id");\n',
    '    expect(editor).toContain("source_workout_id: workout.id");\n    expect(editor.match(/readOnly=\\{Boolean\\(exercise\\.source_workout_id \\|\\| exercise\\.workout_id\\)\\}/g)).toHaveLength(2);\n'
)
