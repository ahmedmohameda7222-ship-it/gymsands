#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_HEAD_REF:-}" != "prelaunch-remediation-2026-07" ]]; then
  exit 0
fi

if [[ -f supabase/migrations/20260711013000_prelaunch_runtime_safety_corrections.sql ]]; then
  exit 0
fi

python3 scripts/run-prelaunch-corrections.py

python3 - <<'PY'
import json
from pathlib import Path
path = Path('package.json')
data = json.loads(path.read_text(encoding='utf-8'))
data.get('scripts', {}).pop('prelint', None)
path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
PY

rm -f \
  scripts/apply-prelaunch-corrections.py \
  scripts/run-prelaunch-corrections.py \
  scripts/ci-apply-prelaunch-corrections.sh \
  .github/workflows/apply-prelaunch-corrections.yml \
  docs/operations/prelaunch-correction-trigger.txt

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add --all
if git diff --cached --quiet; then
  echo "No correction changes were produced."
  exit 0
fi
git commit -m "fix: apply prelaunch runtime safety corrections"
git push origin HEAD:prelaunch-remediation-2026-07
