# Food Catalog Intelligence Implementation Roadmap

**Status:** implementation-planning authority; Plan 1 complete, Plan 2 complete/merged, Plan 3 architecture approved with written-spec review pending  
**Spec:** `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`

## Purpose

The approved Food Catalog Intelligence spec spans independently reviewable subsystems. It must not be executed as one big-bang rewrite. Implementation is split into sequential plans that each produce a testable, reviewable state behind the Food Catalog logical service boundary.

## Global execution rules

- Existing implementation is migration input, not target-architecture authority.
- Preserve stable Plaivra Food IDs, frozen historical snapshots, My Foods isolation, nullable nutrition semantics, and the Food Catalog service boundary throughout migration.
- Never rewrite applied migrations; use forward migrations only.
- Code/migration merge does not itself authorize Production mutation.
- No Food population, activation, or Catalog Generation promotion occurs without separate exact user/Planner approval.
- Before destructive legacy retirement, re-check live Production state and stop if new references/data are not covered by the approved path.
- Keep PostgreSQL/Supabase as the initial physical backend; no paid search/provider/cache dependency without measured need and separate approval.
- Each implementation plan uses TDD, focused commits, independent review, and exact-head verification.

## Current execution state

### Plan 1 — Core Canonical Model Rebuild — COMPLETE

Plan 1 is integrated through repository authority:

`93524c2b162ee832d12b9e2a46c92bdced6fdac9`

The Plan 1 Production schema and semantic correction were separately authorized/applied/reconciled. Latest physical Plan 1 correction identity:

`20260901183021_food_catalog_plan1_semantic_corrections`

The released compatibility marker remained `20260724232734`. No Food population, provider ingestion, activation, Catalog Generation promotion, or Activity Catalog mutation occurred.

### Plan 2 — Food Catalog Domain Service V2 + Compatibility Projection — COMPLETE / MERGED

Implementation plan:

`docs/superpowers/plans/2026-09-01-food-catalog-domain-service-v2.md`

PR #164 completed Planner QA/QC and canonical phase-close Quality, then was squash-merged by the user.

Final approved implementation head:

`3badad0704565f31f92476e94047f3ce131ab6cc`

Squash merge commit:

`2883e077f1fdc159330c29b1dc6124ec905738e2`

Plan 2 established the V2 domain/service boundary without member runtime V2 cutover, Production mutation, Food population, activation, or generation promotion.

### Plan 3 — Activation, Verification, Trust, and Catalog Generations — DESIGN APPROVED / WRITTEN-SPEC REVIEW PENDING

Formal Plan 3 design spec:

`docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`

The architecture design has been approved and self-reviewed. The user/Planner must explicitly approve the written spec before the Superpowers `writing-plans` workflow creates the Plan 3 implementation plan.

Implementation is **not authorized yet**. Production migration apply, activation execution, generation promotion, Food population, provider ingestion, member runtime cutover, deployment, and Plan 4 remain unauthorized.

## Plan sequence

### Plan 1 — Core Canonical Model Rebuild

Introduce target versioned domain structures while keeping consumers intact: nutrition revisions, source-backed serving options, localized/provenance-aware names, taxonomy registry, market registry, verification assertions, immutable merge events, and DB invariants. Existing `food_items` stays a compatibility/stable-ID anchor during transition, but flat fields cease to be future authority.

**Exit condition:** target core schema/domain contracts locally verified; no consumer cutover or Production population. **Satisfied.**

### Plan 2 — Food Catalog Domain Service V2 + Compatibility Projection

Build focused server-only read/persistence modules over the canonical model. Add pure compatibility projection from explicitly selected V2 facts to current consumer shape. Plan 2 intentionally does not choose current facts before Catalog Generations exist.

**Exit condition:** V2 facts read/written through dedicated ports and projected in tests, legacy member runtime unchanged. **Satisfied.**

### Plan 3 — Activation, Verification, Trust, and Catalog Generations

Implement assertion-based verification, deterministic Activation Sets/Grants, full immutable Catalog Generation composition, exact validation reports, single current-generation pointer, atomic promotion/rollback, current-generation reads, flattened redirect projection, and derived Trust Profile output.

Binding design principles include:

- generation is sole current-effective authority;
- no latest-row/max-revision/timestamp inference;
- full immutable snapshots, not runtime delta chains;
- active generation members require exact activation-grant authority;
- verification uses exact scoped assertion selection and linear chains;
- later activation/assertion events do not retroactively mutate an existing generation;
- promotion references an exact validation report and uses expected-current CAS;
- merged source IDs are direct generation redirects to active survivors;
- no fake Generation 0; current pointer may remain `NULL` before real promotion.

**Exit condition:** drafts can exist without visibility; activation remains separate; current reads are generation-authoritative; promotion is audited/atomic; rollback can restore an explicitly selected previous healthy generation without destructive rewriting.

### Plan 4 — Ingestion V2, Quarantine, and Release-Diff Operations

Upgrade ingestion from flat candidates to structured identity/nutrition/serving/name/taxonomy/market/barcode evidence. Add deterministic manifests, quarantine/resolution, run heartbeat/lease, single-writer Production execution, expected-vs-observed reconciliation, release-diff classifications, and operational events.

**Exit condition:** provider/source adapters produce deterministic manifests and safe draft mutations without arbitrary direct canonical editing.

### Plan 5 — Rebuildable Search Projection + Consumer Search Migration

Create generation-aware search documents, PostgreSQL search adapter, objective ranking pipeline, deterministic nutrition-filter policies, market/language handling, keyset cursor semantics, bounded hydration, and personalization overlay. Migrate Food Library search behind the V2 projection.

**Exit condition:** Food Library search uses V2 projection/service contracts and passes the versioned benchmark without direct global-table search dependencies.

### Plan 6 — Curation, Corrections, Capability Security, and Observability

Implement correction cases/reports/evidence, member issue reporting without direct global mutation, personal override semantics, capability-based privileged commands, explicit human/service principals, immutable audit events, operational metrics, and withdrawal/break-glass paths.

**Exit condition:** global truth changes only through audited privileged workflows; generic admin row-editor authority is retired.

### Plan 7 — Backup/Export/Restore Verification + Legacy Retirement

Add provider-neutral Food Catalog export contracts, backup/restore verification, search rebuild verification, and final compatibility retirement. Remove obsolete flat authorities only after all consumers migrate and live preconditions pass.

**Exit condition:** the catalog can be restored/moved while preserving Plaivra Food IDs, and transitional authorities are removed.

### Plan 8 — USDA Foundation Batch 1A Adapter + Full Dry Run

Implement exact USDA Foundation April 2026 release adapter, nutrient mapping, portions, naming policy, taxonomy/market evidence mapping, semantic matching, deterministic full-release dry-run, and QA artifacts. No Production ingestion authority.

**Exit condition:** Batch `1A0` full dry-run produces an exact deterministic manifest and QA report for review.

### Plan 9 — USDA Foundation Production Canary and Full Promotion

Created/executed only after Plan 8 evidence review. Define exact `1A1` representative canary, draft-only Production ingestion, QA, exact activation subset, exact generation promotion, and later `1A2` full promotion.

**Authority:** separate exact user/Planner approval is mandatory before every Production ingestion, activation set, and generation promotion.

### Plan 10 — USDA FNDDS Batch 1B

After Foundation is healthy, implement FNDDS-specific portion/composite handling, Foundation reconciliation, full dry-run `1B0`, representative canary `1B1`, and later full promotion `1B2` under separate approvals.

## Dependency order

```text
Plan 1 Core Model — COMPLETE
  ↓
Plan 2 Domain Service V2 — COMPLETE / MERGED
  ↓
Plan 3 Activation / Verification / Generations — DESIGN APPROVED / SPEC REVIEW PENDING
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

Plans 5 and 6 may overlap only after prerequisite contracts from Plans 2–4 are stable; they still require separate review gates.

## Current best next move

Review and explicitly approve the written Plan 3 design spec:

`docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`

After that approval, invoke Superpowers `writing-plans` to create the detailed Plan 3 implementation plan. Do not implement Plan 3 and do not mutate Production before the implementation plan is separately approved.
