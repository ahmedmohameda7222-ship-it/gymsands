from pathlib import Path
import runpy

script = Path("scripts/planner-pr143-correction.py")
text = script.read_text(encoding="utf-8")
old = '''for marker, section in [
    ("data-aw6-details-overview", "overview"),
    ("data-aw6-details-current-set", "current-set"),
    ("data-aw6-details-muscle-load", "muscle-load"),
    ("data-aw6-details-adjust-today", "adjust-today"),
    ("data-aw6-details-assistance", "assistance"),
]:
    replace_once(
        "components/workouts/active-workout/active-workout-details-bridge.tsx",
        f'''                {marker}\\n                aria-labelledby=''',
        f'''                {marker}\\n                hidden={{effectiveSection !== "{section}"}}\\n                aria-labelledby='''
    )
'''
new = '''for marker, section in [
    ("data-aw6-details-overview", "overview"),
    ("data-aw6-details-current-set", "current-set"),
    ("data-aw6-details-muscle-load", "muscle-load"),
    ("data-aw6-details-adjust-today", "adjust-today"),
    ("data-aw6-details-assistance", "assistance"),
]:
    replace_once(
        "components/workouts/active-workout/active-workout-details-bridge.tsx",
        f"                {marker}",
        f'''                {marker}\\n                hidden={{effectiveSection !== "{section}"}}'''
    )
'''
if old not in text:
    raise SystemExit("Planner correction loop did not match expected transport source")
script.write_text(text.replace(old, new, 1), encoding="utf-8")
runpy.run_path(str(script), run_name="__main__")
Path("scripts/planner-pr143-correction-hotfix.py").unlink(missing_ok=True)
