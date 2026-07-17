# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`

**Verified production state:** 2026-07-17

**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)

**Reconciliation status:** **Reconciled through Muscle Intelligence Phase 3 integrity corrections**

This document records verified production migration history. It is not authorization to replay migration SQL, deploy, promote, update compatibility markers, or merge. Applied migration files and production identities must never be renamed, rewritten, deleted, manually reordered, or replayed.

## Current state

- Supabase migration history contains 39 applied migrations.
- `pendingCount = 0`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedCount = 0`
- `historyRepair.state = reconciled`
- The latest verified production migration is `20260717202151_muscle_intelligence_phase3_integrity_corrections`.
- Repository and production migration identities are aligned through the latest applied migration.
- Ledger-level migration-history release readiness is true.
- The production compatibility marker intentionally remains `20260717032851` until a separately coordinated code merge and deployment operation.

## Muscle Intelligence Phase 3 session snapshots

`20260717194847_muscle_intelligence_phase3_session_snapshots.sql` was applied transactionally through the Supabase management integration on 2026-07-17 after explicit user authorization. Production history records the exact version and name once. Read-only verification confirmed nine snapshots for nine performed sessions, 29 stable historical items, zero missing snapshots, zero ownership mismatches, RLS on both new tables, no anonymous table/RPC access, no member table mutation grants, and authenticated access only to the controlled replacement RPC. All nine legacy snapshots are explicitly unavailable because no exact historical mapping could be proven; no names were matched. Do not replay this migration.

`20260717202151_muscle_intelligence_phase3_integrity_corrections.sql` was then applied as a separate forward-only correction after independent review; the first migration remains byte-immutable. Git blob `af02da43e4d61f9248ad6110b9e58f99cac84560`. It adds cascade-safe FK nullification/deletion for account privacy lifecycle, published-only future mapping selection, active-interval cleanup for existing history, owner-validated reads of retired frozen global mappings, orthogonal terminal performance state, identity-first replacement retry idempotency, and validated mapping bundles. Production postconditions found zero invalid historical mapping intervals and both bundle constraints validated. Do not replay this migration.

## Muscle Intelligence Phase 2

```text
version: 20260717051008
name: muscle_intelligence_phase2_curated_schema
file: supabase/migrations/20260717051008_muscle_intelligence_phase2_curated_schema.sql
Git blob: 628327a9de7983e7ed12f7bddbc164947618deb0

version: 20260717051011
name: muscle_intelligence_phase2_curated_seed
file: supabase/migrations/20260717051011_muscle_intelligence_phase2_curated_seed.sql
Git blob: d3364955cd8ad53eb513c9456addbf9c8ee86fe8
reviewed source head: 9b3006c1a512512bee8c16a4fb2ae34a16b7b7f6
```

The migrations were applied through tracked Supabase CLI `db push` on 2026-07-17 after a dry run listed exactly the schema and seed migrations in order. Production history now records both exact repository versions once.

Read-only post-application verification confirmed:

- six Phase 2 tables exist with RLS enabled;
- no anonymous table privileges exist on those tables;
- approved member reads are limited to localizations, aliases, and relationships;
- research sources, mapping evidence, and mapping reviews remain admin-only;
- 60 curated exercises;
- 180 localizations;
- 180 aliases;
- 32 relationships;
- 21 research sources;
- 89 mapping-evidence rows;
- 60 mapping reviews;
- exactly 9 approved provider links;
- 60 published mapping sets and 0 target drafts;
- 180 mapping entries;
- 0 checksum drift;
- 0 alias collision groups;
- 0 duplicate relationship groups;
- retired legacy target rows remain zero in `exercises`, `workouts`, and `exercise_library`.

Supabase security advisors reported no new Phase 2 security finding. New performance notices are limited to immediately unused indexes and overlapping permissive SELECT policies on the three member-readable tables; they are non-blocking for this phase.

Direct backup/PITR evidence was not captured in this repository before the manual application. That remains an operational evidence gap and is not recorded as passed.

Do not replay either migration. Any later correction requires a new named forward migration.

## Compatibility-marker boundary

The physical production migration head is now:

```text
20260717202151
```

The deployed release compatibility marker remains:

```text
version = 2
migration_version = 20260717032851
```

This difference is intentional until the exact reviewed application commit is merged and deployed through a coordinated release operation. Do not advance the marker independently of the compatible code deployment.

## Legacy 600-exercise catalog retirement

The applied identity remains:

```text
version: 20260717032851
name: retire_legacy_600_exercise_catalog
file: supabase/migrations/20260717032851_retire_legacy_600_exercise_catalog.sql
```

Post-application verification continues to show zero retired target rows in `exercises`, `workouts`, and `exercise_library`. Do not replay this migration.

## Muscle Intelligence Phase 1

```text
version: 20260716215602
name: muscle_intelligence_phase1_foundation
```

All five Phase 1 mapping tables and both publication functions remain present. The migration remains applied and immutable.

## Train Phase 2A

```text
version: 20260715190000
name: train_phase2a_program_architecture
reviewed commit: 5851486009f99dc9e7629b8b01f43cd690a3a04b
verified Git blob: be4102a5b0e0aaec8926362950742290b94d39c3
```

Physical verification confirmed five week templates, twelve assigned weeks, sixteen Phase 2 sessions, and fifty-three activities with no duplicate live legacy mappings. Do not replay this migration.

## Fail-closed ledger semantics

`scripts/check-migration-ledger.mjs` validates:

- `pendingCount`
- `schemaAppliedUntrackedCount`
- `ledgerDriftReviewCount`
- `unresolvedCount`
- `invalidAppliedProductionIdentityCount`
- `reconciliationState`
- `latestAppliedMigrationVersion`
- `releaseReady`

The ledger-level `releaseReady` value requires reconciled history, no pending or untracked schema work, no unresolved identities, no drift-review items, and valid resolved production identities.

## Verification authority

- `supabase/verification/legacy-600-exercise-catalog-retirement.sql` proves the retired target layers remain empty.
- `supabase/verification/muscle-intelligence-phase2.sql` proves exact curated counts, checksum publication, RLS boundaries, legacy emptiness, and mapping immutability on a disposable database.
- `lib/product/muscle-intelligence-phase2-migration.test.ts` enforces the applied/reconciled ledger identities and migration contracts.
- `lib/train/muscle-intelligence/curated-registry.test.ts` enforces registry, provider-link, relationship, golden-plan, and deterministic calculation contracts.
- the full clean migration chain must continue to apply all 37 migrations from zero without modifying historical files.

## Remaining release work

Before merge or deployment:

1. run fresh Phase A and Quality workflows on the exact reconciliation head;
2. confirm migration-ledger validation reports `reconciliation=reconciled` and `release_ready=true`;
3. confirm the full migration-chain rehearsal and Phase 2 verification pass;
4. run strict release preflight on the exact final head;
5. obtain explicit release-owner approval;
6. coordinate the compatibility-marker update with the exact code merge and deployment;
7. verify Vercel built the resulting exact `main` SHA;
8. verify provider metadata, `/api/version`, `/api/health`, and required production smoke evidence.

No merge, compatibility-marker update, or deployment was performed as part of this reconciliation.
