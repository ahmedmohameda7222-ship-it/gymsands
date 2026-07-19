# Plaivra architecture and migration state

Current product, platform, security, and domain authority remains in the focused documents linked from the repository `README.md`. This file records the migration-chain state required by the release preflight and does not replace those focused architecture documents.

## Production baseline

Production project `bkwezjxvapaeasfvlhvv` is reconciled through:

```text
20260719000336_muscle_intelligence_phase4a_required_corrections.sql
```

The release compatibility marker remains `20260717051011`. Physical schema advancement and compatibility-marker advancement are intentionally separate operations.

## Pending Phase 4B migration chain

The following six forward-only migrations are pending exact production application and verification on Draft PR #71:

```text
20260719210001_muscle_intelligence_phase4b_advanced_mappings_part_01.sql
20260719210002_muscle_intelligence_phase4b_advanced_mappings_part_02.sql
20260719210003_muscle_intelligence_phase4b_advanced_mappings_part_03.sql
20260719210004_muscle_intelligence_phase4b_advanced_mappings_part_04.sql
20260719210005_muscle_intelligence_phase4b_advanced_mappings_part_05.sql
20260719210006_muscle_intelligence_phase4b_advanced_mappings_part_06.sql
```

They must be applied in filename order. Their scope is limited to publishing the reviewed global `exercise_muscle_mapping_v2` records for the existing 60 curated exercises while preserving all V1 mappings.

They do not authorize:

- custom-exercise V2 publication;
- V2 workout-session snapshot cutover;
- Active Workout, completion, or history integration;
- compatibility-marker advancement;
- deployment, merge, or Phase 4C work.

The machine-readable state is `supabase/migration-ledger.json`. The executable verification is `supabase/verification/muscle-intelligence-phase4b.sql`.
