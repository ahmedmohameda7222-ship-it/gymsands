# PLAIVRA AW-2A — PERSISTED SESSION EXECUTION STATE

## IMPLEMENTATION REPORT

## Executive summary

AW-2A remains complete on the existing Draft PR #80. The application implementation, applied migrations, production schema, and production verification were not changed by this final correction. The correction is limited to the permanent Quality migration-replay architecture, generic validation assets, their deterministic tests, and this report.

The permanent Quality workflow no longer copies, hides, removes, or restores the AW-2A correction migration. A reusable local-only helper now performs chronological replay through the original AW-2A migration, applies the explicit local compatibility bridge, and then applies the correction plus every later missing migration with `--include-all`.

## Repository identity

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Starting main: `6f381b760eb711c3eef4bb515365d4c675648ed3`
- Branch: `feat/active-workout-aw2a-persisted-execution-state`
- Draft PR: `#80`
- PR URL: `https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/80`
- Last Planner-reviewed head before this correction: `240106da957ff510a3e68062107b30cd5c54e13f`
- Validated application head: `b7ef75583489b7ace32ba6628105969b958b9aa8`
- Validated permanent-CI implementation head: `cf42654a62eea8a9a22250c5861b7ca841aa4139`
- Validated report candidate head: `6cb21ac5abd8ed2cde2c878fce8e4a0d2367fa66`
- PR state: open, Draft, unmerged.

A Git commit cannot contain its own SHA or workflow runs that are created only after that commit exists. Therefore the exact final report-only head SHA, final Phase A run, final Quality run, and final exact-head artifact are recorded in the final Planner handoff. The report records the exact successful predecessor evidence and all permanent implementation facts.

## Final permanent replay architecture

Permanent helper:

```text
scripts/replay-local-migration-chain.mjs
```

Chronological sequence:

```text
1. Start a disposable database-only Supabase stack without repository migrations.
2. supabase db reset --local --no-seed --version 20260720213000
3. Verify local compatibility marker = 20260711014500.
4. Update the disposable local marker to 20260717051011.
5. supabase migration up --local --include-all
6. Verify every repository migration is recorded exactly once.
7. Verify final compatibility marker = 20260717051011.
8. Verify the repository working tree is unchanged.
```

The database-only bootstrap runs from a temporary directory containing only the repository `supabase/config.toml`. It starts the local database without prematurely applying the repository migration chain. No migration file is copied, renamed, hidden, removed, or restored.

## Replay-helper safety

The helper:

- refuses a repository with a linked Supabase project reference;
- uses only `postgresql://postgres:postgres@127.0.0.1:54322/postgres`;
- requires both immutable AW-2A migration files;
- validates legacy 12-digit and current 14-digit repository migration versions;
- rejects duplicate repository versions;
- requires the exact pre-bridge and post-replay markers;
- applies only local migrations with `--local --include-all`;
- rejects missing, duplicate, or unexpected local migration-history records;
- does not use `migration repair`, `db push`, or `--linked`;
- requires no secret or production connection;
- writes `quality-reports/database-validation.log`;
- fails if the working tree changes.

## Future-migration proof

Quality invokes:

```text
node scripts/replay-local-migration-chain.mjs \
  --log quality-reports/database-validation.log \
  --prove-future-order
```

The helper creates a temporary synthetic migration with a version after the latest repository migration. The synthetic SQL requires:

- the original AW-2A execution-state table;
- the AW-2A correction index;
- compatibility marker `20260717051011`.

The successful evidence proves:

```text
original AW-2A
→ local-only marker bridge
→ AW-2A correction
→ synthetic future migration
```

The synthetic file is removed reliably. The helper then performs a second replay of the unmodified repository chain. The synthetic migration is never committed and is not included as a repository migration artifact.

## Generic permanent validation assets

Permanent cross-phase names are now:

```text
scripts/check-unit-failure-parity.mjs
quality-reports/database-validation.log
quality-reports/unit-failure-parity.json
database-validation-<exact-head-sha>
```

The old permanent script was removed:

```text
scripts/check-aw2a-unit-failure-parity.mjs
```

AW-2A-specific SQL verification filenames remain AW-2A-specific because they validate the delivered AW-2A contract.

## workflow_dispatch parity handling

- Pull-request runs compare unit-failure identities against the exact PR base SHA.
- `workflow_dispatch` explicitly skips PR-base parity and records a generic JSON skip reason.
- No workflow-dispatch path can pass an empty `${{ github.event.pull_request.base.sha }}` to the parity script.

## Changed-file delta after `240106...`

The permanent-CI correction changes only:

1. `.github/workflows/quality.yml`
2. `scripts/check-unit-failure-parity.mjs` — rename/generalization of the old AW-2A parity script
3. `scripts/permanent-quality-replay.test.mjs`
4. `scripts/replay-local-migration-chain.mjs`
5. `plaivra_aw2a_persisted_execution_state_implementation_report.md`

No application source file and no migration file changed in this correction.

## Permanent tests

`scripts/permanent-quality-replay.test.mjs` verifies:

- reset through `20260720213000`;
- `migration up --local --include-all`;
- absence of the single-file remove/restore workaround;
- synthetic future ordering;
- linked-project refusal;
- exact-once local migration history;
- local-only compatibility bridge;
- safe workflow-dispatch parity handling;
- generic parity/log/artifact names;
- continued AW-2A SQL and PostgreSQL verification;
- immutable applied-migration checksums.

## Successful permanent-CI evidence

Validated permanent-CI implementation head:

```text
cf42654a62eea8a9a22250c5861b7ca841aa4139
```

- Phase A Diff Validation: run `29841259528` — `completed/success`.
- Quality: run `29841258529` — `completed/success`.
- Generic artifact: `database-validation-cf42654a62eea8a9a22250c5861b7ca841aa4139`.
- Artifact ID: `8499726524`.
- Artifact digest: `sha256:62b67bac954fa82285bc722d55c3db9eb6eaca95f42f37b9a7b0ccc7f28de182`.

Validated report candidate head:

```text
6cb21ac5abd8ed2cde2c878fce8e4a0d2367fa66
```

- Phase A Diff Validation: run `29842265095` — `completed/success`.
- Quality: run `29842265966` — `completed/success`.
- Generic artifact: `database-validation-6cb21ac5abd8ed2cde2c878fce8e4a0d2367fa66`.
- Artifact ID: `8500152895`.
- Artifact digest: `sha256:e5ffcf32709c38f075808a2ba911d1bb3c951f2fa19c09c7b7425da9157e1256`.

Both successful Quality runs passed:

- exact checkout verification;
- lint;
- typecheck;
- i18n;
- related tests;
- full unit-failure parity;
- dependency audit;
- script tests;
- integration tests;
- database-only local bootstrap;
- synthetic chronological future-migration proof;
- final chronological repository replay;
- DB lint;
- AW-2A verification SQL;
- PostgreSQL AW-2A integration verification;
- migration ledger check;
- release manifest;
- production-safe local Train/security/preflight verification;
- production build;
- Train browser QA;
- generic database evidence upload.

## Replay evidence

The successful generic logs show, for both synthetic and final repository replay:

```text
reset through 20260720213000
marker before bridge = 20260711014500
local marker bridge = 20260717051011
correction 20260721012814 applied with --include-all
final marker = 20260717051011
all expected repository migrations present exactly once
```

Final log result:

```text
Chronological local migration replay passed.
```

Migration ledger result:

```text
Migration ledger valid: 64 repository migrations classified.
applied=63 pending=0 applied_schema_untracked=0 unresolved=0
reconciliation=reconciled release_ready=true
expected_database_migration=20260721012814
```

## Unit-failure parity

Exact parity evidence on the validated report candidate:

- Head SHA: `6cb21ac5abd8ed2cde2c878fce8e4a0d2367fa66`.
- Base SHA: `6f381b760eb711c3eef4bb515365d4c675648ed3`.
- Head tests: `1249`.
- Base tests: `1205`.
- Head failures: `4`.
- Base failures: `4`.
- Introduced failure identities: `0`.
- Removed failure identities: `0`.
- Result: passed.

The same four pre-existing failure identities remain on both heads.

## Immutable migration identities

### Original AW-2A migration

- Repository: `20260720213000_active_workout_aw2a_execution_state`
- Production alias: `20260721000544_active_workout_aw2a_execution_state`
- Git blob SHA: `caa286b2ad287f042d2cf7691ec7774a9db7a50d`
- SHA-256: `c8f21655226d51a2157fa1b8c272edc5fac1f84f0a2214376a16e225a1f04f2e`
- Production count: `1`.

### Correction migration

- Identity: `20260721012814_active_workout_aw2a_execution_state_corrections`
- Git blob SHA: `aca8a238ed98f35eabffee7011dbbbd83475350e`
- SHA-256: `b79920d0f9155b0c076d602b10924846409efdac54a485333242a03bbd5e5e18`
- Index: `workout_session_execution_states_active_snapshot_item_idx`
- Production count: `1`.

Neither applied migration was edited, renamed, deleted, reapplied, or otherwise changed.

## Production state unchanged

No Supabase action was invoked during this permanent-CI correction. No production write occurred. The approved production baseline remains:

- migration records: `64`;
- ledger: `63` exact-applied, `1` version-alias;
- compatibility marker: `20260717051011`;
- original AW-2A record count: `1`;
- correction record count: `1`;
- execution-state table and correction index present;
- workout sessions: `10`;
- open sessions: `1`;
- execution-state rows: `1`;
- open sessions without state: `0`;
- terminal sessions with state: `0`;
- owner mismatches: `0`.

## Boundary confirmations

- No application-code change.
- No migration-file content change.
- No Supabase write.
- No Activity Catalog change.
- No single-file migration hiding.
- No new workflow file.
- No branch-name, PR-number, or AW-2A-branch condition in Quality.
- No merge.
- No deployment.
- AW-2B not started.

## Final repository status

- All permanent-CI assets and this report are committed on the existing branch.
- The remote branch is the authoritative workspace.
- Temporary synthetic migrations are absent from the committed tree.
- No temporary workflow, patch fragment, base64 transfer file, workspace archive, or recovery asset is part of the final correction.
- PR #80 remains Draft, open, and unmerged.

## Squash-merge requirement

After final Planner approval, PR #80 must use **Squash and merge**. Normal merge is not authorized. Until approval, the PR remains Draft and unmerged.
