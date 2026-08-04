# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Evidence captured:** 2026-08-03T18:10:27.000Z
**Machine authority:** `supabase/migration-ledger.json`
**Audit baseline:** `92d936bc513af83fff41913477a8148a9ab5b845`
**Status:** Workout History and PCS-2 Production migration history reconciled; PCS-2 application runtime deployed and verified

This document records migration identity and verification. It does not independently authorize merge, deployment, compatibility-marker promotion, or migration replay.

## Current state

- Physical Production migration records: **86**
- Repository classifications: **86**
- Exact applications (`state = applied`): **63**
- Generated-version aliases (`state = applied_version_alias`): **23**
- Repository-only pending migrations: **0**
- `pendingCount = 0`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 0`
- `historyRepair.state = reconciled`
- `release_ready = true`
- Released compatibility marker: `20260724232734`
- Latest physical Production record: `20260803173755_private_app_bootstrap_v1`
- Activity Catalog migration count: **0**

The PCS-2 migration was applied exactly once to Plaivra Production as generated version `20260803173755_private_app_bootstrap_v1`. Its immutable repository file remains `20260803152000_private_app_bootstrap_v1.sql` and is represented through the existing `applied_version_alias` convention. Do not rename, edit, or replay it.

Physical schema advancement and compatibility-marker promotion remain separate release operations. The migration application itself did not promote the compatibility marker or deploy application code. The approved application code was subsequently squash-merged as `92d936bc513af83fff41913477a8148a9ab5b845`, deployed to Vercel Production, and verified against the reconciled database contract.

## Workout History applied identities

| Immutable repository migration | Generated Production identity | State |
|---|---|---|
| `20260801140043_workout_history_verified_records.sql` | `20260802113958_workout_history_verified_records` | `applied_version_alias` |
| `20260801160000_workout_history_correction_and_soft_delete.sql` | `20260802114200_workout_history_correction_and_soft_delete` | `applied_version_alias` |
| `20260801180000_workout_history_repeat_session.sql` | `20260802114311_workout_history_repeat_session` | `applied_version_alias` |
| `20260801194500_workout_history_verified_record_authority_hardening.sql` | `20260802114332_workout_history_verified_record_authority_hardening` | `applied_version_alias` |
| `20260801201500_workout_history_verified_record_rebuild.sql` | `20260802114422_workout_history_verified_record_rebuild` | `applied_version_alias` |
| `20260801203000_workout_history_set_detail_patch_semantics.sql` | `20260802114455_workout_history_set_detail_patch_semantics` | `applied_version_alias` |
| `20260801210000_workout_history_correction_muscle_reconcile.sql` | `20260802114534_workout_history_correction_muscle_reconcile` | `applied_version_alias` |
| `20260801220000_workout_history_keyset_read_authority.sql` | `20260802114654_workout_history_keyset_read_authority` | `applied_version_alias` |
| `20260801223000_workout_history_filter_options.sql` | `20260802114733_workout_history_filter_options` | `applied_version_alias` |

All nine migrations were applied exactly once to Plaivra Production on 2026-08-02 through Supabase `apply_migration`. Their immutable repository SQL files must not be edited or replayed.

## PCS-2 applied identity

| Immutable repository migration | Generated Production identity | State |
|---|---|---|
| `20260803152000_private_app_bootstrap_v1.sql` | `20260803173755_private_app_bootstrap_v1` | `applied_version_alias` |

## PCS-2 Production verification

Read-only verification against Plaivra Production proved:

- `public.get_private_app_bootstrap_v1()` exists with zero arguments and returns `jsonb`;
- the function is `STABLE`, uses `SECURITY DEFINER`, and has fixed `search_path = pg_catalog, public`;
- anonymous execution is denied;
- authenticated and service-role execution are allowed;
- `contractVersion = 1`;
- payload `userId` matches `auth.uid()`;
- profile, account-access state, consent facts, onboarding summary, and settings are owner-scoped;
- verification passed for two different authenticated actors;
- no cross-user selector exists;
- the migration was applied exactly once;
- the Production migration count is **86**;
- the latest physical Production migration is `20260803173755_private_app_bootstrap_v1`;
- the released compatibility marker remains `20260724232734`;
- the migration application itself did not deploy application code;
- Plaivra Activity Catalog remains isolated and unmodified.

## PCS-2 application runtime verification

- Squash merge / Production commit: `92d936bc513af83fff41913477a8148a9ab5b845`
- Vercel deployment: `dpl_DbSrbwJ98HiuZTJQFW7G3hVtkVZy`
- Deployment target and state: `production`, `READY`
- Build timestamp: `2026-08-03T18:07:46.883Z`
- `https://app.plaivra.com/api/version`: HTTP 200
- Runtime commit identity matched the squash-merged `main` commit.
- `schemaCompatibilityVersion = 2`
- `databaseMigrationVersion = 20260724232734`
- `migrationLedgerReconciliationState = reconciled`
- pending, schema-applied-untracked, and unresolved migration counts were all zero.
- `migrationVersionCompatible = true`
- `migrationLedgerReconciled = true`
- `releaseReady = true`
- `schemaCompatible = true`
- `https://app.plaivra.com/login`: HTTP 200
- Vercel reported no runtime-error cluster during the post-deployment verification window.

## Prior applied authorities

AW-9 remains represented by repository migration `20260731090000_active_workout_aw9_offline_multi_device.sql` and generated Production identity `20260801045628_active_workout_aw9_offline_multi_device`. AW-4 and earlier generated aliases remain preserved in the machine ledger.

## Authority and verification

Use these current sources:

- `supabase/migration-ledger.json`
- immutable files under `supabase/migrations/`
- executable contracts under `supabase/verification/`
- `scripts/check-migration-ledger.mjs`
- Production `/api/version`
- Vercel Production deployment identity and runtime logs
- exact-head Quality and release workflow artifacts

## Pending P0 onboarding database repair

- `20260804174500_fix_profiles_update_policy_recursion.sql` is a repository-only pending migration that repairs the confirmed recursive `profiles_update_own_basic` RLS policy blocking final onboarding completion.
- It has not been applied to Production. Do not replay or apply it before explicit Product and Engineering Lead authorization.
