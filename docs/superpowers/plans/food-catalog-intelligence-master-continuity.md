# Plaivra Food Catalog Intelligence — Master Continuity / Recovery Handoff

**Purpose:** living project-continuity authority for future Plaivra Planner chats.  
**Repository:** `ahmedmohameda7222-ship-it/gymsands`  
**Plan 3 implementation base `main`:** `96dbe4c42f908737e5701df83d8f47356dea6096`
**Program:** Food Catalog Intelligence — Architectural Clean Rebuild-in-Place  
**Total roadmap plans:** 10  
**Completed plans:** Plan 1, Plan 2  
**Current plan:** Plan 3 — Activation, Verification, Trust, and Catalog Generations  
**Current Plan 3 state:** implementation and seven-P1-plus-one-P2 Planner correction pass complete on Ready-for-review PR #165; all correctness threads resolved after exact RED/GREEN evidence; code-complete correction head `13b2cd6008cfd831ed108d3333f3d9b669f77335` passed PR Quality `33766974778`; final status-only documentation is being frozen and exact-head PR regression plus fresh canonical phase-close Quality are required on the resulting ultimate head before independent Planner final re-review
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

## 6. Plan 3 implementation — IMPLEMENTATION + SEVEN-P1-PLUS-ONE-P2 CORRECTION PASS COMPLETE / FINAL EXACT-HEAD PHASE-CLOSE PENDING

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

Independent correction review identified seven P1 blockers plus one P2 persistence-contract mismatch. All were corrected with causal RED/GREEN evidence without reopening the architecture:

1. **Generation validation pagination/bulk hydration.** RED `4e1158caad7e88741666220914b959aaa505e857`, PR Quality `33688136654`, core job `100440427269`: >1,000-row validation received only 1,000 of 1,002 Foods and 1,000 of 1,001 redirects. GREEN `297c756e85e03b277c5de800c7c4b86d0892ee6`, PR Quality `33689372475`, core job `100444385557`, database job `100444385568`.
2. **Trusted PostgreSQL semantic replay identity.** RED `00ff1f0f573d1a9181fc4d2a651c4eb657575677`, PR Quality `33689990781`, database job `100446350218`: `Changed semantic command reused an operation ID by trusting the caller checksum.` GREEN `58098f9e3311ce3f6f90a575acbcb04d2893de77`, PR Quality `33692020607`, database job `100452649351`.
3. **Single verification-chain root per `(food_id, assertion_scope)`.** RED `2ab5dc1cff8ccc53ebc6458869bc09fd6dcd6056`, PR Quality `33692433014`, database job `100454013274`: `Second verification root for the same Food/scope was accepted.` GREEN `444d706efecb8b33220cd2de4fc31f7300974c00`, PR Quality `33693069181`, database job `100456022708`.
4. **Activation eligibility integrity.** RED `ed618552e240e9eb95b1b480acba9c31d8cd587b`, PR Quality `33736327808`, rerun database job `100589039339`: `Activation eligibility contradictions were accepted: blockers, display_identity, grant_independent_identity, identity, nutrition_basis, source_legal`. GREEN `e2cb8d760d5ec3e9d2729e74e31f649589c2c991`, PR Quality `33737691329`, database job `100592092120`. The trusted immutable eligibility predicate requires `eligibility='eligible'`, accepted source/legal evidence, resolved identity, valid nutrition basis, valid display identity, and zero blockers; it is reused by the immutable member-row structural authority, grant validation, active candidate sealing, and promotion validation.
5. **Promotion/invalidation concurrency.** Causal RED `29c61e3d969fea5d1f5d937b05679e47ae99caf4`, PR Quality `33740908113`, database job `100602525629`: `Grant invalidation committed before promotion, but the invalidated-grant candidate still became current.` Production SQL fix `7f1b2c930c22ace3586fe2d62a9d848b7cc283f7` adds shared exact-grant locking, promotion invalidation re-check under lock, and deterministic multi-grant lock order. First GREEN attempt PR Quality `33742228444`, database job `100606599934`, exposed an observer/test-harness race only. Harness-only correction `724e70bb76b533f93d2dfad0fa6a45f230b3e8c9` changes exactly one concurrency-verifier file (`+24/-18`) and no production SQL. Final exact-head PR Quality `33742679692`, database job `100608255066`, PASS.
6. **Trusted validation-report checksum at the persistence boundary.** RED `a0a9df7be448206eb092a4fe673532af4a2f557e`, PR Quality `33755929647`, database job `100650528589`: `Validation report checksum mismatch was accepted at the trusted persistence boundary.` Production SQL correction `0bc30953c77f32cb0c89a640f9561cc32a2322a9` recomputes normalized validation-report SHA-256 at the trusted DB boundary, derives verification states from sealed DB authority, requires exact generation checksum/policy binding, rejects caller checksum mismatch before report persistence, and stores/returns the trusted checksum. Existing verifier fixtures were aligned at `42b8b504d53ce5d1ae604ed1156aa53975c98556`; focused positive/stale-semantic checksum coverage was strengthened at `57e5e4cf4e418eace5d3864a23e481382ed0077a`. GREEN PR Quality `33759467874`, database job `100662554948`, PASS.
7. **Service-role direct Plan 3 table-write isolation.** RED `c67374e105801f88e0b4d8f57c64ab021a6a5c81`, PR Quality `33765997956`, database job `100684166797`: migration replay and DB lint passed, then registered database verification failed because `service_role` retained forbidden direct `TRUNCATE` authority on `public.food_catalog_control_operations`; failure artifact `9897657771`. GREEN `13b2cd6008cfd831ed108d3333f3d9b669f77335` changes only the existing unapplied Plan 3 migration: all 16 Plan 3 table revocations include `service_role`, and only the explicitly approved `SELECT` grants are added back. Exact-head PR Quality `33766974778`, database job `100687555354`, PASS through replay, DB lint, all registered database verification including the privilege-boundary verifier, migration ledger, database integrations, and Workout History integrations. Core `100687555450`, integrity `100687555525`, build `100687555582`, CI contracts `100687555591`, rendered QA/i18n `100687555577`, and required-summary `100690963900` also passed.
8. **P2 lowercase activation checksum contract.** RED `6c3d82983fb0afc01863c310357f803a2c84320d`, PR Quality `33760908165`, core job `100666750397`: unit test `rejects uppercase SHA-256 checksums before the persistence boundary` failed because uppercase checksum input was accepted. GREEN `51a68a049742b4bd83801bfaf47cb3d737c6bab2` changes only `lib/food-catalog/domain/activation.ts` (`+1/-1`) so evidence/member checksums use lowercase-only `^[0-9a-f]{64}$`, matching persistence authority. PR Quality `33761128693`, core job `100667707557`, database job `100667707407`, PASS.

The code-complete correction head before status-only reconciliation is:
`13b2cd6008cfd831ed108d3333f3d9b669f77335`

PR Quality `33766974778` passed on that exact head. Database job `100687555354` passed chronological migration replay, DB lint, full registered database verification, migration ledger, database integrations, and Workout History integrations; core `100687555450` passed lint/typecheck/full units; integrity `100687555525`, build `100687555582`, CI contracts `100687555591`, rendered QA/i18n `100687555577`, and required-summary `100690963900` were also GREEN.

All seven P1 review threads and the P2 thread were replied to with exact evidence and resolved. A full review-thread re-fetch after Blocker 7 closure found unresolved P0 = 0 and unresolved P1 = 0.

The Blocker 5 GREEN authority proves invalidation-first rejection, promotion-first success, no retroactive rewrite from later invalidation, shared exact-grant row locking, invalidation re-check under lock, deterministic multi-grant lock order, no deadlock in the covered multi-grant case, no global serialization of unrelated grants, preserved stale-current-generation CAS, and preserved trusted operation-id semantic replay.

The Blocker 6 GREEN authority proves the trusted PostgreSQL persistence boundary recomputes and verifies deterministic validation-report checksum semantics rather than trusting the caller-provided checksum.

The Blocker 7 GREEN authority proves `service_role` retains the required Plan 3 read path while direct table mutation privileges are removed, keeping mutations confined to the approved security-definer command/RPC boundary.

Status-only roadmap/master-continuity reconciliation is the final SHA-changing work. The resulting ultimate exact documentation head must pass exact-head PR regression and then a fresh canonical `.github/workflows/quality.yml` before independent Planner final re-review.

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
12. Full regression + seven-P1-plus-one-P2 correction pass + documentation reconciliation + final exact-head phase-close gates — IN PROGRESS; code-complete correction regression is GREEN, all correctness threads are resolved, and final status metadata is being frozen; exact-head PR regression and fresh canonical Quality on the ultimate documentation head remain required.

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

All are service-role-only. No browser/member/admin generic RPC access is exported. Plan 3 service-role table access is read-only after Blocker 7; mutations remain confined to these approved security-definer command services.

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
- sole pending migration is `20260902150000_food_catalog_generation_authority.sql`;
- latest applied Production identity remains `20260901183021_food_catalog_plan1_semantic_corrections`;
- compatibility marker remains `20260724232734`.

Final corrected Plan 3 migration blob after all implementation corrections:
`65cd33d5a6e8bc7af08ba8079fff8e9da6a68122`

Protected applied Plan 1 blobs remain:
- core `3ea9a95b818068dbe03d080fb205dfcdf5af07ab`;
- semantic correction `1e4dff8b5fea6d8d8b60fc78a77033b32e07ff35`.

### Plan 3 implementation STOP gates — CURRENT TRUTH

- Production mutation: NO
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

Final implementation handoff must remain unmerged for independent Planner final re-review. PR #165 must finish Ready for review. Exact-head PR regression and canonical phase-close Quality must both run on the ultimate status-only documentation head.

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

1. freeze the ultimate status-only documentation head and verify its diff from code-complete head `13b2cd6008cfd831ed108d3333f3d9b669f77335` contains only the two approved status/continuity documents;
2. obtain exact-head PR verification on that ultimate SHA, including Phase A, PR Quality, all registered Plan 3 DB verifiers, ledger, integrations, lint/typecheck/full units, build, rendered QA, and required-summary;
3. obtain a fresh canonical `.github/workflows/quality.yml` on that same exact final SHA; if the workflow trigger requires `pull_request: ready_for_review`, a metadata-only Draft → Ready transition may be used solely to retrigger it and must end Ready;
4. after canonical Quality succeeds, independently re-fetch PR #165, confirm head equals the tested SHA, re-check all review threads, correction scope, protected Plan 1 blobs, Plan 3 pending migration blob/state, ledger truth, compatibility marker, and all Production NO gates;
5. update PR status/evidence metadata with the frozen head and canonical run/job evidence without changing repository SHA;
6. hand the frozen exact head and complete correction evidence to independent Planner final re-review;
7. merge only after explicit Planner approval.

Do not waive the exact-head PR regression or canonical Quality gate.