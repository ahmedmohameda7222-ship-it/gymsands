# Plaivra Muscle Intelligence Phase 3 — Session Snapshot Implementation Report

Generated: 2026-07-17
Status: implementation complete; Draft PR open; GitHub Quality in progress at report time

## 1. Starting `main` SHA

`2cfc1f3f56676c98e8a64eac702f74aa04ff6be6`

The branch was created from the verified latest remote `main` at that exact SHA.

## 2. Branch

`feat/train-muscle-intelligence-phase3-session-snapshots`

## 3. Final implementation head SHA

`068b0381b82e2f0ae6c1ff728c29788dcc47c088`

This is the immutable code, migration, verification, documentation, and ledger-attestation head reviewed by the Draft PR before this report-only commit. The primary implementation commit is `70572bdc13a224357821f5b59268b86ee41d871e`. The report-only commit is intentionally non-runtime metadata and is visible as the current PR head.

## 4. Pull request

Draft PR #68: <https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/68>

Title: `feat(train): add muscle intelligence session snapshots`

## 5. Approved scope

Implemented Phase 3 only:

- immutable session-time muscle snapshots;
- stable global, provider-bridge, and owner-custom exercise provenance;
- planned and completed historical muscle analysis;
- replacement, skipped, adjusted, and completed item semantics;
- privacy export/deletion and migration-chain coverage;
- a catalog-backed single-exercise replacement control required to preserve stable identity.

The existing workout-plan hierarchy and `workout_sessions` performed-session model remain authoritative. No third plan or performed-session model was introduced. No Heat Map UI or Phase 4 work was added.

## 6. Inspected files and dependency findings

The prompt's exact must-read contracts were inspected first: repository instructions, canonical domain model, migration ledger and reconciliation docs, release authority, current workout-session service, exercise catalog/mapping migrations, privacy export, quality workflow, and the affected workout session UI.

Targeted search established these dependencies:

- `workout_sessions` is the performed-session root and supports an insert-time snapshot trigger without changing its contract.
- `workout_session_items` provides the performed item identity, prescription, and actual fields needed for the snapshot child rows.
- the Phase 2A plan hierarchy remains the planned source; no parallel plan storage is needed.
- `exercise_muscle_mappings`, provider bridges, custom exercises, and custom muscle mappings expose stable IDs and version/checksum provenance; display names are not valid identity.
- privacy export and account deletion must include/cascade both snapshot tables.
- replacement UI previously accepted free text, which could not preserve stable identity, so the existing exercise picker was conditionally inspected and reused in single-select mode.
- route auth, ownership, rate-limit, cache, and error conventions were conditionally inspected to implement the read-only analysis endpoint consistently.
- migration tests and the GitHub Quality workflow were conditionally inspected to add a clean-chain Phase 3 SQL verification step.

Additional conditional inspection was limited to direct imports, established tests, RLS/grant conventions, migration-ledger scripts, and rendered QA harness configuration. Unrelated product modules, historical prompts/reports, Heat Map work, and later phases were not inspected for implementation.

## 7. Data model and migrations

New tables:

- `public.workout_session_muscle_snapshots`: one immutable snapshot header per session, with owner, plan/session provenance, freeze time, completeness state, and version/checksum context.
- `public.workout_session_muscle_snapshot_items`: immutable per-session-item records containing stable exercise identity, planned prescription, actual outcome, state, global mapping reference or compact custom mapping payload, and source/version/checksum provenance.

Migrations:

1. `20260717194847_muscle_intelligence_phase3_session_snapshots.sql`
   - Git blob: `865f918091fbb9cf054e170417caaf384c65f049`
2. `20260717202151_muscle_intelligence_phase3_integrity_corrections.sql`
   - Git blob: `af02da43e4d61f9248ad6110b9e58f99cac84560`

The second migration is a forward-only correction. The successfully applied first migration was not rewritten.

## 8. Snapshot freeze and idempotency

An `AFTER INSERT` trigger on `workout_sessions` creates the snapshot and item rows in the same transaction. The session has one snapshot, and retries/resumes return the existing snapshot instead of recalculating it. Snapshot payload columns are protected by immutability triggers. The correction migration permits only integrity-preserving foreign-key `SET NULL` effects and cascade deletion while continuing to reject payload mutation.

Replacement is identity-first and retry-safe: repeating the same replacement identity is idempotent even if a newer mapping is published, a mapping is retired, a provider bridge is removed, or a custom source is later deleted.

## 9. Global mapping-reference design

Global/provider-backed items freeze stable exercise UUID identity and the exact mapping reference, version, checksum, and source context that existed at the session boundary. No exercise-name matching is used. New sessions select only mappings that are currently `published`. Historical owner-validated loading can resolve an exact frozen mapping even after retirement through a narrowly granted `SECURITY DEFINER` RPC with fixed search path and server-side ownership checks.

## 10. Compact custom snapshot design

Owner-custom exercises copy a compact, immutable mapping bundle into the snapshot item rather than depending on mutable/deletable custom mapping rows. The bundle stores stable custom exercise identity plus the exact compact muscle entries and source/version/checksum context. All-or-none constraints prevent partial global or custom provenance bundles. Deleting the custom source therefore does not erase historical muscle analysis.

## 11. Replacement/skipped/adjusted semantics

Planned identity/prescription and actual identity/outcome are stored separately.

- `completed`: the performed outcome is recorded without pretending it changed the plan.
- `skipped`: the item remains in history with no invented workload.
- `adjusted`: actual sets/reps/load or other supported actual values differ from the planned prescription.
- replacement: actual stable exercise identity and its frozen mapping are stored separately from the original planned identity; the terminal state is then `completed`, `adjusted`, or `skipped` according to the actual outcome.

Unsupported non-set prescriptions are returned as limited/unsupported with a warning; the analysis does not invent zero precision.

## 12. Planned/completed analysis APIs

Added:

`GET /api/workouts/sessions/[id]/muscle-analysis?mode=planned|completed`

The route requires authentication, validates the session ID and mode, rate-limits access, enforces owner-scoped database loading, returns safe errors, and applies `Cache-Control: no-store`. The analysis service aggregates from the immutable frozen items, distinguishes planned from completed output, preserves completeness/warning information, and avoids diagnosis or prescription.

## 13. Legacy-history completeness

Production backfill results after both migrations:

- workout sessions: 9
- snapshots: 9
- snapshot items: 29
- sessions missing snapshots: 0
- owner mismatches: 0
- invalid historical mappings: 0

All nine legacy snapshot headers are explicitly marked unavailable/limited because no stable mapping valid at each historical session boundary could be proven. The migration intentionally does not infer identity from exercise names.

## 14. Archive/delete behavior

Archiving or changing current plans/mappings cannot recalculate frozen session history. Account deletion cascades through snapshots and items. Deleting source plan/day/week/scheduled-session records or custom exercise sources may null live foreign keys where allowed, but immutable copied identity, mapping provenance, compact custom payloads, and analysis history remain intact until the owning account/session is deleted.

## 15. RLS, grants, and ownership

RLS is enabled on both tables. Member reads are owner-scoped. Anonymous access is absent, and members cannot directly insert/update/delete snapshot tables. Snapshot creation/replacement and frozen mapping loading occur through narrowly granted RPCs that call the established workout actor assertion, validate session ownership and stable IDs, use fixed `search_path = ''`, and remain unavailable to `anon`/`PUBLIC`.

Supabase security advisor warnings for authenticated execution of the two `SECURITY DEFINER` member RPCs were reviewed as intentional because both are owner-validating domain operations. Performance advisor notices were limited to generic unindexed foreign-key columns; actual analysis paths are covered by owner/time and snapshot-item indexes.

## 16. Privacy export and deletion

Privacy export now emits both snapshot headers and snapshot items. Tests cover the additional export tables. Database verification covers owner isolation, cross-owner denial, custom-source deletion preservation, and account-deletion cascade behavior.

## 17. Changed files by category

- Database: two named migrations, Phase 3 verification SQL, reconciled 39-migration ledger.
- Analysis/API: session analysis service, route, route/service tests.
- Session execution UI/service: catalog-backed replacement identity and authoritative replacement RPC integration.
- Privacy: snapshot export queries and tests.
- CI/tests: Phase 3 focused command, migration contract tests, clean-chain verification in GitHub Quality, compatibility updates to earlier migration tests.
- Authority/docs: canonical domain model, migration reconciliation, release/readme documentation.
- Completion evidence: this report.

## 18. Focused and full validation

Completed locally:

- `npm.cmd ci` — passed; 591 packages, 0 vulnerabilities.
- `npm.cmd run test:muscle-intelligence:phase3` — passed; 3 files, 19 tests.
- `npm.cmd run migration:ledger:check` — passed; 39 applied, 0 pending, 0 unresolved, expected migration `20260717202151`.
- `npm.cmd run lint` — passed.
- `npm.cmd run typecheck` — passed.
- `npm.cmd test` — passed; 160 files passed/4 skipped, 1,059 tests passed/38 skipped.
- `npm.cmd run test:integration` — passed available checks; 1 file passed/4 skipped, 10 tests passed/38 skipped because disposable database credentials were unavailable locally.
- `npm.cmd run test:scripts` — passed; 74 tests.
- `npm.cmd run test:telemetry` — passed; 2 files, 16 tests.
- `npm.cmd run test:muscle-intelligence:phase2` — passed; 2 files, 16 tests.
- `npm.cmd run build` — passed; 91 routes including the new analysis route.
- `git diff --check` — passed.
- `git diff --check origin/main...HEAD` — passed after removing the report-only trailing-space marker.
- isolated Train rendered QA — passed; 165 observations, 0 failures across mobile, desktop, RTL, dark mode, keyboard, pickers, and sessions; evidence remained outside the repository.
- direct 390x844 replacement-flow check — no horizontal overflow, one dialog, and zero free-text replacement inputs.

The explicit review-mode release preflight was executed for the exact report head. It did not certify review readiness because this checkout intentionally lacks the generated `quality-reports` evidence bundle for repository integrity, full migration chain, database checks, dependency audit, tests, environment validation, release metadata, build, and rendered QA. No missing gate was represented as passed; GitHub Quality is responsible for producing the exact-head evidence.

Independent read-only review concluded GO after the forward-only correction; its focused recheck reported 3 files/19 tests green and no remaining Phase 3 blockers.

## 19. Database-chain and SQL verification

Production read-only postconditions after the authorized apply:

- snapshot coverage: 9/9 sessions;
- snapshot items: 29;
- missing snapshots, owner mismatches, and invalid mappings: all 0;
- validated mapping-bundle constraints: 2;
- frozen mapping loader: `SECURITY DEFINER = true`, `anon execute = false`, member execute = true;
- original freeze protection and corrected freeze protection: both present.

The full clean disposable migration chain and `supabase/verification/muscle-intelligence-phase3-session-snapshots.sql` could not execute locally because the Docker engine was unavailable. The GitHub Quality workflow was updated to run that exact verification after database reset.

`npm.cmd run registry:phase2:seed:check` was not a valid Windows byte-for-byte result because `core.autocrlf=true` exposed CRLF normalization in the untouched applied Phase 2 seed migration. The applied file was not rewritten. The Linux GitHub gate remains authoritative for that raw-byte check.

## 20. CI runs and current conclusions

At report time for implementation/evidence head `068b0381b82e2f0ae6c1ff728c29788dcc47c088`:

- Phase A Diff Validation run `29611415745` (#267): completed successfully.
- Quality run `29611415760` (#763): in progress; no failure, cancellation, timeout, or action-required conclusion was present.

The report-only push can create a newer exact-head run. The Draft PR is the source of truth for its live state; no successful conclusion is claimed before completion.

## 21. Known limitations

- legacy sessions are explicitly unavailable/limited where stable historical identity could not be proven;
- unsupported non-set prescriptions produce limited analysis with warnings;
- a full disposable database replay depends on GitHub CI because Docker was unavailable locally;
- the direct local-browser catalog request used a mock-auth environment without its external catalog dependency; the isolated repository QA harness covered the picker flow successfully;
- generic unindexed foreign-key advisor notices remain for provenance-only columns not used by the primary read path.

## 22. Rollback and containment

Containment is the dedicated branch and Draft PR. No merge or application deployment occurred. Because production DDL/data backfill was explicitly authorized and has been applied, rollback must be a new forward-only migration; neither applied migration may be edited. A rollback would first disable new snapshot creation/analysis use, preserve exported historical data, then remove or supersede objects only after dependency and privacy verification.

## 23. Migration and deployment status

Production Supabase migrations were applied to project `bkwezjxvapaeasfvlhvv` after the user explicitly overrode the original no-production-migration instruction:

- `20260717194847_muscle_intelligence_phase3_session_snapshots`
- `20260717202151_muscle_intelligence_phase3_integrity_corrections`

The first correction apply attempt did not reach SQL because command-wrapper text was accidentally included; no migration was recorded. The exact SQL body was then applied successfully once. No production configuration was changed.

Vercel read-only release inspection found zero deployments created for this work during the inspected interval. No Vercel deployment, promotion, production configuration change, or release action occurred.

## 24. Explicit execution-boundary confirmation

The original report template requested confirmation that no production migration occurred. That statement would be false after the user's explicit authorization. Exactly the two Phase 3 migrations named above were applied to production Supabase, and their postconditions were verified.

Confirmed: no merge, no application deployment, no production configuration change, no Heat Map UI, and no Phase 4 work occurred.
