from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "app/(private)/workouts/[id]/page.tsx",
    '  const displayTarget = formatExerciseDisplayList(workout.muscle_category || workout.target_muscle, language, "muscle");',
    '  const displayTarget = formatExerciseDisplayList(workout.target_muscle || workout.muscle_category, language, "muscle");'
)

replace_once(
    "app/(private)/workouts/[id]/page.tsx",
    '''              <div className="flex flex-wrap gap-2">
                {displayTarget ? <Badge>{displayTarget}</Badge> : null}
                {displayEquipment ? <Badge variant="outline">{displayEquipment}</Badge> : null}
                {displayDifficulty ? <Badge variant="outline">{displayDifficulty}</Badge> : null}
                {!workout.is_global ? <Badge variant="success">{tr("custom")}</Badge> : null}
              </div>

''',
    '''              {!workout.is_global ? <div><Badge variant="success">{tr("custom")}</Badge></div> : null}

'''
)

replace_once(
    "components/workouts/workout-browser.tsx",
    'formatExerciseDisplayList(workout.muscle_category || workout.target_muscle, language, "muscle")',
    'formatExerciseDisplayList(workout.target_muscle || workout.muscle_category, language, "muscle")'
)

replace_once(
    "components/workouts/workout-browser.tsx",
    '{workout.mechanics ? <Badge variant="outline">{formatExerciseDisplayValue(workout.movement_pattern || workout.mechanics, language, "movement")}</Badge> : null}',
    '{workout.movement_pattern || workout.mechanics ? <Badge variant="outline">{formatExerciseDisplayValue(workout.movement_pattern || workout.mechanics, language, "movement")}</Badge> : null}'
)

replace_once(
    "components/workouts/todays-workout.tsx",
    'formatExerciseDisplayList(exercise.muscle_category || exercise.target_muscle, language, "muscle")',
    'formatExerciseDisplayList(exercise.target_muscle || exercise.muscle_category, language, "muscle")'
)

replace_once("lib/i18n/train.ts", 'mechanics: "Mechanics"', 'mechanics: "Movement pattern"')
replace_once("lib/i18n/train.ts", 'mechanics: "Mechanik"', 'mechanics: "Bewegungsmuster"')
replace_once("lib/i18n/train.ts", 'mechanics: "الميكانيكا"', 'mechanics: "نمط الحركة"')

test_path = Path("lib/train/exercise-display.test.ts")
test_text = test_path.read_text(encoding="utf-8")
anchor = '''  it("keeps plan review and plan editing metadata friendly without changing canonical identities", () => {
'''
insertion = '''  it("uses the primary muscle before the broader body region and avoids duplicate details metadata", () => {
    const details = readFileSync("app/(private)/workouts/[id]/page.tsx", "utf8");
    const browser = readFileSync("components/workouts/workout-browser.tsx", "utf8");
    const today = readFileSync("components/workouts/todays-workout.tsx", "utf8");
    expect(details).toContain("workout.target_muscle || workout.muscle_category");
    expect(browser).toContain("workout.target_muscle || workout.muscle_category");
    expect(today).toContain("exercise.target_muscle || exercise.muscle_category");
    expect(details).not.toContain("{displayTarget ? <Badge>{displayTarget}</Badge> : null}");
    expect(details).not.toContain("{displayEquipment ? <Badge variant=\"outline\">{displayEquipment}</Badge> : null}");
  });

'''
if test_text.count(anchor) != 1:
    raise SystemExit("Could not locate test insertion anchor")
test_path.write_text(test_text.replace(anchor, insertion + anchor, 1), encoding="utf-8")
