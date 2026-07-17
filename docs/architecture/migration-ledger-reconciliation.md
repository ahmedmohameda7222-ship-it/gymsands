# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`

**Verified production state:** 2026-07-17

**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)

**Reconciliation status:** **Reconciled / migration-ledger release gate eligible**

This document records verified production migration history. It is not authorization to replay migration SQL, change compatibility markers, deploy, promote, or merge. Applied migration files and production identities must never be renamed, rewritten, deleted, or replayed.

## Current state

- Supabase migration history contains 34 applied migrations.
- `pendingCount = 0`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedCount = 0`
- `historyRepair.state = reconciled`
- The latest verified production migration is `20260716215602_muscle_intelligence_phase1_foundation`.
- Repository and production migration identities are aligned through the latest applied migration.
- Migration-ledger validation is expected to report `release_ready=true`; complete release readiness remains subject to exact-head CI and the other fail-closed release gates.

## Muscle Intelligence Phase 1 production application

```text
20260716215602_muscle_intelligence_phase1_foundation.sql
```

Supabase migration history contains the exact production identity:

```text
version: 20260716215602
name: muscle_intelligence_phase1_foundation
```

Read-only production verification on 2026-07-17 also confirmed all five Phase 1 tables and both publication functions exist. The migration is classified as `applied`. Do not replay it or any previously applied migration.

## Train Phase 2A production application

The repository migration:

```text
20260715190000_train_phase2a_program_architecture.sql
```

was applied to production on 2026-07-16 from reviewed commit:

```text
5851486009f99dc9e7629b8b01f43cd690a3a04b
```

Before execution, the fetched file was verified against Git blob:

```text
be4102a5b0e0aaec8926362950742290b94d39c3
```

The production migration history identity was reconciled to:

```text
version: 20260715190000
name: train_phase2a_program_architecture
```

Do not replay this migration.

## Physical verification evidence

Production verification confirmed:

- all five Phase 2A hierarchy tables exist;
- `private.can_access_workout_plan(uuid)` exists;
- `public.detach_workout_plan_week_atomic(uuid, uuid)` exists;
- RLS is enabled for the new hierarchy;
- same-plan week/template integrity holds;
- no duplicate live legacy plan-day mapping exists;
- no duplicate live legacy plan-exercise mapping exists;
- the temporary HTTP extension used only to retrieve the exact reviewed migration was removed;
- legacy backfill produced exactly:
  - 5 week templates for 5 plans;
  - 12 assigned weeks;
  - 16 Phase 2 sessions for 16 legacy plan days;
  - 53 Phase 2 activities for 53 legacy plan exercises.

The full clean migration chain, database lint, executable database preflight, unit tests, integration tests, build, rendered QA, and Train QA had already passed on the reviewed candidate before production reconciliation.

## Existing reconciliation scope

The following earlier production identities remain applied and must not be replayed:

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

## Nutrition override ACL

The authenticated role retains exactly:

```text
DELETE
INSERT
SELECT
UPDATE
```

The following privileges remain absent:

```text
MAINTAIN
REFERENCES
TRIGGER
TRUNCATE
```

## Fail-closed ledger semantics

`scripts/check-migration-ledger.mjs` derives and validates:

- `pendingCount`
- `schemaAppliedUntrackedCount`
- `ledgerDriftReviewCount`
- `unresolvedCount`
- `invalidAppliedProductionIdentityCount`
- `reconciliationState`
- `latestAppliedMigrationVersion`
- `releaseReady`

Resolved states are `applied` and `applied_version_alias`. The current ledger uses exact `applied` identities for Phase 2A and Muscle Intelligence Phase 1.

The ledger-level `releaseReady` value requires:

- `historyRepair.state === "reconciled"`
- `pendingCount === 0`
- `schemaAppliedUntrackedCount === 0`
- `ledgerDriftReviewCount === 0`
- `unresolvedCount === 0`
- all resolved production identities are valid.

Those migration-specific conditions are now satisfied, so release preflight is expected to become ready when the exact-head Quality evidence and manifest are complete. Application release readiness remains fail-closed on exact artifact identity, schema compatibility, retained quality evidence, deployment identity, and production smoke verification.

## Read-only preflight

`supabase/verification/production-release-migration-preflight.sql` continues to block on:

- missing migration objects;
- function security or search-path mismatch;
- incomplete Train RPC contracts;
- unexpected Train RPC overloads;
- Train integrity conflicts;
- disabled RLS or incorrect policy counts;
- missing required nutrition override CRUD privileges;
- any extra authenticated nutrition override privilege, including PostgreSQL 17 `MAINTAIN`.

## Remaining release work

Before merge or deployment:

1. run the complete repository Quality workflow on the exact final PR head;
2. confirm migration-ledger validation reports `reconciliation=reconciled` and `release_ready=true`;
3. confirm release preflight passes for that same commit;
4. obtain independent quality-control approval;
5. merge only the approved exact change;
6. verify Vercel built the exact resulting `main` SHA;
7. verify provider metadata, `/api/version`, `/api/health`, and required production smoke evidence.

No deployment or merge was performed as part of this repository migration-ledger reconciliation.

## Bounded inspection record

- `scripts/check-migration-ledger.mjs` and `scripts/check-migration-ledger.test.mjs`: direct ledger validation contract and aggregate-state tests.
- `scripts/release-preflight.mjs` and `scripts/release-preflight.test.mjs`: direct consumer of ledger reconciliation and release-ready state.
- `lib/product/muscle-intelligence-phase1-migration.test.ts`: direct Phase 1 ledger-state assertion requiring reconciliation.
- `.github/workflows/quality.yml`: direct CI consumer that derives the expected production migration and runs release preflight.

## Advisor status

Separate advisor notices remain outside this correction, including intended narrow `SECURITY DEFINER` boundaries, leaked-password protection configuration, unindexed foreign keys, duplicate indexes, and multiple permissive policies. They do not authorize unrelated changes in this branch.
