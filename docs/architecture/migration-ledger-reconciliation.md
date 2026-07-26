# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`  
**Evidence captured:** 2026-07-25  
**Machine authority:** `supabase/migration-ledger.json`  
**Status:** Reconciled

This document is a human-readable summary only. It does not authorize migration replay, merge, deployment, compatibility-marker promotion, or Production writes.

## Current state

- Physical Production migration records: **74**
- Repository classifications: **74**
- Exact applications (`state = applied`): **63**
- Generated-version aliases (`state = applied_version_alias`): **11**
- `pendingCount = 0`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 0`
- `historyRepair.state = reconciled`
- Released compatibility marker: `20260724232734`
- Latest physical record: `20260725145636_active_workout_aw3c_audit_corrections`

Physical schema advancement and compatibility-marker promotion are deliberately separate release operations.

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
