import json
from pathlib import Path
base=Path('.')
ledger_path=base/'supabase/migration-ledger.json'
d=json.loads(ledger_path.read_text())
local='20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql'
entry=next(e for e in d['entries'] if e.get('localFile')==local)
entry.update({
 'state':'applied_version_alias',
 'productionVersion':'20260724232734',
 'productionName':'active_workout_aw3b_post_apply_logic_corrections',
 'evidenceCommit':'dbedfd201d5bbd5efb1988ccb92899e499197e51',
 'repositorySha256':'1e41fa5670c6a3dbf4f889688a8457dd96efd26b7bcdb3623d97f9ff707d8de4',
 'repositoryGitBlob':'84bfb4a22197f56300245f693f41f91a136814dd',
 'note':('Applied exactly once to Plaivra Database on 2026-07-24T23:27:34Z through Supabase apply_migration. '
         'The generated production version 20260724232734 differs from immutable repository version 20260724023000; '
         'this alias preserves both identities without renaming or replaying the reviewed SQL. Durable pre-application '
         'evidence commit dbedfd201d5bbd5efb1988ccb92899e499197e51; repository Git blob '
         '84bfb4a22197f56300245f693f41f91a136814dd; repository and applied SQL SHA-256 '
         '1e41fa5670c6a3dbf4f889688a8457dd96efd26b7bcdb3623d97f9ff707d8de4. Do not replay.')
})
d['capturedAt']='2026-07-24T23:28:12Z'
d['auditedRepositoryCommit']='dbedfd201d5bbd5efb1988ccb92899e499197e51'
for evidence_entry in d['entries']:
    if evidence_entry.get('localFile') == '20260724013000_active_workout_aw3b_final_logic_hardening.sql':
        evidence_entry['evidenceCommit'] = d['auditedRepositoryCommit']
d['pendingCount']=0
d['unresolvedCount']=0
d['productionRecordCount']=72
d['historyRepair']={
 'state':'reconciled','schemaAppliedUntrackedCount':0,'pendingCount':0,'unresolvedCount':0,
 'note':('Production history is reconciled through generated AW-3B record '
         '20260724232734_active_workout_aw3b_post_apply_logic_corrections. Physical Production history contains 72 records; '
         'productionMigrationCount remains the validator-derived exact state=applied count and excludes generated-version aliases. '
         'The compatibility marker remains 20260722161542. Do not replay any applied migration.')
}
ledger_path.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')

report='''# AW-3B structured set details — final implementation report

## Identity

```text
Repository: ahmedmohameda7222-ship-it/gymsands
Base: 91ab36077d5528ee1d967ed7def2ba8d2164a6a2
Branch: feat/active-workout-aw3b-structured-set-details
Draft PR: #85
Pre-application approved head: dbedfd201d5bbd5efb1988ccb92899e499197e51
```

AW-3B remains inside the structured-set-details unit. AW-3C and all later Active Workout units were not started.

## Permanent implementation

AW-3B provides owner-bound structured set details, deterministic nested reads, actor-bound provenance, exact segment replacement semantics, atomic core/detail/segment/metric writes, privacy-safe timeline evidence, complete privacy export pagination, accessible RPE/RIR validation, and EN/DE/AR drawer behavior.

The rendered autosave defect had two independent causes and both received long-term corrections:

1. Train QA duplicated plan/exercise identities and hydrated a different exercise. `lib/fixtures/train-mock-contract.json` is now the single source of truth, and QA fails immediately unless Set 1 is hydrated as persisted, completed, and structured.
2. React Strict Mode effect replay cancelled the autosave coordinator while leaving a cancelled object in its ref. Lifecycle ownership now creates one coordinator per mount, cancels only that instance, clears the ref only when it still owns it, and recreates a live coordinator on remount. A mount-cleanup-remount regression test proves the replacement coordinator persists pending writes.

Invalid draft RPE/RIR remains non-throwing for context construction, while actual persistence retains strict validation.

## Immutable migrations

Already-applied migrations remain byte-immutable. The final forward-only correction was applied exactly once:

```text
Repository file: 20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql
Generated Production identity: 20260724232734_active_workout_aw3b_post_apply_logic_corrections
Pre-application evidence commit: dbedfd201d5bbd5efb1988ccb92899e499197e51
Repository Git blob: 84bfb4a22197f56300245f693f41f91a136814dd
Repository/applied SQL SHA-256: 1e41fa5670c6a3dbf4f889688a8457dd96efd26b7bcdb3623d97f9ff707d8de4
Repository bytes: 26941
Applied at: 2026-07-24T23:27:34Z
```

No earlier AW-3B migration was replayed or modified.

## Pre-application exact-head evidence

All required workflows passed on `dbedfd201d5bbd5efb1988ccb92899e499197e51`:

```text
Phase A Diff Validation: 30131710206 — success
Quality: 30131710177 — success
Exact Release Quality Validation: 30131710165 — success
```

Quality passed migration replay, database lint, all SQL verification, migration-ledger validation, dependency audit, lint, typecheck, unit failure parity, integration tests, scripts/i18n, telemetry, environment validation, production build, release metadata, and rendered browser QA. Exact Release independently verified request-bound canonical Quality evidence and recorded read-only pre-application mode.

## Production verification

```text
Plaivra Production project: bkwezjxvapaeasfvlhvv
Physical migration records before: 71
Physical migration records after: 72
Compatibility marker before/after: 20260722161542
Graph revision before/after: absent / present
Superseded canonicalizer before/after: present / absent
Ownership violations after: 0
```

Protected data was unchanged by the migration:

```text
exercise_logs: 64 — 1c7bbdacc730fc969c63fa0041b1a4442ce8089895fa981c8e8d4815931191cf
exercise_log_metric_values: 75 — 639e66fd9a496c99bcdb1a0159bd73bc074b3145802a600c1139f06a52af0706
exercise_log_set_details: 15 — a51b3db65554f4de75e8caa3b9646f334e45f94219343aa54ec602455a500149
exercise_log_set_segments: 0 — e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
exercise_log_set_segment_metric_values: 0 — e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
workout_session_timeline_events: 83 — a6a42bb0872af5b8e652e456f531ac5b132df9f3906c94e0be3d10b333589aa9
```

The deployed public upsert remains `SECURITY DEFINER` with an empty search path, is executable by authenticated/service roles, and is denied to anon. Private graph/snapshot/timeline helpers are denied to public roles. The public authority includes timeline deferral, structured summary, graph revision, and existing detail/segment/metric provenance preservation.

## Activity Catalog isolation

Project `khlcctuefiuhunqymkbp` was inspected read-only before and after application. It contains zero AW-3B relations and zero AW-3B functions. No migration or write was sent to it.

## Advisor classification

No new AW-3B table/index/RLS regression was reported. Security advisor warnings for authenticated execution of the canonical workout `SECURITY DEFINER` RPCs are intentional and covered by owner assertion, bounded payloads, row locking, empty search paths, anon denial, and executable SQL verification. Other RLS, Auth leaked-password, unindexed-FK, unused-index, duplicate-index, and multiple-policy findings predate this unit and remain out of AW-3B scope.

## Ledger semantics

The ledger is reconciled with `pendingCount = 0`, `unresolvedCount = 0`, and `schemaAppliedUntrackedCount = 0`. `productionMigrationCount` continues to mean entries whose state is exactly `applied`; generated Production versions are represented as `applied_version_alias`. The physical Production history count is recorded separately as 72.

## Boundary

PR #85 remains Draft and unmerged. The compatibility marker was not promoted. No deployment occurred. AW-3C was not started.

## Final validation

Final post-reconciliation Phase A, Quality, and Exact Release Quality run identities are recorded after the final exact head completes.

NOT READY FOR INDEPENDENT PLANNER QA/QC — FINAL EXACT-HEAD VALIDATION PENDING
'''
(base/'docs/reports/active-workout-aw3b-implementation-report.md').write_text(report)

arch_path=base/'docs/architecture/migration-ledger-reconciliation.md'
arch=arch_path.read_text()
marker='## AW-3B final reconciliation (2026-07-24)'
section='''## AW-3B final reconciliation (2026-07-24)

The forward-only correction `20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql` was applied exactly once to Plaivra Production as generated identity `20260724232734_active_workout_aw3b_post_apply_logic_corrections`.

```text
Pre-application evidence commit: dbedfd201d5bbd5efb1988ccb92899e499197e51
Git blob: 84bfb4a22197f56300245f693f41f91a136814dd
SHA-256: 1e41fa5670c6a3dbf4f889688a8457dd96efd26b7bcdb3623d97f9ff707d8de4
Physical Production records: 72
Compatibility marker: 20260722161542
Pending: 0
Schema-applied-untracked: 0
Unresolved: 0
```

`productionMigrationCount` remains the machine-derived number of exact `state = applied` entries. Generated Production identities use `applied_version_alias`, so the physical history count is intentionally reported separately. The migration preserved all protected row counts and hashes, introduced `private.aw3b_graph_revision(uuid)`, removed the superseded canonicalizer, retained safe RPC ACL/search-path contracts, and left Activity Catalog untouched.

Do not replay, rename, edit, or replace any applied AW-3B migration.
'''
if marker in arch:
 arch=arch[:arch.index(marker)]+section+'\n'
else:
 arch=arch.rstrip()+'\n\n'+section+'\n'
arch=arch.replace('The physical production history contains **70 records**.', 'The physical production history contained **70 records** at the earlier AW-2A reconciliation point; the current AW-3B post-apply history contains **72 records**.')
arch=arch.replace('63 exact-applied + 7 version-alias = 70 actual production records', '63 exact-applied + 9 version-alias = 72 actual production records')
arch=arch.replace('AW-3B post-apply correction `supabase/migrations/20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql` is committed and pending one authorized Plaivra Database application; do not replay any applied migration.', 'AW-3B post-apply correction `supabase/migrations/20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql` is applied as generated identity `20260724232734`; do not replay any applied migration.')
arch_path.write_text(arch)

print('updated ledger/report/architecture')
print('ledger summary',d['productionMigrationCount'],d['productionRecordCount'],d['pendingCount'],d['unresolvedCount'],d['historyRepair'])

import shutil
for cleanup_path in [
    Path('aw3b-evidence-export'),
    Path('aw3b-migration-export'),
    Path('.github/workflows/aw3b-final-reconciliation.yml'),
    Path('.github/workflows/aw3b-final-reconciliation-trigger.txt'),
    Path('.github/workflows/aw3b-final-reconciliation-trigger-2.txt'),
    Path('.github/workflows/aw3b-final-reconciliation-trigger-3.txt'),
    Path('.github/workflows/aw3b-final-reconciliation-trigger-4.txt'),
    Path('.github/workflows/aw3b-final-reconciliation-trigger-5.txt'),
    Path('.github/workflows/aw3b-final-reconciliation-trigger-6.txt'),
]:
    if cleanup_path.is_dir():
        shutil.rmtree(cleanup_path)
    elif cleanup_path.exists():
        cleanup_path.unlink()
