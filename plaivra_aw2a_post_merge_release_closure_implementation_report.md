# PLAIVRA AW-2A — POST-MERGE RELEASE CLOSURE STAGE 1

## Implementation report

## Executive summary

Stage 1 closes the permanent repository-side release-evidence gap that remained after AW-2A was squash-merged. It does not reopen AW-2A application behavior and does not promote the Production compatibility marker.

The implementation provides:

- exact-commit manual `Quality` execution with explicit reviewed and comparison SHAs;
- retained real log, exit-code, and metadata evidence for every release-required gate;
- one canonical `quality-reports-<run_id>` artifact and authoritative manifest generated after all gates;
- fail-closed exact-artifact Release preflight validation;
- permanent exact release-quality orchestration for pull requests that change the release contract;
- a guarded compatibility-marker promotion tool with read-before-write, compare-and-set, read-after-write, project allowlisting, explicit authorization evidence, and explicit confirmation;
- focused deterministic tests for the evidence helper, Quality contract, preflight, and promotion tool.

Stage 1 performs no Supabase write, no marker promotion, no merge, and no deployment. Production is expected to remain fail-closed at `/api/version` until separately authorized Stage 2.

## Repository identity

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Starting `main`: `93f6aaad5d170bf5cfe304597317c7ffa3016e2a`
- Branch: `fix/aw2a-post-merge-release-closure`
- Draft PR: `#81`
- Draft PR URL: `https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/81`
- Validated implementation candidate head before this report update: `34b8ea48cda856c0d3c3caf459b3509985cc63d8`
- PR state required at handoff: open, Draft, unmerged

A Git commit cannot contain its own content-derived SHA or workflow run IDs allocated only after that commit exists. The committed report therefore records the latest validated implementation candidate and the contract for exact final-head evidence. The exact report-head Phase A, PR Quality, manual Quality, canonical artifact, and Release preflight identities are emitted by `Exact Release Quality Validation`, retained as GitHub artifacts, recorded in the PR validation comment, and repeated in the Planner handoff.

## Root cause of Production `/api/version` HTTP 503

The deployed AW-2A artifact correctly expects migration version:

```text
20260721012814
```

The Production compatibility row intentionally remains:

```text
schema version: 2
migration marker: 20260717051011
```

The migration ledger is reconciled with no pending, untracked, or unresolved entries, but the marker has not been promoted. Runtime behavior is intentionally fail-closed:

```text
schemaMarkerCompatible: true
migrationVersionCompatible: false
migrationLedgerReconciled: true
artifactIdentityValid: true
releaseReady: false
```

Stage 1 adds the evidence and guarded tooling required for later authorization. It does not change this Production state.

## Quality artifact contract defect

Before Stage 1:

- `Release preflight` and post-deploy workflows expected `quality-reports-<quality_run_id>`;
- they expected `quality-reports/release-manifest.json` and complete gate evidence;
- permanent `Quality` uploaded only specialized artifacts;
- the release manifest was generated early under `/tmp` before later gates;
- no canonical exact-run artifact retained all required gate logs and exits.

Consequently Release preflight could not consume a complete exact-commit release authority.

## Exact manual Quality inputs

`Quality` now requires on `workflow_dispatch`:

```text
reviewed_commit   exact 40-character SHA
comparison_base   exact 40-character SHA
```

Manual mode checks out only `reviewed_commit`, validates repository and checkout identity, and uses `comparison_base` for full unit-failure identity parity. Pull-request mode continues to use the exact PR head and base.

Both event modes execute the complete release-quality suite.

## Gate-to-evidence mapping

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

Each gate retains:

```text
quality-reports/<basename>.log
quality-reports/<basename>.exit
quality-reports/<basename>.meta.json
```

`run-quality-gate.mjs` streams output, captures complete stdout/stderr, writes the exact exit code atomically, retains gate provenance, uses `shell: false`, and propagates failure.

## Stable build identity

One UTC Quality build timestamp is created before checkout and exported as both:

```text
PLAIVRA_QUALITY_BUILD_TIMESTAMP
PLAIVRA_BUILD_TIMESTAMP
```

The same timestamp is used by the Production build, built release-metadata verification, gate provenance, and authoritative manifest generation.

## Authoritative release manifest

The manifest is generated only after every required gate has completed and evidence has been retained:

```text
quality-reports/release-manifest.json
```

Required release identity:

```text
commitSha: exact reviewed commit
environment: ci
schemaCompatibilityVersion: 2
expectedDatabaseMigrationVersion: 20260721012814
migrationLedgerReconciliationState: reconciled
pendingMigrationCount: 0
schemaAppliedUntrackedCount: 0
unresolvedMigrationCount: 0
```

Generation fails if a gate is missing, failed, nonzero, commit-mismatched, or stale. The manifest records per-gate log, exit, metadata, SHA-256 digests, sizes, and exact commit provenance.

## Canonical Quality artifact

Successful full release-quality runs upload:

```text
quality-reports-<github.run_id>
```

Retention: 30 days.

Contents include:

- `release-manifest.json`;
- `evidence-index.json`;
- `artifact-metadata.json`;
- every required gate `.log`, `.exit`, and `.meta.json`;
- `unit-failure-parity.json`;
- `database-validation.log`;
- rendered/browser QA outputs;
- relevant diagnostic logs.

Artifact metadata records repository, workflow run ID and attempt, reviewed commit, comparison base, event type, stable build timestamp, capture timestamp, and `fullReleaseQuality=true`.

## Evidence integrity

`evidence-index.json` contains SHA-256 and byte size for every retained file except the self-referential manifest and index files. The manifest retains the index and metadata SHA-256 digests. Release preflight recalculates and validates all required digests and sizes.

## Release preflight hardening

`release-preflight.yml` remains manual, read-only, and non-deploying. It downloads only:

```text
quality-reports-<quality_run_id>
```

It validates:

- exact reviewed commit;
- exact numeric Quality run ID;
- expected repository;
- CI environment and schema compatibility version 2;
- expected migration `20260721012814`;
- reconciled ledger and zero pending/untracked/unresolved counts;
- exact artifact run/commit/base metadata;
- full-release-quality marker;
- every required gate passed with exit file `0`;
- every evidence file exists and matches manifest/index SHA-256 and size;
- unit parity head/base identity;
- evidence timestamps are not stale;
- no deployment or Production mutation occurred.

Stage-1 execution uses:

```text
validationContext: stage1-infrastructure-validation
productionPromotionAuthorized: false
```

It is explicitly not Production promotion authorization.

## Exact release-quality orchestration

The permanent workflow:

```text
.github/workflows/exact-release-quality-validation.yml
```

runs for pull requests that change the release contract. It:

1. dispatches manual full `Quality` for the exact PR head and base;
2. waits for success;
3. requires exactly one canonical run-keyed artifact;
4. captures artifact ID, name, and digest;
5. dispatches read-only Stage-1 Release preflight against that exact artifact;
6. waits for success;
7. uploads a Stage-1 exact-validation summary;
8. records exact identities in the PR validation comment.

This additional workflow is necessary because Stage 1 requires a manual exact-head `workflow_dispatch` result in addition to ordinary PR Quality.

## Guarded compatibility-marker promotion tool

Permanent tool:

```text
scripts/promote-release-schema-compatibility.mjs
```

Supported modes and inputs:

```text
--dry-run
--apply
--project-ref
--reviewed-commit
--expected-current-marker
--target-marker
--release-preflight-evidence
--output
--confirmation
```

Safeguards include:

- only Plaivra project `bkwezjxvapaeasfvlhvv`;
- explicit rejection of Activity Catalog `khlcctuefiuhunqymkbp`;
- exact 40-character reviewed commit;
- current marker must be `20260717051011`;
- target marker must be `20260721012814`;
- target must equal the latest reconciled ledger head;
- pending/untracked/unresolved must all be zero;
- exact successful preflight evidence for the same commit and target;
- apply mode additionally requires `productionPromotionAuthorized=true`;
- trusted server-side PostgreSQL connection only;
- read current singleton/version/marker before operation;
- compare-and-set update with exact predicates;
- exactly one updated row or transaction failure;
- update limited to `migration_version` and `applied_at`;
- read-after-write proof;
- explicit confirmation token for apply;
- redacted before/after output;
- no automatic rollback.

Stage 1 runs mock-based local tests only. It does not invoke Production dry-run or apply mode.

## Focused tests

Local dependency-free focused suite:

```text
34 focused Stage-1 tests passed
0 failed
```

Coverage includes:

- exact Quality manual inputs and full gate execution;
- retained logs/exits/metadata;
- command streaming and failure propagation;
- safe argument handling and secret non-disclosure;
- canonical manifest and artifact integrity;
- Release preflight accept/reject cases;
- future migration replay and immutable migration checksums;
- promotion dry-run no-write behavior;
- project/marker/ledger/preflight guards;
- compare-and-set zero/multiple-row rejection;
- explicit apply confirmation and Production authorization;
- redacted evidence;
- exact manual Quality and preflight orchestration.

Complete dependency-backed validation is authoritative in GitHub Actions.

## Known unit-failure parity

The established repository parity model compares full Vitest failure identities on the exact reviewed commit against the explicit comparison base. Release-quality mode never records parity as skipped. Final exact-run counts and identities are retained in `unit-failure-parity.json` and summarized in the final Planner handoff.

## Immutable migration proof

No migration was edited or added.

Original AW-2A migration:

```text
supabase/migrations/20260720213000_active_workout_aw2a_execution_state.sql
SHA-256: c8f21655226d51a2157fa1b8c272edc5fac1f84f0a2214376a16e225a1f04f2e
```

Correction migration:

```text
supabase/migrations/20260721012814_active_workout_aw2a_execution_state_corrections.sql
SHA-256: b79920d0f9155b0c076d602b10924846409efdac54a485333242a03bbd5e5e18
```

## Read-only Production baseline

Plaivra Database project: `bkwezjxvapaeasfvlhvv`

```text
physical migration records: 64
AW-2A base production record count: 1
AW-2A correction production record count: 1
schema version: 2
compatibility migration marker: 20260717051011
workout_session_execution_states: present
correction index: present
workout sessions: 10
execution-state rows: 1
started sessions without state: 0
terminal sessions with state: 0
owner mismatches: 0
```

The marker `applied_at` remains `2026-07-17T18:11:24.068485Z` at the Stage-1 before-state check.

No Supabase write was invoked.

## Activity Catalog boundary

Plaivra Activity Catalog project: `khlcctuefiuhunqymkbp`

Read-only baseline at Stage 1:

```text
public tables: 20
public views: 1
supabase_migrations.schema_migrations present: false
```

No Activity Catalog operation or repository path is part of the implementation.

## Changed-file scope

Planned final changed files:

1. `.github/workflows/quality.yml`
2. `.github/workflows/release-preflight.yml`
3. `.github/workflows/exact-release-quality-validation.yml`
4. `release/release-manifest.template.json`
5. `scripts/create-release-manifest.mjs`
6. `scripts/quality-evidence-contract.mjs`
7. `scripts/release-preflight.mjs`
8. `scripts/run-quality-gate.mjs`
9. `scripts/run-quality-gate.test.mjs`
10. `scripts/promote-release-schema-compatibility.mjs`
11. `scripts/promote-release-schema-compatibility.test.mjs`
12. `scripts/release-closure-stage1.test.mjs`
13. `scripts/permanent-quality-replay.test.mjs`
14. `plaivra_aw2a_post_merge_release_closure_implementation_report.md`

No application component, route behavior, workout service, message, translation, Activity Catalog source, migration, or Supabase schema file is changed.

## Remote validation evidence

The following fields are populated by the exact remote validation cycle and repeated in the PR exact-validation comment and Planner handoff:

```text
Validated candidate head: 34b8ea48cda856c0d3c3caf459b3509985cc63d8
Phase A run: 29855528252 — completed/success
PR Quality run: 29855528260 — completed/success
Exact Release Quality Validation run: 29855528272 — completed/success
manual exact-head full Quality run: 29855536992 — completed/success
canonical artifact: quality-reports-29855536992
canonical artifact ID: 8505474606
canonical artifact digest: sha256:a6b995e07e7c9c2d19d242fab2f72c86735db4f73a1228a815081e41b3f7d6e1
Stage-1 Release preflight run: 29856503679 — completed/success
final exact report-head evidence: emitted after this report commit by the permanent exact-validation workflow
```


## Validated candidate manifest summary

The successful manual exact-commit Quality artifact for candidate `34b8ea48cda856c0d3c3caf459b3509985cc63d8` contains manifest schema version 2 with:

```text
release.commitSha: 34b8ea48cda856c0d3c3caf459b3509985cc63d8
release.buildTimestamp: 2026-07-21T18:02:56.000Z
release.environment: ci
release.schemaCompatibilityVersion: 2
release.expectedDatabaseMigrationVersion: 20260721012814
release.migrationLedgerReconciliationState: reconciled
release.pendingMigrationCount: 0
release.schemaAppliedUntrackedCount: 0
release.unresolvedMigrationCount: 0
qualityArtifact.workflowRunId: 29855536992
qualityArtifact.comparisonBase: 93f6aaad5d170bf5cfe304597317c7ffa3016e2a
qualityArtifact.fullReleaseQuality: true
all 16 required release gates: passed
all retained gate exit codes: 0
all retained evidence stale flags: false
```

Known-failure identity parity on the same manual run:

```text
head total tests: 1249
comparison-base total tests: 1249
head failed tests: 4
comparison-base failed tests: 4
introduced failure identities: 0
removed failure identities: 0
parity: passed
```

The Stage-1 Release preflight consumed that exact artifact and validated repository, run ID, commit, expected migration, ledger reconciliation, zero pending/untracked/unresolved counts, every retained evidence file, every zero exit code, timestamps, sizes, and SHA-256 digests. It recorded `productionPromotionAuthorized=false`, `productionMutationPerformed=false`, and `deploymentPerformed=false`.

## Final boundaries

- No application behavior change.
- No migration change.
- No new migration.
- No migration replay or history repair against Production.
- No Supabase write.
- No compatibility-marker promotion.
- No Activity Catalog change.
- No manual deployment.
- No PR merge.
- AW-2B not started.
- `/api/version` is expected to remain HTTP 503 during Stage 1.

## Stage-2 exact handoff

Stage 2 requires separate Planner authorization and must:

1. squash-merge PR #81 only after QA/QC approval;
2. wait for the exact new `main` deployment;
3. run full manual Quality on that exact `main` commit with explicit comparison base;
4. run strict Release preflight against the exact canonical Quality artifact using Production marker-promotion authorization context;
5. run the promotion tool in dry-run mode;
6. promote only `release_schema_compatibility.migration_version` from `20260717051011` to `20260721012814` using compare-and-set;
7. verify `/api/version` becomes HTTP 200, `migrationVersionCompatible=true`, and `releaseReady=true`;
8. run Production post-deploy smoke including populated and empty authenticated layers;
9. close AW-2A release state;
10. start AW-2B only after separate Planner approval.

## Final repository status

At Stage-1 handoff, all release/CI infrastructure, tests, and this report must be committed on the existing Stage-1 branch. The PR must remain Draft and unmerged. The remote branch is the authoritative workspace; no temporary transfer workflow, upload fragment, archive, or uncommitted change may remain in the final PR diff.


---

# Final Planner QA/QC correction

## Correction starting identity

```text
correction starting head: 3d50008140fc026b313052aaf7df199fd4bcbbb7
approved starting main: 93f6aaad5d170bf5cfe304597317c7ffa3016e2a
branch: fix/aw2a-post-merge-release-closure
Draft PR: #81
```

The final corrected implementation head is content-derived after this report update. The permanent exact-validation workflow records that exact head, run IDs, request identities, artifact identity, and preflight identity in the PR evidence comment and immutable Stage-1 artifact.

## Corrected Stage-2 authorization path

`Release preflight` now has two strict read-only choice modes:

```text
stage1-infrastructure-validation
production-marker-promotion-authorization
```

Stage-1 mode can never authorize marker promotion. Production-authorization mode remains non-mutating and non-deploying and requires this exact token contract:

```text
AUTHORIZE_PRODUCTION_MARKER_PROMOTION_<reviewed_commit>_<quality_run_id>_<expected_migration>
```

The token is rejected when any commit, Quality run, migration, context, or purpose component differs. Stage-1 exact validation always dispatches the Stage-1 context with an empty authorization token.

## Derived migration target contract

Generic Quality and Release preflight no longer contain a pinned AW-2A migration target. The exact checked-out `supabase/migration-ledger.json` is required to be release-ready and reconciled with zero pending, schema-applied-untracked, and unresolved entries. Its latest applied migration becomes the single expected target used by:

- build environment metadata;
- built release-metadata verification;
- artifact metadata;
- evidence index;
- authoritative release manifest;
- Release preflight;
- exact orchestration evidence.

Manifest generation rejects any requested expected migration that differs from the ledger head. A synthetic later reconciled ledger test proves the target advances automatically.

## End-to-end release identity

The permanent chain binds:

```text
reviewed commit
comparison base
Quality workflow run ID
validation request ID
expected migration
preflight request ID
validation context
```

Manual Quality requires `validation_request_id` and includes it in the deterministic run name, artifact metadata, evidence index, and manifest. Exact orchestration discovers Quality and preflight runs by their unique request-bound run names rather than same-head recency. It downloads both artifacts and independently verifies all identity fields before reporting success.

## Database URL and Plaivra project binding

Before any Production database adapter is constructed or any compatibility row is read, the promotion entry point validates the database URL against Plaivra project:

```text
bkwezjxvapaeasfvlhvv
```

Accepted forms:

```text
direct:
host = db.bkwezjxvapaeasfvlhvv.supabase.co
user = postgres

recognized Supabase pooler:
host matches a concrete *.pooler.supabase.com endpoint
user = postgres.bkwezjxvapaeasfvlhvv
```

Rejected targets include Activity Catalog direct/pooler identities, other Supabase projects, generic PostgreSQL hosts, localhost, malformed URLs, incomplete credentials, insecure TLS modes, and project-ref/URL mismatches. Evidence exposes only project ref, connection kind, and redacted host.

## Least-privilege workflow permissions

Exact validation retains only:

```text
actions: write
contents: read
issues: write
```

`actions: write` dispatches and inspects exact runs. `contents: read` checks out the exact PR head and ledger. `issues: write` updates the PR conversation evidence comment. `pull-requests: write` was removed. `pull_request_target` is not used.

## Immutable boundaries

- no application behavior changed;
- no migration changed or added;
- no Supabase write;
- no Production compatibility-marker promotion;
- no Activity Catalog operation;
- no merge;
- no deployment;
- AW-2B not started.
