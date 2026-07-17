# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`

**Verified production state:** 2026-07-17

**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)

**Reconciliation status:** **Production reconciled through Phase 3 integrity; three reviewed Phase 3 corrections pending**

This document records verified production migration history. It is not authorization to replay migration SQL, deploy, promote, update compatibility markers, or merge. Applied migration files and production identities must never be renamed, rewritten, deleted, manually reordered, or replayed.

## Current state

- Supabase migration history contains 39 applied migrations.
- `pendingCount = 3`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedCount = 3`
- `historyRepair.state = pending`
- The latest verified production migration is `20260717202151_muscle_intelligence_phase3_integrity_corrections`.
- Repository and production identities are aligned through that migration.
- Ledger-level migration-history release readiness is false while the reviewed correction files remain pending.
- The production compatibility marker remains `20260717051011` and must not change in this correction task.

## Pending PR #68 forward corrections

The following additive files are reviewed repository migrations but are not yet recorded in production history:

```text
supabase/migrations/20260717215500_muscle_intelligence_phase3_lifecycle_provider_corrections.sql
supabase/migrations/20260717215600_muscle_intelligence_phase3_direct_session_authority.sql
supabase/migrations/20260717215700_muscle_intelligence_phase3_replacement_repair_hardening.sql
```

They must remain classified as `pending` until the clean migration chain and Phase 3 executable verification pass, the exact production project and history are rechecked, and Supabase records each exact identity once. Do not classify them as applied based on repository presence alone.

## Muscle Intelligence Phase 3 applied baseline

`20260717194847_muscle_intelligence_phase3_session_snapshots.sql` was applied transactionally through the Supabase management integration on 2026-07-17 after explicit user authorization. Production history records the exact version and name once. Read-only verification confirmed nine snapshots for nine performed sessions, 29 stable historical items, zero missing snapshots, zero ownership mismatches, RLS on both new tables, no anonymous table/RPC access, no member table mutation grants, and authenticated access only to controlled RPCs. All nine legacy snapshots are explicitly unavailable because no exact historical mapping could be proven; no names were matched. Git blob `865f918091fbb9cf054e170417caaf384c65f049`. Do not replay or modify this migration.

`20260717202151_muscle_intelligence_phase3_integrity_corrections.sql` was then applied as a separate forward-only correction after independent review; the first migration remains byte-immutable. Git blob `af02da43e4d61f9248ad6110b9e58f99cac84560`. It adds cascade-safe FK nullification/deletion for account privacy lifecycle, published-only future mapping selection, active-interval cleanup for existing history, owner-validated reads of retired frozen global mappings, orthogonal terminal performance state, identity-first replacement retry idempotency, and validated mapping bundles. Production postconditions found zero invalid historical mapping intervals and both bundle constraints validated. Do not replay or modify this migration.

## Muscle Intelligence Phase 2

```text
version: 20260717051008
name: muscle_intelligence_phase2_curated_schema
file: supabase/migrations/20260717051008_muscle_intelligence_phase2_curated_schema.sql
Git blob: 628327a9de7983e7ed12f7bddbc164947618deb0

version: 20260717051011
name: muscle_intelligence_phase2_curated_seed
file: supabase/migrations/20260717051011_muscle_intelligence_phase2_curated_seed.sql
Git blob: d3364955cd8ad53eb513c9456addbf9c8ee86fe8
reviewed source head: 9b3006c1a512512bee8c16a4fb2ae34a16b7b7f6
```

The migrations were applied through tracked Supabase CLI `db push` on 2026-07-17 after a dry run listed exactly the schema and seed migrations in order. Production history records both exact repository versions once. Verification confirmed six Phase 2 tables with RLS, no anonymous table privileges, 60 curated exercises, 180 localizations, 180 aliases, 32 relationships, 21 research sources, 89 evidence rows, 60 reviews, nine provider links, 60 published mappings, 180 entries, zero checksum drift, and zero target drafts. Do not replay either migration.

## Compatibility-marker boundary

The physical production migration head is currently:

```text
20260717202151
```

The deployed release compatibility marker remains:

```text
version = 2
migration_version = 20260717051011
```

This difference is intentional. The marker must not advance in PR #68 corrections and may only change in a separately authorized, coordinated release operation with compatible code deployment.

## Earlier applied identities

- `20260717032851_retire_legacy_600_exercise_catalog` remains applied; the retired target rows remain zero.
- `20260716215602_muscle_intelligence_phase1_foundation` remains applied with all five mapping tables and both publication functions.
- `20260715190000_train_phase2a_program_architecture` remains applied from reviewed commit `5851486009f99dc9e7629b8b01f43cd690a3a04b`, Git blob `be4102a5b0e0aaec8926362950742290b94d39c3`.

Any later correction requires a new named forward migration.

## Fail-closed ledger semantics

`scripts/check-migration-ledger.mjs` validates:

- `pendingCount`
- `schemaAppliedUntrackedCount`
- `ledgerDriftReviewCount`
- `unresolvedCount`
- `invalidAppliedProductionIdentityCount`
- `reconciliationState`
- `latestAppliedMigrationVersion`
- `releaseReady`

The ledger-level `releaseReady` value requires reconciled history, no pending or untracked schema work, no unresolved identities, no drift-review items, and valid resolved production identities.

## Verification authority

- `supabase/verification/legacy-600-exercise-catalog-retirement.sql` proves the retired target layers remain empty.
- `supabase/verification/muscle-intelligence-phase2.sql` proves exact curated counts, checksum publication, RLS boundaries, legacy emptiness, and mapping immutability on a disposable database.
- `supabase/verification/muscle-intelligence-phase3-session-snapshots.sql` executes the split Phase 3 lifecycle, direct-session, replacement, privacy, and deletion cases and must reach its final `ROLLBACK`.
- `lib/product/muscle-intelligence-phase3-migration.test.ts` enforces immutable applied identities and truthful pending/applied classification.
- the full clean migration chain must apply every repository migration from zero without modifying historical files.

## Remaining correction work

Before the pending files may be applied:

1. run fresh Phase A and Quality workflows on the exact pending-ledger head;
2. confirm the full clean chain and Phase 3 executable SQL pass;
3. confirm production still has exactly 39 migrations ending at `20260717202151` and no data-count drift;
4. apply only the three exact pending files to project `bkwezjxvapaeasfvlhvv`;
5. independently verify each migration identity once, counts, repair results, ownership, mapping intervals, RLS, privileges, RPC ACLs, fixed search paths, and marker `20260717051011`;
6. reconcile the ledger to the new applied production history;
7. trigger fresh Phase A and Quality workflows on the final documentation/report head.

No merge, compatibility-marker update, deployment, Phase 4 work, or Heat Map UI is authorized.
