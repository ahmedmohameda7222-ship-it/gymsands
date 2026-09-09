# Food Catalog Plan 6 — Final P1 Verification Authority

This document registers the permanent repository state after the final Plan 6 P1 re-review corrections. It is documentation-only and does not change SQL or runtime behavior.

## Permanent product authority

- Product commit: `ee4fb55865c07cffadbcadad4bc53cce88203c9c`
- Plan 6 migration: `supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql`
- Plan 6 migration Git blob: `307583136cbb666b2984723c9edb29c0536d71e2`
- Applied Plan 4 migration remains frozen at Git blob: `eb2cdc2ee16462d7712080a3e3532757ec093742`
- Plan 6 remains repository-only and pending/unapplied in Plaivra Production.

## Final lock-order contract

Barcode writers use one deterministic cross-authority order: acquire canonical Food-row authority first, then the normalized-GTIN advisory lock, then perform governance preparation/ownership/CAS work. Multi-Food authority is ordered deterministically by Food UUID and GTIN authority is normalized before locking. The `food_barcodes` serialization trigger covers privileged writers, including the already-applied Plan 4 ingestion runtime, without modifying the Plan 4 migration. PostgreSQL deadlock is not accepted as serialization.

Permanent concurrency coverage includes:

- Plan 4 MATCH on an existing Food versus Plan 6 same-Food GTIN correction;
- Plan 6 versus Plan 6 on the same GTIN;
- Plan 4 CREATE versus Plan 6;
- assign/remove behavior.

## Live human Owner authority

Human governance principals are bound to real Auth users and canonical active account state. Ghost/nonexistent users and disabled/deleting users are rejected. Stale disabled/deleting sessions cannot govern. Recovery counts only usable Owners, and account deletion cannot eliminate the final usable recovery Owner. Distinct-session deletion/governance mutation coverage protects the same invariant under concurrency.

Permanent verification:

- `lib/product/food-catalog-governance-plan6-final-p1-rereview.test.ts`
- `supabase/verification/food-catalog-governance-control-plane-live-owner-rereview.sql`
- `scripts/test-food-catalog-governance-plan6-final-p1-concurrency.mjs`

## Correction Report privacy lifecycle

Correction Case/report metadata and canonical curator/governance evidence survive member account deletion, while member reporter identity, member free-text, and member-submitted JSON payload are separated into purgeable member-owned data and removed by canonical account purge. Stale submission after deletion processing begins is rejected, and report submission versus account purge cannot resurrect personal payload.

Permanent verification:

- `lib/product/food-catalog-governance-plan6-final-p1-rereview.test.ts`
- `supabase/verification/food-catalog-governance-control-plane-report-privacy-rereview.sql`
- `scripts/test-food-catalog-governance-plan6-final-p1-concurrency.mjs`

## Registered database verification

`scripts/run-database-verification.mjs` permanently registers the Plan 6 rollback verifiers and both distinct-session Plan 6 concurrency harnesses. The finalizer verified chronological migration replay, database lint, registered database verification, both Plan 6 concurrency suites, migration ledger validation, Plan 4 immutability, lint, and typecheck before creating the permanent product commit.

## Migration ledger boundary

The repository ledger intentionally remains fail-closed while Plan 6 is pending: `pendingCount = 1`, `unresolvedCount = 1`, and `historyRepair.state = pending`. The pending Plan 6 entry contains no applied-evidence tuple (`evidenceCommit`, `repositorySha256`, or `repositoryGitBlob`) and must not be reconciled as applied before an independently authorized post-merge Production migration action.

This documentation commit exists solely to establish a human-authored exact PR head for the repository's canonical pull-request workflows after the permanent product commit was created by GitHub Actions.
