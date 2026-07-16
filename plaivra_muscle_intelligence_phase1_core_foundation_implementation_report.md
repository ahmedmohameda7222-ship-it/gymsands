# Plaivra Muscle Intelligence Phase 1 Core Foundation — Implementation Report

## Source and branch

- Starting `main` SHA: `51eef3386f84a95187aaca59e1519404586bea68`
- Branch: `feat/train-muscle-intelligence-phase1-core`
- Implementation commit SHA: `a92a44f5cb2be9ac919aa34933cbefc003925e60`
- Final branch head SHA: recorded in the PR head and final Codex handoff because a Git commit cannot contain its own SHA
- PR: [#64 — feat(train): add muscle intelligence phase 1 foundation](https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/64) (Draft)

## Product and architecture decision

Phase 1 adds no visible feature and does not change Train runtime behavior. `exercises.id` remains the canonical global exercise identity; `user_custom_exercises.id` remains the owner-scoped custom identity. The 24-muscle taxonomy is code-authoritative, and versioned mappings are separate from exercise definitions. Provider links are non-authoritative aliases and are never inferred or verified by name.

## Files changed

- `README.md`
- `docs/architecture/canonical-domain-model.md`
- `docs/architecture/migration-ledger-reconciliation.md`
- `docs/architecture/decisions/0005-muscle-intelligence-taxonomy-and-mapping-authority.md`
- `lib/privacy/data-export.ts`
- `lib/privacy/data-export.test.ts`
- `lib/product/train-phase2a-architecture.test.ts`
- `lib/product/muscle-intelligence-phase1-migration.test.ts`
- `lib/train/muscle-intelligence/taxonomy.ts`
- `lib/train/muscle-intelligence/contracts.ts`
- `lib/train/muscle-intelligence/versions.ts`
- `lib/train/muscle-intelligence/thresholds.ts`
- `lib/train/muscle-intelligence/checksum.ts`
- `lib/train/muscle-intelligence/calculate-muscle-load.ts`
- `lib/train/muscle-intelligence/index.ts`
- `lib/train/muscle-intelligence/taxonomy.test.ts`
- `lib/train/muscle-intelligence/contracts.test.ts`
- `lib/train/muscle-intelligence/checksum.test.ts`
- `lib/train/muscle-intelligence/calculate-muscle-load.test.ts`
- `supabase/migrations/20260716215602_muscle_intelligence_phase1_foundation.sql`
- `supabase/verification/muscle-intelligence-phase1.sql`
- `supabase/migration-ledger.json`
- `plaivra_muscle_intelligence_phase1_core_foundation_implementation_report.md`

## TypeScript foundation

- Exact ordered 24-muscle registry with English, Arabic, and German labels.
- Strict discrete role, contribution, side-scope, duplicate, and primary-presence validation.
- Stable semantic SHA-256 checksum canonicalized by taxonomy display order then muscle ID.
- Pure `resistance_sets_v1` calculation with planned/completed modes, deterministic completeness, coverage counts, warnings, contribution breakdown, mapping versions, session/weekly thresholds, and long-period weekly averaging.
- Bench Press and Chest Fly fixtures produce the exact required scores; stabilizers remain present with zero direct score.
- Unsupported and unmapped work are reported without fabricated conversions.

## Migration objects

Tables:

- `exercise_provider_links`
- `exercise_muscle_mapping_sets`
- `exercise_muscle_mapping_entries`
- `user_custom_exercise_mapping_sets`
- `user_custom_exercise_mapping_entries`

Publication functions:

- `public.publish_exercise_muscle_mapping_set(uuid)`
- `public.publish_user_custom_exercise_mapping_set(uuid)`

The migration also adds the compatible unique constraint on `user_custom_exercises(id, user_id)`, composite custom ownership FK, one-current-published partial indexes, lookup indexes, lifecycle/entry immutability triggers, deterministic database checksum helpers, and updated-at triggers.

## RLS, grants, and privacy

- All five new tables have RLS enabled and explicit table grants.
- Provider aliases are admin/server controlled and not member-readable in Phase 1.
- Members can read only published global mappings for approved global exercises.
- Global drafts and mutations require current admin authorization; publication functions are restricted to authenticated admins or service-role calls.
- Custom sets and entries are owner-scoped through RLS and the composite ownership FK; cross-owner publication is rejected server-side.
- Publication functions are `SECURITY DEFINER` with empty `search_path`, explicit relation qualification, and revoked `PUBLIC`/`anon` execution.
- Published/retired content is immutable; publication atomically retires the previous current version.
- User exports now include custom mapping sets and entries through stable parent relationships. Global mappings, provider aliases, credentials, secrets, and admin data are excluded.
- Account/custom-exercise deletion reaches custom mappings through verified cascade paths in the authored disposable verification.

## Version constants

- `MUSCLE_TAXONOMY_VERSION = muscle_taxonomy_v1`
- `MUSCLE_MAPPING_SCHEMA_VERSION = exercise_muscle_mapping_v1`
- `MUSCLE_CALCULATION_ENGINE_VERSION = muscle_load_resistance_sets_v1`
- `MUSCLE_THRESHOLD_PROFILE_VERSION = muscle_load_thresholds_v1`
- `MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION = muscle_analysis_result_v1`

## Validation actually run

- Focused Muscle Intelligence + privacy + migration contract tests: passed.
- `npm run lint`: passed with one pre-existing unrelated `exercise-picker-dialog.tsx` hook dependency warning.
- `npm run typecheck`: passed.
- `npm run test:unit`: passed, 152 files / 995 tests.
- `npm run test:integration`: passed, 10 tests; 38 environment-gated tests skipped.
- `npm run test:scripts`: passed, 66 tests.
- `npm run migration:ledger:check`: passed with 33 applied, 1 pending, 0 schema-untracked, 1 unresolved; release-ready false.
- `npm run build`: passed; Next.js production compilation and 91 static pages completed.
- `git diff --check`: passed.

## Safe-database verification

- Connected Plaivra production metadata was queried read-only before implementation. It confirmed the five proposed tables were absent and the canonical exercise/custom-exercise columns and policies matched the approved baseline. No user rows were queried.
- The migration was not applied to production.
- `supabase/verification/muscle-intelligence-phase1.sql` was not executed because the disposable local Supabase database was unavailable: Docker was not running (`//./pipe/docker_engine` not found).
- No paid development branch was created and no hosted database was mutated.

## Known limitations and remaining gate

- The migration and destructive verification SQL have strong static contract coverage but still require execution on a clean disposable local/development database before database approval.
- The migration ledger intentionally classifies `20260716215602_muscle_intelligence_phase1_foundation.sql` as `pending`; repository release readiness remains false.
- Phase 1 does not persist analysis output or historical mapping snapshots.
- No trusted exercise mappings are seeded.

## Out of scope preserved

No UI, body SVG, heat map, builder/library filters, plan/session lifecycle changes, writer cutover, ChatGPT actions, notifications, offline storage, reports, provider imports, legacy deletion, dependency upgrades, or Phase 2 work were implemented.

## Production and deployment status

- Production migration: **not applied**
- Deployment: **not performed**
- Merge: **not performed**
- Final Git status: clean after the report metadata commit and push; exact branch head verified in the PR and final handoff
