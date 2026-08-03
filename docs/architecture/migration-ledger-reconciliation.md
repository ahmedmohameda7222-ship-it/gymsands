# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Evidence captured:** 2026-08-02T11:55:00.000Z
**Machine authority:** `supabase/migration-ledger.json`
**Audit baseline:** `0e9e08ac2a5fda053612035762613ef94128e815`
**Status:** Workout History Production history reconciled; PCS-2 migration pending authorization

This document records migration identity and verification. It does not independently authorize merge, deployment, compatibility-marker promotion, or migration replay.

## Current state

- Physical Production migration records: **85**
- Repository classifications: **86**
- Exact applications (`state = applied`): **63**
- Generated-version aliases (`state = applied_version_alias`): **22**
- Repository-only pending migrations: **1**
- Pending repository migration: `20260803152000_private_app_bootstrap_v1.sql`
- `pendingCount = 1`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 1`
- `historyRepair.state = pending`
- `release_ready = false`
- Released compatibility marker: `20260724232734`
- Latest physical Production record: `20260802114733_workout_history_filter_options`
- Activity Catalog migration count: **0**

The pending PCS-2 migration has not been applied to Production. It requires explicit Production migration authorization after Lead QA/QC. Do not replay or apply it from repository presence alone.

Physical schema advancement and compatibility-marker promotion remain separate release operations. The Workout History application did not promote the compatibility marker.

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

## PCS-2 pending identity

| Immutable repository migration | Production identity | State |
|---|---|---|
| `20260803152000_private_app_bootstrap_v1.sql` | Not assigned or applied | `pending` |

## Production verification

Independent read-only verification after the Workout History application proved:

- all required Workout History columns, RPC authorities, views, and the correction muscle-reconciliation trigger exist;
- authenticated clients cannot execute the server-owned verified-record replacement authority;
- the service role retains the replacement authority;
- anonymous users cannot execute Workout History root-page or filter-option reads;
- authenticated users retain the intended owner-scoped read authorities;
- the compatibility marker remains `20260724232734`;
- Plaivra Activity Catalog remains isolated and unmodified.

No Production verification is claimed for `20260803152000_private_app_bootstrap_v1.sql` because it remains unapplied.

## Prior applied authorities

AW-9 remains represented by repository migration `20260731090000_active_workout_aw9_offline_multi_device.sql` and generated Production identity `20260801045628_active_workout_aw9_offline_multi_device`. AW-4 and earlier generated aliases remain preserved in the machine ledger.

## Authority and verification

Use these current sources:

- `supabase/migration-ledger.json`
- immutable files under `supabase/migrations/`
- executable contracts under `supabase/verification/`
- `scripts/check-migration-ledger.mjs`
- exact-head Quality and Exact Release workflow artifacts
