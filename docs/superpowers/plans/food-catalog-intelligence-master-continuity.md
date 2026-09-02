# Plaivra Food Catalog Intelligence — Master Continuity / Recovery Handoff

**Purpose:** living project-continuity authority for future Plaivra Planner chats.  
**Repository:** `ahmedmohameda7222-ship-it/gymsands`  
**Plan 3 implementation base `main`:** `96dbe4c42f908737e5701df83d8f47356dea6096`
**Program:** Food Catalog Intelligence — Architectural Clean Rebuild-in-Place  
**Total roadmap plans:** 10  
**Completed plans:** Plan 1, Plan 2  
**Current plan:** Plan 3 — Activation, Verification, Trust, and Catalog Generations  
**Current Plan 3 state:** implementation and Planner correction pass complete on Ready-for-review PR #165; all three P1 correction threads resolved after exact-head GREEN evidence; final status-only docs head PR Quality and canonical phase-close Quality pending before independent Planner correction re-review
**Plans remaining including Plan 3:** 8  
**Plans remaining after Plan 3 completes:** 7

---

## 0. Recovery instructions for a new Planner chat

If the previous Plaivra Planner chat reaches its limit, do **not** restart the Food Catalog architecture discussion.

Required recovery sequence:

1. Fetch current `origin/main` and PR #165 head independently.
2. Read this file completely.
3. Read `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`.
4. Read `docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`.
5. Read `docs/superpowers/plans/2026-09-02-food-catalog-plan3-activation-verification-generations.md`.
6. Read `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`.
7. Verify GitHub/CI/Supabase state independently instead of trusting stale chat text.
8. Continue from **Current Next Move** at the end of this file.
9. Do not reopen already-approved architecture unless new repository/Production evidence creates a real contradiction.

### Authority order

1. Latest explicit user/Planner decision.
2. Parent Food Catalog architecture spec.
3. Current approved Plan-specific written spec.
4. Current approved Plan-specific implementation plan.
5. Program roadmap.
6. This continuity file.
7. Existing runtime implementation.

**Existing implementation is migration input, not architecture authority.**

---

## 1. Governing architecture

Binding rule:

> Design the Plaivra Food Catalog we want to own for years, then migrate current development code toward it. Existing implementation does not constrain the target architecture.

Selected strategy:

> **Clean-slate architecture, not clean-slate repository.**

> **Architectural Clean Rebuild-in-Place.**

Preserve repository/history/tests/CI/migration knowledge and sound boundaries; progressively replace transitional implementation.

### Global invariants

- Stable canonical Food ID is Plaivra-owned and source-independent.
- Provider IDs, names, barcodes, taxonomy, market, and search labels are evidence/presentation facts, not canonical identity.
- Ingestion identity outcome is exactly `MATCH | CREATE | POSSIBLE_DUPLICATE | REJECT`.
- Never merge canonical Foods from name or nutrition similarity alone.
- Canonical merge = survivor + immutable merge history; old IDs redirect; historical snapshots are never rewritten.
- Redirect chains are flattened.
- Unknown nutrition = `NULL`; explicit source zero = `0`; no imputation.
- No generic household conversion; no `ml ↔ g` without exact Food-specific evidence.
- Names are provenance-aware/localized facts; open BCP-47-compatible language tags.
- Arabizi = Arabic-context Latin-script transliteration/search alias, not a language/locale.
- Taxonomy is stable Plaivra-owned multidimensional classification.
- Market, language, source, and canonical Food identity are separate.
- User market must be explicit; do not infer canonical market from locale/IP/timezone/GPS.
- Verification assertions, lifecycle, completeness, source freshness, and user-facing trust are separate.
- Mutable `is_verified` is not authority.
- Ingestion ≠ activation ≠ generation promotion ≠ member visibility.
- Search is derived/rebuildable projection.
- Member plane and privileged control plane remain separate.
- My Foods/personal state stays isolated from global canonical truth.
- No paid provider/search/cache dependency without measured need and approval.
- Applied migrations are immutable; corrections are forward-only.
- Production mutation requires exact separate authority when applicable.
- Recovery uses lifecycle/generation authority, not destructive deletion.

---

## 2. Repository / Production anchors

### Main repository

`ahmedmohameda7222-ship-it/gymsands`

### Plaivra Main Supabase Production

Project: `bkwezjxvapaeasfvlhvv`  
Region: `eu-central-1`

### Separate Activity Catalog

Project: `khlcctuefiuhunqymkbp`

Food Catalog work must not mutate Activity Catalog without separate exact authority.

### Released compatibility marker

Still: `20260724232734`

Plan 1 and Plan 2 did not promote it. Plan 3 implementation leaves it byte-identical to the recorded base.

---

## 3. Plan 1 — COMPLETE

**Plan:** `docs/superpowers/plans/2026-09-01-food-catalog-core-model-rebuild.md`

Final integrated repository authority:

`93524c2b162ee832d12b9e2a46c92bdced6fdac9`

PR #162 was **not technically merged**; Plan 1 was integrated through the approved exact squash-equivalent fallback. Never claim PR #162 `merged=true`.

### Plan 1 Production migrations

Core repository migration:
`supabase/migrations/20260901153000_food_catalog_intelligence_core.sql`

Production generated identity:
`20260901165219_food_catalog_intelligence_core`

Core migration blob:
`3ea9a95b818068dbe03d080fb205dfcdf5af07ab`

Semantic correction:
`supabase/migrations/20260901174500_food_catalog_plan1_semantic_corrections.sql`

Production generated identity:
`20260901183021_food_catalog_plan1_semantic_corrections`

Correction blob:
`1e4dff8b5fea6d8d8b60fc78a77033b32e07ff35`

Plan 3 exact-base/final-scope verification confirms both applied Plan 1 migration blobs remain unchanged.

### Plan 1 established

- stable Food root identity;
- source records/provenance;
- nullable immutable nutrition revisions;
- source-backed serving facts;
- localized/provenance-aware names;
- taxonomy registry/assignments;
- Market Scope registry/memberships/assignments;
- immutable verification assertions;
- immutable merge events;
- RLS/least privilege;
- same-Food provenance constraints.

QA corrections:
1. non-direct household gram conversion requires source provenance;
2. source-origin names require source provenance.

No provider population/activation/generation promotion occurred.

---

## 4. Plan 2 — COMPLETE / SQUASH-MERGED

**Plan:** `docs/superpowers/plans/2026-09-01-food-catalog-domain-service-v2.md`

PR: `#164 — Food Catalog V2 — Domain Service + Compatibility Projection`

Final approved implementation head:
`3badad0704565f31f92476e94047f3ce131ab6cc`

Canonical phase-close Quality:
`33620840597` — PASS on exact approved head.

User squash-merged PR #164. Main merge commit:
`2883e077f1fdc159330c29b1dc6124ec905738e2`

### Plan 2 established

- Food Catalog V2 server contracts;
- Supabase-independent read/write ports;
- strict canonical read adapter;
- validated append-only immutable-fact write adapter;
- canonical root resolution;
- raw `FoodCatalogDomainBundle`;
- evidence-safe pure compatibility projection;
- relocated legacy `food_items` compatibility implementation under Food Catalog;
- Nutrition thin façade;
- direct-table/service-boundary guards.

Plan 2 deliberately **does not choose current facts**. Raw facts must never be interpreted via latest revision/time/order. Plan 3 owns current-effective authority.

Plan 2 side effects:
- DB migration: NO
- Production mutation: NO
- Food population: NO
- activation/promotion: NO
- member V2 cutover: NO
- Activity Catalog mutation: NO

---

## 5. Plan 3 — CURRENT / IMPLEMENTATION REVIEW

### Approved written specification

`docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`

Plan 3 architecture and the formal 12-task implementation plan were explicitly approved before implementation. Implementation was separately authorized and executed on the dedicated review branch. The design/spec itself still grants **no Production mutation authority**.

### Approved design decisions

1. **Catalog Generation is sole current-effective authority.** No latest row/revision/time/root mutable field.
2. **Full immutable generation composition.** Full snapshot; references immutable fact IDs; no runtime delta inheritance.
3. **Single nullable current pointer.** Promotion/rollback/revocation history is immutable/audited.
4. **Activation Sets/Grants are separate.** Activation grants eligibility; it does not publish.
5. **Candidate generation = explicit base + exact change manifest → full materialized snapshot.**
6. **Verification is linear immutable same-Food/same-scope chain.** Generation selects exact assertion IDs.
7. **Trust Profile is pure structured projection.** No numeric trust score.
8. `Verified` requires active + identity verified + nutrition verified + accepted activation/source authority + zero blockers. Serving verification is not mandatory.
9. Plan 3 defines blocker interface only; Plan 4 later owns quarantine/cases.
10. Current service = pointer → exact generation selection/redirect → exact hydration → Trust Profile → optional compatibility projection.
11. Generation redirects are flattened direct old-ID → active survivor.
12. Promotion/rollback use DB transaction + expected-current CAS + idempotency.
13. Plan 3 uses server-only control-plane commands; Plan 6 later owns permanent capability security.
14. Forward schema migration is allowed in implementation code, but Production apply is separately authorized.
15. Bootstrap has no fake Generation 0; pointer remains `NULL` until explicit future promotion.

### Design self-review corrections already binding

- Later activation invalidation or verification assertion does not retroactively alter a sealed/promoted generation.
- Promotion binds an exact validation report ID, never a “latest report”.
- Merged identities are generation redirects, not duplicate ambiguous merged lifecycle rows.

---

## 6. Plan 3 implementation — EXECUTED ON REVIEW BRANCH / PLANNER QA/QC PENDING

**Plan path:**
`docs/superpowers/plans/2026-09-02-food-catalog-plan3-activation-verification-generations.md`

Initial plan commit:
`745e8ab93c720b115b1ee69e76f9e5ae3145a50a`

Self-reviewed plan commit:
`b9b3d18f78765ed47f346413aa3800af801b1899`

Implementation branch:
`feat/food-catalog-generation-authority-v3`

Ready-for-review PR:
`#165 — Food Catalog Plan 3 — Activation, Verification, Trust + Catalog Generations`

Recorded implementation base:
`96dbe4c42f908737e5701df83d8f47356dea6096`

Task 1–11 implementation evidence head:
`03a498e4ef6cce1f5460479a6a381795a5c8b067`

Exact-head Task 11 / full-regression PR Quality:
`33679147523` — PASS.

Planner correction pass then fixed three P1 blockers with causal RED/GREEN evidence:

1. generation validation pagination/bulk enumeration — GREEN `297c756e85e03b277c5de800c7c4b86d0892ee6`, PR Quality `33689372475`;
2. trusted PostgreSQL semantic replay identity — RED `00ff1f0f573d1a9181fc4d2a651c4eb657575677`, PR Quality `33689990781`, database job `100446350218`; GREEN `58098f9e3311ce3f6f90a575acbcb04d2893de77`, PR Quality `33692020607`, database job `100452649351`;
3. single verification-chain root per `(food_id, assertion_scope)` — RED `2ab5dc1cff8ccc53ebc6458869bc09fd6dcd6056`, PR Quality `33692433014`, database job `100454013274`; GREEN `444d706efecb8b33220cd2de4fc31f7300974c00`, PR Quality `33693069181`, database job `100456022708`.

The exact corrected implementation head `444d706efecb8b33220cd2de4fc31f7300974c00` passed the full PR Quality regression: scope classification, exact-head integrity, repository/telemetry contracts, lint, typecheck, full unit suite, production build, chronological migration replay, database lint, registered database verification SQL, migration ledger, database integration tests, Workout History integration tests, and required-summary. The three P1 review threads were replied to with exact GREEN evidence and resolved only after this run passed.

Status-only documentation reconciliation is now the only SHA-changing phase-close work. Independent Planner correction re-review and canonical phase-close `.github/workflows/quality.yml` remain mandatory before merge approval.

Implemented forward migration:
`supabase/migrations/20260902150000_food_catalog_generation_authority.sql`

It remains repository-only `pending`; it has **not** been applied to Production.

### Important plan self-review corrections implemented

1. Reuse existing `FoodVerificationScope`; no parallel `GenerationVerificationScope`.
2. Singleton pointer includes `current_validation_report_id` in addition to generation/event because after rollback the transition event is a rollback event, not a promotion event.
3. Operation-id idempotency is race-safe using transaction advisory lock before immutable operation lookup/insert.
4. Rollback requires exact target generation/checksum + prior target promotion event + exact target validation report/checksum; no inferred previous generation/report.
5. Implementation used exact recorded base `96dbe4c42f908737e5701df83d8f47356dea6096` and verified the Plan 2 squash ancestor.

### Plan 3 implementation tasks

1. Domain contracts, stable error codes, canonical hashing — PASS.
2. One normalized Plan 3 schema migration + truthful pending-ledger classification — PASS.
3. Atomic service-role-only PostgreSQL RPCs + disposable database verifier — PASS.
4. Supabase-independent Plan 3 ports + strict read/RPC adapters — PASS.
5. Deterministic Activation Set create/grant/invalidate service — PASS.
6. Full immutable generation builder + deterministic composition checksum — PASS.
7. Deterministic generation validator + immutable validation report — PASS.
8. Pure structured Trust Profile — PASS.
9. Exact current-generation read/hydration + compatibility bridge — PASS.
10. Typed promote/rollback/revoke command services — PASS.
11. Physical-table / privileged-command / no-implicit-current boundary tests — PASS.
12. Full regression + correction pass + documentation reconciliation + final exact-head phase-close gates — IN PROGRESS; corrected implementation regression is GREEN, final docs-head PR Quality and canonical Quality remain required.

### Implemented schema authority

Normalized tables include:

- `food_catalog_control_operations`
- `food_catalog_activation_sets`
- `food_catalog_activation_set_members`
- `food_catalog_activation_events`
- `food_catalog_generations`
- `food_catalog_generation_foods`
- `food_catalog_generation_servings`
- `food_catalog_generation_names`
- `food_catalog_generation_taxonomy`
- `food_catalog_generation_markets`
- `food_catalog_generation_verification`
- `food_catalog_generation_redirects`
- `food_catalog_generation_validation_reports`
- `food_catalog_generation_validation_findings`
- `food_catalog_generation_events`
- `food_catalog_current_generation`

The singleton pointer contains:
- `current_generation_id`
- `current_event_id`
- `current_validation_report_id`
- `pointer_revision`

It is seeded with all current references `NULL`; no generation or Food data is seeded.

### Implemented privileged RPCs

- `food_catalog_create_activation_set_v1(jsonb)`
- `food_catalog_grant_activation_set_v1(jsonb)`
- `food_catalog_invalidate_activation_grant_v1(jsonb)`
- `food_catalog_create_generation_v1(jsonb)`
- `food_catalog_record_generation_validation_v1(jsonb)`
- `food_catalog_promote_generation_v1(jsonb)`
- `food_catalog_rollback_generation_v1(jsonb)`
- `food_catalog_revoke_generation_v1(jsonb)`

All are service-role-only. No browser/member/admin generic RPC access is exported.

### Migration-ledger state

The new migration is classified `pending` in `supabase/migration-ledger.json`.

Current repository ledger truth:
- `productionMigrationCount = 63`;
- `pendingCount = 1`;
- `unresolvedCount = 1`;
- `historyRepair.state = pending`;
- `schemaVerifiedUntrackedCount = 0`;
- derived `release_ready = false`;
- no `productionVersion`/`productionName` is invented for Plan 3;
- latest applied Production identity remains `20260901183021_food_catalog_plan1_semantic_corrections`;
- compatibility marker remains `20260724232734`.

Corrected Plan 3 migration blob at implementation correction head:
`65aa6fe1eb77a60c141e01174f128611f36f7958`

Protected applied Plan 1 blobs remain:
- core `3ea9a95b818068dbe03d080fb205dfcdf5af07ab`;
- semantic correction `1e4dff8b5fea6d8b60fc78a77033b32e07ff35`.

### Plan 3 implementation STOP gates — CURRENT TRUTH

- Production migration apply: NO
- Food population: NO
- provider ingestion: NO
- Production activation: NO
- Production generation promotion: NO
- member runtime cutover: NO
- deployment: NO
- Activity Catalog mutation: NO
- Plan 4: NO
- compatibility marker changed: NO
- applied Plan 1 migration bytes changed: NO
- PR merged: NO

Final implementation handoff must remain unmerged for independent Planner correction re-review. PR #165 is already Ready for review. Canonical phase-close Quality must run on the exact final status-only documentation head.

Even after code merge, Production schema application requires separate exact authority. Even schema application does not authorize Food activation or generation promotion.

---

## 7. Remaining roadmap after Plan 3

### Plan 4 — Ingestion V2, Quarantine, Release-Diff Operations
Structured identity/nutrition/serving/name/taxonomy/market facts; deterministic manifests; quarantine/resolution; heartbeat/lease; single-writer Production execution; expected-vs-observed reconciliation; release diffs; operational events.

**Exit:** source adapter can create deterministic safe draft mutations without arbitrary canonical edits.

### Plan 5 — Rebuildable Search Projection + Consumer Search Migration
Generation-aware search documents, PostgreSQL search first, deterministic ranking/filter policies, market/language handling, keyset cursors, bounded hydration, personalization overlay; Food Library moves behind V2 search boundary.

High Protein / Low Carb labels/filters are derived search/presentation facts, not canonical taxonomy.

### Plan 6 — Curation, Corrections, Capability Security, Observability
Correction cases/evidence, personal overrides, capability-based control plane, human/service principals, immutable audit, metrics, withdrawal/break-glass.

### Plan 7 — Backup/Export/Restore + Legacy Retirement
Portable Food Catalog export/restore, search rebuild verification, final transitional authority retirement after live preconditions.

### Plan 8 — USDA Foundation Batch 1A Adapter + Full Dry Run
April 2026 Foundation adapter, exact nutrient/source portions/naming/taxonomy/market/matching, deterministic full dry run `1A0`. No Production ingestion.

### Plan 9 — USDA Foundation Production Canary + Promotion
Separate data-operation authority: representative canary `1A1`, draft-only Production ingestion, QA/activation subset, then separately approved `1A2` full promotion.

### Plan 10 — USDA FNDDS Batch 1B
FNDDS 2021–2023 Oct 2024 handling, Foundation reconciliation, dry-run `1B0`, canary `1B1`, later separately approved full `1B2`.

---

## 8. Production baseline to re-check before any future schema apply

Last independently verified Food Catalog state through Plan 2:

- `food_items = 0`
- `food_source_records = 0`
- `food_nutrition_revisions = 0`
- `food_serving_options = 0`
- `food_names = 0`
- `food_taxonomy_assignments = 0`
- `food_market_assignments = 0`
- `food_verification_assertions = 0`
- `food_merge_events = 0`

Latest applied Food Catalog migration identity:
`20260901183021_food_catalog_plan1_semantic_corrections`

Do not assume these values remain true forever. Re-read Production before any destructive operation, migration apply, activation, or population authority.

---

# Current Next Move

Do **not** merge, deploy, apply the pending migration, populate Foods, ingest providers, execute activation, promote a generation, cut member runtime over, mutate Activity Catalog, or start Plan 4.

Required next sequence:

1. require exact-head PR Quality on the final status-only documentation head;
2. independently re-check final PR head, correction diff, protected Plan 1 blobs, pending ledger state, resolved review threads, and absence of new blockers;
3. require canonical `.github/workflows/quality.yml` on that same exact final head;
4. hand the frozen exact head and correction evidence to independent Planner correction re-review;
5. merge only after explicit Planner approval.

PR #165 is already Ready for review. Do not move it back to Draft and do not waive the canonical Quality gate.