# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Evidence captured:** 2026-08-03T18:10:27.000Z
**Machine authority:** `supabase/migration-ledger.json`
**Audit baseline:** `92d936bc513af83fff41913477a8148a9ab5b845`
**Status:** Applied Production history reconciled; two repository migrations intentionally pending

This document records migration identity and verification. It does not independently authorize merge, deployment, compatibility-marker promotion, or migration replay.

## Current state

- Physical Production migration records: **87**
- Exact applications (`state = applied`): **63**
- Repository-only pending migrations: **2**
- `pendingCount = 2`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 2`
- `historyRepair.state = pending`
- `release_ready = false` while the repository migrations remain intentionally pending
- Released compatibility marker: `20260724232734`
- Latest physical Production record: `20260804180932_fix_profiles_update_policy_recursion`
- Activity Catalog Production remains isolated from the Main migration ledger

The previously applied Plaivra Production migration history remains reconciled through `20260804180932_fix_profiles_update_policy_recursion`. P10F migration `20260811234000_p10f_v2_plan_activity_catalog_authority_snapshot.sql` and Exercise Detail + Personal Records migration `20260813042754_exercise_detail_personal_records_authority.sql` are intentionally classified `pending`. Neither has been applied to Production, neither claims a Production identity, and neither may be replayed or applied before explicit Planner approval.

Physical schema advancement and compatibility-marker promotion remain separate release operations. The pending P10F repository state does not authorize Production migration application, application deployment, or compatibility-marker promotion.

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
- Plaivra Production now has **87** physical migration records and the latest physical record is `20260804180932_fix_profiles_update_policy_recursion`.
- The compatibility marker remained unchanged and Activity Catalog was not modified.

## P10F pending migration authority

- `20260811234000_p10f_v2_plan_activity_catalog_authority_snapshot.sql` is the single Planner-authorized narrow Main schema addition for P10F Stage A.
- Ledger state: `pending`; Production version/name: intentionally absent.
- No historical rows are rewritten; the migration remains repository-only until the Planner explicitly approves the merge/cutover sequence.
- Do not replay or apply the P10F migration before that approval.

## Exercise Detail + Personal Records pending migration authority

- `20260813042754_exercise_detail_personal_records_authority.sql` is the additive Main schema authority for Exercise Detail + Personal Records.
- Ledger state: `pending`; Production version/name: intentionally absent.
- It preserves historical Verified events while adding versioned semantics, owner-scoped Manual records, and guarded atomic Add-to-plan authority.
- Do not replay or apply this migration before explicit Planner approval of the phase merge/release sequence.

## Workout History redesign pending migration authority

- `20260813071926_workout_history_redesign_read_contract.sql` is the additive owner-scoped read authority for first-page period context and global-history existence.
- Ledger state: `pending`; Production version/name: intentionally absent.
- It does not rewrite historical data and was not applied to Plaivra Production.
- Do not replay or apply it before explicit Planner approval of the Workout History redesign merge/release sequence.

## Authority and verification

Use these current sources:

- `supabase/migration-ledger.json`
- immutable files under `supabase/migrations/`
- executable contracts under `supabase/verification/`
- `scripts/check-migration-ledger.mjs`
- Production `/api/version`
- Vercel Production deployment identity and runtime logs
- exact-head Quality and release workflow artifacts
