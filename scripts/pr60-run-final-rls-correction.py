from pathlib import Path

script_path = Path("scripts/pr60-final-rls-correction.py")
script = script_path.read_text(encoding="utf-8")
script = script.replace('"t\\\\\\\\tt"', '"t\\\\tt"')
script = script.replace('"t\\\\\\\\tt\\\\\\\\tt"', '"t\\\\tt\\\\tt"')
exec(compile(script, str(script_path), "exec"))
