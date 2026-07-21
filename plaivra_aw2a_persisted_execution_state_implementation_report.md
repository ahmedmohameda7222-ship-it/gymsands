# PLAIVRA AW-2A — PERSISTED SESSION EXECUTION STATE

## IMPLEMENTATION REPORT

## Executive summary

AW-2A is complete on the existing Draft PR #80. The application implementation, applied migrations, production schema, and production verification remain unchanged. This final correction changes only the permanent Quality migration-replay architecture and its generic validation assets.

The permanent Quality workflow no longer copies, hides, removes, or restores the AW-2A correction migration. It now delegates migration replay to a reusable local-only helper that:

1. starts a disposable database-only Supabase stack without repository migrations;
2. resets the real repository chain through `20260720213000_active_workout_aw2a_execution_state`;
3. verifies the historical local compatibility marker is exactly `20260711014500`;
4. updates that marker only in the disposable local database to `20260717051011`;
5. applies the AW-2A correction and every later missing migration with `supabase migration up --local --include-all`;
6. verifies every repository migration is recorded exactly once;
7. verifies the final marker remains `20260717051011`;
8. leaves the repository working tree unchanged.

The workflow additionally proves future ordering with a synthetic migration created only during CI after the current repository chain. The proof verifies the order:

```text
original AW-2A
→ local-only compatibility bridge
→ AW-2A correction
→ synthetic future migration
```

The synthetic migration is removed reliably before the helper exits and never becomes a committed migration or repository artifact.

## Repository identity

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Starting/reviewed main SHA: `6f381b760eb711c3eef4bb515365d4c675648ed3`
- Branch: `feat/active-workout-aw2a-persisted-execution-state`
- Draft PR: `#80`
- PR URL: `https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/80`
- Last Planner-reviewed final head: `240106da957ff510a3e68062107b30cd5c54e13f`
- Validated AW-2A application head: `b7ef75583489b7ace32ba6628105969b958b9aa8`
- Validated permanent-CI implementation head before this report-only commit: `cf42654a62eea8a9a22250c5861b7ca841aa4139`
- PR state: open, Draft, unmerged.
- The exact report-only commit cannot self-embed its own future workflow run IDs. Exact final report-head run IDs and artifact identity are recorded in the final Planner handoff.

## AW-2A delivered application behavior

The approved application behavior remains unchanged:

- set-log persistence completes before cursor/rest advancement is accepted;
- a failed set-log write does not advance the cursor or leave a new rest state;
- a successful set-log write followed by execution-state synchronization failure is reported as partial success rather than a failed log write;
- paused duration uses accumulated elapsed seconds without wall-clock projection;
- the serialized execution-state queue/ref tracks the latest accepted server state;
- tests cover ordering, rollback boundaries, partial success, paused projection, and latest-state behavior.

No application component, service, helper, type, privacy export, or AW-2A application test behavior was changed by the permanent-CI correction.

## Final permanent replay architecture

Permanent helper:

```text
scripts/replay-local-migration-chain.mjs
```

Safety properties:

- refuses a repository containing a linked Supabase project reference;
- uses the fixed local database URL `postgresql://postgres:postgres@127.0.0.1:54322/postgres`;
- starts only a disposable local database stack;
- requires both immutable AW-2A migration files;
- rejects invalid or duplicate repository migration versions;
- requires the pre-bridge marker to equal `20260711014500`;
- permits the marker update only through local `psql` against `127.0.0.1`;
- applies missing migrations with `--local --include-all`;
- requires the final marker to equal `20260717051011`;
- requires every repository migration to appear exactly once in local history;
- rejects missing, duplicate, or unexpected local migration records;
- does not invoke `migration repair`, `db push`, or `--linked`;
- writes `quality-reports/database-validation.log`;
- fails if the working tree differs after replay.

## Chronological replay sequence

The exact permanent sequence is:

```text
supabase start --exclude <all non-database services>
supabase db reset --local --no-seed --version 20260720213000
verify marker = 20260711014500
update local marker = 20260717051011
supabase migration up --local --include-all
verify marker = 20260717051011
verify repository migration history exactly once
```

The database-only bootstrap is executed from a temporary directory containing only the repository `supabase/config.toml`. This starts the local database without applying the repository migration chain prematurely. No migration is copied, renamed, hidden, or removed.

## Future-migration proof

The helper calculates a temporary timestamp after the latest current repository migration and creates a synthetic SQL migration in the CI working tree. Its SQL requires:

- the original AW-2A execution-state table to exist;
- the correction index to exist;
- the compatibility marker to equal `20260717051011`.

The helper then performs the full chronological replay and confirms that local history orders:

```text
20260720213000
< 20260721012814
< synthetic future version
```

After that proof, the temporary migration is removed and a second replay validates the unmodified repository chain. The successful Quality evidence log records both passes.

## Generic permanent validation assets

The cross-phase validation assets are now generic:

```text
scripts/check-unit-failure-parity.mjs
quality-reports/database-validation.log
quality-reports/unit-failure-parity.json
database-validation-<exact-head-sha>
```

Removed permanent AW-2A-specific script name:

```text
scripts/check-aw2a-unit-failure-parity.mjs
```

AW-2A-specific SQL verification filenames remain unchanged because they verify the delivered AW-2A database contract.

## workflow_dispatch parity handling

For pull-request runs, unit-failure parity compares against the exact `${{ github.event.pull_request.base.sha }}`.

For `workflow_dispatch`, the PR-base parity step is explicitly skipped and a generic JSON record is written with:

```text
skipped = true
reason = workflow_dispatch has no pull-request base SHA
```

Therefore workflow dispatch never passes an empty pull-request base SHA to the parity script.

## Permanent-CI changed-file delta after `240106...`

Relative to `240106da957ff510a3e68062107b30cd5c54e13f`, the permanent-CI implementation head changes only:

1. `.github/workflows/quality.yml`
2. `scripts/check-unit-failure-parity.mjs` — rename/generalization of the old AW-2A parity script
3. `scripts/permanent-quality-replay.test.mjs`
4. `scripts/replay-local-migration-chain.mjs`
5. `plaivra_aw2a_persisted_execution_state_implementation_report.md` — this report-only finalization

No application source file and no migration file changed in this correction.

## Permanent source-contract tests

`scripts/permanent-quality-replay.test.mjs` verifies:

- Quality delegates to the permanent replay helper;
- replay uses `db reset --version 20260720213000`;
- replay uses `migration up --local --include-all`;
- no single-file remove/restore workaround remains;
- synthetic future version ordering;
- linked-project refusal;
- exact-once migration-history validation;
- local-only compatibility bridge;
- safe workflow-dispatch parity handling;
- generic log, parity, and artifact names;
- AW-2A verification SQL and PostgreSQL integration remain enforced;
- both applied migration SHA-256 checksums remain immutable.

## Exact successful validation before report-only finalization

Permanent-CI implementation head:

```text
cf42654a62eea8a9a22250c5861b7ca841aa4139
```

Exact-head workflows:

- Phase A Diff Validation: run `29841259528` — `completed/success`.
- Quality: run `29841258529` — `completed/success`.

Generic exact-head evidence artifact:

- Name: `database-validation-cf42654a62eea8a9a22250c5861b7ca841aa4139`
- Artifact ID: `8499726524`
- Digest: `sha256:62b67bac954fa82285bc722d55c3db9eb6eaca95f42f37b9a7b0ccc7f28de182`
- Artifact head: `cf42654a62eea8a9a22250c5861b7ca841aa4139`

The successful Quality job passed:

- exact checkout verification;
- changed-source lint;
- TypeScript typecheck;
- i18n contract;
- related tests;
- full unit-failure parity;
- production dependency audit;
- script tests;
- integration tests;
- database-only local bootstrap;
- synthetic future-migration chronological replay proof;
- final repository chronological replay;
- DB lint;
- AW-2A verification SQL;
- PostgreSQL AW-2A integration verification;
- migration ledger check;
- release manifest generation;
- production-safe local Train/security/preflight verification;
- production build;
- Train browser QA;
- generic database artifact upload.

## Migration replay evidence

The generic validation log proves:

```text
synthetic replay:
  reset through 20260720213000
  marker before bridge = 20260711014500
  marker after bridge = 20260717051011
  correction 20260721012814 applied
  synthetic later migration applied

final repository replay:
  reset through 20260720213000
  marker before bridge = 20260711014500
  marker after bridge = 20260717051011
  correction 20260721012814 applied
  all repository migrations recorded once

result:
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

Generic parity evidence for `cf42654a62eea8a9a22250c5861b7ca841aa4139`:

- Base SHA: `6f381b760eb711c3eef4bb515365d4c675648ed3`.
- Head tests: `1249`.
- Base tests: `1205`.
- Head failures: `4`.
- Base failures: `4`.
- Introduced failure identities: `0`.
- Removed failure identities: `0`.
- Result: passed.

The four unchanged failure identities are:

1. `Muscle Intelligence Phase 1 migration contract executes the disposable Phase 1 verification in the authoritative Quality database preflight`
2. `Train Phase 2A architecture contract enforces privacy, ownership, JSON shape, and verification in the authoritative quality gate`
3. `approved Train Phase 1 UI contracts keeps picker selection, duplicates, keyboard selection, focus return, request grouping, cancellation, and explicit pagination`
4. `approved Train Phase 1 UI contracts localizes detail, history filters, direct-session failures, and the active workout controller`

## Immutable migration identities

### Original AW-2A migration

- Repository file: `supabase/migrations/20260720213000_active_workout_aw2a_execution_state.sql`
- Repository identity: `20260720213000_active_workout_aw2a_execution_state`
- Production alias: `20260721000544_active_workout_aw2a_execution_state`
- Git blob SHA: `caa286b2ad287f042d2cf7691ec7774a9db7a50d`
- SHA-256: `c8f21655226d51a2157fa1b8c272edc5fac1f84f0a2214376a16e225a1f04f2e`
- Production record count: `1`.

### Forward-only correction migration

- Repository file: `supabase/migrations/20260721012814_active_workout_aw2a_execution_state_corrections.sql`
- Identity: `20260721012814_active_workout_aw2a_execution_state_corrections`
- Git blob SHA: `aca8a238ed98f35eabffee7011dbbbd83475350e`
- SHA-256: `b79920d0f9155b0c076d602b10924846409efdac54a485333242a03bbd5e5e18`
- Index: `workout_session_execution_states_active_snapshot_item_idx`
- Production record count: `1`.

Neither applied migration was edited, renamed, deleted, reapplied, or otherwise changed by this correction.

## Production state unchanged

No Supabase write action was executed during this permanent-CI correction. The previously approved read-only production state remains the applicable baseline:

- production migration records: `64`;
- ledger: `63` exact-applied and `1` version-alias;
- compatibility marker: `20260717051011`;
- original AW-2A production record count: `1`;
- correction production record count: `1`;
- execution-state table present;
- correction index present;
- workout sessions: `10`;
- open sessions: `1`;
- execution-state rows: `1`;
- open sessions without state: `0`;
- terminal sessions with state: `0`;
- owner mismatches: `0`.

## Scope and boundary confirmations

- No application-code change in the permanent-CI correction.
- No migration-file content change.
- No migration application or replay against Supabase production.
- No Supabase write.
- No Activity Catalog repository or database change.
- No single migration file was hidden, removed, renamed, or restored during replay.
- No new workflow file.
- No branch-name, PR-number, or AW-2A-branch condition was added to Quality.
- No merge.
- No deployment.
- AW-2B was not started.

## Final repository status

- All permanent-CI assets and this report are committed on the existing AW-2A branch.
- The remote branch is the authoritative workspace.
- Temporary synthetic migrations are removed by the helper and do not appear in the committed tree.
- No temporary workflow, patch fragment, workspace archive, base64 transfer file, or recovery helper is part of the final correction.
- PR #80 remains open, Draft, and unmerged.

## Squash-merge requirement

After final Planner approval, PR #80 must be merged using **Squash and merge**. Normal merge is not authorized because the PR contains the full iterative implementation and CI-correction commit history. Until that approval, the PR must remain Draft and unmerged.
