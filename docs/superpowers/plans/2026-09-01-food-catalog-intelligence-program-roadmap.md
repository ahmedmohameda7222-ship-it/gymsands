# Food Catalog Intelligence Implementation Roadmap

**Status:** implementation-planning authority; Plan 1 complete, Plan 2 complete/merged, Plan 3 implementation + six-P1-and-one-P2 correction pass complete on review branch; all correctness review threads resolved; canonical phase-close Quality pending
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

### Plan 3 — Activation, Verification, Trust, and Catalog Generations — IMPLEMENTATION + CORRECTION PASS COMPLETE / CANONICAL PHASE-CLOSE QUALITY PENDING

Formal Plan 3 design spec:

`docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`

Detailed implementation plan:

`docs/superpowers/plans/2026-09-02-food-catalog-plan3-activation-verification-generations.md`

Implementation review branch:

`feat/food-catalog-generation-authority-v3`

Ready-for-review PR:

`#165 — Food Catalog Plan 3 — Activation, Verification, Trust + Catalog Generations`

Recorded implementation base:

`96dbe4c42f908737e5701df83d8f47356dea6096`

Task 1–11 implementation evidence head:

`03a498e4ef6cce1f5460479a6a381795a5c8b067`

Task 1–11 exact-head PR Quality:

`33679147523` — PASS.

Independent correction review identified six P1 blockers plus one P2 persistence-contract mismatch. All were corrected with causal RED/GREEN evidence without reopening the approved architecture:

1. **Generation validation pagination/bulk hydration.** RED `4e1158caad7e88741666220914b959aaa505e857`, PR Quality `33688136654`, core job `100440427269`: the >1,000-row verifier received only 1,000 of 1,002 Foods and 1,000 of 1,001 redirects. GREEN `297c756e85e03b277c5de800c7c4b86d0892ee6`, PR Quality `33689372475`, core job `100444385557`, database job `100444385568`.
2. **Trusted PostgreSQL semantic replay identity.** RED `00ff1f0f573d1a9181fc4d2a651c4eb657575677`, PR Quality `33689990781`, database job `100446350218`: `Changed semantic command reused an operation ID by trusting the caller checksum.` GREEN `58098f9e3311ce3f6f90a575acbcb04d2893de77`, PR Quality `33692020607`, database job `100452649351`.
3. **Single verification-chain root per `(food_id, assertion_scope)`.** RED `2ab5dc1cff8ccc53ebc6458869bc09fd6dcd6056`, PR Quality `33692433014`, database job `100454013274`: `Second verification root for the same Food/scope was accepted.` GREEN `444d706efecb8b33220cd2de4fc31f7300974c00`, PR Quality `33693069181`, database job `100456022708`.
4. **Activation eligibility integrity.** RED `ed618552e240e9eb95b1b480acba9c31d8cd587b`, PR Quality `33736327808`, rerun database job `100589039339`: `Activation eligibility contradictions were accepted: blockers, display_identity, grant_independent_identity, identity, nutrition_basis, source_legal`. GREEN `e2cb8d760d5ec3e9d2729e74e31f649589c2c991`, PR Quality `33737691329`, database job `100592092120`. One immutable trusted eligibility predicate is reused by the member-row structural invariant, grant validation, active candidate sealing, and promotion validation.
5. **Promotion/invalidation concurrency.** Causal RED `29c61e3d969fea5d1f5d937b05679e47ae99caf4`, PR Quality `33740908113`, database job `100602525629`: `Grant invalidation committed before promotion, but the invalidated-grant candidate still became current.` SQL fix `7f1b2c930c22ace3586fe2d62a9d848b7cc283f7` serializes exact grant invalidation/promotion authority with grant-row locks and deterministic multi-grant lock order. First GREEN attempt `33742228444`, database job `100606599934`, exposed observer/test-harness skew only. Harness-only correction `724e70bb76b533f93d2dfad0fa6a45f230b3e8c9` changes one concurrency verifier file (`+24/-18`) and no production SQL. Exact-head PR Quality `33742679692`, database job `100608255066`, PASS.
6. **Trusted validation-report checksum at the persistence boundary.** RED `a0a9df7be448206eb092a4fe673532af4a2f557e`, PR Quality `33755929647`, database job `100650528589`: registered verification failed `Validation report checksum mismatch was accepted at the trusted persistence boundary.` SQL correction `0bc30953c77f32cb0c89a640f9561cc32a2322a9` recomputes normalized validation-report SHA-256 from trusted DB semantics, derives verification states from sealed DB authority, requires exact generation checksum/policy binding, and rejects caller checksum mismatch before persistence. Fixture alignment `42b8b504d53ce5d1ae604ed1156aa53975c98556` and focused verifier strengthening `57e5e4cf4e418eace5d3864a23e481382ed0077a` preserve positive acceptance and stale-semantic rejection coverage. GREEN `57e5e4cf4e418eace5d3864a23e481382ed0077a`, PR Quality `33759467874`, database job `100662554948`, PASS.
7. **P2 lowercase activation checksum contract.** RED `6c3d82983fb0afc01863c310357f803a2c84320d`, PR Quality `33760908165`, core job `100666750397`: unit test `rejects uppercase SHA-256 checksums before the persistence boundary` failed because uppercase input was accepted. GREEN fix `51a68a049742b4bd83801bfaf47cb3d737c6bab2` changes only `lib/food-catalog/domain/activation.ts` (`+1/-1`) so activation evidence/member checksums use lowercase-only `^[0-9a-f]{64}$`, matching PostgreSQL persistence constraints. PR Quality `33761128693`, core job `100667707557`, database job `100667707407`, PASS.

The exact corrected implementation head before final status-only reconciliation is:

`51a68a049742b4bd83801bfaf47cb3d737c6bab2`

PR Quality `33761128693` passed on that exact head, including scope/integrity, repository contracts, lint, typecheck, full units, production build, chronological migration replay, DB lint, registered database verification, migration ledger, database integrations, Workout History integrations, rendered QA, and required-summary. Same-head Phase A `33761128687`, Exercise Detail Runtime QA `33761128713`, and Exercise Library Locale Runtime QA `33761128708` also passed. All six P1 threads and the P2 thread were replied to with exact evidence and resolved; a complete thread re-fetch found zero unresolved correctness threads.

Plan 3 adds exactly one repository-only pending migration:

`supabase/migrations/20260902150000_food_catalog_generation_authority.sql`

Current Plan 3 migration blob after all code corrections:

`555099adf93eef1db3f29e660dc76b7cfa148d86`

Migration ledger remains truthful with `productionMigrationCount=63`, `pendingCount=1`, `unresolvedCount=1`, `historyRepair.state=pending`, `schemaVerifiedUntrackedCount=0`, and derived `release_ready=false`; latest applied Production identity remains `20260901183021_food_catalog_plan1_semantic_corrections`. The released compatibility marker remains `20260724232734`.

Applied Plan 1 migration blobs remain byte-identical: core `3ea9a95b818068dbe03d080fb205dfcdf5af07ab`, semantic correction `1e4dff8b5fea6d8d8b60fc78a77033b32e07ff35`. No Production migration apply, Food population, provider ingestion, Production activation execution, Production generation promotion, member runtime V2 cutover, deployment, Activity Catalog mutation, or Plan 4 work occurred.

A fresh canonical phase-close `.github/workflows/quality.yml` is still mandatory on the ultimate exact final status-only documentation head before independent Planner final re-review. PR #165 remains unmerged.

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
- the current pointer carries exact generation/transition/validation evidence so rollback is deterministic;
- operation-id retries are serialized race-safely;
- merged source IDs are direct generation redirects to active survivors;
- no fake Generation 0; current pointer may remain `NULL` before real promotion.

**Exit condition:** drafts can exist without visibility; activation remains separate; current reads are generation-authoritative; promotion is audited/atomic; rollback can restore an explicitly selected previous healthy generation without destructive rewriting. **Implementation and six-P1-plus-one-P2 correction pass satisfied on review branch; merge approval remains pending canonical phase-close Quality and independent Planner final re-review.**

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
Plan 3 Activation / Verification / Generations — IMPLEMENTATION + CORRECTION PASS COMPLETE / CANONICAL QUALITY PENDING
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

Keep Ready-for-review PR #165 unmerged. Freeze status-only documentation, obtain a fresh canonical `.github/workflows/quality.yml` on the ultimate exact final head, then independently re-fetch the PR head/review threads/protected migration blobs/ledger and hand that frozen exact head to the Planner for final re-review. Merge only after explicit Planner approval.

No Production mutation is authorized by implementation completion, canonical Quality, Planner review, or merge approval.