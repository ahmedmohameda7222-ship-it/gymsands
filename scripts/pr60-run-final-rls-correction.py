from pathlib import Path
import traceback

script_path = Path("scripts/pr60-final-rls-correction.py")
script = script_path.read_text(encoding="utf-8")
script = script.replace('"t\\\\\\\\tt"', '"t\\\\tt"')
script = script.replace('"t\\\\\\\\tt\\\\\\\\tt"', '"t\\\\tt\\\\tt"')
try:
    exec(compile(script, str(script_path), "exec"))
except BaseException:
    Path("scripts/pr60-rls-correction-error.txt").write_text(traceback.format_exc(), encoding="utf-8")
