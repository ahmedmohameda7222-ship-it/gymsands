# Plaivra AW-2B — Command Authority Implementation Report

## Report status

Implementation complete and retained in Draft PR #82 for independent Planner QA/QC.

This report is committed as part of the final validation target. GitHub-generated final run IDs, artifact IDs, and digests are intentionally not hard-coded here because they are created only after this report commit exists. Those exact identities are retained in the canonical Quality artifact, the Stage-1 preflight artifact, the Stage-1 exact validation summary artifact, and the final completion response.

## Repository identity

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Branch: `feat/active-workout-aw2b-command-authority`
- Draft PR: `#82`
- Comparison base: `7524cc53462cf514bbcadaafb6353e2636bf3041`
- Scope: AW-2B command authority and final exact-head evidence closure only
- Merge performed: no
- Deployment performed: no
- AW-2C started: no

## Implemented AW-2B scope

AW-2B establishes a typed, atomic command authority over the AW-2A persisted active-workout execution state.

Implemented behavior includes:

- immutable command-receipt storage scoped to the open workout execution state;
- cryptographically random command IDs;
- idempotent replay for an identical command request;
- explicit rejection when a command ID is reused with a different request identity;
- expected-revision compare-and-swap semantics;
- authoritative revision-conflict responses;
- database-owned revision advancement exactly once for effective writes;
- no revision change for legitimate no-op commands;
- typed command envelopes and payload validation;
- removal of authenticated direct `UPDATE` authority over execution state;
- authenticated execution through the hardened atomic RPC only;
- monotonic client-side state acceptance and serialized command writes;
- preservation of canonical set-log authority and save ordering;
- permanent PostgreSQL verification for schema, ACL, replay, conflict, no-op, import, and lifecycle behavior;
- retention of the AW-2A lifecycle, timer, cursor, rest, and session-review semantics;
- no timeline-event model and no offline or multi-device takeover implementation.

## Production migration identity

The AW-2B migration was applied exactly once to Plaivra Database before this final evidence correction.

- Repository migration:
  `20260722013000_active_workout_aw2b_command_authority.sql`
- Applied Production migration:
  `20260721224813_active_workout_aw2b_command_authority`
- Repository migration Git blob:
  `9cf5b9a95902266fcb231319f492938427a6e45f`
- Repository migration SHA-256:
  `c149a6bde073fa1461eaa62f5a96bc555fb0a964695d5c2e3dcac433f9f28672`
- Ledger state:
  `applied_version_alias`
- Migration reapplied during final correction:
  no
- Migration history modified during final correction:
  no

## Production compatibility marker

The compatibility marker remains unchanged during the PR:

- schema compatibility version: `2`
- migration marker: `20260721012814`

No marker promotion was performed.

## Exact evidence failure diagnosis

Exact Release Quality Validation run `29879218632` successfully completed its manual exact-head Quality run, canonical artifact verification, Stage-1 preflight, and preflight evidence verification. Its only failure was the former `Record exact Stage-1 validation evidence` PR-comment sub-operation in job `88796167657`.

A later PR Quality failure artifact, `quality-failure-29889874293`, identified the exact permanent-contract violation:

- failed gate: `script and i18n tests`;
- failed assertion: `scripts/release-closure-stage1.test.mjs` required the Exact workflow not to contain `pull-requests: write`;
- observed cause: the workflow had coupled successful evidence closure to writing a mutable PR conversation comment and had expanded token permissions for that side effect.

No AW-2B application, migration, database, integration, build, or rendered-QA failure was present.

## Permanent root-cause correction

The Exact workflow now uses artifact-only evidence closure:

- workflow permissions are limited to `actions: write` and `contents: read`;
- no `issues: write`, `pull-requests: write`, `contents: write`, or `pull_request_target` authority is present;
- no PR comment is created, updated, or required for successful validation;
- the request-bound manual Quality run and canonical artifact are downloaded and independently verified;
- the request-bound Stage-1 preflight artifact is downloaded and independently verified;
- canonical Quality artifact ID, name, and digest are recorded;
- Stage-1 preflight artifact ID, name, and digest are recorded;
- exact workflow run ID and attempt are recorded;
- reviewed head, comparison base, validation request ID, preflight request ID, ledger-derived migration, Quality run ID, and preflight run ID are recorded in one immutable JSON summary;
- the summary is validated before upload;
- the permanent artifact name is:
  `stage1-exact-release-validation-<reviewed-head>`;
- no temporary workflow is used;
- no workflow commits to or mutates the PR branch.

Permanent release tests now reject:

- PR-comment evidence dependencies;
- issue or pull-request write permissions;
- content-write permissions;
- `pull_request_target` execution;
- incomplete artifact identity binding;
- Production mutation or deployment commands in Stage-1 validation.

## Final validation contract

The exact report head must independently pass:

- Phase A Diff Validation;
- PR-triggered Quality;
- Exact Release Quality Validation;
- request-bound manual exact-head full Quality;
- canonical Quality artifact verification;
- request-bound Stage-1 Release preflight;
- independent Stage-1 preflight artifact verification;
- immutable exact validation summary generation and validation;
- upload of `stage1-exact-release-validation-<final-head>`.

The final artifact chain binds the same:

- reviewed commit;
- comparison base;
- validation request ID;
- expected migration derived from the reconciled ledger;
- manual Quality run ID;
- canonical artifact ID, name, and digest;
- preflight request ID;
- Stage-1 preflight run ID;
- preflight artifact ID, name, and digest;
- Exact workflow run ID and attempt.

## Production read-only verification

A read-only query against Plaivra Database verified:

- Production migration `20260721224813_active_workout_aw2b_command_authority` is recorded;
- compatibility schema version remains `2`;
- compatibility migration marker remains `20260721012814`;
- `workout_session_execution_commands` exists;
- the atomic AW-2B RPC exists;
- authenticated users have RPC execution authority;
- authenticated direct execution-state `UPDATE` authority is revoked;
- authenticated direct receipt-table `SELECT` authority is revoked;
- every open workout session has execution state;
- execution-state lifecycle and ownership are consistent.

The verification was read-only and performed no mutation.

## Activity Catalog isolation

Activity Catalog was not queried, migrated, or modified. The permanent release-target contract rejects the Activity Catalog project reference for Plaivra Production release operations.

## Explicit non-actions

During final evidence correction:

- no migration was reapplied;
- no migration history was changed;
- no compatibility marker was changed;
- no real command was submitted against Production workout data;
- no Production user row was modified;
- Activity Catalog was not modified;
- no merge was performed;
- no deployment was started;
- AW-2C was not started.

## Files corrected for final evidence closure

- `.github/workflows/exact-release-quality-validation.yml`
- `scripts/release-closure-stage1.test.mjs`
- `scripts/release-closure-final-qa.test.mjs`
- `plaivra_aw2b_command_authority_implementation_report.md`

All other AW-2B implementation files remain within the approved PR scope.
