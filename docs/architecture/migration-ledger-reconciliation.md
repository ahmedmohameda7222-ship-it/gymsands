# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`

**Machine-readable authority:** [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json)

**Current state:** production is reconciled through Phase 4A; six Phase 4B migrations are pending review and application.

This document records migration-history evidence. It is not authorization to replay migrations, merge, deploy, promote, or change the release compatibility marker. Applied migrations and production identities are immutable.

## Verified production baseline

Before Phase 4B application:

- applied production migrations: 47;
- latest applied migration: `20260719000336_muscle_intelligence_phase4a_required_corrections.sql`;
- schema-applied untracked migrations: 0;
- compatibility marker: `20260717051011`;
- published curated V1 mappings: 60;
- published global V2 mappings: 0;
- published custom V2 mappings: 0;
- V2 workout-session snapshots: 0.

The Phase 4A entries remain immutable and must not be replayed:

```text
20260718214000_muscle_intelligence_phase4a_advanced_atlas_foundation.sql
20260719000336_muscle_intelligence_phase4a_required_corrections.sql
```

## Pending Phase 4B chain

The following forward-only migrations are classified as pending until exact production history and post-application verification are captured:

```text
20260719210001_muscle_intelligence_phase4b_advanced_mappings_part_01.sql
20260719210002_muscle_intelligence_phase4b_advanced_mappings_part_02.sql
20260719210003_muscle_intelligence_phase4b_advanced_mappings_part_03.sql
20260719210004_muscle_intelligence_phase4b_advanced_mappings_part_04.sql
20260719210005_muscle_intelligence_phase4b_advanced_mappings_part_05.sql
20260719210006_muscle_intelligence_phase4b_advanced_mappings_part_06.sql
```

These migrations must be applied in filename order. They publish reviewed `exercise_muscle_mapping_v2` records for the existing 60 curated exercises while preserving the 60 published V1 mappings. They do not authorize custom V2 mappings, V2 session-snapshot cutover, compatibility-marker advancement, or runtime deployment.

## Required post-application verification

Before the ledger may return to `historyRepair.state = reconciled`, evidence must confirm:

```text
published curated V1 mappings = 60
published reviewed V2 mappings = 60
published reviewed V2 entries = 453
V2 checksum drift = 0
custom V2 mappings = 0
V2 workout-session snapshots = 0
compatibility marker = 20260717051011
temporary Phase 4B publication helper = absent
```

The executable authority is:

- `supabase/verification/muscle-intelligence-phase4b.sql`;
- `lib/product/muscle-intelligence-phase4b.test.ts`;
- `lib/train/muscle-intelligence/advanced-mapping-registry.test.ts`;
- full clean migration-chain replay in GitHub Quality;
- read-only production verification after application.

## Release boundary

Until production application and ledger reconciliation are complete:

- the six Phase 4B migrations remain pending;
- PR #71 remains Draft and unmerged;
- no deployment is authorized;
- no compatibility-marker change is authorized;
- no Active Workout, Workout Completion, history, Phase 4C, or V2 snapshot cutover is authorized.

Do not replay any migration already recorded as applied.
