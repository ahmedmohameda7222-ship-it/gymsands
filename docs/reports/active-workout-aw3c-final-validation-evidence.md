# AW-3C Final Validation Evidence

## State

FINAL EXACT-HEAD VALIDATION IN PROGRESS

## Reconciled implementation

- Draft PR: `#86`
- PR base: `main`
- Post-reconciliation parent head: `db8704fef79f572c31d62a12a81d2d480715e30b`
- Exact pre-application evidence commit: `96fe292d57b2d22a21f9cfa402615b0fff60cdfa`
- Production migration: `20260725130422_active_workout_aw3c_immutable_prescription_snapshots`
- Repository migration Git blob: `35af298e904a4cdfdd336a033a91dfc63f827479`
- Repository/applied SQL SHA-256: `c7ee67e8184d4cf1afe6e7ce9c6ec4de90c5fd36bc9d31006b55e53f62b94031`
- Physical Production migration records: `73`
- AW-3C applications: `1`
- Prescription sets/targets: `86 / 15`
- Compatibility marker: `20260724232734` (unchanged)
- Migration ledger: reconciled, pending `0`, unresolved `0`

## Post-application integrity

- Duplicate sets/targets: `0 / 0`
- Orphan sets/targets: `0 / 0`
- Owner/path mismatches: `0`
- RLS: enabled on both AW-3C tables
- Authenticated access: owner-filtered SELECT only
- Authenticated direct writes: denied
- Private materializer executable by authenticated: no
- Activity Catalog AW-3C relations/functions: `0 / 0`

## Final gate

This commit launches the normal final exact-head:

- Phase A Diff Validation
- Quality
- Exact Release Quality Validation

PR `#86` remains Draft and unmerged. The compatibility marker remains unchanged. AW-4 has not started.
