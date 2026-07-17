# Muscle Intelligence Phase 2 curated registry

## Scope and authority

- Starting `main`: `99df1c97d7acbd7ab77c597cd859533d20ad9981`
- Implementation branch: `feat/muscle-intelligence-phase2-curated-registry`
- Reviewed migration-source head: `9b3006c1a512512bee8c16a4fb2ae34a16b7b7f6`
- Machine authority: `data/muscle-intelligence/v1/registry.json`
- Decision context: `data/muscle-intelligence/v1/CURATION.md`
- Registry SHA-256: `892a3aa65692eaa8e053617f33c7a4c66f90df234ab9126884de1c8f7c4020aa`
- Merge, compatibility-marker advancement, deployment, and later-phase work remain separate operations.

## Implemented decision

Phase 2 adds the exact approved cohort of 60 canonical global exercises, 180 EN/DE/AR localizations, 180 controlled aliases, 32 reviewed relationships, 21 research sources, 89 mapping-evidence references, 60 internal reviews, nine exact provider identity links, and 60 version-1 mapping sets containing 180 entries. The other 51 provider decisions remain explicit only in the registry and do not create provider-link rows.

The seed asserts the retired catalog stays empty, rejects pre-existing deterministic identities, preserves non-target and user-owned counts, verifies every database checksum, and publishes each mapping only through `public.publish_exercise_muscle_mapping_set(...)`.

PR #67's compatibility correction keeps omitted preflight mode universally strict (`release`), makes GitHub Quality pass explicit review/release modes, and normalizes curated JSON instruction arrays stored in the legacy exercise text field into ordered readable steps. Provider selection, fallback policy, registry content, and migration bytes were not changed by that correction.

## Production application

The two reviewed migrations were applied to production project `bkwezjxvapaeasfvlhvv` on 2026-07-17 through tracked Supabase CLI `db push` after a dry run listed exactly these files, in order:

- `20260717051008_muscle_intelligence_phase2_curated_schema.sql`
- `20260717051011_muscle_intelligence_phase2_curated_seed.sql`

Supabase production history now contains 37 migrations and ends at `20260717051011_muscle_intelligence_phase2_curated_seed`. Both exact repository versions are recorded once. The Docker warning printed after the remote push concerned optional local migration-catalog caching only; it did not affect the completed remote transaction or migration history.

Direct backup/PITR evidence was not captured in this repository before the manual application. This is an operational evidence gap and must not be rewritten as a passed backup check.

## Production verification

Read-only verification after application confirmed:

- 60 curated exercises;
- 180 localizations;
- 180 aliases;
- 32 relationships;
- 21 research sources;
- 89 mapping-evidence rows;
- 60 mapping reviews;
- 9 exact provider links;
- 60 mapping sets, all published;
- 0 curated draft mappings;
- 180 mapping entries;
- 0 checksum drift;
- 0 alias collision groups;
- 0 duplicate relationship groups;
- all six Phase 2 tables have RLS enabled;
- no anonymous table privileges exist on the six new tables;
- member-readable policies exist only for localizations, aliases, and relationships;
- research, evidence, and review policies remain admin-only;
- retired legacy target rows remain zero in `exercises`, `workouts`, and `exercise_library`.

The nine provider identities match the approved allowlist exactly. The other 51 curated exercises have no provider-link row.

Supabase security advisors introduced no Phase 2 security finding. Performance advisors reported expected non-blocking notices for newly unused indexes and overlapping permissive admin/member SELECT policies on the three member-readable tables. No production correction was made because these are not data-integrity or security blockers for this phase.

## Repository reconciliation

`supabase/migration-ledger.json` now records:

- `productionMigrationCount = 37`;
- `pendingCount = 0`;
- `schemaVerifiedUntrackedCount = 0`;
- `unresolvedCount = 0`;
- `historyRepair.state = reconciled`.

Both Phase 2 entries are immutable applied identities tied to reviewed source head `9b3006c1a512512bee8c16a4fb2ae34a16b7b7f6` and their original Git blobs. Do not replay either migration.

## Security and privacy boundary

- Approved localizations, searchable aliases, and approved relationships are member-readable.
- Research sources, mapping evidence, and internal review rationale remain admin/service-role only.
- Anonymous access is revoked and there is no anonymous mutation path.
- Existing Phase 1 mapping immutability and atomic publication remain authoritative.
- No user-owned table, plan, session, log, custom exercise, or custom mapping was rewritten by the Phase 2 seed.

## Compatibility and release boundary

The production physical schema is now at `20260717051011`, while `public.release_schema_compatibility.migration_version` intentionally remains `20260717032851` for the currently deployed application pair.

Do not update that marker independently. Marker advancement must be coordinated with the exact reviewed merge and production deployment so `/api/version` continues to represent one compatible code/database release pair.

This production application did not:

- merge PR #67;
- mark the PR ready for review;
- update the compatibility marker;
- deploy Vercel;
- change production environment variables;
- start Muscle Intelligence Phase 3 or Phase 4.

## Rollback and follow-up boundary

The applied migrations are now immutable. Any correction requires a separately reviewed forward migration. The next release operation is fresh exact-head CI, strict release preflight, explicit merge authorization, coordinated compatibility-marker handling, exact `main` deployment verification, and smoke acceptance.
