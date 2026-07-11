# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`  
**Read-only capture:** 2026-07-10  
**Audited repository commit:** `60a204d5fc20fc396be1b1b47e748c42ebba6abf`

This is an evidence record, not permission to repair the production ledger. Applied migration files and production migration history must never be renamed, rewritten, or deleted.

## Reconciled state

The machine-readable authority is [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json). `npm run migration:ledger:check` fails when a repository migration is unclassified, when a referenced file is absent, or when a production identity is incomplete or duplicated.

- Ten repository migrations match production by version and name.
- `functional_fitness_constraints` was applied in production as `20260710140133`; its immutable repository filename starts with `20260710135000`.
- `drop_retired_ai_request_and_safety_tables` was applied in production as `20260710145503`; its immutable repository filename starts with `20260710170000`.
- Production contains the columns introduced by `20260703151807_onboarding_coaching_quick_log_preferences.sql`, but its migration ledger does not contain that version/name. This is schema/ledger drift and requires original deployment evidence before a Supabase ledger repair is considered.
- `20260710164946_enforce_initial_launch_age_16.sql` is pending and has not been represented as applied.

## Safe operating procedure

1. Capture `supabase_migrations.schema_migrations` and the affected schema from production before any release.
2. Compare the capture with the checked-in ledger; do not infer application solely from current columns.
3. Execute pending migrations on an isolated branch/database and run verification SQL.
4. Apply only additive migrations during convergence.
5. Require row-count, per-user-total, ownership, RLS, export, deletion, and active-reference gates before a read cutover.
6. Repair ledger metadata only through the approved Supabase workflow, with owner review and a backup. Never make SQL content appear to have run when its provenance is unknown.

## Rollback and forward-fix

Additive columns remain nullable until backfill verification. Application readers must tolerate their absence during rollout. If a new write path fails, disable its feature flag and return to the preceding writer; retain newly written rows for a forward-fix. Dropping legacy objects is a separate future migration after zero-reference and backup gates, not a rollback technique.
