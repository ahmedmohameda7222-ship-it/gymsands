# Muscle Intelligence Phase 2 curated registry

## Scope and authority

- Starting `main`: `99df1c97d7acbd7ab77c597cd859533d20ad9981`
- Implementation branch: `feat/muscle-intelligence-phase2-curated-registry`
- Final-correction starting head: `4733126084adb738c86506457a80c8fc382d8573`
- Machine authority: `data/muscle-intelligence/v1/registry.json`
- Decision context: `data/muscle-intelligence/v1/CURATION.md`
- Registry SHA-256: `892a3aa65692eaa8e053617f33c7a4c66f90df234ab9126884de1c8f7c4020aa`
- Production, deployment, merge, and later-phase work are outside this implementation.

## Implemented decision

Phase 2 adds the exact approved cohort of 60 canonical global exercises, 180 EN/DE/AR localizations, 180 controlled aliases, 32 reviewed relationships, 21 research sources, 89 mapping-evidence references, 60 internal reviews, nine exact provider identity links, and 60 version-1 mapping sets containing 180 entries. The other 51 provider decisions remain explicit only in the registry and do not create provider-link rows.

The seed asserts the retired catalog stays empty, rejects pre-existing deterministic identities, preserves non-target and user-owned counts, verifies every database checksum, and publishes each mapping only through `public.publish_exercise_muscle_mapping_set(...)`.

PR #67's final compatibility correction keeps omitted preflight mode universally strict (`release`), makes GitHub Quality pass explicit review/release modes, and normalizes the curated JSON instruction arrays stored in the legacy exercise text field into ordered readable steps. Invalid structured entries are ignored; malformed payloads or arrays with no valid entries preserve the original trimmed legacy text as one step. Provider selection, fallback policy, the registry, and both pending migrations remain unchanged.

## Forward migrations

- `20260717051008_muscle_intelligence_phase2_curated_schema.sql`
- `20260717051011_muscle_intelligence_phase2_curated_seed.sql`

Both are classified as `pending` in `supabase/migration-ledger.json`. Production remains at `20260717032851_retire_legacy_600_exercise_catalog` until a separate authorized application and reconciliation.

## Bounded inspection record

Must-read authority:

- attached implementation prompt;
- attached curated registry JSON;
- attached curation package.
- PR #67 required final corrections prompt.

Search-only areas:

- migration and checksum/publication references under `supabase/`, `lib/train/muscle-intelligence/`, and `lib/product/`;
- current release/migration metadata references in `README.md`, `docs/`, `release/`, and `.github/workflows/quality.yml`.

Conditional source inspection:

- `supabase/migrations/20260716215602_muscle_intelligence_phase1_foundation.sql` — reused the exact mapping constraints, checksum function, lifecycle triggers, publication function, grants, and admin policy convention;
- `supabase/migrations/20260717032851_retire_legacy_600_exercise_catalog.sql` — preserved its provenance and user-data safety boundary;
- `supabase/migrations/202606290000_clean_initial_schema.sql` — confirmed available `exercises` columns and existing RLS conventions;
- `lib/train/muscle-intelligence/{taxonomy,contracts,checksum,calculate-muscle-load}.ts` — reused canonical muscle IDs, validation, checksum canonicalization, and deterministic result behavior;
- `scripts/check-migration-ledger.mjs` and `.github/workflows/quality.yml` — kept pending-migration and full-chain verification semantics truthful;
- current canonical-domain, roadmap, release, and migration-reconciliation documentation — updated only current authority.

- `scripts/release-preflight.mjs`, its script tests, and `.github/workflows/quality.yml` - restored a universally strict default and explicit trusted workflow mode selection;
- `services/activity-catalog/server/legacy-provider.ts`, the Activity Catalog adapter/types, and focused provider tests - added bounded compatibility parsing without changing provider selection or fallback policy.

Graphify was not used because targeted source search resolved the required dependencies without expanding the inspection boundary.

## Security and privacy boundary

- RLS is enabled on all six new tables.
- Approved localizations, searchable aliases, and approved relationships are member-readable.
- Research sources, mapping evidence, and internal review rationale remain admin/service-role only.
- Anonymous access is revoked and there is no anonymous mutation path.
- Existing Phase 1 mapping immutability and atomic publication remain authoritative.
- No user-owned table, plan, session, log, custom exercise, or custom mapping is rewritten by the Phase 2 seed.

## Verification status

Local results on 2026-07-17:

- registry/seed synchronization: pass;
- migration-ledger validation: pass with `applied=35`, `pending=2`, `unresolved=2`, `reconciliation=pending`, and `release_ready=false`;
- focused Phase 2 registry/migration tests: 16 passed, including semantic full-body, upper/lower, and push/pull/legs session contracts;
- focused legacy instruction normalization: 7 passed, including every one of the 60 curated payloads and final adapter output;
- unit configuration: 1,030 passed;
- integration configuration: 10 passed and 38 environment-gated skips;
- telemetry configuration: 16 passed;
- script tests: 74 passed;
- TypeScript: pass;
- lint: pass with one pre-existing warning outside this phase;
- production build: pass, including 91 generated static pages;
- `git diff --check`: pass.

The clean local Supabase migration-chain and disposable SQL verification could not run because Docker Desktop is unavailable in the Windows environment. The Draft PR's Docker-backed GitHub Quality job must supply that exact-head database-chain evidence; an unrun local check is not recorded as passed.

## Rollback and follow-up boundary

Before production application, rollback is branch/commit reversion. After any future authorized application, the migrations are immutable and correction requires a new named forward migration. Do not merge, deploy, apply production migrations, update the production release marker, or start Phase 3/4 from this report.
