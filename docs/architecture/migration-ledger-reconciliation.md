# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Evidence captured:** 2026-08-01
**Machine authority:** `supabase/migration-ledger.json`
**Audit baseline:** `73944677c11222044520991fc1f18c8edd81a78e`
**Status:** AW-9 applied; eight Workout History migrations pending

This document is a human-readable summary only. It does not authorize migration replay, merge, deployment, compatibility-marker promotion, or Production writes.

## Current state

- Physical Production migration records: **76**
- Repository classifications: **84**
- Exact applications (`state = applied`): **63**
- Generated-version aliases (`state = applied_version_alias`): **13**
- Repository-only pending migrations: **8**
- `pendingCount = 8`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 8`
- `historyRepair.state = pending`
- `release_ready = false`
- Released compatibility marker: `20260724232734`
- Latest physical Production record: `20260801045628_active_workout_aw9_offline_multi_device`
- Expected Production migration: `20260801045628_active_workout_aw9_offline_multi_device`

Physical schema advancement and compatibility-marker promotion are deliberately separate release operations.

## Workout History pending identity

`20260801140043_workout_history_verified_records.sql`, `20260801160000_workout_history_correction_and_soft_delete.sql`, `20260801180000_workout_history_repeat_session.sql`, `20260801194500_workout_history_verified_record_authority_hardening.sql`, `20260801201500_workout_history_verified_record_rebuild.sql`, `20260801203000_workout_history_set_detail_patch_semantics.sql`, `20260801210000_workout_history_correction_muscle_reconcile.sql`, `20260801220000_workout_history_keyset_read_authority.sql` are approved forward repository migrations for the Workout History program and its independent QA/QC corrections. They exist only in the repository, are classified as pending, and have not been applied to Production. Applying them requires separate explicit authorization; this implementation program does not authorize Production writes.

## AW-9 applied identity

```text
Repository 20260731090000_active_workout_aw9_offline_multi_device.sql
Production 20260801045628_active_workout_aw9_offline_multi_device
State      applied_version_alias
Evidence   73944677c11222044520991fc1f18c8edd81a78e
Git blob   f1ffadfa2a0fc3b149afc6cfbf3c82751f18230c
SHA-256    1e727c81e333b08bfe4cc4f2aae50014ac07064bc25625913b14b27f41f7bf3e
```

The AW-9 migration was applied exactly once to Plaivra Production on 2026-08-01 through Supabase `apply_migration`. Its preflight verified compatibility schema version `2`, marker `20260724232734`, all AW-4 authorities, and absence of any existing or partially applied AW-9 authority. The immutable repository filename and SQL bytes must not be edited or replayed. The compatibility marker was not promoted. Activity Catalog was not modified.

One Active Workout session was open at application time. It had a valid execution state and no claimed controller. AW-9 preserves the legacy unclaimed request path until a controller is explicitly claimed, so the schema change did not invalidate that session.

## AW-4 applied identity

```text
Repository 20260726075737_active_workout_aw4_session_engine.sql
Production 20260726114212_active_workout_aw4_session_engine
State      applied_version_alias
Evidence   73944677c11222044520991fc1f18c8edd81a78e
Git blob   e79d74a90adcc62b044ce5eec83018416fdbabab
SHA-256    b9d5af90a8b7c277bf9892cdae8c412c58284641b7e51f19d220c683eb272d93
```

The AW-4 migration was applied exactly once to Plaivra Production. The immutable repository filename and SQL bytes must not be edited or replayed. Compatibility-marker promotion remains a separate operation and was not performed. Activity Catalog was not modified.

## AW-3C applied identities

```text
Repository 20260725013000_active_workout_aw3c_immutable_prescription_snapshots.sql
Production 20260725130422_active_workout_aw3c_immutable_prescription_snapshots
State      applied_version_alias

Repository 20260725163000_active_workout_aw3c_audit_corrections.sql
Production 20260725145636_active_workout_aw3c_audit_corrections
State      applied_version_alias
```

Both migrations were applied exactly once to Plaivra Production. The repository filenames and SQL bytes remain immutable. Activity Catalog was not modified.

## Authority and verification

Use these current sources:

- `supabase/migration-ledger.json`
- immutable files under `supabase/migrations/`
- executable contracts under `supabase/verification/`
- `scripts/check-migration-ledger.mjs`
- exact-head Quality and Exact Release workflow artifacts

Merged pull requests and Git history preserve historical implementation reports. Those reports are not current migration authority and are intentionally excluded from the active tree.
