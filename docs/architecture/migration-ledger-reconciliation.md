# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Evidence captured:** 2026-08-28T19:34:31.343591Z
**Machine authority:** `supabase/migration-ledger.json`
**Audit baseline:** `dfa14c3bc2c1524ff185b1ee4e170f4537a80230`
**Status:** Production migration history reconciled through the latest applied identity; no repository migration remains pending or unresolved

This document records migration identity and verification. It does not independently authorize merge, deployment, compatibility-marker promotion, or migration replay.

## Current state

- Physical Production migration records: **111**
- Exact applications (`state = applied`): **63**
- Repository-only pending migrations: **0**
- `pendingCount = 0`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 0`
- `historyRepair.state = reconciled`
- `release_ready = true` for the migration-ledger authority; merge, application deployment, compatibility-marker promotion, and Product Owner approval remain separate gates
- Released compatibility marker: `20260724232734`
- Latest physical Production record: `20260828193416_nutrition_v1_meal_plan_mutation_idempotency`
- Activity Catalog Production remains isolated from the Main migration ledger

Production migration history is reconciled through `20260828193416_nutrition_v1_meal_plan_mutation_idempotency`. The six previously pending non-Nutrition repository migrations were applied exactly once on 2026-08-21 under generated aliases. Eight authorized Nutrition V1 migrations were applied exactly once on 2026-08-27. The five final closure migrations were applied on 2026-08-28, followed by the bounded Meal Plan final-review correction under canonical generated identity `20260828100730_nutrition_v1_meal_plan_week_atomicity`, the bounded Recipe Working Draft revision correction under generated identity `20260828112951_nutrition_v1_recipe_draft_revision`, the Recipe Draft graph-identity correction under generated identity `20260828170752_nutrition_v1_recipe_draft_graph_identity`, the atomic/idempotent Food-to-New-Recipe preseed correction under generated identity `20260828181729_nutrition_v1_recipe_preseed_idempotency`, and the durable Meal Plan mutation replay correction under generated identity `20260828193416_nutrition_v1_meal_plan_mutation_idempotency`.

During the final Meal Plan application, a concurrent duplicate execution produced later migration-history identity `20260828100735_nutrition_v1_meal_plan_week_atomicity`. Both stored statements were verified byte-equivalent and the migration itself is schema-idempotent: it performs a read-only precondition, `CREATE OR REPLACE` functions, grants/revokes, and trigger replacement without application-row DML. The redundant later history row was therefore removed by a guarded metadata-only repair that first required exactly two matching records and exact statement equality. The canonical first identity `20260828100730` remains immutable. The later Recipe revision, graph-identity, preseed-idempotency, and Meal Plan mutation-idempotency migrations were subsequently applied exactly once, so Production now contains exactly 111 migration records. No application data or schema authority was rolled back by the history repair. Do not replay these migrations.

Repository migration filenames remain immutable; generated Production identities are recorded below and in the machine ledger. Physical schema advancement and compatibility-marker promotion remain separate release operations. These migration applications did not deploy application code, merge PR #152, modify Activity Catalog Production, or promote the released compatibility marker.

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

## 2026-08-28 final Nutrition corrections — applied

| Immutable repository migration | Generated Production identity | Applied | State |
|---|---|---|---|
| `20260828032000_nutrition_v1_final_architecture_corrections.sql` | `20260828091053_nutrition_v1_final_architecture_corrections` | `2026-08-28` | `applied_version_alias` |
| `20260828032100_nutrition_v1_cooking_command_authority.sql` | `20260828091108_nutrition_v1_cooking_command_authority` | `2026-08-28` | `applied_version_alias` |
| `20260828032200_nutrition_v1_final_closure.sql` | `20260828091147_nutrition_v1_final_closure` | `2026-08-28` | `applied_version_alias` |
| `20260828032300_nutrition_v1_timer_instance_identity.sql` | `20260828091159_nutrition_v1_timer_instance_identity` | `2026-08-28` | `applied_version_alias` |
| `20260828032400_nutrition_v1_working_draft_command.sql` | `20260828091228_nutrition_v1_working_draft_command` | `2026-08-28` | `applied_version_alias` |
| `20260828032500_nutrition_v1_meal_plan_week_atomicity.sql` | `20260828100730_nutrition_v1_meal_plan_week_atomicity` | `2026-08-28` | `applied_version_alias` |
| `20260828032600_nutrition_v1_recipe_draft_revision.sql` | `20260828112951_nutrition_v1_recipe_draft_revision` | `2026-08-28` | `applied_version_alias` |
| `20260828170500_nutrition_v1_recipe_draft_graph_identity.sql` | `20260828170752_nutrition_v1_recipe_draft_graph_identity` | `2026-08-28` | `applied_version_alias` |
| `20260828180000_nutrition_v1_recipe_preseed_idempotency.sql` | `20260828181729_nutrition_v1_recipe_preseed_idempotency` | `2026-08-28` | `applied_version_alias` |
| `20260828210000_nutrition_v1_meal_plan_mutation_idempotency.sql` | `20260828193416_nutrition_v1_meal_plan_mutation_idempotency` | `2026-08-28` | `applied_version_alias` |

Production verification for the Meal Plan final-review correction confirmed:

- exactly one canonical migration-history record remains for `nutrition_v1_meal_plan_week_atomicity`;
- the planned-occurrence week-date trigger is installed and active;
- `public.mutate_nutrition_meal_plan_week(uuid,bigint,jsonb)` exists as `SECURITY DEFINER` with fixed `search_path = pg_catalog, public`;
- `authenticated` and `service_role` can execute the command while `anon` cannot;
- no existing planned occurrence is outside the seven-day interval of its persisted week;
- disposable verification proves lazy week creation plus the first meaningful mutation commit atomically, a failed first mutation leaves no orphan week, and direct cross-week date writes are rejected.

Production verification for the durable Meal Plan mutation-replay correction confirmed:

- `private.nutrition_meal_plan_mutation_operations` exists as the owner-scoped private replay authority;
- `authenticated` has no direct `SELECT`, `INSERT`, `UPDATE`, or `DELETE` access to that ledger;
- `public.mutate_nutrition_meal_plan_week(uuid,bigint,jsonb)` retains the existing authenticated command surface while anonymous execution remains denied;
- the command validates an opaque UUID operation identity, locks the owner/operation namespace, and checks an exact request hash before the normal Meal Plan CAS path;
- an identical ambiguous retry returns the original committed result before stale-revision evaluation and does not advance the week revision twice;
- reuse of one operation ID with different input is rejected;
- failed mutations leave no operation row, occurrence residue, or revision advancement;
- operation identity is owner-scoped, so another member cannot observe or replay another owner's command;
- disposable chronological replay, database lint, and the full database verification suite were green before Production application;
- the repository migration is recorded exactly once in Production as generated identity `20260828193416_nutrition_v1_meal_plan_mutation_idempotency` and must not be replayed.

Production verification for the Recipe Working Draft revision correction confirmed:

- `public.nutrition_recipe_drafts.revision` is `bigint NOT NULL DEFAULT 0` with the nonnegative revision constraint present and no invalid existing rows;
- `public.autosave_nutrition_recipe_draft(uuid,bigint,jsonb,jsonb,jsonb,jsonb)` exists as `SECURITY DEFINER` with fixed `search_path = pg_catalog, public` and derives owner identity from `auth.uid()`;
- `authenticated` and `service_role` can execute the revision-aware command while `anon` cannot;
- the retired unversioned `public.autosave_nutrition_recipe_draft(uuid,jsonb,jsonb,jsonb,jsonb)` signature is absent;
- disposable verification proves a valid save advances revision atomically, a stale expected revision is rejected without replacing canonical draft state, a later valid save can advance the new revision, and cross-owner autosave is rejected.

Production verification for Recipe Draft graph identity confirmed:

- the graph-aware autosave preserves stable ingredient, action, and equipment identities across full Draft replacement;
- action dependencies and ingredient/equipment references are remapped against preserved child identities instead of dangling after autosave;
- structured action fields remain round-trippable through the Working Draft editor and command path;
- the repository migration is recorded exactly once in Production as generated identity `20260828170752_nutrition_v1_recipe_draft_graph_identity` and must not be replayed.

Production verification for atomic/idempotent Food-to-New-Recipe preseed confirmed:

- `private.nutrition_recipe_creation_operations` exists as the owner-scoped replay ledger;
- `public.create_preseeded_nutrition_recipe_draft(uuid,jsonb)` exists and commits the Recipe root, Working Draft, first ingredient, and replay identity in one database transaction;
- `authenticated` and `service_role` can execute the command while `anon` cannot;
- direct RPC calls reject unavailable catalog foods and another member's custom Food rather than relying only on route-level ownership checks;
- same-owner retries with the same operation ID and identical input converge on the original Recipe/Draft result, while reusing the operation ID with different input is rejected;
- disposable migration replay, database lint, database verification, and exact-head unit verification passed before Production application;
- the repository migration is recorded exactly once in Production as generated identity `20260828181729_nutrition_v1_recipe_preseed_idempotency` and must not be replayed.

The previously applied final migrations retain their verified Food Library trigram indexes, Cooking/Saved Meal/Recipe RPCs, Recipe cover owner constraint, Cooking command privilege revocations, removal of obsolete write policies, timer instance-identity correction, Working Draft command, Meal Plan atomicity correction, Recipe Working Draft revision CAS, structured graph identity, atomic/idempotent new-Recipe preseed authority, and durable Meal Plan operation replay. Supabase advisor warnings remain generic/pre-existing or expected for the bounded command/index architecture and did not establish a new Nutrition V1 blocker.

The released compatibility marker remains `20260724232734`. No application deployment, PR merge, compatibility-marker promotion, or Activity Catalog Production mutation occurred as part of these migration applications or the metadata-only history repair.

## Authority and verification

Use these current sources:

- `supabase/migration-ledger.json`
- immutable files under `supabase/migrations/`
- executable contracts under `supabase/verification/`
- `scripts/check-migration-ledger.mjs`
- Production `/api/version`
- Vercel Production deployment identity and runtime logs
- exact-head Quality and release workflow artifacts
