# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Current reconciliation date:** 2026-08-30
**Machine authority:** `supabase/migration-ledger.json`
**Status:** Production migration history remains reconciled through the latest applied identity; the repository now contains one intentionally pending Food Catalog Batch 0 migration and no schema-applied-untracked migration

This document is the human-readable current migration authority. Exhaustive immutable repository-to-Production identity mappings live in `supabase/migration-ledger.json`; immutable SQL lives under `supabase/migrations/`; executable verification lives under `supabase/verification/`.

Historical PR descriptions, completed implementation reports, and old audit snapshots are evidence only. They do not override the current state below.

## Current state

The last verified Plaivra Production inspection after the Nutrition V1 squash merge established:

- Physical Production migration records: **113**
- Exact repository-name applications tracked as `state = applied`: **63**
- Latest physical Production record: `20260829093401_nutrition_v1_final_review_corrections`
- Corresponding immutable repository migration: `20260829110000_nutrition_v1_final_review_corrections.sql`
- Released compatibility marker: `20260724232734`
- Activity Catalog Production remains isolated from the Main Plaivra migration ledger

The current repository/machine-ledger state additionally records:

- Repository-only pending migrations: **1**
- Pending migration: `20260830011407_food_catalog_population_readiness.sql`
- `pendingCount = 1`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 1`
- `historyRepair.state = pending`
- migration-ledger `release_ready = false`

`historyRepair.state = pending` here does **not** mean previously applied Production migration history has regressed. It reflects the single new forward repository migration that has deliberately not been applied to Production. The machine-ledger `productionMigrationCount` still counts exact `state = applied` entries; it is not the total number of physical Supabase migration-history records. Physical Production count was last established as 113.

## Food Catalog Batch 0 repository-only pending migration

Repository migration `20260830011407_food_catalog_population_readiness.sql` is classified as `pending` only.

It exists to make the canonical Food Catalog structurally ready for later versioned ingestion. It has **not** been applied to Plaivra Production and must not be represented as applied until a separate Planner/user-approved Production action is executed and reconciled.

Batch 0 repository state preserves these boundaries:

- zero Food population;
- zero Production migration application or other Production database mutation;
- zero provider-specific data import or source adapter execution;
- zero compatibility-marker promotion;
- zero Activity Catalog Production mutation.

The released compatibility marker therefore remains `20260724232734`. Do not replay the pending migration or any previously applied migration.

## Nutrition V1 runtime compatibility baseline

At Nutrition V1 feature closure, Production `/api/version` reported:

- Nutrition V1 feature squash / first verified Production commit: `0efddc0d6969487eb4105fccc02f3b629efbab91`
- `schemaCompatibilityVersion = 2`
- `expectedDatabaseMigrationVersion = 20260724232734`
- `databaseMigrationVersion = 20260724232734`
- `migrationLedgerReconciliationState = reconciled`
- `pendingMigrationCount = 0`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedMigrationCount = 0`
- `migrationVersionCompatible = true`
- `migrationLedgerReconciled = true`
- `schemaCompatible = true`
- `releaseReady = true`

This is the verified Nutrition V1 closure baseline, not a claim about the current repository ledger after the later Food Catalog Batch 0 pending migration. Documentation-only and later product commits can advance both Git and deployed commit identity. Exact current runtime identity must be verified live from GitHub `main`, Vercel, and Production `/api/version`.

Physical schema advancement and compatibility-marker promotion are separate authorities. Nutrition V1 advanced physical schema without changing the released compatibility marker because the deployed runtime remains compatible with marker `20260724232734`.

## Immutable migration rules

- Never rewrite an applied Supabase migration.
- Repository migration filenames remain immutable after application.
- Generated Production identities are recorded as aliases in the machine ledger where Supabase applied a repository migration under a different physical timestamp.
- Do not replay an `applied` or `applied_version_alias` migration.
- An ambiguous apply result must be reconciled read-only against Production history before any retry.
- Migration-history repair is metadata-only and allowed only after proving exact duplicate identity/statement conditions; it must never be used to hide schema or application-data divergence.
- Activity Catalog migrations remain separate from the Main Plaivra migration ledger.

## Workout History generated identities

The nine Workout History migrations were applied exactly once to Plaivra Production on 2026-08-02 under generated aliases. Their immutable mappings remain recorded in `supabase/migration-ledger.json` and must not be replayed.

The current generated Production identities are:

1. `20260802113958_workout_history_verified_records`
2. `20260802114200_workout_history_correction_and_soft_delete`
3. `20260802114311_workout_history_repeat_session`
4. `20260802114332_workout_history_verified_record_authority_hardening`
5. `20260802114422_workout_history_verified_record_rebuild`
6. `20260802114455_workout_history_set_detail_patch_semantics`
7. `20260802114534_workout_history_correction_muscle_reconcile`
8. `20260802114654_workout_history_keyset_read_authority`
9. `20260802114733_workout_history_filter_options`

## PCS-2 generated identity

Repository migration `20260803152000_private_app_bootstrap_v1.sql` was applied exactly once as generated Production identity `20260803173755_private_app_bootstrap_v1`.

The compatibility marker remained unchanged and Activity Catalog was not modified.

## P0 onboarding Production repair

Repository migration `20260804174500_fix_profiles_update_policy_recursion.sql` was applied exactly once as generated Production identity `20260804180932_fix_profiles_update_policy_recursion`.

The repository filename and Production version differ, so the machine ledger preserves the immutable mapping as `applied_version_alias`. Do not replay it.

## 2026-08-21 pre-Nutrition reconciliation

The six previously pending non-Nutrition repository migrations were applied exactly once on 2026-08-21 under generated aliases:

1. `20260821013625_p10f_v2_plan_activity_catalog_authority_snapshot`
2. `20260821013718_exercise_detail_personal_records_authority`
3. `20260821013749_workout_history_redesign_read_contract`
4. `20260821013757_active_workout_feedback_preferences`
5. `20260821013814_exercise_detail_setup_notes`
6. `20260821013822_exercise_alternative_reason_v2`

All mappings remain immutable in the machine ledger.

## Nutrition V1 Production migration authority

Nutrition V1 schema authority is fully applied and reconciled in Plaivra Production.

### Initial Nutrition V1 applications — 2026-08-27

The initial eight Nutrition V1 repository migrations were applied exactly once under generated Production identities:

1. `20260827071936_nutrition_v1_reusable_domains`
2. `20260827072239_nutrition_v1_plan_diary_targets`
3. `20260827072300_nutrition_v1_cooking_sessions`
4. `20260827072316_nutrition_v1_food_search_and_curation`
5. `20260827072351_nutrition_v1_meal_plan_week_start_authority`
6. `20260827072406_nutrition_v1_privacy_purge_authority`
7. `20260827072417_nutrition_v1_review_atomicity_corrections`
8. `20260827105332_nutrition_v1_long_term_architecture_corrections`

### Final Nutrition V1 applications — 2026-08-28 to 2026-08-29

The later forward-only Nutrition V1 corrections are represented by these generated Production identities:

1. `20260828091053_nutrition_v1_final_architecture_corrections`
2. `20260828091108_nutrition_v1_cooking_command_authority`
3. `20260828091147_nutrition_v1_final_closure`
4. `20260828091159_nutrition_v1_timer_instance_identity`
5. `20260828091228_nutrition_v1_working_draft_command`
6. `20260828100730_nutrition_v1_meal_plan_week_atomicity`
7. `20260828112951_nutrition_v1_recipe_draft_revision`
8. `20260828170752_nutrition_v1_recipe_draft_graph_identity`
9. `20260828181729_nutrition_v1_recipe_preseed_idempotency`
10. `20260828193416_nutrition_v1_meal_plan_mutation_idempotency`
11. `20260828220542_nutrition_v1_saved_meal_creation_idempotency`
12. `20260829093401_nutrition_v1_final_review_corrections`

The final identity maps to immutable repository migration `20260829110000_nutrition_v1_final_review_corrections.sql`.

No Nutrition V1 repository migration remains pending or unresolved. The only current pending repository migration is the later Food Catalog Batch 0 readiness migration identified above.

## Meal Plan duplicate-history repair

During application of the Meal Plan atomicity migration, a concurrent duplicate execution briefly produced later history identity `20260828100735_nutrition_v1_meal_plan_week_atomicity` in addition to canonical first identity `20260828100730_nutrition_v1_meal_plan_week_atomicity`.

The two stored statements were verified byte-equivalent. The migration itself was schema-idempotent and contained no application-row DML. A guarded metadata-only repair required exactly two matching migration-history records and exact statement equality before removing only the redundant later history row.

The canonical first identity `20260828100730` remains immutable. No application data or schema authority was rolled back. Do not replay the migration.

## Verified Nutrition V1 database invariants

Disposable chronological replay, database lint, verification SQL, integration tests, and Production read-only checks established the following current invariants.

### Food Library and owner data

- authoritative Food search/index authority exists;
- active-only catalog discovery remains enforced;
- personal corrections and favorites remain owner-scoped;
- authenticated users cannot select another member as owner authority.

### Saved Meal

- root plus item creation is transactional;
- update/replacement is transactional;
- replay-safe creation uses private owner-scoped operation identity;
- identical ambiguous retry converges on the original Saved Meal;
- changed-input operation-ID reuse is rejected;
- failed create leaves no replay-ledger or partial domain residue;
- restore/purge lifecycle remains owner-scoped;
- account deletion explicitly removes the Saved Meal creation replay ledger and verifies no residual rows remain.

### Recipe

- Recipe duplicate commits atomically;
- Working Draft replacement is revision/CAS protected;
- stale Draft revision conflicts without partial graph mutation;
- structured action graph identity and references remain coherent;
- Food-to-New-Recipe preseed is transactional and owner/idempotency protected;
- Recipe cover-path ownership is enforced.

### Cooking

- Cooking commands are owner-derived;
- transaction boundaries protect canonical Cooking state;
- timer identity is per timer instance rather than display-name deduplication;
- concurrent legitimate timers remain representable.

### Meal Plan

- week creation plus first meaningful mutation is atomic;
- occurrence dates stay inside their authoritative week;
- durable private operation replay converges ambiguous retries before stale-revision handling;
- changed-input operation-ID reuse is rejected;
- failed mutation leaves no operation or occurrence residue and does not advance revision.

### Diary and hydration

- grouped Diary writes use replay-safe operation identity;
- planned execution remains separate from intended plan state;
- hydration uses `public.log_nutrition_water(uuid,date,integer)` with owner derived from `auth.uid()`;
- identical hydration retry returns the existing water row;
- reuse of one hydration operation ID with different date/amount is rejected;
- anonymous execution is denied.

### Privacy/account deletion

- Nutrition V1 user-owned domain rows are included in canonical account purge authority;
- private Meal Plan and Saved Meal replay ledgers are included in deletion/reconciliation authority;
- residual-row verification fails closed if owner Nutrition rows remain.

## Nutrition V1 runtime/merge closure

PR #152 was squash-merged into `main` as feature commit `0efddc0d6969487eb4105fccc02f3b629efbab91` after exact-head PR Quality, canonical Quality, Exact Release, and read-only Stage-1 preflight passed.

Vercel Git integration first deployed that exact feature commit to Plaivra Production as `dpl_CsGXokKyNA9HffKtJcVKfL62gTxv`, state `READY`. Production `/api/version` reported the same feature SHA with migration reconciliation healthy and `releaseReady = true` at closure.

Push-triggered Production uptime synthetic run `33250942724` passed after the feature merge. Immediate Vercel runtime-error inspection found no runtime-error cluster.

Later documentation-only or product commits may advance `main` and Vercel Production commit identity. This closure section deliberately preserves the feature baseline rather than pretending it is the permanently current deployment identity.

The Nutrition merge did not promote the released compatibility marker and did not mutate the separate Activity Catalog Production project.

## Authority and verification

Use these current sources in order for migration facts:

1. `supabase/migration-ledger.json` for repository/application identity classification.
2. Immutable files under `supabase/migrations/` for migration bytes.
3. Executable contracts under `supabase/verification/` for database invariants.
4. `scripts/check-migration-ledger.mjs` for ledger validation.
5. Supabase Production migration history for physical applied records.
6. Production `/api/version` for live runtime compatibility and reconciliation state.
7. Vercel Production deployment identity/runtime logs for live deployed application identity.
8. Exact-head Quality/release workflow artifacts for phase-close evidence.

Do not use historical PR descriptions or completed implementation reports as current migration authority.