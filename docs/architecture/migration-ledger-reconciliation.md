# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Evidence captured:** 2026-07-31
**Machine authority:** `supabase/migration-ledger.json`
**Status:** AW-4 applied; AW-9 pending independent review

This document is a human-readable summary only. It does not authorize migration replay, merge, deployment, compatibility-marker promotion, or Production writes.

## Current state

- Physical Production migration records: **75**
- Repository classifications: **76**
- Exact applications (`state = applied`): **63**
- Generated-version aliases (`state = applied_version_alias`): **12**
- Repository-only pending migrations: **1**
- `pendingCount = 1`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 1`
- `historyRepair.state = pending`
- `release_ready = false`
- Released compatibility marker: `20260724232734`
- Latest physical Production record: `20260726114212_active_workout_aw4_session_engine`
- Expected Production migration while AW-9 remains pending: `20260726114212_active_workout_aw4_session_engine`

Physical schema advancement and compatibility-marker promotion are deliberately separate release operations.

## AW-4 applied identity

```text
Repository 20260726075737_active_workout_aw4_session_engine.sql
Production 20260726114212_active_workout_aw4_session_engine
State      applied_version_alias
Evidence   020a17d0b82ec3c50aed7d5f1ad03e5e19b5abc9
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

## AW-9 pending identity

```text
Repository 20260731090000_active_workout_aw9_offline_multi_device.sql
State      pending
Evidence   020a17d0b82ec3c50aed7d5f1ad03e5e19b5abc9
Git blob   f1ffadfa2a0fc3b149afc6cfbf3c82751f18230c
SHA-256    1e727c81e333b08bfe4cc4f2aae50014ac07064bc25625913b14b27f41f7bf3e
```

The AW-9 migration is repository-only and pending independent review. It has not been applied to Supabase Production. The Production migration count and compatibility marker remain unchanged. Applied migrations must not be replayed.

## Authority and verification

Use these current sources:

- `supabase/migration-ledger.json`
- immutable files under `supabase/migrations/`
- executable contracts under `supabase/verification/`
- `scripts/check-migration-ledger.mjs`
- exact-head Quality and Exact Release workflow artifacts

Merged pull requests and Git history preserve historical implementation reports. Those reports are not current migration authority and are intentionally excluded from the active tree.
