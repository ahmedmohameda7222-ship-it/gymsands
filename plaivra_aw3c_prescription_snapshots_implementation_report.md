# Plaivra AW-3C Immutable Prescription Snapshots — Implementation Report

## Status

NOT READY FOR PLANNER QA/QC

AW-3C now exists as a normal permanent repository tree. Temporary transport bundles, placeholder migration content, materialization workflows, and focus-correction workflows have been removed. The Draft PR targets `main` again. Exact-head pre-application validation, Production application, ledger reconciliation, post-apply verification, and final-head validation remain pending.

## Repository

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Branch: `feat/active-workout-aw3c-prescription-snapshots`
- Draft PR: `#86`
- Starting released `main`: `0420f5f1238f5beaafbf1b58fec81a4e810dc541`
- Current PR base: `main`
- Compatibility marker boundary: `20260724232734`
- Production project: `bkwezjxvapaeasfvlhvv`
- Activity Catalog boundary: `khlcctuefiuhunqymkbp` (read-only isolation; no mutation authorized)

## Fresh pre-implementation baseline

- Physical Production migration records: 72
- Workout sessions: 10 (3 plan, 7 direct)
- Snapshot roots/items: 10 / 34
- AW-3C tables before implementation: absent
- Data-derived conservative backfill expectation: 86 prescription sets / 15 repetition-range targets
- Snapshot owner mismatches: 0
- Frozen raw prescription hash: `ab11eb497643ff257229bac49c22e64763423225dd8e6b9951c0f07f8edbf26c`

## Implemented scope

- Forward-only AW-3C schema, ownership paths, indexes, RLS, grants, immutability triggers, and one private authoritative materializer.
- Plan/direct snapshot-item creation convergence and resume verification.
- Frozen-item-only deterministic historical backfill.
- Typed ordered read projection with registry/shape/path validation.
- Plan and direct execution hydration from immutable prescription sets.
- Frozen planned compatibility fields for performed logs and ChatGPT workout context.
- Paginated privacy export and explicit account-deletion proof.
- Permanent migration, source-contract, projection, integration, and SQL verification assets.

## Blocker corrections completed

- Removed the stale post-chain AW-3B compatibility-marker assertion while preserving historical marker proof in chronological replay tests.
- Kept the AW-3B 500-performed-log limit fixture valid under AW-3C by reducing only its planned prescription count to the supported maximum of 100.
- Corrected rendered mobile-keyboard focus verification to bind to one concrete DOM element across viewport resize instead of allowing `Locator.first()` to resolve to a different asynchronously hydrated input.
- Materialized the permanent implementation tree and removed all encoded transport and write-enabled temporary workflow files.
- Retargeted Draft PR `#86` to `main`.

## Conditional extra reads

- `types/database-legacy.ts`: required to construct the frozen plan UI compatibility object safely.
- `scripts/check-migration-ledger.mjs`, `README.md`, and `docs/architecture/migration-ledger-reconciliation.md`: required by the repository's strict pending-migration classification contract.
- `scripts/run-train-layout-qa.mjs`: required to diagnose and correct the stable-element mobile keyboard focus assertion.
- AW-3B verification assets: required to make historical verification future-phase-safe without weakening AW-3B release-boundary proof.

## Validation evidence already observed on permanent code

A prior clean permanent-tree Quality attempt reached and passed:

- Full chronological migration replay
- Database lint
- AW-2/AW-3A/AW-3B/AW-3C database preflight and verification SQL
- Migration ledger validation
- Dependency audit
- ESLint
- TypeScript
- Unit tests
- Integration tests
- Script, i18n, and telemetry tests
- Production environment contract
- Production build
- Built release metadata

That attempt failed only in the rendered mobile-focus assertion described above. The permanent correction is now committed; a new clean exact-head validation is required and prior partial evidence is not treated as final approval.

## Pending evidence

- Clean exact-head Phase A, Quality, and Exact Release Quality results
- Exact migration Git blob/SHA-256 and pre-application evidence commit
- Fresh Production baseline immediately before application
- Generated Production migration identity and applied hash
- Post-apply counts, RLS, immutability, export/deletion, advisors, and Activity Catalog isolation
- Final ledger reconciliation, implementation report completion, and final exact head

NOT READY FOR PLANNER QA/QC
