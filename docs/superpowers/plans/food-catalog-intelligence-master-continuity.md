# Plaivra Food Catalog Intelligence — Master Continuity / Recovery Handoff

**Purpose:** living project-continuity authority for future Plaivra Planner chats.  
**Repository:** `ahmedmohameda7222-ship-it/gymsands`  
**Checkpoint source `main` before this continuity update:** `ac1fe71cf7592f239716c1091be767f050827e64`  
**Current program:** Food Catalog Intelligence architectural clean rebuild-in-place  
**Total roadmap plans:** 10  
**Completed plans:** Plan 1, Plan 2  
**Current plan:** Plan 3 — Activation, Verification, Trust, and Catalog Generations  
**Plan 3 state:** architecture design approved; formal written spec created/self-reviewed; user written-spec review pending  
**Plans remaining including Plan 3:** 8  
**Plans remaining after Plan 3 completes:** 7

---

## 0. Recovery instructions for a new Plaivra Planner chat

If a previous Planner chat reaches its limit, **do not restart the Food Catalog architecture discussion**.

Do this in order:

1. Fetch current `origin/main`.
2. Read this file completely.
3. Read `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md` completely.
4. Read `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md` completely.
5. Read the current Plan-specific spec/plan listed below.
6. Verify repository/PR/Production state from GitHub/Supabase rather than trusting stale chat text.
7. Continue from **Current Next Move** at the end of this file.
8. Do not reopen already-approved architecture unless new evidence creates a real contradiction.

### Authority order

1. Latest explicit user/Planner decision.
2. `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`.
3. Current Plan-specific approved design/spec/implementation plan.
4. `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`.
5. This continuity file.
6. Existing runtime implementation.

**Existing implementation is migration input, not architecture authority.**

---

# 1. Governing architecture

Binding principle:

> Design the Plaivra Food Catalog we want to own for years, then migrate current development code toward it. Existing implementation does not constrain the target architecture.

Selected strategy:

> **Clean-slate architecture, not clean-slate repository.**

More precisely:

> **Architectural Clean Rebuild-in-Place.**

Keep repository history, useful tests, CI, migration knowledge, stable product contracts, and sound boundaries. Replace transitional implementation progressively; no big-bang rewrite.

### Global invariants

- Stable canonical Food ID is Plaivra-owned and source-independent.
- Provider IDs/names/barcodes/taxonomy/market/search labels are evidence/presentation, not canonical identity.
- Ingestion matching outcome is `MATCH | CREATE | POSSIBLE_DUPLICATE | REJECT`.
- Name similarity or nutrition similarity alone never authorizes canonical merge.
- Confirmed duplicate merge uses survivor + immutable merge history.
- Old IDs redirect; historical Diary/Recipe/Saved Meal/Meal Plan snapshots are never rewritten.
- Redirect chains must be flattened.
- Unknown nutrition is `NULL`; known source zero is `0`.
- No silent imputation, no generic household conversion, no generic `ml ↔ g` without exact Food-specific evidence.
- Names are localized/provenance-aware; BCP-47-style language tags remain open-ended.
- Arabizi is Arabic-context Latin transliteration/search aliasing, not a locale.
- Taxonomy is Plaivra-owned, stable, multidimensional, identity-independent.
- Market, language, source, and Food identity are separate.
- Market context is explicit; never infer canonical market from locale/IP/timezone/GPS without separate product authority.
- Lifecycle, verification assertions, completeness, freshness, and trust are distinct concepts.
- Mutable `is_verified` is not final authority.
- Ingestion, activation, generation promotion, deployment, and Production mutation are separate authorities.
- Search is derived/rebuildable.
- Member plane and privileged control plane remain separated.
- No generic privileged Supabase client for member/browser surfaces.
- My Foods/personal state remain isolated from global catalog truth.
- Applied migrations are immutable; corrections are forward migrations.
- Rollback/recovery is generation/lifecycle driven, not destructive deletion.
- No paid provider/search/cache dependency without measured need and separate approval.

---

# 2. Repository and Production anchors

## GitHub

`ahmedmohameda7222-ship-it/gymsands`

## Plaivra Main Supabase Production

Project: `bkwezjxvapaeasfvlhvv`  
Region: `eu-central-1`

## Separate Activity Catalog Supabase

Project: `khlcctuefiuhunqymkbp`

Food Catalog work must not mutate Activity Catalog without separate exact authority.

## Released compatibility marker

Last verified marker remained:

`20260724232734`

Plan 1 and Plan 2 did not promote it.

---

# 3. Authoritative Food Catalog documents

## Parent architecture

`docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`

## Program roadmap

`docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`

## Plan 1 implementation plan

`docs/superpowers/plans/2026-09-01-food-catalog-core-model-rebuild.md`

## Plan 2 implementation plan

`docs/superpowers/plans/2026-09-01-food-catalog-domain-service-v2.md`

## Plan 3 formal design spec — current Plan-specific document

`docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`

Status of Plan 3 spec: **architecture-approved and self-reviewed; written-spec user review pending. Implementation plan does not yet exist.**

---

# 4. Plan 1 — Core Canonical Model Rebuild

**Status:** COMPLETE / integrated / Production schema applied and reconciled under separate explicit authority.

## Repository authority

Integrated Plan 1 authority:

`93524c2b162ee832d12b9e2a46c92bdced6fdac9`

PR #162 was reviewed; due connector/Draft constraints, integration used the approved exact squash-equivalent fallback. Do not claim GitHub technically marked PR #162 as merged.

## Plan 1 migrations

Repository core migration:

`supabase/migrations/20260901153000_food_catalog_intelligence_core.sql`

Production identity:

`20260901165219_food_catalog_intelligence_core`

Repository semantic correction migration:

`supabase/migrations/20260901174500_food_catalog_plan1_semantic_corrections.sql`

Production identity:

`20260901183021_food_catalog_plan1_semantic_corrections`

Both applied exactly once. Never edit/replay the historical files.

## Core capabilities introduced

- stable Food root/identity anchor;
- source provenance records;
- immutable nullable nutrition revisions;
- source-backed serving options;
- localized/provenance-aware names;
- taxonomy registry/assignments;
- Market Scope registry/memberships/assignments;
- scoped immutable verification assertions;
- immutable merge events;
- same-Food provenance FKs/constraints;
- RLS/least-privilege core-table posture.

## Plan 1 semantic correction

QA found and corrected:

1. household/non-direct serving conversions require positive gram evidence **and** source provenance;
2. source-origin/source-name facts require source provenance.

No generic serving assumptions were introduced.

## Last verified Production data state through Plan 2 QA

All global Food/fact tables remained zero-row, including:

- `food_items = 0`
- `food_source_records = 0`
- `food_nutrition_revisions = 0`
- `food_serving_options = 0`
- `food_names = 0`
- `food_taxonomy_assignments = 0`
- `food_market_assignments = 0`
- `food_verification_assertions = 0`
- `food_merge_events = 0`

No provider/USDA population occurred.

---

# 5. Plan 2 — Food Catalog Domain Service V2 + Compatibility Projection

**Status:** COMPLETE / QA-approved / squash-merged by user.

## PR / merge authority

PR #164:

`Food Catalog V2 — Domain Service + Compatibility Projection`

Final approved branch head before squash merge:

`3badad0704565f31f92476e94047f3ce131ab6cc`

Squash merge commit on `main`:

`2883e077f1fdc159330c29b1dc6124ec905738e2`

Plan 2 passed corrective Planner QA/QC and canonical phase-close Quality before merge.

## Plan 2 capabilities

Plan 2 introduced the server-only Food Catalog V2 service boundary:

- V2 server contracts;
- Supabase-independent read/write ports;
- strict Supabase read adapter;
- validated append-only write adapter;
- canonical root resolver;
- raw `FoodCatalogDomainBundle`;
- pure evidence-safe compatibility projector;
- legacy `food_items` compatibility reads relocated into Food Catalog ownership;
- thin Nutrition façade;
- V2 physical-table boundary tests;
- strict enum/persisted fact validation.

## Critical Plan 2 rule

Plan 2 must not select current facts using:

- highest revision number;
- latest timestamp;
- insertion order;
- maximum ID;
- arbitrary first row;
- guessed source priority.

Plan 2 intentionally exposes raw immutable fact arrays. **Plan 3 supplies current authority through Catalog Generations.**

## Plan 2 side effects

- migration: NO
- Production mutation: NO
- Food population: NO
- provider ingestion: NO
- activation: NO
- generation promotion: NO
- member runtime V2 cutover: NO
- Activity Catalog mutation: NO

---

# 6. Plan 3 — Activation, Verification, Trust, and Catalog Generations

**Status:** ARCHITECTURE DESIGN APPROVED. FORMAL SPEC CREATED + SELF-REVIEWED. USER WRITTEN-SPEC REVIEW PENDING. IMPLEMENTATION NOT AUTHORIZED.

Formal spec:

`docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`

## Approved Plan 3 architecture

### A. Catalog Generation is sole current-effective authority

Never infer current authority from row order, `MAX`, timestamp, revision number, root compatibility fields, provider priority, or importer behavior.

A promoted Catalog Generation defines the exact effective composition.

### B. Full immutable generation composition

Chosen model: **full immutable snapshot per generation**.

- Candidate may be constructed from explicit base + exact changes.
- Result is full self-contained composition.
- Runtime does not walk deltas.
- Composition references immutable fact IDs; it does not duplicate fact values.
- Optional human ordinal is diagnostic only, never current authority.
- Deterministic composition checksum covers semantic selections/policy versions.

### C. Single current pointer + immutable event history

- one singleton current-generation pointer;
- pointer may be `NULL` before initialization;
- promotion uses exact candidate/checksum/validation report and CAS expected-current authority;
- promotion event append + pointer switch are atomic;
- stale concurrent promotion fails;
- rollback names an explicit healthy target generation;
- no `latest/previous by time` rollback inference;
- no generation/fact/event deletion.

### D. Activation Sets / Grants are separate from promotion

Binding sequence:

```text
draft ≠ activation
activation ≠ visibility
activation ≠ generation promotion
promoted current generation = visibility authority
```

Activation Set is an immutable deterministic manifest. Active generation members require an **exact immutable activation grant/event reference**.

Later activation invalidation does not retroactively mutate a sealed/promoted generation. It prevents reuse in future candidate construction; current effective state changes only through a new generation/rollback or later separately designed emergency path.

### E. Verification assertions are linear scoped chains

- same Food + same scope only;
- successor supersedes current chain head only;
- no forks;
- no cross-Food/scope supersession;
- no cycles/self-supersession;
- immutable rows;
- generation selects exact assertion ID per scope;
- never choose latest assertion by time.

Later assertions do not retroactively alter an existing generation.

### F. Trust Profile is pure derived projection

No opaque score.

`Verified` requires at minimum:

1. active in current generation;
2. identity scope verified;
3. nutrition scope verified;
4. selected activation/source evidence approved under generation policy;
5. exact promotion validation evidence has no blocker.

Serving verification is **not** required for overall Verified. Completeness remains separate from trust. Missing optional nutrients stay `NULL`.

### G. Blocking validation interface without Plan 4 quarantine

Plan 3 defines stable validation findings/reason codes and immutable validation reports. It does **not** implement quarantine/case management.

Promotion must reference an **exact validation report ID** for the exact candidate/checksum. Never select validation evidence by `latest` ordering.

### H. Current-generation read service

Target flow:

```text
current pointer
→ exact generation redirect resolution
→ exact generation Food entry
→ exact selected fact IDs
→ hydrate immutable facts
→ same-Food validation
→ Trust Profile
→ optional Plan 2 compatibility projection
```

No scanning raw arrays to infer current facts.

Plan 3 does not yet cut member runtime to this path.

### I. Flattened redirects and lifecycle representation

Within promoted generation:

- non-merged Food rows use `active | deprecated | withdrawn` effective lifecycle;
- draft Foods are outside promoted composition;
- merged source IDs are represented by direct generation redirects;
- redirect target must be an active non-redirecting survivor in same generation;
- A→B→D must materialize A→D and B→D.

Legacy root merge fields remain transitional migration input only.

### J. Control-plane boundary

- internal server-only command services;
- explicit principal/authority/operation/reason context;
- no permanent `role === admin` architecture introduced;
- Plan 6 remains authority for final capability security;
- no generic service-role client exported to member/browser/MCP surfaces.

### K. Proposed forward schema

Plan 3 expects an additive forward migration with architecture equivalent to:

Activation:
- `food_catalog_activation_sets`
- `food_catalog_activation_set_members`
- `food_catalog_activation_events`

Generation:
- `food_catalog_generations`
- `food_catalog_generation_foods`
- `food_catalog_generation_servings`
- `food_catalog_generation_names`
- `food_catalog_generation_taxonomy`
- `food_catalog_generation_markets`
- `food_catalog_generation_verification`
- `food_catalog_generation_redirects`

Validation/audit/current:
- `food_catalog_generation_validation_reports`
- normalized findings child table if useful
- `food_catalog_generation_events`
- `food_catalog_current_generation` singleton

Current fact composition is normalized/FK-backed, not JSON-array authority.

All manifests/composition/reports/events are immutable. The singleton current pointer is the sole intentionally mutable Plan 3 authority row and changes only through narrow atomic command paths.

### L. Bootstrap behavior

- no fake Generation 0;
- schema supports zero Foods and `current_generation_id = NULL`;
- current-generation service returns explicit not-initialized/unavailable state;
- it must not fall back to latest generation/root/raw arrays;
- legacy member runtime remains stable until explicit cutover later.

### M. Plan 3 Production boundary

Plan 3 implementation may include a forward migration in the repository.

**Merge does not authorize Production migration apply.**

Even after a separately approved schema apply, the following remain separate exact authorities:

- Food population;
- provider ingestion;
- activation execution;
- generation promotion;
- member runtime V2 cutover;
- USDA canary;
- deployment;
- Activity Catalog mutation.

## Plan 3 mandatory acceptance themes

Implementation must prove:

- no latest-row authority;
- deterministic immutable full composition/checksum;
- same-Food FKs/validation;
- active member requires exact activation grant;
- verification chains no forks/non-head supersession;
- exact assertion selection;
- Trust rule exact;
- exact validation report referenced at promotion;
- no retroactive semantic mutation from later activation/verification events;
- flattened redirects only;
- CAS/concurrency safety;
- idempotent operation IDs;
- explicit rollback target;
- RLS/no anon-auth direct CRUD;
- no member runtime cutover;
- no Production population/activation/promotion during implementation.

---

# 7. Remaining roadmap after Plan 3

## Plan 4 — Ingestion V2, Quarantine, Release-Diff Operations

**Status:** NOT STARTED.

Build structured ingestion into draft canonical evidence:

- identity/nutrition/serving/name/taxonomy/market/barcode facts;
- deterministic manifests;
- quarantine/resolution;
- run heartbeat/lease;
- single-writer Production execution;
- expected-vs-observed reconciliation;
- release-diff classification;
- operational events.

Exit: provider adapter can create deterministic safe draft mutations without direct arbitrary canonical editing.

## Plan 5 — Rebuildable Search Projection + Consumer Search Migration

**Status:** NOT STARTED.

Build generation-aware SearchDocument/projection and migrate Food Library search:

- PostgreSQL first;
- deterministic ranking;
- market/language handling;
- versioned nutrition-filter policies;
- keyset cursor semantics;
- bounded hydration;
- personalization overlay separate from global truth.

Existing approved UX concepts such as **High Protein + Low Carb filters together** and derived Food-card labels remain presentation/search policies, not taxonomy identity.

Exit: Food Library search uses V2 projection/service boundary and benchmark passes.

## Plan 6 — Curation, Corrections, Capability Security, Observability

**Status:** NOT STARTED.

Build durable privileged control plane:

- correction cases/reports/evidence;
- member issue reports without direct global mutation;
- personal override semantics;
- capability-based commands;
- human/service principals;
- immutable audit events;
- operational metrics;
- withdrawal/break-glass paths.

Exit: global truth can only change through audited privileged workflows; no generic admin row editor authority.

## Plan 7 — Backup/Export/Restore Verification + Legacy Retirement

**Status:** NOT STARTED.

Build:

- provider-neutral Food Catalog export;
- restore verification;
- generation/search rebuild verification;
- final compatibility retirement;
- destructive cleanup only after live preconditions/consumer migration.

Exit: catalog can be restored/moved preserving Plaivra Food IDs; obsolete transitional authority removed.

## Plan 8 — USDA Foundation Batch 1A Adapter + Full Dry Run

**Status:** NOT STARTED.

Implement exact USDA Foundation April 2026 adapter:

- explicit nutrient mapping;
- source portions;
- naming policy;
- taxonomy/market evidence mapping;
- semantic matching;
- deterministic full-release dry run;
- QA/benchmark artifacts.

`1A0` is offline/full dry run. No Production ingestion authority.

## Plan 9 — USDA Foundation Production Canary + Full Promotion

**Status:** NOT STARTED.

Only after Plan 8 evidence approval.

Stages:

- `1A1`: deterministic representative Production canary (~50–100 Foods), draft-only ingestion first;
- post-ingestion QA;
- exact activation subset;
- exact generation promotion;
- `1A2`: full Foundation promotion only after canary health and new exact approvals.

Every Production ingestion/activation/promotion requires separate explicit authority.

## Plan 10 — USDA FNDDS Batch 1B

**Status:** NOT STARTED.

After Foundation is healthy:

- `1B0`: full FNDDS 2021–2023 dry run;
- `1B1`: deterministic representative Production canary (~150–250 records);
- `1B2`: full FNDDS promotion under separate approval.

Emphasis: mixed dishes, composite foods, portion weights, preparation variants, and reconciliation with Foundation identities.

---

# 8. Roadmap count / sequencing

```text
Plan 1 — Core Canonical Model                         COMPLETE
Plan 2 — Domain Service V2                           COMPLETE
Plan 3 — Activation / Verification / Generations     DESIGN APPROVED; SPEC REVIEW PENDING
Plan 4 — Ingestion V2 / Quarantine                   NOT STARTED
Plan 5 — Search Projection / Consumer Search         NOT STARTED
Plan 6 — Curation / Security / Observability         NOT STARTED
Plan 7 — DR / Export / Legacy Retirement             NOT STARTED
Plan 8 — USDA Foundation Dry Run                     NOT STARTED
Plan 9 — Foundation Production Canary / Promotion    NOT STARTED
Plan 10 — FNDDS                                      NOT STARTED
```

There are **8 plans remaining including Plan 3**. After Plan 3 is completely implemented/QA'd/integrated, **7 plans remain (Plans 4–10)**.

Do not skip prerequisite order. Plans 5/6 may overlap only after prerequisite contracts from Plans 2–4 are stable and still require separate review gates.

---

# 9. Execution workflow

For architecture work use Superpowers:

1. `using-superpowers`
2. `brainstorming`
3. after written spec user approval: `writing-plans`
4. implementation only after implementation-plan approval.

Implementation uses TDD and exact-head verification. Under Classic ChatGPT, if true worktree/subagent primitives are absent, use the explicitly approved Classic execution mode rather than pretending unavailable tools exist:

- one dedicated implementation branch/PR;
- task-by-task RED/GREEN evidence;
- focused commits;
- exact-head GitHub Quality/CI;
- explicit spec-compliance/code-quality review;
- Planner independent QA/QC before merge.

Never silently downgrade architectural or Production gates because tooling is unavailable.

---

# 10. Production authority protocol

Always distinguish:

1. documentation/spec merge;
2. implementation merge;
3. migration file existing in repo;
4. Production migration apply;
5. ingestion execution;
6. activation-set execution;
7. generation promotion;
8. member-runtime cutover;
9. application deployment.

Authority for one does not grant the next.

If a future chat is uncertain whether Production mutation was authorized, default to **NO** and stop before mutating.

---

# 11. Current Next Move

**Do not write the Plan 3 implementation plan yet. Do not implement Plan 3 yet.**

The approved Plan 3 architecture has been written and self-reviewed at:

`docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`

The next gate is:

> **User/Planner written-spec review and explicit approval.**

If the user says the written Plan 3 spec is approved, then invoke Superpowers `writing-plans` and create the detailed Plan 3 implementation plan from the then-current authoritative `main`.

After creating the implementation plan, stop again for explicit user approval before implementation.

No Production mutation is authorized at this checkpoint.
