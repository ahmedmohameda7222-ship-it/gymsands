# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Read-only verification:** 2026-07-14 23:24 UTC
**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)
**Reconciliation status:** **Pending / NO-GO**

This document records evidence. It is not authorization to edit production migration history, apply the forward correction, update the compatibility marker, merge, or deploy. Applied migration files and production identities must never be renamed, rewritten, deleted, or replayed.

## Current state

- Supabase migration history contains 24 normally applied migrations through `20260711014500_idempotency_uncertain_completion_guard`.
- Seven later repository migrations are physically present in production but absent from `supabase_migrations.schema_migrations`.
- One new forward-only ACL correction migration is intentionally `pending` and has not been applied to production.
- `pendingCount = 1`
- `schemaAppliedUntrackedCount = 7`
- `unresolvedCount = 8`
- `historyRepair.state = pending`
- `releaseReady = false`

The seven physically applied, history-untracked files are:

1. `20260711213000_adaptive_onboarding_v2.sql`
2. `20260712173000_persistent_meal_plan_skip_status.sql`
3. `20260712195000_nutrition_target_date_overrides.sql`
4. `20260713153000_meal_plan_atomic_execution.sql`
5. `20260713160000_train_section_atomic_integrity.sql`
6. `20260713170000_finalize_train_schedule_delete_integrity.sql`
7. `20260714030000_harden_train_plan_rpc_execution.sql`

The pending forward correction is:

8. `20260715010000_restrict_nutrition_target_override_acl.sql`

## Material divergence requiring the forward correction

Production grants `authenticated` the following privileges on `public.user_nutrition_target_date_overrides`:

```text
DELETE
INSERT
MAINTAIN
REFERENCES
SELECT
TRIGGER
TRUNCATE
UPDATE
```

The intended contract is exactly:

```text
DELETE
INSERT
SELECT
UPDATE
```

`20260715010000_restrict_nutrition_target_override_acl.sql` is a forward PostgreSQL 17 security correction. It revokes only `TRUNCATE`, `TRIGGER`, `REFERENCES`, and `MAINTAIN`, reasserts CRUD, changes no data, and does not replay `20260712195000_nutrition_target_date_overrides.sql`.

The original nutrition migration is not eligible for history repair until this forward correction is applied through a separately approved tracked mechanism and the exact ACL is verified.

## Seventh migration evidence

Read-only production verification for `20260714030000_harden_train_plan_rpc_execution.sql` confirmed:

- all six canonical Train RPC signatures exist;
- all six are `SECURITY DEFINER`;
- all six have an explicitly empty `search_path`;
- authenticated and service-role execute are present;
- anonymous and PUBLIC execute are denied;
- every RPC invokes `public.assert_workout_actor(p_user_id)`;
- `assert_workout_actor(uuid)` contains the service-role-aware `auth.role()` path and owner mismatch denial;
- no unexpected overload remains outside the six canonical signatures;
- checked active-plan, orphan, duplicate-schedule, and scheduled-history counts are zero.

Its ledger state is therefore `applied_schema_untracked`, not `pending`. It must not be marked `applied` until a supported production history repair is separately approved and verified.

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

Resolved states are `applied` and `applied_version_alias`. Every other state is unresolved.

`releaseReady` requires all of the following:

- `historyRepair.state === "reconciled"`
- `pendingCount === 0`
- `schemaAppliedUntrackedCount === 0`
- `ledgerDriftReviewCount === 0`
- `unresolvedCount === 0`
- all resolved production identities are valid

A physically applied migration incorrectly classified as `pending` cannot produce a ready state.

## Read-only preflight

`supabase/verification/production-release-migration-preflight.sql` now blocks on:

- missing migration objects;
- function security/search-path mismatch;
- incomplete seventh-migration Train RPC contract;
- any Train RPC signature outside the six canonical signatures;
- Train integrity conflicts;
- disabled RLS or incorrect policy count;
- missing required nutrition override CRUD privileges;
- any extra authenticated nutrition override privilege, including PostgreSQL 17 `MAINTAIN`.

The ACL inspection uses `pg_class.relacl` and `aclexplode`, not only `information_schema`, so PostgreSQL 17 privileges are visible.

## Required future sequence

Do not run a normal migration push from the canonical repository while the seven historical identities are absent from production history.

A later owner-approved execution must:

1. activate and verify a production deployment release hold;
2. verify a current backup/PITR recovery point;
3. revalidate exact repository SHA and all eight migration hashes;
4. create a disposable Supabase execution workdir containing the 24 already tracked migration files plus only `20260715010000_restrict_nutrition_target_override_acl.sql`;
5. use linked migration-list and database-push dry-run operations and require the sole proposed migration to be version `20260715010000`;
6. apply and normally record only the new forward ACL correction;
7. verify exact ACL, RLS, policies, service-role access, row integrity, history identity, and unchanged compatibility marker;
8. re-run complete equivalence checks for all seven historical identities;
9. use the supported linked migration-repair operation with status `applied` only for identities proven complete equivalent;
10. verify migration history and physical state after each repaired identity;
11. update the repository ledger in a separate reviewed commit;
12. update the compatibility marker only after all preceding verification;
13. run release preflight and deploy only the exact approved commit.

Supabase documents that database push applies local migrations absent from remote history, its dry-run prints the proposed set, and migration repair changes tracking without running migration SQL.

## Preconditions still missing

The recommendation remains `NO-GO` until direct evidence supplies:

- latest successful backup/PITR timestamp;
- backup type and recovery window;
- evidence capture timestamp;
- named production operator;
- named independent verifier;
- named release-hold owner;
- exact verified Vercel hold mechanism;
- named rollback owner.

## Advisor status

Separate advisor notices remain outside this correction, including authenticated `SECURITY DEFINER` warnings for intended narrow RPC boundaries, leaked-password protection disabled, unindexed foreign keys, duplicate indexes, and multiple permissive policies. They do not authorize unrelated changes in this branch.
