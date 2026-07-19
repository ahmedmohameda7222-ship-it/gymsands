# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`

**Verified production state:** 2026-07-19

**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)

**Status:** **Production is reconciled through `20260719094718`; four Phase 4C.1 repository migrations are pending and unapplied**

This document records verified production migration history and pending repository migrations. It is not authorization to replay migrations, apply pending migrations, deploy, promote, change compatibility markers, or merge. Applied migration files and production identities are immutable.

## Current production and ledger state

- Applied production migrations: 53
- Latest production migration: `20260719094718_muscle_intelligence_phase4b_advanced_mappings_part_06`
- `pendingCount = 4`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedCount = 4`
- `historyRepair.state = pending`
- Compatibility marker: `20260717051011`
- Ledger-level migration-history release readiness: false until the pending Phase 4C.1 chain is explicitly handled

Production itself remains unchanged. The pending state describes repository files that have not been applied.

## Pending Muscle Intelligence Phase 4C.1 chain

```text
20260719223000_muscle_intelligence_phase4c1_runtime_v2_cutover.sql
20260719223100_muscle_intelligence_phase4c1_terminal_history_guard.sql
20260719223200_muscle_intelligence_phase4c1_set_type_refresh.sql
20260719223300_muscle_intelligence_phase4c1_trusted_log_cleanup.sql
```

These migrations are classified as `pending` because they exist in the Draft Phase 4C.1 implementation but are absent from production migration history. They must not be applied, repaired as applied, merged, or deployed without explicit coordinated authorization. Do not replay any already-applied migration.

The pending chain is designed to:

- preserve every existing V1 workout-session snapshot unchanged;
- freeze V2 mappings only for newly started sessions after cutover;
- add structured set types and exclude warm-up sets from qualifying performed workload;
- freeze performed total and qualifying set counts at terminal completion;
- prevent ordinary mutation or deletion of terminal workout history;
- keep the deployed compatibility marker unchanged during implementation.

## Applied Muscle Intelligence Phase 4B chain

The reviewed advanced mapping population was applied exactly once in this order:

```text
20260719094159_muscle_intelligence_phase4b_advanced_mappings_part_01
20260719094350_muscle_intelligence_phase4b_advanced_mappings_part_02
20260719094445_muscle_intelligence_phase4b_advanced_mappings_part_03
20260719094536_muscle_intelligence_phase4b_advanced_mappings_part_04
20260719094623_muscle_intelligence_phase4b_advanced_mappings_part_05
20260719094718_muscle_intelligence_phase4b_advanced_mappings_part_06
```

The exact local migration filenames match the production migration identities. They were applied through the supported Supabase migration operation. Do not replay or modify them.

Exact Git blobs and SHA-256 digests:

```text
20260719094159  d20171efa0288b8a47165012e1a7aaab1fcdf151  fe98714aec5ffa02188542b4bcc459cc52b94cd0fddedf22e65a059899adb5a6
20260719094350  8130fe22f6e77f2f054a6f856aab0e484ce7eaf8  b8d3dc3bcc0406b32cb382f0d1f36078df649547b1d35b196ff5c79980d16b48
20260719094445  80b3b9469009386be100c29478d1683a9ede9fdf  bbf00a901497767a9a8fd74bc9a2738fa04364c19650caff9b35f262af7bc5b7
20260719094536  a11c9242c30df74dcc35d2c51812dc75b065a619  0d9d98eb7040b975e52125684b2da1a29cc0585196650b41ebd8d1cb9ef78c08
20260719094623  b0172ed267254da8f561a3b79054378f3a7ad734  34eb5a0c1dba0abafe3a4ca10242d3a9cfd44e1678ee520f96fc9500529ba15c
20260719094718  aa97772d5c95f1b5dc760584318201a1dfb975db  fca05961a40ddc12d20661c423f66991f81aaf986bc97c21acbbe4249a6537d9
```

## Phase 4B production verification

Read-only verification after the complete chain confirmed:

```text
published curated V1 mappings = 60
published reviewed V2 mappings = 60
published V2 mapping entries = 453
non-curated or unapproved V2 mappings = 0
wrong V2 source rows = 0
V2 checksum drift = 0
duplicate or missing V2 mapping per curated exercise = 0
V2 workout-session snapshots = 0
temporary Phase 4B publication helper exists = false
workout sessions = 9
session snapshots = 9
snapshot items = 29
compatibility marker = 20260717051011
```

The Phase 4B chain published only reviewed `exercise_muscle_mapping_v2` data. It did not cut Active Workout, completion, history, or workout-session snapshots over to V2. It did not publish custom-exercise V2 mappings and did not change the compatibility marker.

## Applied Phase 4A baseline

```text
20260718214000_muscle_intelligence_phase4a_advanced_atlas_foundation
20260719000336_muscle_intelligence_phase4a_required_corrections
```

Phase 4A remains immutable. It established the advanced atlas and schema-isolated V2 publication authority while preserving V1 runtime behavior.

## Applied Phase 3 baseline and corrections

```text
20260717194847_muscle_intelligence_phase3_session_snapshots
20260717202151_muscle_intelligence_phase3_integrity_corrections
20260717215400_muscle_intelligence_phase3_account_deletion_authority
20260717215500_muscle_intelligence_phase3_lifecycle_provider_corrections
20260717215600_muscle_intelligence_phase3_direct_session_authority
20260717215700_muscle_intelligence_phase3_replacement_repair_hardening
20260717215800_muscle_intelligence_phase3_plan_session_start_authority
20260717215900_muscle_intelligence_phase3_set_log_completion_authority
```

The existing owner, privacy, lifecycle, snapshot, and RPC security contracts remain active.

## Compatibility boundary

Physical production migration head:

```text
20260719094718
```

Deployed compatibility marker:

```text
version = 2
migration_version = 20260717051011
```

The difference is intentional. The marker may advance only in a separately authorized coordinated release. Phase 4C.1 does not advance it.

## Verification authority

- `supabase/verification/muscle-intelligence-phase4b.sql`
- `supabase/verification/muscle-intelligence-phase4c1.sql`
- `lib/product/muscle-intelligence-phase4b.test.ts`
- `lib/product/muscle-intelligence-phase4c1.test.ts`
- `lib/product/muscle-intelligence-phase4c1-set-type.test.ts`
- `lib/train/muscle-intelligence/advanced-mapping-registry.test.ts`
- `lib/train/muscle-intelligence/advanced-session-analysis.test.ts`
- full clean migration-chain replay in GitHub Quality
- exact-head production build
- `supabase/migration-ledger.json`

Phase 4C.1 migration apply, PR merge, deployment, compatibility-marker advancement, Phase 4C.2, and Phase 4C.3 remain separate decisions.
