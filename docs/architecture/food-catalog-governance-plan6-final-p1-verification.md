# Food Catalog Plan 6 — Final P1 Verification Authority

This document registers the permanent repository state after the final Plan 6 P1 re-review corrections. It is documentation-only and does not change SQL or runtime behavior.

## Permanent product authority

- Product commit after P1-F4/P1-F5 closure: `6cac23159347fca0007490b276307e4a697ab679`
- Plan 6 migration: `supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql`
- Plan 6 migration Git blob: `fcc342b0e1a09c9ee62c91c81861665732a51146`
- Applied Plan 4 migration remains frozen at Git blob: `eb2cdc2ee16462d7712080a3e3532757ec093742`
- Plan 6 remains repository-only and pending/unapplied in Plaivra Production.

## Finalizer authority

P1-F4/P1-F5 finalizer run `34307647092`, job `102327558712`, completed SUCCESS before the permanent product commit was persisted. It passed focused Plan 6 contracts, chronological migration replay, database lint, P1-F4/P1-F5 rollback verifiers, all registered database verification, final-P1 distinct-session concurrency, prior-five-P1 concurrency, fail-closed migration-ledger validation, applied Plan 4 immutability, lint, and typecheck.

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

## P1-F4 — durable-first account deletion

Account deletion now establishes durable retry authority before any access or Food-governance disable transition. `food_catalog_queue_account_deletion(...)` creates or reuses the canonical privacy request and retryable deletion job while the account is still active, under account-purge and governance recovery serialization. The durable worker then calls `food_catalog_begin_account_deletion(user_id, deletion_job_id)`; that transition refuses to disable sessions, governance authority, or account access without a matching retryable durable job.

The final usable Food governance recovery Owner remains protected at durable queue and transition boundaries. Failure before worker disable leaves the durable job retryable and does not strand the member in a disabled state without durable cleanup authority.

Permanent verification includes:

- `lib/product/food-catalog-governance-plan6-final-p1-f4-f5-rereview.test.ts`
- `supabase/verification/food-catalog-governance-control-plane-deletion-durability-rereview.sql`
- `supabase/verification/food-catalog-governance-control-plane-live-owner-rereview.sql`
- `scripts/test-food-catalog-governance-plan6-final-p1-concurrency.mjs`

The final-P1 concurrency verifier generates its account-deletion job UUID per process and removes it explicitly, preventing cross-verifier fixture collisions from being misclassified as concurrency failures.

## P1-F5 — member-authored identifying claim privacy

Member correction-report `p_claim_key` is no longer copied into durable global Case identity. Member-authored claim text, description, and submitted evidence are stored only in `food_catalog_correction_report_member_payloads`, which is member-owned purgeable data. The durable Correction Case instead receives a server-generated non-personal `member-report:<case UUID>` claim identity and issue key.

Canonical Correction Case/report metadata and governed curator evidence can survive account deletion while identifying member-authored claim text is deleted. Stale report submission after deletion processing begins is rejected, and report-submission versus account-purge concurrency proves that member payload cannot resurrect or leak into durable Case/audit/outbox identity.

Permanent verification includes:

- `lib/product/food-catalog-governance-plan6-final-p1-f4-f5-rereview.test.ts`
- `supabase/verification/food-catalog-governance-control-plane-report-privacy-rereview.sql`
- `scripts/test-food-catalog-governance-plan6-final-p1-concurrency.mjs`

## Registered database verification

`scripts/run-database-verification.mjs` permanently registers the Plan 6 rollback verifiers and both distinct-session Plan 6 concurrency harnesses. The P1-F4/P1-F5 finalizer verified chronological migration replay, database lint, registered database verification, both Plan 6 concurrency suites, migration-ledger validation, Plan 4 immutability, lint, and typecheck before creating the permanent product commit.

## Migration ledger boundary

The repository ledger intentionally remains fail-closed while Plan 6 is pending: `pendingCount = 1`, `unresolvedCount = 1`, and `historyRepair.state = pending`. The pending Plan 6 entry contains no applied-evidence tuple (`evidenceCommit`, `repositorySha256`, or `repositoryGitBlob`) and must not be reconciled as applied before an independently authorized post-merge Production migration action.

This documentation commit exists solely to establish a human-authored exact PR head for the repository's canonical pull-request workflows after the permanent P1-F4/P1-F5 product commit was created by GitHub Actions.