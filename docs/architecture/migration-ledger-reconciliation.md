# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Verified production state:** 2026-07-15
**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)
**Reconciliation status:** **Pending / release NO-GO**

This document records the verified production state supplied after the controlled reconciliation sequence. It is not authorization to replay migration SQL, change the compatibility marker, deploy, promote, or merge. Applied migration files and production identities must never be renamed, rewritten, deleted, or replayed.

## Current state

- Supabase migration history contains 32 applied migrations.
- All eight reconciliation-scope identities are present in production migration history exactly once.
- `pendingCount = 1`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedCount = 1`
- `historyRepair.state = pending`
- `20260715190000_train_phase2a_program_architecture.sql` is present in the repository and intentionally not applied to production.
- The migration-ledger reconciliation gate is therefore not satisfied for the current Draft PR.
- The latest verified production migration remains `20260715010000`; production release must stay fail-closed until the pending migration is separately applied and verified.

The verified production identities are:

1. `20260711213000_adaptive_onboarding_v2.sql`
2. `20260712173000_persistent_meal_plan_skip_status.sql`
3. `20260712195000_nutrition_target_date_overrides.sql`
4. `20260713153000_meal_plan_atomic_execution.sql`
5. `20260713160000_train_section_atomic_integrity.sql`
6. `20260713170000_finalize_train_schedule_delete_integrity.sql`
7. `20260714030000_harden_train_plan_rpc_execution.sql`
8. `20260715010000_restrict_nutrition_target_override_acl.sql`

The first seven identities were repaired in production migration history only after complete physical-equivalence verification. The eighth identity was applied and recorded normally as the forward-only ACL correction. None of these files may be replayed.

## Final nutrition override ACL

The authenticated role now has exactly:

```text
DELETE
INSERT
SELECT
UPDATE
```

The following privileges are absent:

```text
MAINTAIN
REFERENCES
TRIGGER
TRUNCATE
```

RLS, the four owner policies, service-role access, owner administration, and application data remain outside the scope of this repository-only completion and were preserved by the verified production operation.

## Final Train reconciliation evidence

Production verification for `20260714030000_harden_train_plan_rpc_execution.sql` confirmed:

- all six canonical Train RPC signatures exist;
- all six are `SECURITY DEFINER`;
- all six have an explicitly empty `search_path`;
- authenticated and service-role execute are present;
- anonymous and PUBLIC execute are denied;
- every RPC invokes `public.assert_workout_actor(p_user_id)`;
- `assert_workout_actor(uuid)` contains the service-role-aware `auth.role()` path and owner mismatch denial;
- no unexpected overload remains outside the six canonical signatures;
- checked active-plan, orphan, duplicate-schedule, and scheduled-history counts are zero.

Its exact production migration identity is now present and classified as `applied`.

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

The ledger-level `releaseReady` value requires all of the following:

- `historyRepair.state === "reconciled"`
- `pendingCount === 0`
- `schemaAppliedUntrackedCount === 0`
- `ledgerDriftReviewCount === 0`
- `unresolvedCount === 0`
- all resolved production identities are valid

The previously applied production ledger satisfied those migration-specific conditions before the Phase 2A branch added `20260715190000_train_phase2a_program_architecture.sql`. The current repository ledger correctly returns to `pending` and is not release-ready until that migration receives a verified production identity. The application-level release readiness calculation remains independently fail-closed on artifact identity, schema compatibility, database migration-marker compatibility, and the remaining release evidence.

## Read-only preflight

`supabase/verification/production-release-migration-preflight.sql` continues to block on:

- missing migration objects;
- function security/search-path mismatch;
- incomplete Train RPC contract;
- any Train RPC signature outside the six canonical signatures;
- Train integrity conflicts;
- disabled RLS or incorrect policy count;
- missing required nutrition override CRUD privileges;
- any extra authenticated nutrition override privilege, including PostgreSQL 17 `MAINTAIN`.

The ACL inspection uses `pg_class.relacl` and `aclexplode`, not only `information_schema`, so PostgreSQL 17 privileges remain visible.

## Remaining release work

Migration-history reconciliation is complete. A separate approved release workflow must still:

1. keep the compatibility marker unchanged until its own reviewed forward operation is authorized;
2. update that marker only after the required release evidence is complete;
3. run the complete release preflight and all repository quality gates;
4. confirm the Vercel main-only deployment policy integrated into PR #57 remains validated by the current Quality workflow;
5. deploy only the exact approved commit;
6. verify provider commit metadata, `/api/version`, health checks, and required browser smoke evidence;
7. merge only after independent quality-control approval.

This PR does not perform any Supabase write, migration repair, migration replay, compatibility-marker update, deployment, promotion, or merge.

## Advisor status

Separate advisor notices remain outside this correction, including authenticated `SECURITY DEFINER` warnings for intended narrow RPC boundaries, leaked-password protection disabled, unindexed foreign keys, duplicate indexes, and multiple permissive policies. They do not authorize unrelated changes in this branch.
