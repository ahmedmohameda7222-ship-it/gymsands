# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`

**Verified production state:** 2026-07-18

**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)

**Status:** **Fully reconciled through `20260717215900`; no pending repository migration remains**

This document records verified production migration history. It is not authorization to replay migrations, deploy, promote, change compatibility markers, or merge. Applied migration files and production identities must remain immutable.

## Current production state

- Applied migrations: 45
- Latest migration: `20260717215900_muscle_intelligence_phase3_set_log_completion_authority`
- `pendingCount = 0`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedCount = 0`
- `historyRepair.state = reconciled`
- Compatibility marker: `20260717051011`
- Ledger-level migration-history release readiness: true

## Applied PR #68 correction chain

The following reviewed forward migrations are recorded exactly once in Supabase migration history:

```text
20260717215400_muscle_intelligence_phase3_account_deletion_authority
20260717215500_muscle_intelligence_phase3_lifecycle_provider_corrections
20260717215600_muscle_intelligence_phase3_direct_session_authority
20260717215700_muscle_intelligence_phase3_replacement_repair_hardening
20260717215800_muscle_intelligence_phase3_plan_session_start_authority
20260717215900_muscle_intelligence_phase3_set_log_completion_authority
```

They were executed through the Supabase SQL Editor in filename order and each exact version was recorded through supported migration repair.

Exact Git blobs:

```text
20260717215400  93868fad063217196d7d78c14978242221494fb0
20260717215500  2bb956fba6dcd31f67df12b17b4aedf315f78063
20260717215600  c9313396b9d1fa718c5d26672304e5dd9eea2c8f
20260717215700  acd893420c0761369899e9826553581feff52c25
20260717215800  748e7c058468d3ba7c24ac7d4a688a9729327394
20260717215900  9b725cc990af9565580cde16096c5bb6ece9b1e4
```

Do not replay or modify any applied migration.

## Read-only production verification

Verification after all six corrections confirmed:

```text
auth users = 11
profiles = 11
performed sessions = 9
session snapshots = 9
snapshot items = 29
sessions missing snapshots = 0
snapshot owner mismatches = 0
duplicate snapshot envelopes = 0
terminal snapshot items still planned = 0
compatibility marker = 20260717051011
```

The account-deletion purge remains executable only by `service_role`. Direct-session start, replacement eligibility, plan-session start, set-log, and completion RPCs exist as `SECURITY DEFINER` functions with fixed empty `search_path`, no `PUBLIC` or anonymous execution, and intended authenticated/service-role execution. The active-direct-session uniqueness index exists. The lifecycle transition trigger and all three normal Train history-preservation triggers remain enabled.

## Applied Phase 3 baseline

- `20260717194847_muscle_intelligence_phase3_session_snapshots.sql`
  - Git blob: `865f918091fbb9cf054e170417caaf384c65f049`
- `20260717202151_muscle_intelligence_phase3_integrity_corrections.sql`
  - Git blob: `af02da43e4d61f9248ad6110b9e58f99cac84560`

These migrations remain byte-immutable.

## Compatibility boundary

Physical production migration head:

```text
20260717215900
```

Deployed compatibility marker:

```text
version = 2
migration_version = 20260717051011
```

The difference is intentional. The marker may advance only in a separately authorized coordinated release.

## Supabase advisor review

The post-DDL security advisor reported no critical finding. It continues to report informational deny-all RLS tables and generic warnings for authenticated `SECURITY DEFINER` RPCs. For the Phase 3 RPCs, authenticated execution is intentional and protected by direct actor checks, owner predicates, fixed search paths, and explicit ACLs. The pre-existing leaked-password-protection warning is outside PR #68 scope.

## Verification authority

- `supabase/verification/muscle-intelligence-phase3-session-snapshots.sql`
- `lib/product/muscle-intelligence-phase3-migration.test.ts`
- `lib/product/muscle-intelligence-phase3-corrections.test.ts`
- full clean migration-chain replay in GitHub Quality
- `supabase/migration-ledger.json`

## Remaining work

1. Run fresh Phase A and Quality on the exact final reconciled head.
2. Keep PR #68 Draft and unmerged until the user separately authorizes the merge.
3. Do not update the compatibility marker or start Phase 4 under this task.

No merge, compatibility-marker update, deployment, Phase 4 work, or Heat Map UI is authorized.
