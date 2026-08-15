from pathlib import Path

path = Path("components/workouts/active-workout/active-workout-details-bridge.tsx")
text = path.read_text(encoding="utf-8")
block = '''  const closeBeforeAi = () => onOpenChange(false);\n  const effectiveSection: ActiveWorkoutDetailsSection =\n    requestedSection === "adjust-today" && sourceKind !== "plan-day" ? "overview" : requestedSection;\n  const dialogTitle = effectiveSection === "overview"\n    ? tr("details.exerciseOverview")\n    : effectiveSection === "current-set"\n      ? tr("actions.setDetails")\n      : effectiveSection === "muscle-load"\n        ? tr("details.muscleLoad")\n        : effectiveSection === "adjust-today"\n          ? tr("details.adjustToday")\n          : tr("chatGPT.ask");\n\n'''
if text.count(block) != 1:
    raise SystemExit("focused-details declaration block did not match exactly once")
text = text.replace(block, "", 1)
anchor = '''  const rpeErrorId = activeRpeValidation.error ? "active-set-rpe-error" : undefined;\n  const rirErrorId = activeRirValidation.error ? "active-set-rir-error" : undefined;\n\n'''
if text.count(anchor) != 1:
    raise SystemExit("details validation anchor did not match exactly once")
# effectiveSection must be initialized before the effect dependency list reads it.
text = text.replace(anchor, anchor + block, 1)
path.write_text(text, encoding="utf-8")
Path("scripts/planner-pr143-ts-fix.py").unlink(missing_ok=True)
Path(".github/workflows/planner-pr143-ts-fix.yml").unlink(missing_ok=True)
