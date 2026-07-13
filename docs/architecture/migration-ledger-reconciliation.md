# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`  
**Read-only verification:** 2026-07-13  
**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)  
**Reconciliation status:** **Pending**

This document is an evidence record, not permission to edit Supabase migration history. Applied migration files and production migration identities must never be renamed, rewritten, deleted, or replayed. The ledger capture commit may predate the current repository head; `scripts/check-migration-ledger.mjs` validates that the recorded capture metadata is syntactically valid and that this document lists every current untracked migration.

## Current state

- Supabase migration history contains 24 normally applied migrations through `20260711014500_idempotency_uncertain_completion_guard`.
- No repository migration is currently classified as `pending`.
- Six repository migrations are classified as `applied_schema_untracked`: their schema effects are recorded as verified, but they are absent from Supabase migration history.
- Release readiness remains false until the separate migration-history reconciliation is approved, performed, and independently verified.

The six schema-applied, history-untracked files are:

1. `20260711213000_adaptive_onboarding_v2.sql`
2. `20260712173000_persistent_meal_plan_skip_status.sql`
3. `20260712195000_nutrition_target_date_overrides.sql`
4. `20260713153000_meal_plan_atomic_execution.sql`
5. `20260713160000_train_section_atomic_integrity.sql`
6. `20260713170000_finalize_train_schedule_delete_integrity.sql`

## Recorded schema evidence

### Adaptive onboarding v2

Recorded verification covers the onboarding, nutrition-preference, and fitness-constraint columns; onboarding constraints; authenticated `complete_adaptive_onboarding_v2` RPC; hardened execution behavior; and anonymous denial.

### Persistent meal-plan skip status

Recorded verification covers the `planned | done | skipped` status constraint, skipped-state integrity constraint, terminal-state transition trigger, and trigger function.

### Nutrition target date overrides

Recorded verification covers `user_nutrition_target_date_overrides`, its uniqueness/index structure, RLS, four ownership policies, updated-at trigger, authenticated CRUD grants, anonymous denial, and `apply_nutrition_target_changes`.

### Meal-plan atomic execution

Recorded verification covers the ownership-checked atomic meal-plan RPCs, hardened `SECURITY DEFINER` search paths and grants, uniqueness indexes, validated execution-state constraint, terminal transition behavior, duplicate checks, and the reviewed repair of incomplete legacy completed rows.

### Train section atomic integrity

Recorded verification covers Train atomic RPCs, ownership assertions, history/reference-preservation triggers, archived day/exercise columns, active-plan constraint, required indexes, hardened search paths and grants, and production integrity checks.

### Final Train schedule/delete integrity

Recorded verification covers explicit-local-date RPC signatures, removal of legacy overloads, schedule-safe behavior, authenticated/service-role grants, anonymous denial, hardened search paths, and checked reference, duplication, schedule-history, active-plan, and orphan conditions.

## Required action

Do not replay any of the six files. Their database objects already exist according to the recorded evidence. Repairing Supabase migration history requires separate owner approval and evidence that every migration was fully applied.

The approved implementation branch provides:

- `plaivra_production_migration_reconciliation_plan.md` — the owner-reviewed forward-only procedure;
- `supabase/verification/production-release-migration-preflight.sql` — read-only catalog checks;
- `npm run migration:ledger:check` — repository classification, count, ordering, identity, evidence-note, and documentation validation.

The ledger entries must remain `applied_schema_untracked` until the production history repair has actually been completed and independently verified. The database compatibility marker must be updated only after that reconciliation and post-repair verification.

## Advisor status

The verified migrations do not authorize broad changes to unrelated advisor findings. Supabase still reports separate items including service-only tables with RLS and no member policies, leaked-password protection disabled, unindexed foreign keys, duplicate indexes, and multiple permissive policies. These require evidence-backed security/performance review and are outside migration-history repair.
