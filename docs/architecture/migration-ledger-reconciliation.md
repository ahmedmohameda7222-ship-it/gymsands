# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Evidence captured:** 2026-08-27T10:53:32.000Z
**Machine authority:** `supabase/migration-ledger.json`
**Audit baseline:** `dfa14c3bc2c1524ff185b1ee4e170f4537a80230`
**Status:** Production history reconciled through the latest applied identity; two repository migrations pending separate Production authorization

This document records migration identity and verification. It does not independently authorize merge, deployment, compatibility-marker promotion, or migration replay.

## Current state

- Physical Production migration records: **101**
- Exact applications (`state = applied`): **63**
- Repository-only pending migrations: **2**
- `pendingCount = 2`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 2`
- `historyRepair.state = pending`
- `release_ready = false` while the two repository migrations remain unapplied; merge/deployment/compatibility-marker authorization remain separate gates
- Released compatibility marker: `20260724232734`
- Latest physical Production record: `20260827105332_nutrition_v1_long_term_architecture_corrections`
- Activity Catalog Production remains isolated from the Main migration ledger

Production migration history is reconciled through `20260827105332_nutrition_v1_long_term_architecture_corrections`. The six previously pending non-Nutrition repository migrations were already applied exactly once on 2026-08-21 under generated aliases, and eight explicitly authorized Nutrition V1 migrations were applied exactly once on 2026-08-27. Repository migration filenames remain immutable; generated Production identities are recorded below and in the machine ledger. Do not replay any applied migration.

Two later Nutrition V1 correction migrations are repository-only and intentionally classified as `pending`. They have **not** been applied to Production. Applying them requires separate explicit Production authorization; their repository presence and successful disposable verification do not constitute application authority.

Physical schema advancement and compatibility-marker promotion remain separate release operations. Prior migration application does not authorize application deployment, merge, or compatibility-marker promotion.

## Workout History applied identities

| Immutable repository migration | Generated Production identity | State |
|---|---|---|
| `20260801140043_workout_history_verified_records.sql` | `20260802113958_workout_history_verified_records` | `applied_version_alias` |
| `20260801160000_workout_history_correction_and_soft_delete.sql` | `20260802114200_workout_history_correction_and_soft_delete` | `applied_version_alias` |
| `20260801180000_workout_history_repeat_session.sql` | `20260802114311_workout_history_repeat_session` | `applied_version_alias` |
| `20260801194500_workout_history_verified_record_authority_hardening.sql` | `20260802114332_workout_history_verified_record_authority_hardening` | `applied_version_alias` |
| `20260801201500_workout_history_verified_record_rebuild.sql` | `20260802114422_workout_history_verified_record_rebuild` | `applied_version_alias` |
| `20260801203000_workout_history_set_detail_patch_semantics.sql` | `20260802114455_workout_history_set_detail_patch_semantics` | `applied_version_alias` |
| `20260801210000_workout_history_correction_muscle_reconcile.sql` | `20260802114534_workout_history_correction_muscle_reconcile` | `applied_version_alias` |
| `20260801220000_workout_history_keyset_read_authority.sql` | `20260802114654_workout_history_keyset_read_authority` | `applied_version_alias` |
| `20260801223000_workout_history_filter_options.sql` | `20260802114733_workout_history_filter_options` | `applied_version_alias` |

All nine migrations were applied exactly once to Plaivra Production on 2026-08-02 through Supabase `apply_migration`. Their immutable repository SQL files must not be edited or replayed.

## PCS-2 applied identity

| Immutable repository migration | Generated Production identity | State |
|---|---|---|
| `20260803152000_private_app_bootstrap_v1.sql` | `20260803173755_private_app_bootstrap_v1` | `applied_version_alias` |

## PCS-2 Production verification

Read-only verification against Plaivra Production proved:

- `public.get_private_app_bootstrap_v1()` exists with zero arguments and returns `jsonb`;
- the function is `STABLE`, uses `SECURITY DEFINER`, and has fixed `search_path = pg_catalog, public`;
- anonymous execution is denied;
- authenticated and service-role execution are allowed;
- `contractVersion = 1`;
- payload `userId` matches `auth.uid()`;
- profile, account-access state, consent facts, onboarding summary, and settings are owner-scoped;
- verification passed for two different authenticated actors;
- no cross-user selector exists;
- the migration was applied exactly once;
- the PCS-2 application itself did not deploy application code;
- Plaivra Activity Catalog remained isolated and unmodified.

## PCS-2 application runtime verification

- Squash merge / Production commit: `92d936bc513af83fff41913477a8148a9ab5b845`
- Vercel deployment: `dpl_DbSrbwJ98HiuZTJQFW7G3hVtkVZy`
- Deployment target and state: `production`, `READY`
- Build timestamp: `2026-08-03T18:07:46.883Z`
- `https://app.plaivra.com/api/version`: HTTP 200
- Runtime commit identity matched the squash-merged `main` commit.
- `schemaCompatibilityVersion = 2`
- `databaseMigrationVersion = 20260724232734`
- `migrationLedgerReconciliationState = reconciled`
- `migrationVersionCompatible = true`
- `migrationLedgerReconciled = true`
- `schemaCompatible = true`
- `https://app.plaivra.com/login`: HTTP 200
- Vercel reported no runtime-error cluster during the post-deployment verification window.

## Prior applied authorities

AW-9 remains represented by repository migration `20260731090000_active_workout_aw9_offline_multi_device.sql` and generated Production identity `20260801045628_active_workout_aw9_offline_multi_device`. AW-4 and earlier generated aliases remain preserved in the machine ledger.

## P0 onboarding Production repair

- `20260804174500_fix_profiles_update_policy_recursion.sql` was applied exactly once to Plaivra Production as generated version `20260804180932_fix_profiles_update_policy_recursion`.
- The repository filename and Production version differ, so the migration ledger preserves the immutable mapping as `applied_version_alias`. Do not replay.
- The compatibility marker remained unchanged and Activity Catalog was not modified.

## 2026-08-27 Production reconciliation

| Immutable repository migration | Generated Production identity | Applied | State |
|---|---|---|---|
| `20260811234000_p10f_v2_plan_activity_catalog_authority_snapshot.sql` | `20260821013625_p10f_v2_plan_activity_catalog_authority_snapshot` | `2026-08-21` | `applied_version_alias` |
| `20260813042754_exercise_detail_personal_records_authority.sql` | `20260821013718_exercise_detail_personal_records_authority` | `2026-08-21` | `applied_version_alias` |
| `20260813071926_workout_history_redesign_read_contract.sql` | `20260821013749_workout_history_redesign_read_contract` | `2026-08-21` | `applied_version_alias` |
| `20260816044500_active_workout_feedback_preferences.sql` | `20260821013757_active_workout_feedback_preferences` | `2026-08-21` | `applied_version_alias` |
| `20260820060000_exercise_detail_setup_notes.sql` | `20260821013814_exercise_detail_setup_notes` | `2026-08-21` | `applied_version_alias` |
| `20260820070000_exercise_alternative_reason_v2.sql` | `20260821013822_exercise_alternative_reason_v2` | `2026-08-21` | `applied_version_alias` |
| `20260825120000_nutrition_v1_reusable_domains.sql` | `20260827071936_nutrition_v1_reusable_domains` | `2026-08-27` | `applied_version_alias` |
| `20260825120100_nutrition_v1_plan_diary_targets.sql` | `20260827072239_nutrition_v1_plan_diary_targets` | `2026-08-27` | `applied_version_alias` |
| `20260825120200_nutrition_v1_cooking_sessions.sql` | `20260827072300_nutrition_v1_cooking_sessions` | `2026-08-27` | `applied_version_alias` |
| `20260825120300_nutrition_v1_food_search_and_curation.sql` | `20260827072316_nutrition_v1_food_search_and_curation` | `2026-08-27` | `applied_version_alias` |
| `20260825120350_nutrition_v1_meal_plan_week_start_authority.sql` | `20260827072351_nutrition_v1_meal_plan_week_start_authority` | `2026-08-27` | `applied_version_alias` |
| `20260825120400_nutrition_v1_privacy_purge_authority.sql` | `20260827072406_nutrition_v1_privacy_purge_authority` | `2026-08-27` | `applied_version_alias` |
| `20260827060000_nutrition_v1_review_atomicity_corrections.sql` | `20260827072417_nutrition_v1_review_atomicity_corrections` | `2026-08-27` | `applied_version_alias` |
| `20260827103000_nutrition_v1_long_term_architecture_corrections.sql` | `20260827105332_nutrition_v1_long_term_architecture_corrections` | `2026-08-27` | `applied_version_alias` |

All fourteen generated identities above are immutable Production history. They must not be replayed. Nutrition V1 schema application did not merge PR #152, deploy application code, or promote the released compatibility marker.

## 2026-08-28 repository-only pending Nutrition corrections

| Repository migration | Production identity | State |
|---|---|---|
| `20260828032000_nutrition_v1_final_architecture_corrections.sql` | Not applied | `pending` |
| `20260828032100_nutrition_v1_cooking_command_authority.sql` | Not applied | `pending` |

Both pending migrations have passed disposable local replay/lint/verification as part of PR #152 validation, but neither has been applied to Production. Do not assign a generated Production identity or change either ledger entry to an applied state unless a separately authorized Production migration operation actually succeeds and its exact resulting identity is captured.

## Authority and verification

Use these current sources:

- `supabase/migration-ledger.json`
- immutable files under `supabase/migrations/`
- executable contracts under `supabase/verification/`
- `scripts/check-migration-ledger.mjs`
- Production `/api/version`
- Vercel Production deployment identity and runtime logs
- exact-head Quality and release workflow artifacts
