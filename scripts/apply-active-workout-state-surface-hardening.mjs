import fs from "node:fs";

const path = "components/workouts/active-workout/active-workout-execution-shell.tsx";
let source = fs.readFileSync(path, "utf8");
function replaceOnce(before, after) {
  if (!source.includes(before)) throw new Error(`Missing state-surface anchor: ${before.slice(0, 140)}`);
  source = source.replace(before, after);
}

replaceOnce(
  '  function closeThenWithTrigger(action: (trigger: HTMLButtonElement) => void, trigger: HTMLButtonElement) {\n    setOpenMenu(null);\n    action(trigger);\n  }\n\n  return (',
  '  function closeThenWithTrigger(action: (trigger: HTMLButtonElement) => void, trigger: HTMLButtonElement) {\n    setOpenMenu(null);\n    action(trigger);\n  }\n\n  const exerciseNavigatorTrigger = onOpenExerciseNavigator ? (\n    <button\n      type="button"\n      data-aw-exercise-navigator-trigger\n      className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"\n      onClick={(event) => closeThenWithTrigger(onOpenExerciseNavigator, event.currentTarget)}\n      aria-haspopup="dialog"\n    >\n      {exercisePositionLabel}\n      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />\n    </button>\n  ) : <p className="text-xs font-semibold text-muted-foreground">{exercisePositionLabel}</p>;\n\n  return (',
);
replaceOnce(
  '            <p className="mt-1 text-sm text-muted-foreground">{setPositionLabel}</p>\n            <Button type="button" className="mt-6 min-h-[52px] min-w-52" onClick={onPauseResume} disabled={busy}>',
  '            <p className="mt-1 text-sm text-muted-foreground">{setPositionLabel}</p>\n            <div className="mt-3">{exerciseNavigatorTrigger}</div>\n            <Button type="button" className="mt-6 min-h-[52px] min-w-52" onClick={onPauseResume} disabled={busy}>',
);
replaceOnce(
  '          <section data-aw10-rest-state className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">\n            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{restPresetSectionLabel}</p>',
  '          <section data-aw10-rest-state className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">\n            <div className="mb-2">{exerciseNavigatorTrigger}</div>\n            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{restPresetSectionLabel}</p>',
);
replaceOnce(
  '                {onOpenExerciseNavigator ? (\n                  <button\n                    type="button"\n                    data-aw-exercise-navigator-trigger\n                    className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"\n                    onClick={(event) => closeThenWithTrigger(onOpenExerciseNavigator, event.currentTarget)}\n                    aria-haspopup="dialog"\n                  >\n                    {exercisePositionLabel}\n                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />\n                  </button>\n                ) : <p className="text-xs font-semibold text-muted-foreground">{exercisePositionLabel}</p>}',
  '                {exerciseNavigatorTrigger}',
);
replaceOnce(
  '      <div className="mt-3" aria-live="polite">{feedback}</div>',
  '      <div data-aw5-feedback className="mt-3" aria-live="polite">{feedback}</div>',
);
replaceOnce(
  '      <MobileStickyActionsSpacer placement="session" />\n      <MobileStickyActions placement="session" data-aw10-sticky-actions>\n        <Button type="button" data-aw5-primary-action className="min-h-[54px] w-full text-base font-semibold" onClick={onPrimaryAction} disabled={resolvedPrimaryActionDisabled}>\n          <PrimaryActionIcon kind={primaryActionKind} />\n          {primaryActionLabel}\n        </Button>\n      </MobileStickyActions>\n\n      <div className="mt-7 hidden lg:block">\n        <Button type="button" data-aw5-primary-action className="min-h-[54px] w-full text-base font-semibold" onClick={onPrimaryAction} disabled={resolvedPrimaryActionDisabled}>\n          <PrimaryActionIcon kind={primaryActionKind} />\n          {primaryActionLabel}\n        </Button>\n      </div>',
  '      {!paused ? (\n        <>\n          <MobileStickyActionsSpacer placement="session" />\n          <MobileStickyActions placement="session" data-aw10-sticky-actions>\n            <Button type="button" data-aw5-primary-action className="min-h-[54px] w-full text-base font-semibold" onClick={onPrimaryAction} disabled={resolvedPrimaryActionDisabled}>\n              <PrimaryActionIcon kind={primaryActionKind} />\n              {primaryActionLabel}\n            </Button>\n          </MobileStickyActions>\n\n          <div className="mt-7 hidden lg:block">\n            <Button type="button" data-aw5-primary-action className="min-h-[54px] w-full text-base font-semibold" onClick={onPrimaryAction} disabled={resolvedPrimaryActionDisabled}>\n              <PrimaryActionIcon kind={primaryActionKind} />\n              {primaryActionLabel}\n            </Button>\n          </div>\n        </>\n      ) : null}',
);

fs.writeFileSync(path, source);
console.log("Active Workout paused/rest state surfaces hardened.");
