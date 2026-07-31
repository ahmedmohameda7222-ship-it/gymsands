# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Evidence captured:** 2026-07-26
**Machine authority:** `supabase/migration-ledger.json`
**Status:** Reconciled through AW-4

This document is a human-readable summary only. It does not authorize migration replay, merge, deployment, compatibility-marker promotion, or Production writes.

## Current state

- Physical Production migration records: **75**
- Repository classifications: **75**
- Exact applications (`state = applied`): **63**
- Generated-version aliases (`state = applied_version_alias`): **12**
- `pendingCount = 0`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 0`
- `historyRepair.state = reconciled`
- Released compatibility marker: `20260724232734`
- Latest physical record: `20260726114212_active_workout_aw4_session_engine`

Physical schema advancement and compatibility-marker promotion are deliberately separate release operations.

## AW-4 applied identity

```text
Repository 20260726075737_active_workout_aw4_session_engine.sql
Production 20260726114212_active_workout_aw4_session_engine
State      applied_version_alias
Evidence   bc22cb06e1683cf1bcf5dbf2330bb20c711da6a0
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

Post-application evidence records 86 normalized prescription sets, 15 metric targets, zero duplicate/orphan/owner-path violations, zero non-contiguous prescription items, and private canonicalization/materialization authority unavailable to anonymous or authenticated callers.

## Authority and verification

Use these current sources:

- `supabase/migration-ledger.json`
- immutable files under `supabase/migrations/`
- executable contracts under `supabase/verification/`
- `scripts/check-migration-ledger.mjs`
- exact-head Quality and Exact Release workflow artifacts

Merged pull requests and Git history preserve historical implementation reports. Those reports are not current migration authority and are intentionally excluded from the active tree.

### AW-9 pending database migration

`20260731090000_active_workout_aw9_offline_multi_device.sql` is repository-only and pending independent review. It has not been applied to Supabase Production. The Production compatibility marker remains unchanged; do not replay applied migrations.
