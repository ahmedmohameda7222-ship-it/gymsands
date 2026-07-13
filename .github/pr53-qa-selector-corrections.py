from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    content = target.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one QA selector correction in {path}, found {count}: {old!r}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")


replace_once(
    "components/workouts/active-workout-indicator.tsx",
    '      shell.dataset.activeWorkoutController = height > 0 ? "present" : "absent";',
    '      shell.dataset.activeWorkoutControllerState = height > 0 ? "present" : "absent";'
)
replace_once(
    "components/workouts/active-workout-indicator.tsx",
    '      shell.dataset.activeWorkoutController = "absent";',
    '      shell.dataset.activeWorkoutControllerState = "absent";'
)
replace_once(
    "scripts/run-train-layout-qa.mjs",
    'shellState: document.querySelector("[data-app-shell]")?.getAttribute("data-active-workout-controller") ?? null,',
    'shellState: document.querySelector("[data-app-shell]")?.getAttribute("data-active-workout-controller-state") ?? null,'
)
