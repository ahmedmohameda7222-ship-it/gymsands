# PLAIVRA AW-2A — POST-MERGE RELEASE CLOSURE STAGE 1

## Authoritative implementation report

## 1. Scope and status

Stage 1 provides the permanent release-evidence and compatibility-marker promotion infrastructure required to close the AW-2A release safely. It does not reopen or change Active Workout application behavior.

```text
Repository: ahmedmohameda7222-ship-it/gymsands
Starting main: 93f6aaad5d170bf5cfe304597317c7ffa3016e2a
Branch: fix/aw2a-post-merge-release-closure
Draft PR: #81
PR URL: https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/81
Validated implementation candidate: 6beb21c34836303d5d993cf2f3df8eb65eb08fa2
Temporary-workflow cleanup commit: b79ccafbc88592705b6a63033834f10ec1032f59
```

The exact commit containing this report and the final PR head cannot be embedded in their own content-derived commit. Their exact SHA and final exact-head workflow identities are therefore recorded in the external Planner QA/QC handoff after this report commit is created and validated.

Stage 1 boundaries:

```text
Application behavior changed: no
Active Workout changed: no
Migration changed or added: no
Supabase write: no
Compatibility marker promoted: no
Activity Catalog changed: no
PR merged: no
Manual deployment: no
AW-2B started: no
```

## 2. Production release blocker being closed

The AW-2A Production application correctly expects:

```text
expected database migration: 20260721012814
```

Production intentionally remains at:

```text
schema compatibility version: 2
compatibility migration marker: 20260717051011
```

Therefore `/api/version` intentionally remains fail-closed:

```text
HTTP status: 503
schemaMarkerCompatible: true
migrationVersionCompatible: false
migrationLedgerReconciled: true
artifactIdentityValid: true
releaseReady: false
```

Stage 1 builds the repository-side evidence and guarded tooling needed for a later, separately authorized Stage 2. It does not mutate Production.

## 3. Permanent Quality evidence contract

Manual `Quality` requires exact release identity inputs:

```text
reviewed_commit
comparison_base
validation_request_id
```

The workflow checks out only the exact reviewed commit, verifies repository and base identity, derives the expected migration from the exact checked-out reconciled migration ledger, and executes the full release-quality suite.

The required gates are:

| Release gate | Evidence basename |
|---|---|
| `repositoryIntegrity` | `integrity` |
| `fullMigrationChain` | `full-migration-chain` |
| `databaseLint` | `database-lint` |
| `databasePreflight` | `database-preflight` |
| `migrationLedger` | `migration-ledger` |
| `dependencyAudit` | `dependency-audit` |
| `lint` | `lint` |
| `typecheck` | `typecheck` |
| `unitTests` | `unit` |
| `integrationTests` | `integration` |
| `scriptTests` | `script-tests` |
| `telemetryTests` | `telemetry-tests` |
| `environmentValidation` | `environment-validation` |
| `releaseMetadata` | `release-metadata` |
| `productionBuild` | `build` |
| `renderedBrowserQa` | `rendered-qa` |

Every gate retains real evidence:

```text
quality-reports/<basename>.log
quality-reports/<basename>.exit
quality-reports/<basename>.meta.json
```

`scripts/run-quality-gate.mjs`:

- runs without shell interpolation by default;
- streams stdout and stderr to GitHub Actions;
- retains complete output;
- records the exact numeric exit code;
- records commit and timestamp provenance;
- writes evidence atomically;
- propagates command failure;
- cannot convert a failed command into passing evidence.

## 4. Ledger-derived expected migration

Generic Quality and Release preflight do not pin an AW-2A migration constant.

The expected migration is derived from the exact checked-out `supabase/migration-ledger.json`. The ledger must be:

```text
reconciliation state: reconciled
release ready: true
pending: 0
schema-applied-untracked: 0
unresolved: 0
```

The latest reconciled applied migration becomes the single release target used by:

```text
build environment metadata
built release-metadata verification
artifact metadata
evidence index
authoritative release manifest
Release preflight
exact orchestration evidence
```

Manifest generation rejects an explicitly supplied migration that differs from the ledger head. Synthetic future-ledger tests prove that a later reconciled migration becomes the target automatically without editing the permanent workflow or evidence contract.

For this release the derived value is:

```text
20260721012814
```

## 5. Stable release identity

One stable UTC Quality build timestamp is created once and used consistently for:

```text
gate provenance
Production build
built metadata verification
artifact metadata
authoritative manifest generation
```

The release identity is bound end-to-end across Quality, artifact metadata, evidence index, release manifest, unit parity, Release preflight, and the orchestration summary:

```text
reviewed commit
comparison base
Quality workflow run ID
validation request ID
expected migration
preflight request ID
validation context
```

The exact orchestration workflow discovers dispatched runs through unique request-bound run names, not merely the same head SHA or a newer run ID. It then downloads and independently verifies both Quality and preflight evidence before reporting success.

## 6. Canonical Quality artifact

Every successful full release-quality run uploads:

```text
quality-reports-<quality_run_id>
```

Retention is 30 days.

Required contents include:

```text
release-manifest.json
artifact-metadata.json
evidence-index.json
all 16 gate logs, exits, and metadata files
unit-failure-parity.json
database-validation.log
rendered browser QA evidence
Train QA evidence
relevant diagnostic runtime logs
```

The authoritative release manifest is generated only after every required gate has produced retained evidence.

`evidence-index.json` records SHA-256 and byte size for retained evidence. Release preflight recalculates and verifies file existence, digest, size, timestamp, commit, base, run, request, and migration identity.

A failed, missing, stale, mismatched, or tampered gate cannot generate a release-valid manifest.

## 7. Release preflight contexts

Release preflight is read-only and non-deploying. It supports exactly two contexts:

```text
stage1-infrastructure-validation
production-marker-promotion-authorization
```

### Stage-1 context

It requires successful exact artifact validation and emits:

```text
ready: true
qualityArtifactValid: true
productionPromotionAuthorized: false
deploymentPerformed: false
productionMutationPerformed: false
```

### Production marker-promotion authorization context

It remains read-only and non-deploying. It may emit `productionPromotionAuthorized=true` only when all exact evidence passes and this deliberate identity-bound token matches:

```text
AUTHORIZE_PRODUCTION_MARKER_PROMOTION_<reviewed_commit>_<quality_run_id>_<expected_migration>
```

A wrong commit, base, run, request ID, migration, context, or token fails closed.

Stage 1 does not create Production authorization evidence.

## 8. Guarded compatibility-marker promotion tool

Permanent tool:

```text
scripts/promote-release-schema-compatibility.mjs
```

The AW-2A transition is intentionally pinned to:

```text
Plaivra project: bkwezjxvapaeasfvlhvv
forbidden Activity Catalog project: khlcctuefiuhunqymkbp
expected current marker: 20260717051011
target marker: 20260721012814
schema version: 2
```

Before any database adapter is created or any row is read, the trusted PostgreSQL URL must be structurally bound to the Plaivra project.

Accepted Production identities:

```text
direct:
  host = db.bkwezjxvapaeasfvlhvv.supabase.co
  user = postgres

recognized Supabase pooler:
  host = a recognized *.pooler.supabase.com endpoint
  user = postgres.bkwezjxvapaeasfvlhvv
```

Rejected before any database operation:

```text
Activity Catalog direct or pooler identity
another Supabase project
generic PostgreSQL host
localhost
malformed or incomplete URL
insecure TLS mode
project-ref and URL identity mismatch
```

Only redacted target identity is emitted. The full URL, username, password, and query credentials are never retained.

Apply mode additionally requires:

- exact successful Production-authorization preflight evidence;
- the explicit confirmation token;
- read-before-write validation;
- current singleton/version/marker match;
- compare-and-set semantics;
- exactly one updated row;
- update limited to `migration_version` and `applied_at`;
- read-after-write proof;
- redacted evidence;
- no automatic rollback.

Stage 1 uses mocks or disposable local resources only and never invokes Production dry-run or apply mode.

## 9. Least privilege

Exact Release Quality Validation uses only:

```text
actions: write
contents: read
issues: write
```

Purpose:

- `actions: write` dispatches and inspects exact Quality and preflight runs;
- `contents: read` checks out the reviewed commit and ledger;
- `issues: write` updates the PR conversation evidence comment.

`pull-requests: write` is not granted. `pull_request_target` is not used.

## 10. Validated implementation candidate evidence

Before final report cleanup, the corrected implementation candidate was validated on:

```text
candidate head: 6beb21c34836303d5d993cf2f3df8eb65eb08fa2
comparison base: 93f6aaad5d170bf5cfe304597317c7ffa3016e2a
derived migration: 20260721012814
```

Candidate workflow results:

```text
Phase A Diff Validation: 29866221693 — success
PR Quality: 29866221512 — success
Exact Release Quality Validation: 29866221706 — success
manual exact-head full Quality: 29866229805 — success
Stage-1 Release preflight: 29867254970 — success
```

Candidate request identities:

```text
validation request ID:
stage1-q-29866221706-1-6beb21c34836303d5d993cf2f3df8eb65eb08fa2

preflight request ID:
stage1-p-29866221706-1-6beb21c34836303d5d993cf2f3df8eb65eb08fa2
```

Candidate canonical artifact:

```text
artifact ID: 8509678793
name: quality-reports-29866229805
digest: sha256:b306fb0abaf422de5c6d15bad479e5c37fa5d724b82bf262d36f5ba9ab64cbdd
```

Candidate evidence proved:

```text
all 16 gates passed
all gate exit codes = 0
all stale flags = false
ledger reconciled
pending/untracked/unresolved = 0
unit failure identities introduced = 0
productionPromotionAuthorized = false
deploymentPerformed = false
productionMutationPerformed = false
```

These candidate identities do not replace the required final exact-head validation after the report cleanup commit.

## 11. Temporary workflow cleanup

A temporary self-mutating workflow was added after the candidate report. It was not part of the approved permanent design.

It was removed in:

```text
b79ccafbc88592705b6a63033834f10ec1032f59
```

The final PR tree must not contain:

```text
.github/workflows/stage1-report-finalize.yml
any self-mutating report workflow
any transfer workflow
any upload fragment
any archive or workspace helper
```

Final exact-head validation is performed only after this cleanup and this ordinary report commit.

## 12. Immutable migrations

No migration was edited or added.

```text
supabase/migrations/20260720213000_active_workout_aw2a_execution_state.sql
SHA-256: c8f21655226d51a2157fa1b8c272edc5fac1f84f0a2214376a16e225a1f04f2e

supabase/migrations/20260721012814_active_workout_aw2a_execution_state_corrections.sql
SHA-256: b79920d0f9155b0c076d602b10924846409efdac54a485333242a03bbd5e5e18
```

## 13. Read-only Production baseline

Plaivra Database:

```text
project: bkwezjxvapaeasfvlhvv
physical migration records: 64
AW-2A base alias records: 1
AW-2A correction records: 1
schema compatibility version: 2
compatibility marker: 20260717051011
workout_session_execution_states: present
correction index: present
workout sessions: 10
execution-state rows: 1
started sessions without execution state: 0
terminal sessions with execution state: 0
owner mismatches: 0
```

Activity Catalog:

```text
project: khlcctuefiuhunqymkbp
AW-2A execution table: absent
AW-2A named function: absent
```

Stage 1 performs no database write, migration application, migration repair, schema change, marker promotion, or deployment.

## 14. Final changed-file scope

The intended final PR diff contains these 16 permanent files only:

1. `.github/workflows/exact-release-quality-validation.yml`
2. `.github/workflows/quality.yml`
3. `.github/workflows/release-preflight.yml`
4. `plaivra_aw2a_post_merge_release_closure_implementation_report.md`
5. `release/release-manifest.template.json`
6. `scripts/create-release-manifest.mjs`
7. `scripts/permanent-quality-replay.test.mjs`
8. `scripts/promote-release-schema-compatibility.mjs`
9. `scripts/promote-release-schema-compatibility.test.mjs`
10. `scripts/quality-evidence-contract.mjs`
11. `scripts/release-closure-final-qa.test.mjs`
12. `scripts/release-closure-stage1.test.mjs`
13. `scripts/release-identity-contract.mjs`
14. `scripts/release-preflight.mjs`
15. `scripts/run-quality-gate.mjs`
16. `scripts/run-quality-gate.test.mjs`

No application component, application route, workout service, message, translation, migration, Supabase schema file, or Activity Catalog source is in scope.

## 15. Final validation protocol

After this report commit, the exact stable PR head must pass:

```text
Phase A Diff Validation
PR Quality
Exact Release Quality Validation
manual exact-head full Quality
Stage-1 Release preflight
```

The final handoff must record externally:

```text
final stable PR head SHA
report commit SHA
Phase A run ID/status
PR Quality run ID/status
Exact Release Quality Validation run ID/status
manual Quality run ID/status
canonical artifact ID/name/digest
Stage-1 preflight run ID/status
validation request ID
preflight request ID
derived expected migration
final changed-file list
final remote tree status
```

## 16. Stage 2 order

Stage 2 requires separate Planner authorization and must proceed in this exact order:

1. independently approve Stage 1;
2. squash-merge PR #81;
3. wait for the exact new `main` deployment;
4. run full manual Quality on the exact new `main` commit with an explicit comparison base and request ID;
5. run strict Release preflight against its exact canonical artifact using Production marker-promotion authorization context and exact deliberate token;
6. run the promotion tool in dry-run mode against the Plaivra-bound Production connection;
7. promote only `release_schema_compatibility.migration_version` from `20260717051011` to `20260721012814` using compare-and-set;
8. verify `/api/version` becomes HTTP 200 with `migrationVersionCompatible=true` and `releaseReady=true`;
9. run Production post-deploy smoke, including populated and empty authenticated layers;
10. close AW-2A release state;
11. start AW-2B only after separate Planner approval.

## 17. Final boundaries

```text
PR remains Draft and unmerged
Production compatibility marker remains 20260717051011
/api/version remains expected HTTP 503 during Stage 1
no application change
no migration change
no Supabase write
no Activity Catalog change
no deployment
AW-2B not started
```
