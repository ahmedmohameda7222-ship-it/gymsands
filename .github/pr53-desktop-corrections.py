from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    content = target.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one desktop correction match in {path}, found {count}: {old[:160]!r}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")


replace_once(
    "components/layout/app-shell.tsx",
    '''  "--active-workout-controller-gap": "0.5rem",
  "--active-workout-controller-bottom": "calc(env(safe-area-inset-bottom) + var(--mobile-nav-bottom-offset) + var(--mobile-nav-height) + var(--active-workout-controller-gap))",
  "--app-bottom-overlay-stack": "calc(var(--active-workout-controller-bottom) + var(--active-workout-controller-height, 0px))",
  "--app-bottom-reserved-space": "calc(var(--app-bottom-overlay-stack) + 2rem)",
  "--train-sticky-footer-bottom": "calc(var(--app-bottom-overlay-stack) + 0.5rem)"''',
    '''  "--active-workout-controller-gap": "0.5rem",
  "--active-workout-controller-bottom": "calc(env(safe-area-inset-bottom) + var(--mobile-nav-bottom-offset) + var(--mobile-nav-height) + var(--active-workout-controller-gap))",
  "--app-bottom-overlay-stack": "calc(var(--active-workout-controller-bottom) + var(--active-workout-controller-height, 0px))",
  "--app-bottom-reserved-space": "calc(var(--app-bottom-overlay-stack) + 2rem)",
  "--train-sticky-footer-bottom": "calc(var(--app-bottom-overlay-stack) + 0.5rem)",
  "--desktop-active-workout-controller-bottom": "1.25rem",
  "--desktop-app-bottom-reserved-space": "calc(var(--desktop-active-workout-controller-bottom) + var(--active-workout-controller-height, 0px) + 2rem)",
  "--desktop-train-sticky-footer-bottom": "calc(var(--desktop-active-workout-controller-bottom) + var(--active-workout-controller-height, 0px) + 0.5rem)"'''
)
replace_once(
    "components/layout/app-shell.tsx",
    '<main id="main-content" className="pb-[var(--app-bottom-reserved-space)] lg:ml-72 lg:pb-0">',
    '<main id="main-content" className="pb-[var(--app-bottom-reserved-space)] lg:ml-72 lg:pb-[var(--desktop-app-bottom-reserved-space)]">'
)
replace_once(
    "components/workouts/active-workout-indicator.tsx",
    'lg:inset-x-auto lg:bottom-5 lg:right-5 lg:w-[34rem]',
    'lg:inset-x-auto lg:bottom-[var(--desktop-active-workout-controller-bottom)] lg:right-5 lg:w-[34rem]'
)
replace_once(
    "components/workouts/workout-plan-builder.tsx",
    '<div className="sticky bottom-[var(--train-sticky-footer-bottom)] z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-auto sm:flex sm:w-full sm:max-w-5xl sm:items-center sm:justify-between sm:rounded-2xl sm:border sm:px-4" data-train-sticky-footer>',
    '<div className="sticky bottom-[var(--train-sticky-footer-bottom)] z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-auto sm:flex sm:w-full sm:max-w-5xl sm:items-center sm:justify-between sm:rounded-2xl sm:border sm:px-4 lg:bottom-[var(--desktop-train-sticky-footer-bottom)]" data-train-sticky-footer>'
)
replace_once(
    "components/workouts/workout-plan-editor.tsx",
    '<div className="fixed inset-x-0 bottom-[var(--train-sticky-footer-bottom)] z-30 border-t bg-background/95 px-3 py-3 backdrop-blur sm:static sm:rounded-2xl sm:border" data-train-sticky-footer>',
    '<div className="sticky bottom-[var(--train-sticky-footer-bottom)] z-30 border-t bg-background/95 px-3 py-3 backdrop-blur sm:rounded-2xl sm:border lg:bottom-[var(--desktop-train-sticky-footer-bottom)]" data-train-sticky-footer>'
)
replace_once(
    "lib/product/train-final-visual-corrections.test.ts",
    '    expect(shell).toContain("--active-workout-controller-height, 0px");',
    '    expect(shell).toContain("--active-workout-controller-height, 0px");\n    expect(shell).toContain("--desktop-train-sticky-footer-bottom");\n    expect(shell).toContain("lg:pb-[var(--desktop-app-bottom-reserved-space)]");'
)
