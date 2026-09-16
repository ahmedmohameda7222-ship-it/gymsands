from pathlib import Path

path = Path('.github/workflows/food-catalog-portable-export-qa.yml')
text = path.read_text()

old = '''      - name: Prove non-column schema fingerprint sensitivity
        shell: bash
        run: |
          set -euo pipefail
          evidence="$RUNNER_TEMP/plan7-schema-identity-sensitivity.json"
          node scripts/verify-food-catalog-schema-identity-sensitivity.mjs > "$evidence"
          node - "$evidence" <<'NODE'
          const fs = require('node:fs');
          const evidence = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
          const required = ['constraintChanged','policyChanged','triggerChanged','functionDefinitionChanged','functionAclChanged'];
          if (evidence.verified !== true) process.exit(1);
          for (const field of required) if (evidence[field] !== true) process.exit(1);
          NODE
          cat "$evidence"
'''
if text.count(old) != 1:
    raise SystemExit(f'expected one old sensitivity step, found {text.count(old)}')
text = text.replace(old, '')

replay = '''      - name: Replay exact Git migration authority
        run: |
          mkdir -p ci-reports
          node scripts/replay-local-migration-chain.mjs --log ci-reports/plan7-restored-search-runtime.log --prove-future-order
'''
inserted = replay + '''      - name: Verify canonical schema identity sensitivity
        shell: bash
        run: |
          set -euo pipefail
          evidence="$RUNNER_TEMP/plan7-schema-identity-sensitivity.json"
          PLAN7_DATABASE_URL="$PLAIVRA_LOCAL_DATABASE_URL" node scripts/verify-food-catalog-schema-identity-sensitivity.mjs > "$evidence"
          node - "$evidence" <<'NODE'
          const fs = require('node:fs');
          const evidence = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
          const required = [
            'userFoodItemsDriftDetected',
            'privateFoodCatalogAclDriftDetected',
            'searchNormalizationHelperDriftDetected',
            'unrelatedPrivateFunctionExcluded',
            'rollbackVerified',
            'constraintChanged',
            'policyChanged',
            'triggerChanged',
            'functionDefinitionChanged',
            'functionAclChanged',
          ];
          if (evidence.verified !== true) process.exit(1);
          for (const field of required) if (evidence[field] !== true) process.exit(1);
          if (!evidence.hashes?.searchNormalizationHelperSha256) process.exit(1);
          NODE
          cat "$evidence"
'''
if text.count(replay) != 1:
    raise SystemExit(f'expected one canonical replay step, found {text.count(replay)}')
path.write_text(text.replace(replay, inserted))
