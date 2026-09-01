# Food Catalog Intelligence Implementation Roadmap

**Status:** implementation-planning authority; runtime implementation not started  
**Spec:** `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`

## Purpose

The approved Food Catalog Intelligence spec spans several independently reviewable subsystems. It must not be executed as one big-bang rewrite. Implementation is therefore split into sequential plans that each produce a testable, reviewable state behind the existing Food Catalog logical service boundary.

## Global execution rules

- Existing implementation is migration input, not target-architecture authority.
- Preserve stable Plaivra Food IDs, historical frozen snapshots, My Foods isolation, nullable nutrition semantics, and the Food Catalog logical service boundary throughout the migration.
- Do not rewrite applied migrations; use forward migrations only.
- Do not mutate Production merely because implementation code or a migration is merged.
- No Food population, activation, or Catalog Generation promotion occurs without a separate exact user/Planner approval.
- Before any destructive retirement of legacy Food Catalog columns/tables/functions, re-check live Production state. If global canonical Food data or new references exist that are not covered by the approved migration path, stop and reconcile instead of assuming the catalog is still empty.
- Keep PostgreSQL/Supabase as the initial physical backend. No paid search/provider/cache dependency is introduced by these plans.
- Each implementation plan uses TDD, focused commits, independent review, and the verification chain.

## Plan sequence

### Plan 1 — Core Canonical Model Rebuild

Introduce the target versioned domain structures while keeping current consumers intact: nutrition revisions, source-backed serving options, localized/provenance-aware names, taxonomy registry, market registry, verification assertions, immutable merge events, and database invariants. Existing `food_items` remains the stable root/compatibility anchor during migration, but its flat name/nutrition/serving/category/verification fields cease to be future authority.

**Exit condition:** target core schema and pure domain contracts exist and are locally verified; no consumer cutover and no Production population.

### Plan 2 — Food Catalog Domain Service V2 + Compatibility Projection

Build focused server-only read/persistence modules over the new domain model. Add compatibility projection from the new model to the current Food Catalog service contract so Nutrition consumers can migrate without direct-table coupling.

**Exit condition:** current consumers can be served from V2 domain facts in tests while legacy physical fields remain compatibility-only.

### Plan 3 — Activation, Verification, Trust, and Catalog Generations

Implement assertion-based verification, exact activation sets, Catalog Generation composition/promotion/revocation, current-generation reads, flattened redirect projection, and derived Trust Profile output.

**Exit condition:** ingestion can create drafts without making them user-visible, and promotion is a separate audited operation with rollback to a previous healthy generation.

### Plan 4 — Ingestion V2, Quarantine, and Release-Diff Operations

Upgrade ingestion contracts from flat Food candidates to structured identity/nutrition/serving/name/taxonomy/market/barcode facts. Add quarantine/resolution, run heartbeat/lease, single-writer Production execution, expected-vs-observed reconciliation, release-diff classifications, and structured operational events.

**Exit condition:** a source adapter can produce deterministic manifests and safe draft mutations without direct canonical-row editing.

### Plan 5 — Rebuildable Search Projection + Consumer Search Migration

Create generation-aware search documents, PostgreSQL search adapter, objective ranking pipeline, deterministic nutrition-filter policies, market/language handling, keyset cursor semantics, bounded hydration, and personalization overlay. Migrate Food Library search behind the projection without per-user global indexes.

**Exit condition:** Food Library search uses the V2 projection/service contract and passes the versioned search benchmark without direct global-table search dependencies.

### Plan 6 — Curation, Corrections, Capability Security, and Observability

Implement correction cases/reports/evidence, personal-override semantics, capability-based control-plane commands, explicit human/service principals, immutable audit events, privileged operation gates, operational metrics, and emergency withdrawal/break-glass paths.

**Exit condition:** member feedback cannot mutate global truth directly, and privileged curation/release operations no longer depend on generic `role === admin` row editors.

### Plan 7 — Backup/Export/Restore Verification + Legacy Retirement

Add provider-neutral Food Catalog export contracts, backup/restore verification tooling, search rebuild verification, and the final compatibility-retirement migration. Remove obsolete flat verification/name/serving/nutrition/category/market authorities only after all approved consumers have migrated and live preconditions pass.

**Exit condition:** the Food Catalog can be restored/moved while preserving Plaivra Food IDs, and obsolete transitional authorities are removed rather than carried indefinitely.

### Plan 8 — USDA Foundation Batch 1A Adapter + Full Dry Run

Implement the exact USDA Foundation release adapter, explicit nutrient mapping, source portion extraction, naming policy, taxonomy/market evidence mapping, semantic matching, deterministic full-release dry-run, and benchmark artifacts. This plan does not authorize Production ingestion.

**Exit condition:** Batch `1A0` full dry-run produces an exact deterministic manifest and QA report for review.

### Plan 9 — USDA Foundation Production Canary and Full Promotion

This is a data-operation plan created only after Plan 8 evidence is reviewed. It defines the exact `1A1` representative canary manifest, draft-only Production ingestion, post-ingestion QA, activation subset, and later `1A2` full promotion.

**Authority:** separate exact user/Planner approval is mandatory before every Production ingestion, activation set, and generation promotion.

### Plan 10 — USDA FNDDS Batch 1B

Created only after Foundation is healthy. Implement FNDDS-specific portion/composite-food handling, Foundation reconciliation, full dry-run, canary, and later full promotion under separate exact approvals.

## Dependency order

```text
Plan 1 Core Model
  ↓
Plan 2 Domain Service V2
  ↓
Plan 3 Activation / Verification / Generations
  ↓
Plan 4 Ingestion V2 / Quarantine
  ↓
Plan 5 Search Projection / Consumer Search
  ↓
Plan 6 Curation / Security / Observability
  ↓
Plan 7 DR / Export / Legacy Retirement
  ↓
Plan 8 USDA Foundation Dry Run
  ↓
Plan 9 Foundation Production Canary / Promotion
  ↓
Plan 10 FNDDS
```

Plans 5 and 6 may overlap in implementation only after their prerequisite contracts from Plans 2–4 are stable; they still require separate review gates.

## Current best next move

Execute **Plan 1 — Core Canonical Model Rebuild** first. It is additive, keeps current Nutrition consumers functioning, creates the clean long-term data foundation, and avoids prematurely coupling source adapters or search behavior to transitional `food_items` columns.