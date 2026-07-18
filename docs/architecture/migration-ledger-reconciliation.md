# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`

**Verified production state:** 2026-07-18

**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)

**Status:** **Reconciled through `20260717215400`; five reviewed Phase 3 corrections remain pending**

This document records verified production migration history. It is not authorization to replay migrations, deploy, promote, change compatibility markers, or merge. Applied migration files and production identities must remain immutable.

## Current production state

- Applied migrations: 40
- Latest migration: `20260717215400_muscle_intelligence_phase3_account_deletion_authority`
- `pendingCount = 5`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedCount = 5`
- `historyRepair.state = pending`
- Compatibility marker: `20260717051011`
- Ledger release readiness remains false while pending migrations exist.

## Applied account-deletion authority

`20260717215400_muscle_intelligence_phase3_account_deletion_authority.sql` was executed through the Supabase SQL Editor and recorded exactly once in remote migration history through supported migration repair on 2026-07-18.

Read-only verification confirmed:

- 11 Auth users and 11 profiles remained unchanged;
- nine performed sessions, nine snapshots, and 29 snapshot items remained unchanged;
- `public.purge_account_application_data_atomic(uuid)` exists;
- the function is `SECURITY DEFINER` with fixed empty `search_path`;
- execute is denied to `PUBLIC`, `anon`, and `authenticated`;
- execute is granted only to `service_role`;
- all three Train history-preservation triggers remain enabled;
- compatibility marker `20260717051011` remains unchanged.

The function is lifecycle-bound, idempotent, and uses deterministic dependency ordering. Normal Train history protection remains active. Do not replay or modify this migration.

## Pending PR #68 migrations

The following files are reviewed but are not yet recorded in production history:

```text
supabase/migrations/20260717215500_muscle_intelligence_phase3_lifecycle_provider_corrections.sql
supabase/migrations/20260717215600_muscle_intelligence_phase3_direct_session_authority.sql
supabase/migrations/20260717215700_muscle_intelligence_phase3_replacement_repair_hardening.sql
supabase/migrations/20260717215800_muscle_intelligence_phase3_plan_session_start_authority.sql
supabase/migrations/20260717215900_muscle_intelligence_phase3_set_log_completion_authority.sql
```

They must remain `pending` until each exact identity is applied in filename order, independently verified, and recorded once in Supabase migration history.

## Applied Phase 3 baseline

- `20260717194847_muscle_intelligence_phase3_session_snapshots.sql`
  - Git blob: `865f918091fbb9cf054e170417caaf384c65f049`
  - Verified nine snapshots, 29 stable historical items, zero missing snapshot headers, and zero owner mismatches.
- `20260717202151_muscle_intelligence_phase3_integrity_corrections.sql`
  - Git blob: `af02da43e4d61f9248ad6110b9e58f99cac84560`
  - Verified mapping-interval, provenance, lifecycle, and immutability corrections.

Do not replay or modify either migration.

## Compatibility boundary

Physical production migration head:

```text
20260717215400
```

Deployed compatibility marker:

```text
version = 2
migration_version = 20260717051011
```

The difference is intentional. The marker may advance only in a separately authorized coordinated release.

## Verification authority

- `supabase/verification/muscle-intelligence-phase3-session-snapshots.sql`
- `lib/product/muscle-intelligence-phase3-migration.test.ts`
- `lib/product/muscle-intelligence-phase3-corrections.test.ts`
- full clean migration-chain replay in GitHub Quality
- `supabase/migration-ledger.json`

## Remaining work

1. Run fresh Phase A and Quality on the exact reconciled-ledger head.
2. Confirm production still has 40 migrations ending at `20260717215400`.
3. Apply only the five pending files in filename order through a controlled migration path.
4. Verify each exact migration identity and production postcondition.
5. Reconcile the ledger again.
6. Run final exact-head Phase A and Quality.

No merge, compatibility-marker update, deployment, Phase 4 work, or Heat Map UI is authorized.
