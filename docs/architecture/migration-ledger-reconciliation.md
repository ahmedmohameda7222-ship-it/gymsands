# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`

**Verified production state:** 2026-07-17

**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)

**Reconciliation status:** **Pending / two repository-only Phase 2 migrations not applied**

This document records verified production migration history. It is not authorization to replay migration SQL, deploy, promote, or merge. Applied migration files and production identities must never be renamed, rewritten, deleted, manually reordered, or replayed.

## Current state

- Supabase migration history contains 35 applied migrations.
- `pendingCount = 2`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedCount = 2`
- `historyRepair.state = pending`
- The latest verified production migration is `20260717032851_retire_legacy_600_exercise_catalog`.
- Repository and production migration identities are aligned through the latest applied migration; the two newer Phase 2 files intentionally remain pending.
- Migration-ledger validation must report `release_ready=false` until those migrations are separately authorized, applied, and reconciled.

## Legacy 600-exercise catalog retirement

The repository migration identity is:

```text
version: 20260717032851
name: retire_legacy_600_exercise_catalog
file: supabase/migrations/20260717032851_retire_legacy_600_exercise_catalog.sql
```

The migration was applied directly to production on 2026-07-17 after read-only inspection confirmed:

- exactly 600 provenance-matched rows in `public.exercises` with `source = 'plaivra_legacy_workouts'`;
- exactly 600 provenance-matched rows in `public.workouts` with notes beginning `Real FitLife exercise library seed`;
- exactly 600 provenance-matched rows in `public.exercise_library` with the same seed marker;
- all 600 canonical rows were approved global exercises with distinct non-null `legacy_workout_id` values;
- zero references from current plan block items, legacy plan exercises, performed sessions, favorites, user videos, provider links, or muscle mapping sets.

Post-application read-only verification confirmed:

- target `public.exercises` rows: 0;
- target `public.workouts` rows: 0;
- target `public.exercise_library` rows: 0;
- total canonical exercises: 0;
- existing user workout plans remained: 5;
- existing performed workout sessions remained: 9;
- provider links and global muscle mapping sets remained: 0.

The forward migration recorded in the repository contains the same guarded provenance predicates, exact-count preconditions, reference checks, non-target preservation assertions, and zero-target postconditions. Do not replay it on production.

## Muscle Intelligence Phase 1

```text
version: 20260716215602
name: muscle_intelligence_phase1_foundation
```

Read-only production verification confirmed all five Phase 1 tables and both publication functions exist. The migration remains classified as `applied` and must not be replayed.

## Muscle Intelligence Phase 2 pending migrations

```text
supabase/migrations/20260717051008_muscle_intelligence_phase2_curated_schema.sql
supabase/migrations/20260717051011_muscle_intelligence_phase2_curated_seed.sql
```

Both migrations are classified as `pending`. Production still has zero canonical exercises, provider links, and global mapping sets. This branch does not authorize applying the migrations or updating the production compatibility marker. After a separately authorized application, capture exact migration-history and physical-schema evidence, then update the ledger through a new reviewed reconciliation change. Do not replay either migration after it is applied.

## Train Phase 2A

```text
version: 20260715190000
name: train_phase2a_program_architecture
reviewed commit: 5851486009f99dc9e7629b8b01f43cd690a3a04b
verified Git blob: be4102a5b0e0aaec8926362950742290b94d39c3
```

Physical verification confirmed five week templates, twelve assigned weeks, sixteen Phase 2 sessions, and fifty-three activities with no duplicate live legacy mappings. Do not replay this migration.

## Existing reconciliation scope

Earlier applied identities remain immutable, including:

1. `20260711213000_adaptive_onboarding_v2.sql`
2. `20260712173000_persistent_meal_plan_skip_status.sql`
3. `20260712195000_nutrition_target_date_overrides.sql`
4. `20260713153000_meal_plan_atomic_execution.sql`
5. `20260713160000_train_section_atomic_integrity.sql`
6. `20260713170000_finalize_train_schedule_delete_integrity.sql`
7. `20260714030000_harden_train_plan_rpc_execution.sql`
8. `20260715010000_restrict_nutrition_target_override_acl.sql`
9. `20260715190000_train_phase2a_program_architecture.sql`
10. `20260716215602_muscle_intelligence_phase1_foundation.sql`
11. `20260717032851_retire_legacy_600_exercise_catalog.sql`

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

- `supabase/verification/legacy-600-exercise-catalog-retirement.sql` proves the three target layers remain empty.
- `supabase/verification/muscle-intelligence-phase2.sql` proves exact curated counts, checksum publication, RLS boundaries, legacy emptiness, and mapping immutability on a disposable database.
- `lib/product/muscle-intelligence-phase2-migration.test.ts` and `lib/train/muscle-intelligence/curated-registry.test.ts` enforce registry, migration, provider-link, relationship, golden-plan, and release-boundary contracts.
- `lib/product/legacy-exercise-catalog-retirement-migration.test.ts` enforces the migration's transaction, provenance, safety, preservation, postcondition, and ledger contracts.
- the full clean migration chain must seed the historical 600 rows and retire them through the new forward migration without modifying historical migration files.
- database lint, executable preflight, unit, integration, build, rendered QA, Train QA, release manifest, and release preflight remain required on the exact final PR head.

## Remaining release work

Before merge or deployment:

1. run the complete repository Quality workflow on the exact final PR head;
2. confirm migration-ledger validation truthfully reports `reconciliation=pending` and `release_ready=false` while production is unchanged;
3. confirm full migration-chain rehearsal plus Phase 2 registry, RLS, checksum, and retirement compatibility tests pass;
4. obtain independent quality-control approval;
5. merge only after explicit authorization;
6. verify Vercel built the exact resulting `main` SHA;
7. verify provider metadata, `/api/version`, `/api/health`, and required production smoke evidence.

No merge or deployment was performed as part of this reconciliation.
