# Plaivra architecture and migration state

Current product, platform, security, and domain authority remains in the focused documents linked from the repository `README.md`. This file records the migration-chain state required by release preflight and does not replace those documents.

## Production baseline

Production project `bkwezjxvapaeasfvlhvv` is reconciled through:

```text
20260719094718_muscle_intelligence_phase4b_advanced_mappings_part_06.sql
```

There are 53 applied repository migrations, with no pending or unresolved migration entry. The release compatibility marker remains `20260717051011`; physical schema advancement and compatibility-marker advancement are intentionally separate operations.

## Applied Phase 4B migration chain

The reviewed Phase 4B chain was applied exactly once in this order:

```text
20260719094159_muscle_intelligence_phase4b_advanced_mappings_part_01.sql
20260719094350_muscle_intelligence_phase4b_advanced_mappings_part_02.sql
20260719094445_muscle_intelligence_phase4b_advanced_mappings_part_03.sql
20260719094536_muscle_intelligence_phase4b_advanced_mappings_part_04.sql
20260719094623_muscle_intelligence_phase4b_advanced_mappings_part_05.sql
20260719094718_muscle_intelligence_phase4b_advanced_mappings_part_06.sql
```

Production verification confirms 60 preserved published V1 mappings, 60 reviewed published V2 mappings, 453 V2 regional entries, zero checksum drift, zero custom or non-curated V2 publication, and zero V2 workout-session snapshots.

Phase 4B does not authorize:

- custom-exercise V2 publication;
- V2 workout-session snapshot cutover;
- Active Workout, completion, or history integration;
- compatibility-marker advancement;
- deployment, merge, or Phase 4C work.

The machine-readable authority is `supabase/migration-ledger.json`. The executable production verification is `supabase/verification/muscle-intelligence-phase4b.sql`.
