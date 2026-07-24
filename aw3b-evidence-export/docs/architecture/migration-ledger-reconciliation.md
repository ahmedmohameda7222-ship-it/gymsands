# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`

**Verified production state:** 2026-07-22

**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)

**Status:** **Production reconciled through generated record `20260722232817`; all three AW-3B migrations are applied**

This document records verified production migration history. It is not authorization to replay migrations, deploy, promote, change compatibility markers, or merge. Applied migration files and production identities are immutable.

## Current production and ledger state

- Actual production migration records: 70
- Ledger exact-applied rows (`state = applied`): 63
- Ledger version-alias rows (`state = applied_version_alias`): 7
- Latest production migration: `20260722232817_active_workout_aw3b_read_and_payload_corrections` (immutable repository file `20260723010500_active_workout_aw3b_read_and_payload_corrections.sql`)
- `pendingCount = 0`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedCount = 0`
- `historyRepair.state = reconciled`
- Compatibility marker: `20260722161542`
- Ledger-level migration-history release readiness: true

## Applied AW-3B structured-set chain

```text
Repository 20260722210312_active_workout_aw3b_structured_set_details.sql
Production 20260722223426_active_workout_aw3b_structured_set_details
Git blob   8843c1dd46369501c771e34f4324e793b04edb01
SHA-256    22ea89a6c63356b8e5b3040076a4268f88dde8059dd21798659d6978859238ff

Repository 20260722224500_active_workout_aw3b_production_hardening.sql
Production 20260722224246_active_workout_aw3b_production_hardening
Git blob   c41892195a25e21e35c3fede1ce8e696fc99eaa4
SHA-256    19bdbaad1bd80318e5893f4c80d6a9b037816b6ebed2480c2ed5574ce74409a3

Repository 20260723010500_active_workout_aw3b_read_and_payload_corrections.sql
Production 20260722232817_active_workout_aw3b_read_and_payload_corrections
Git blob   e585dda90f2f25cea76b975476144982899c9502
SHA-256    4847061819b8f19cdcaf2cf0023eb44d0e3ecfaaef2de298926bff8fe07fb6f
```

The first migration normalizes owner-bound set details, multi-stage segments, segment metrics, conservative legacy tokens, and atomic write/timeline behavior. The second forward migration adds FK-supporting indexes and enables authenticated-read RLS on the shared metric-definition registry. The third makes the detail relationship exactly one-to-one for PostgREST, caches owner-policy identity checks, bounds public payload and total session logs, reserves backfill provenance, and reloads the API schema cache. Production verification confirmed 15 exact backfilled detail rows, 16 removed metadata tokens, zero ownership violations, an object-shaped live Data API relation, unchanged AW-3A metric/timeline hashes, no test-fixture residue, and an unchanged compatibility marker. All three files and generated Production identities are immutable and must not be replayed.

## Applied Muscle Intelligence Phase 4C.1 chain

```text
20260719223000_muscle_intelligence_phase4c1_runtime_v2_cutover.sql
20260719223010_muscle_intelligence_phase4c1_snapshot_support.sql
20260719223020_muscle_intelligence_phase4c1_v2_snapshot_freeze.sql
20260719223030_muscle_intelligence_phase4c1_direct_session_v2.sql
20260719223040_muscle_intelligence_phase4c1_replacement_v2.sql
20260719223050_muscle_intelligence_phase4c1_terminal_reconcile_v2.sql
20260719223100_muscle_intelligence_phase4c1_terminal_history_guard.sql
20260719223200_muscle_intelligence_phase4c1_set_type_refresh.sql
20260719223300_muscle_intelligence_phase4c1_trusted_log_cleanup.sql
```

These migrations were applied exactly once through the supported Supabase migration authority. Their local filenames now match production migration history. Do not replay or modify them.

The applied, ordered chain:

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
20260722232817
```

Deployed compatibility marker:

```text
version = 2
migration_version = 20260722161542
```

The difference is intentional. AW-3B schema is applied, while the marker remains on released AW-3A until coordinated AW-3B release closure.

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

AW-3B PR merge, deployment, compatibility-marker advancement, and later execution units remain separate release-closure decisions.

## Applied AW-2A execution-state migrations

### Immutable base migration

- Repository file: `20260720213000_active_workout_aw2a_execution_state.sql`
- Repository SHA-256: `c8f21655226d51a2157fa1b8c272edc5fac1f84f0a2214376a16e225a1f04f2e`
- Production record: `20260721000544_active_workout_aw2a_execution_state`
- Ledger state: `applied_version_alias`; the repository version differs from the generated production timestamp while the reviewed SQL remains immutable.
- Applied exactly once to Plaivra Database through the supported migration authority.
- Backfilled the one existing open workout session, left terminal sessions without execution state, and preserved compatibility marker `20260717051011`.
- Do not replay, rename, or modify either immutable identity.

### Forward-only correction migration

- Repository file and production record: `20260721012814_active_workout_aw2a_execution_state_corrections.sql`
- SHA-256: `b79920d0f9155b0c076d602b10924846409efdac54a485333242a03bbd5e5e18`
- Ledger state: exact `applied`.
- Applied exactly once to Plaivra Database.
- Adds the partial covering index `workout_session_execution_states_active_snapshot_item_idx` on non-null `active_snapshot_item_id` values.
- Leaves the compatibility marker at `20260717051011` and preserves all workout sessions, logs, snapshots, and execution-state rows.
- The Supabase performance advisor no longer reports `workout_session_execution_states_active_snapshot_item_id_fkey` as unindexed. Unrelated pre-existing advisor findings remain outside AW-2A scope.
- Do not replay or modify the applied correction migration.

## Production-count interpretation

The physical production history contains **70 records**. The machine ledger intentionally reports `productionMigrationCount = 63` because that field counts only exact `state = applied` rows. Seven generated production identities are represented by immutable version aliases. Therefore:

```text
63 exact-applied + 7 version-alias = 70 actual production records
```

This is deliberate reconciliation behavior, not drift. `scripts/check-migration-ledger.mjs` remains strict and unchanged.

AW-3B post-apply correction `supabase/migrations/20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql` is committed and pending one authorized Plaivra Database application; do not replay any applied migration.
