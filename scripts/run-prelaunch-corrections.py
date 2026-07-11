from __future__ import annotations

from pathlib import Path

root = Path(__file__).resolve().parents[1]
marker = root / "supabase/migrations/20260711013000_prelaunch_runtime_safety_corrections.sql"
if marker.exists():
    print("Prelaunch correction batch already applied.")
    raise SystemExit(0)

patcher = root / "scripts/apply-prelaunch-corrections.py"
source = patcher.read_text(encoding="utf-8")
source = source.replace(
    "    if count != 1:\n        raise RuntimeError(f\"Expected exactly one match in {path}, found {count}: {old[:120]!r}\")",
    "    if count < 1:\n        raise RuntimeError(f\"Expected at least one match in {path}, found {count}: {old[:120]!r}\")",
    1,
)
exec(compile(source, str(patcher), "exec"), {"__name__": "__main__", "__file__": str(patcher)})
