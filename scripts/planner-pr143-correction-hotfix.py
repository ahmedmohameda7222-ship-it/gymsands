from pathlib import Path
import runpy

script = Path("scripts/planner-pr143-correction.py")
text = script.read_text(encoding="utf-8")
start = text.index("for marker, section in [")
end = text.index("# 5) Surface the frozen per-set target", start)
replacement = '''for marker, section in [
    ("data-aw6-details-overview", "overview"),
    ("data-aw6-details-current-set", "current-set"),
    ("data-aw6-details-muscle-load", "muscle-load"),
    ("data-aw6-details-adjust-today", "adjust-today"),
    ("data-aw6-details-assistance", "assistance"),
]:
    replace_once(
        "components/workouts/active-workout/active-workout-details-bridge.tsx",
        f"                {marker}",
        f"                {marker}\\n                hidden={{effectiveSection !== \\\"{section}\\\"}}"
    )

'''
script.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
runpy.run_path(str(script), run_name="__main__")
Path("scripts/planner-pr143-correction-hotfix.py").unlink(missing_ok=True)
