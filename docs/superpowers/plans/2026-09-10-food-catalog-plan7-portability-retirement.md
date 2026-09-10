# Food Catalog Plan 7 Portability and Legacy Retirement Implementation Plan

> **For the Classic ChatGPT Implementation Chat:** execute this plan only after explicit Planner implementation approval, using repository connectors and GitHub Actions evidence. Do not assume a local checkout/shell, do not use Codex, and do not perform Production writes or deployments without separately explicit authorization.

**Goal:** Build deterministic provider-neutral Food Catalog export/restore verification, prove derived search reconstruction and identity/security invariants on a disposable PostgreSQL 17.x target, migrate Product/database consumers off transitional authority through expand/deploy/contract, and only then retire an explicitly approved destructive set through forward migrations.

**Architecture:** Plan 7 is one roadmap plan with two sequential internal workstreams. Workstream 1 builds `CORE_PORTABLE` and `FULL_DR` logical export, restore, security, and search verification without Production mutation. Workstream 2 performs repository cutover, backward-compatible database expansion/reconciliation where required, separately authorized deployment, live observation/preflight, Planner approval of an exact destructive set, separately authorized forward retirement, and a complete post-retirement portability/search re-proof.

**Tech Stack:** TypeScript/Node.js, PostgreSQL 17.x/Supabase-compatible SQL contracts, Vitest, Node test scripts, GitHub Actions, existing Food Catalog Plan 1–6 domain services/RPCs, SHA-256, AES-256-GCM for protected transport.

**Spec:** `docs/superpowers/specs/2026-09-10-food-catalog-plan7-portability-retirement-design.md`

**Discovery authority:** `docs/superpowers/plans/2026-09-10-food-catalog-plan7-discovery-inventory.md`

## Global Constraints

- **Implementation is not authorized by this document.** Start only after an explicit Planner implementation approval.
- Start implementation from then-current `main`; re-read Plan 7 design/inventory, parent architecture, roadmap, and continuity before edits.
- Applied migrations remain immutable. Use forward migrations only.
- **Do not reserve long-lived migration timestamps/filenames in advance.** At the exact task requiring SQL, read then-current `main` and latest repository/Production migration authority, allocate the next safe identity, record it in task/PR evidence, then create SQL. Never silently rename an applied migration.
- No Plan 8/USDA/provider ingestion, Production Food population, activation, generation promotion, compatibility promotion, or Activity Catalog mutation.
- Production discovery/preflight remains SELECT/read-only until a separate authorization explicitly names an allowed Production DB mutation.
- Deployment always requires separate Planner authorization. Deployment is nevertheless **mandatory evidence before eventual destructive Production retirement**; repository cutover alone is insufficient.
- No Production retirement migration may be applied while the deployed application artifact is still pre-cutover.
- Preserve exact Plaivra Food UUIDs and all stable authority/history identities required by the spec.
- Catalog Generation remains sole current-effective global authority.
- Historical consumer snapshots are never rewritten.
- Unknown nutrition remains `NULL`; no fabricated serving or generic unit conversion.
- Every authoritative export uses one PostgreSQL MVCC snapshot.
- Migration/current-pointer/compatibility observations are captured inside the same snapshot as exported authoritative segments.
- Independent REST/API pagination without common DB snapshot is not authoritative export evidence.
- No Product write lock/stop-the-world export lock is introduced.
- Authoritative PostgreSQL scalars remain lossless/type-aware before JavaScript canonicalization.
- SearchDocuments are `DERIVED_REBUILD`; a relation is never classified derived without a defined deterministic rebuild source.
- Classification and restore `loadMode` are separate; seeded rows are validated rather than blindly inserted/upserted.
- Protected segments use AES-256-GCM with fresh random nonce per segment/run; no deterministic encryption and no plaintext fallback.
- Plaintext semantic SHA-256 and ciphertext/transport SHA-256 are distinct; semantic root never depends on randomized ciphertext/nonces.
- Artifact validity is separate from caller-supplied RPO/recovery eligibility; there is no hard-coded Plan 7 artifact TTL.
- `CORE_PORTABLE` can prove core identity/generation/search portability but cannot emit final DR-ready. Only `FULL_DR` can.
- Real Production PII/security plaintext is never uploaded to GitHub Actions artifacts; CI uses deterministic protected fixtures and ephemeral keys.
- Every verification failure is fail-closed.
- Workstream 2 destructive retirement cannot begin while any consumer/dependency/deployed-live matrix entry is unsupported or any preflight differs from approved expectation.
- Every candidate head must be verified by fresh exact-head GitHub Actions evidence; stale success from another SHA is not reusable.

---

# Workstream 1 — Portability / Backup / Export / Restore Verification

## Task 1: Reconfirm frozen Planner policy and exact implementation baseline

**Files:**
- Modify only if then-current facts differ: `docs/superpowers/specs/2026-09-10-food-catalog-plan7-portability-retirement-design.md`
- Modify only if discovery differs: `docs/superpowers/plans/2026-09-10-food-catalog-plan7-discovery-inventory.md`

**Interfaces:**
- Consumes: frozen Planner policy block in the design.
- Produces: exact implementation-baseline evidence; no new Product policy decisions.

- [ ] **Step 1: Re-read current `main` and read-only Production baseline.**

Confirm main SHA, migration ledger, physical/latest Production migration, PostgreSQL major/minor, global catalog counts, current-generation pointer, compatibility version/marker, seeded reference/singleton rows, required extensions, `food_items` nullability, and Activity Catalog separation.

- [ ] **Step 2: Stop on superseding architecture or schema drift.**

Do not reinterpret the frozen policy silently. Planner amendment is required for a material contradiction.

- [ ] **Step 3: Commit documentation-only corrections if needed and run docs-scope exact-head checks.**

No runtime/migration change belongs in this task.

## Task 2: Implement lossless portable contract, relation registry, and load modes

**Files:**
- Create: `lib/food-catalog/portability/export-contract.ts`
- Create: `lib/food-catalog/portability/export-contract.test.ts`
- Create: `lib/food-catalog/portability/canonicalize.ts`
- Create: `lib/food-catalog/portability/canonicalize.test.ts`
- Create: `lib/food-catalog/portability/relation-registry.ts`
- Create: `lib/food-catalog/portability/relation-registry.test.ts`

**Interfaces:**
- Produces:
  - `PortableExportProfile = "CORE_PORTABLE" | "FULL_DR"`
  - `PortableLoadMode = "VALIDATE_PRESEEDED" | "RESTORE_EXACT" | "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION" | "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY" | "DERIVED_REBUILD"`
  - `PortableExportManifestV1`
  - `PortableSegmentDescriptorV1`
  - a lossless PostgreSQL scalar transport contract containing PostgreSQL type identity + lossless text/token representation
  - deterministic plaintext semantic canonicalization/hashing
  - `FOOD_CATALOG_PORTABLE_RELATIONS_V1` with classification, logical segment, load mode, stable key, seed ownership, protected/excluded fields, required profile.

- [ ] **Step 1: Write failing manifest/profile/version tests.**

Reject unknown format/canonicalization/profile/load-mode values, duplicate segment names/stable IDs, missing mandatory segments, malformed digests, secret fields, and inconsistent snapshot-boundary references.

- [ ] **Step 2: Write lossless scalar tests before canonicalization implementation.**

Cover:

- timestamp with exact PostgreSQL microseconds;
- bigint greater than `Number.MAX_SAFE_INTEGER`;
- large/high-precision numeric values and decimal scale variants;
- negative zero/leading/trailing zero semantic normalization;
- JSONB nested high-precision numeric tokens;
- NULL versus zero;
- exact typed PostgreSQL round-trip.

Native JS `number`/`Date` must not be the first authoritative representation for these values.

- [ ] **Step 3: Implement deterministic semantic canonicalization over lossless transport.**

UUID lowercase; UTC six-digit microsecond timestamp canonical form; decimal canonical form without binary float/exponent output; recursively sorted JSON object keys; arrays preserve order unless relation contract explicitly marks set semantics.

- [ ] **Step 4: Encode load-mode and seed-ownership rules.**

At minimum encode:

- taxonomy/market migration seed keys → `VALIDATE_PRESEEDED`;
- governance policy seed/pointer and current-generation singleton → preseed validation plus explicit keyed mutable-field restore;
- `food_items` → `RECONSTRUCT_TRANSITIONAL_COMPATIBILITY` for current schema;
- lease-bearing governance/ingestion rows → `RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION`;
- SearchDocuments → `DERIVED_REBUILD`;
- `food_aliases`/`food_market_relevance` → exact transitional preservation while present, not derived without rebuild.

- [ ] **Step 5: Verify zero-row segment contracts.**

Required empty segments remain explicit and hashed.

## Task 3: Build one-snapshot provider-neutral streaming export

**Files:**
- Create: `lib/food-catalog/portability/postgres-snapshot-reader.ts`
- Create: `lib/food-catalog/portability/postgres-snapshot-reader.test.ts`
- Create: `lib/food-catalog/portability/export-reader.ts`
- Create: `lib/food-catalog/portability/export-reader.test.ts`
- Create: `lib/food-catalog/portability/export-writer.ts`
- Create: `lib/food-catalog/portability/export-writer.test.ts`
- Create: `scripts/export-food-catalog-portable.mjs`
- Create: `scripts/export-food-catalog-portable.test.mjs`
- Create: `.github/workflows/food-catalog-portable-export-qa.yml`

**Interfaces:**
- Consumes: relation registry + lossless scalar/canonical hash contracts.
- Produces: `CORE_PORTABLE` or `FULL_DR` bundle with all authoritative segments bound to one snapshot boundary.

- [ ] **Step 1: Write snapshot-boundary tests first.**

Single-reader implementation uses a read-only `REPEATABLE READ` transaction. Multi-reader implementation, if used, must use equivalent exported-snapshot semantics and import the same snapshot before every worker query.

- [ ] **Step 2: Add concurrent-write/torn-export negative test.**

Start export and read segment A; commit a concurrent test write changing authority/current pointer; continue export. One trusted artifact must observe only one side of the write. A new separate export may observe the other side. No mixed artifact may validate.

- [ ] **Step 3: Capture source observations inside the same snapshot.**

Migration/latest migration, pointer, compatibility and other source evidence used by the manifest are queried inside the export snapshot, not before/after in independent API calls.

- [ ] **Step 4: Stream/page by stable key inside the snapshot.**

Reject duplicate/non-monotonic keys. Offset order is not semantic authority.

- [ ] **Step 5: Stream deterministic segment bytes/hashes without whole-catalog buffering.**

All values enter writer from the lossless transport contract.

- [ ] **Step 6: Generate the deterministic semantic manifest last.**

Every authority segment references the same snapshot-boundary checksum.

- [ ] **Step 7: Refuse unsnapshotted REST/API adapters for authoritative mode.**

They may be diagnostic tools but cannot emit a trusted Plan 7 artifact.

## Task 4: Implement artifact validity and separate recovery eligibility

**Files:**
- Create: `lib/food-catalog/portability/validate-artifact.ts`
- Create: `lib/food-catalog/portability/validate-artifact.test.ts`
- Create: `lib/food-catalog/portability/recovery-eligibility.ts`
- Create: `lib/food-catalog/portability/recovery-eligibility.test.ts`

**Interfaces:**
- Produces:
  - pure structural/semantic artifact validation;
  - `evaluateRecoveryEligibility(manifest, { maxArtifactAge, evaluationTime })` or equivalent explicit caller policy.

- [ ] **Step 1: Write artifact-validity tests that do not hard-code TTL.**

An old but structurally/hash/schema/ownership-valid artifact remains valid.

- [ ] **Step 2: Write recovery-eligibility tests.**

Same artifact can be accepted under one explicit RPO and rejected under a stricter `maxArtifactAge` without changing artifact validity.

- [ ] **Step 3: Treat `capturedAt`/snapshot time as evidence.**

No universal Plan 7 age constant.

## Task 5: Build disposable restore loader with preseed validation

**Files:**
- Create: `lib/food-catalog/portability/restore-plan.ts`
- Create: `lib/food-catalog/portability/restore-plan.test.ts`
- Create: `scripts/restore-food-catalog-portable.mjs`
- Create: `scripts/restore-food-catalog-portable.test.mjs`
- Create: `scripts/verify-food-catalog-portable-target.mjs`
- Create: `scripts/verify-food-catalog-portable-target.test.mjs`

**Interfaces:**
- Consumes: valid artifact + exact target capability/schema profile.
- Produces: disposable restored target and structured evidence; never Production promotion.

- [ ] **Step 1: Enforce PostgreSQL 17.x target profile.**

Verify exact tested version, `pgcrypto`, `pg_trgm`, `uuid-ossp`, and required auth/RLS compatibility harness semantics.

- [ ] **Step 2: Build target strictly from Git migration/schema authority.**

Exported DDL is not authority.

- [ ] **Step 3: Validate migration-created seed/singleton rows before portable data load.**

Taxonomy/market registry, governance policy/pointer, current-generation singleton and release-schema-compatibility target state are never blindly inserted/upserted.

- [ ] **Step 4: Restore current `food_items` without an `id`-only shortcut.**

Preserve every exported physical compatibility value needed by current schema/runtime; temporarily set only cyclic `verified_source_record_id=NULL`, restore source records, then reconstruct that exact compatibility value and validate the composite FK.

- [ ] **Step 5: Apply each registry `loadMode` explicitly.**

`RESTORE_EXACT`, transient-neutralized restore, transitional reconstruction and derived rebuild are separate code paths with tests.

- [ ] **Step 6: Keep current-generation pointer unavailable until pre-pointer verification passes.**

Validate migration-created singleton identity first, then exact pointer fields last.

- [ ] **Step 7: Make partial restore visibly untrusted/idempotent.**

Retry is keyed by artifact semantic root + immutable segment hashes; conflicting non-identical stable IDs fail.

## Task 6: Implement restore assertion engine

**Files:**
- Create: `lib/food-catalog/portability/restore-assertions.ts`
- Create: `lib/food-catalog/portability/restore-assertions.test.ts`
- Create: `scripts/verify-food-catalog-restore.mjs`
- Create: `scripts/verify-food-catalog-restore.test.mjs`

**Interfaces:**
- Produces: `FoodCatalogRestoreVerificationReportV1` with exact target capability profile, snapshot boundary, identity/hash/graph/security assertions and separate recovery-eligibility status.

- [ ] **Step 1: Implement byte/hash assertions.**

Verify plaintext semantic hashes/manifest root, transport hashes as transport integrity, and stored architecture-defined checksums.

- [ ] **Step 2: Implement exact typed value/identity assertions.**

Food/fact/revision/event/report/operation IDs, pointer IDs/revision, ownership, typed timestamps/bigints/numerics, policy versions.

- [ ] **Step 3: Implement graph assertions.**

Source, nutrition/name/serving lineage, verification chains, activation, generations, redirects, merge topology.

- [ ] **Step 4: Implement historical consumer-reference assertions.**

Frozen Diary/Recipe/Saved Meal/Meal Plan values remain unchanged; Food IDs remain valid under their contract.

- [ ] **Step 5: Fail closed on any unknown mandatory assertion.**

`ready` is profile-aware: `CORE_PORTABLE` can report core portability only, never final DR readiness.

## Task 7: Implement protected `FULL_DR` segments and encryption contract

**Files:**
- Create: `lib/food-catalog/portability/protected-segments.ts`
- Create: `lib/food-catalog/portability/protected-segments.test.ts`
- Create: `lib/food-catalog/portability/key-provider.ts`
- Create: `lib/food-catalog/portability/key-provider.test.ts`
- Modify: `lib/privacy/data-export.ts`
- Modify: exact current privacy-export tests

**Interfaces:**
- Consumes: external key-provider interface.
- Produces: AES-256-GCM encrypted protected owner/security segments plus Plan 6 owner privacy export coverage.

- [ ] **Step 1: Write encryption negative tests first.**

Reject missing key provider, plaintext fallback, malformed key, nonce reuse, and any test/implementation that expects deterministic ciphertext.

- [ ] **Step 2: Encrypt each protected segment with fresh random nonce.**

Same plaintext encrypted twice must keep the same plaintext semantic SHA-256 and produce different nonce/ciphertext/transport SHA-256.

- [ ] **Step 3: Keep key material outside artifact/repository/log/evidence.**

CI uses ephemeral test keys only; no paid KMS is required by architecture.

- [ ] **Step 4: Close privacy export gap for Plan 6 personal overrides.**

Owner export includes exact `food_personal_overrides`, revisions and operations for that user only.

- [ ] **Step 5: Preserve governance history without automatic operational reactivation.**

Service credentials are not portable; human identity binding and service rebind are external gates; `food.outbox.deliver` remains unavailable until replay reconciliation.

- [ ] **Step 6: Never publish real Production protected plaintext to GitHub Actions.**

A separately authorized real export may contribute only approved non-sensitive attestation/hashes to repository/CI evidence.

## Task 8: Add deterministic search rebuild, golden queries, and Workstream 1 CI evidence

**Files:**
- Create: `lib/food-catalog/portability/search-restore-verifier.ts`
- Create: `lib/food-catalog/portability/search-restore-verifier.test.ts`
- Create: `scripts/verify-food-catalog-restored-search.mjs`
- Create: `scripts/verify-food-catalog-restored-search.test.mjs`
- Create: `test/fixtures/food-catalog/plan7-golden-search-v1.json`
- Modify: `.github/workflows/food-catalog-portable-export-qa.yml`
- Create: `docs/architecture/food-catalog-portability-runbook.md`

**Interfaces:**
- Calls: `public.rebuild_food_catalog_search_projection_v2(uuid,text,text)` then `public.search_food_catalog_v2(...)`.
- Produces: exact-head core/full portability evidence; final DR-ready only from `FULL_DR` fixture verification.

- [ ] **Step 1: Build deterministic populated + zero-row fixtures.**

Use fixed UUIDs/timestamps/locale/script/market/taxonomy/redirect/favorites/log/My Food/protected-owner/security fixtures; no provider network.

- [ ] **Step 2: Rebuild only exact current restored generation/projection.**

Global serving display remains NULL until explicit serving authority exists.

- [ ] **Step 3: Run full golden query matrix.**

Exact/alias/prefix/contains, locale/script, direct/parent/GLOBAL market, category/current cuisine, nullable numerics, presets, favorites/recent/My Foods, cursor continuation/context mismatch, redirect, stale-generation isolation.

- [ ] **Step 4: Run corruption, precision-loss, torn-export, wrong-owner, nonce-reuse and preseed-mismatch failures.**

Each fails before target trust.

- [ ] **Step 5: Publish only deterministic non-sensitive CI evidence tied to exact head SHA.**

No Production write/deployment/population/promotion.

**Workstream 1 completion gate:** Planner reviews exact-head `CORE_PORTABLE` and deterministic protected-fixture `FULL_DR` evidence and separately authorizes beginning implementation Workstream 2. Green portability evidence alone never authorizes retirement.

---

# Workstream 2 — Consumer Cutover, Deploy Proof, and Legacy Retirement

## Task 9: Cut new Food handoffs to current-generation authority

**Files:**
- Modify: `services/nutrition-v1/server/food-handoff.ts`
- Modify: `services/nutrition-v1/server/food-handoff.test.ts`
- Modify exact handoff/MCP tests
- Use existing current-generation Food Catalog service

- [ ] **Step 1: Write failure-first tests for no flat current truth.**

Redirect survivor, deprecated/withdrawn rejection, exact selected facts, nullable facts, no latest-row inference.

- [ ] **Step 2: Replace catalog `resolveCatalogFood` use with current-generation resolution.**

My Foods remain separate.

- [ ] **Step 3: Cut personal overlay reads/writes to Plan 6 personal overrides.**

At this stage old correction table remains physically available for backward compatibility until live retirement gate.

- [ ] **Step 4: Prove Diary/Saved Meal/Recipe/Meal Plan frozen schemas unchanged.**

Only new authority resolution changes.

## Task 10: Cut recipe verification to generation-selected trust

**Files:**
- Modify: `services/nutrition-v1/server/recipe-published.ts`
- Modify: `services/nutrition-v1/server/recipe-workspace.ts`
- Modify corresponding tests

- [ ] **Step 1: Write verified/revoked/missing assertion tests.**

Root `is_verified` must not control outcome.

- [ ] **Step 2: Replace legacy verification helper with bounded generation/trust service.**

Avoid uncontrolled N+1 behavior.

- [ ] **Step 3: Prove historical published snapshots remain immutable.**

## Task 11: Cut MCP/browser/prompt/admin consumers and isolate Egyptian suggestions

**Files:**
- Modify: `lib/mcp/nutrition-v1-food-execution.ts`
- Modify: `lib/mcp/tool-executor-implementation.ts`
- Modify: `services/database/nutrition.ts`
- Modify exact browser callers
- Modify: `services/database/planned-meal-prompt-context.ts`
- Modify: `app/api/admin/quality/route.ts`
- Modify/create focused contract tests

- [ ] **Step 1: Migrate MCP global search to V2/current-generation search.**

Explicit locale/market context; no provider search substitution.

- [ ] **Step 2: Migrate old global browser/category reads.**

Global catalog comes only from Food Catalog domain/search authority.

- [ ] **Step 3: Preserve `@/data/egyptian-foods` only behind an explicit non-canonical/manual suggestion boundary while no current generation exists.**

It may prefill My Food/manual entry UX. It must not create fake global IDs, use `source='catalog'` without canonical resolution, become search authority, or fabricate verified provenance. Once a current generation exists, global catalog results exclude this fallback.

- [ ] **Step 4: Replace planned-meal prompt and admin Food quality direct root reads.**

Unknown metadata stays unknown; quality measures canonical/generation state.

- [ ] **Step 5: Add repository contract denying Product/UI/MCP/admin current-truth reads of retirement candidates.**

Allow only true low-level domain persistence/governance owners.

## Task 12: Implement frozen barcode and duplicate-hint Product behavior

**Files:**
- Modify relevant barcode server/UI boundaries
- Modify: `services/nutrition-v1/server/user-foods.ts`
- Add focused tests

- [ ] **Step 1: Make catalog barcode resolution local-canonical-first.**

Normalize/validate GTIN → `food_catalog_lookup_effective_barcode` → use active canonical result. Provider-assisted lookup occurs only on canonical miss and remains suggestion/source evidence; no Plan 8 ingestion.

- [ ] **Step 2: Replace name-only duplicate helper with advisory V2/current-generation search.**

Prefer exact/strong normalized match as “possible existing match”; user may ignore; never merge/mutate/block automatically.

## Task 13: Reconcile heterogeneous owner favorites and personal corrections

**Files:**
- Modify: `services/meals/food-logging-speed.ts`
- Modify: `lib/privacy/data-export.ts`
- Modify related favorite/personal-override tests
- Create a forward reconciliation migration **only if exact implementation evidence requires it**, using a just-in-time migration identity allocated at this task
- Create matching verification SQL with the allocated identity/name conventions

**Interfaces:**
- Consumes current legacy favorite-key semantics and Plan 6 personal override authority.
- Produces exact owner-preserving classification/reconciliation evidence; this task is not destructive retirement.

- [ ] **Step 1: Reconfirm heterogeneous key production from current code and data.**

Legacy key may be global `food_item_id`, owner `user_food_item_id`, or normalized `food_name|serving_size` fallback.

- [ ] **Step 2: Write row-classification tests.**

Four classes:

1. exact UUID resolving to global `food_items.id` → may map to `food_favorites` for same owner;
2. exact UUID resolving to that owner's `user_food_items.id` → preserve My Food favorite semantics, never global favorite;
3. text/log-derived key → preserve legacy state or migrate only to separately approved owner favorite model;
4. unknown/ambiguous → blocker/preserved state.

Include duplicate target favorite, cross-owner UUID, deleted/unavailable My Food, malformed key, normalized text collision.

- [ ] **Step 3: Do not create a blanket `user_food_favorites → food_favorites` data migration.**

Every row has explicit classification/result evidence.

- [ ] **Step 4: Apply personal-correction rule.**

At the exact live migration point, if `food_personal_corrections` count is zero, verified no-op data migration is acceptable. If any row exists, STOP and obtain explicit owner-preserving semantic migration design before proceeding.

- [ ] **Step 5: Allocate migration identity only if SQL is required.**

Read then-current `main` and latest repository/Production migration authority, allocate next safe identity, record evidence, then create SQL. No reserved timestamp from this plan.

- [ ] **Step 6: Keep old owner structures until deployed cutover and live zero-unmapped evidence.**

Retirement requires zero unmapped owner rows.

## Task 14: Add backward-compatible database expand/reconciliation authority

**Files:**
- Allocate any needed forward migration identity **at this task only** after current migration-authority check
- Create matching verification SQL and contract tests

**Interfaces:**
- Produces database functions/schema that support both pre-cutover deployed code where required and the new cutover artifact; this is the **expand** phase, not destructive contract.

- [ ] **Step 1: Re-scan current DB functions/views/triggers/grants and repository SQL.**

Freeze exact dependencies on flat root/old search/owner compatibility.

- [ ] **Step 2: Write failure-first verification for required replacement authority.**

At minimum assess ingestion persistence, duplicate/lifecycle/merge guards, activation/generation functions, recipe preseed, old search and Plan 5 rebuild helper.

- [ ] **Step 3: Implement only backward-compatible expand/reconciliation changes.**

No DROP of retirement candidates. Preserve security-definer/search-path/grants/concurrency/idempotency semantics and no latest-row inference.

- [ ] **Step 4: Keep unresolved root metadata untouched.**

`tags`, `notes`, `source_type`, `is_global`, `is_editable_by_user`, `created_by`, `kitchen_id`, `subcategory_id`, `brand_name` remain KEEP / UNKNOWN PENDING EVIDENCE.

- [ ] **Step 5: If a migration is required, allocate its identity just-in-time and run full replay/DB verification.**

Repository merge does not authorize Production apply.

- [ ] **Step 6: Under separate Production DB authorization, apply required backward-compatible expand/reconciliation authority before deploying code that depends on it.**

Read back exact Production identity/state. No destructive retirement occurs.

## Task 15: Deploy the consumer-cutover artifact and prove exact live cutover

**Files:**
- No mandatory repository mutation solely to deploy; use normal deployment/release evidence mechanisms.

**Interfaces:**
- Consumes: repository consumer cutover + any Production-applied backward-compatible expand authority.
- Produces: exact deployed artifact SHA and live compatibility evidence required for later contract phase.

- [ ] **Step 1: Obtain separate Planner deployment authorization.**

Implementation/merge/DB-expand authorization does not imply deployment authority.

- [ ] **Step 2: Freeze exact deployment artifact commit/SHA and expected compatibility contract.**

Do not deploy an unreviewed descendant silently.

- [ ] **Step 3: Deploy only the consumer-cutover artifact.**

No destructive retirement migration is bundled.

- [ ] **Step 4: Prove the live deployed artifact SHA.**

Use repository/deployment metadata and runtime release identity appropriate to the platform.

- [ ] **Step 5: Prove live compatibility behavior.**

Exercise/read-only observe representative Food search/handoff/recipe verification/MCP/browser/barcode/owner paths as applicable. Confirm new code works while old structures still exist.

- [ ] **Step 6: Read-only observe that no live consumer requires the retirement candidates.**

Repository proof alone is insufficient. Keep an evidence window appropriate to the reviewed rollout; no arbitrary time threshold is invented by this plan.

## Task 16: Run exact live retirement preflight and obtain destructive-scope approval

**Files:**
- Create: `scripts/food-catalog-plan7-retirement-preflight.mjs`
- Create: `scripts/food-catalog-plan7-retirement-preflight.test.mjs`
- Create/update: `docs/architecture/food-catalog-plan7-retirement-evidence.md`

**Interfaces:**
- Consumes exact deployed cutover SHA, current read-only Production state, Workstream 1 proof and discovery query contract.
- Produces an exact proposed destructive object set for Planner approval.

- [ ] **Step 1: Verify Production target, migration ledger and deployed artifact identity.**

Stop on wrong project, Activity Catalog, pending/unresolved ledger, unexpected latest migration, or pre-cutover deployed artifact.

- [ ] **Step 2: Verify candidate schema/data/dependencies/grants.**

Information schema, constraints, functions, views, dependency catalogs, execution privileges, row/non-null counts, current generation, compatibility.

- [ ] **Step 3: Verify repository and live consumers.**

No unsupported non-historical repository reference and no observed live dependency may remain for an object proposed to drop.

- [ ] **Step 4: Verify owner-state disposition.**

`user_food_favorites` retirement requires zero unmapped rows. `food_personal_corrections` follows zero/no-op versus nonzero/STOP rule.

- [ ] **Step 5: Re-evaluate `food_market_relevance` as RETIRE AFTER PRECONDITION.**

Require clean repository + database + deployed/external/reporting evidence immediately before approval. Zero rows and no known repository reader are insufficient alone.

- [ ] **Step 6: Verify fresh portability proof against this exact deployed/schema state.**

Stale proof from before cutover/expand is insufficient.

- [ ] **Step 7: Planner approves the exact destructive object list.**

A green preflight does not itself authorize SQL creation/application or Production mutation.

## Task 17: Create and apply the explicitly approved forward retirement migration

**Files:**
- Allocate the migration identity **only now**, after Task 16 approval and then-current migration-authority check
- Create matching verification SQL
- Modify affected Product/database contracts
- Update repository migration-ledger evidence only through normal workflow and never mark Production-applied state prematurely

**Interfaces:**
- Consumes: exact destructive set approved in Task 16 + separate repository/Production authorizations.
- Produces: explicit forward-only retirement with no CASCADE surprises.

- [ ] **Step 1: Re-read then-current `main` and latest repository/Production migration authority.**

Allocate next safe identity and record it in PR/task evidence before creating SQL.

- [ ] **Step 2: Write migration/verification tests before SQL.**

Assert only approved objects are removed; `food_items.id`, canonical Plans 1–6, barcode authority, current search/rebuild, retained owner models, frozen consumer references and unresolved root metadata remain intact unless each was explicitly approved.

- [ ] **Step 3: Implement explicit forward drops/constraint changes without `CASCADE`.**

Any unexpected dependency fails replay.

- [ ] **Step 4: Preserve immutable historical migrations/audit rows.**

Never rewrite history to erase transitional concepts.

- [ ] **Step 5: Run chronological replay, DB lint, verification SQL, unit/integration/script contracts, build/runtime QA as scope requires.**

Repository success does not authorize Production apply.

- [ ] **Step 6: Obtain separate Production mutation authorization naming exact target/head/migration blob.**

- [ ] **Step 7: Re-run exact retirement preflight immediately before apply.**

If deployed SHA/schema/data/dependency state changed, STOP.

- [ ] **Step 8: Apply the approved forward retirement migration exactly once and read back exact Production migration/schema state.**

No Food population, provider ingestion, activation, generation promotion, compatibility promotion, deployment, Activity Catalog mutation or Plan 8 is bundled.

## Task 18: Fresh post-retirement portability/search re-proof and Plan 7 closure review

**Files:**
- Modify relation registry/tests only for actually retired fields/relations
- Modify golden fixtures only if representation changes without semantic drift
- Update `docs/architecture/food-catalog-portability-runbook.md`
- Update retirement evidence with approved non-sensitive Production attestations

**Interfaces:**
- Consumes exact post-apply Production read-back and final repository schema.
- Produces final fresh `CORE_PORTABLE`/`FULL_DR` fixture certification and closure evidence; does not itself declare closure without Planner approval.

- [ ] **Step 1: Re-run exact Production read-back.**

Verify only approved objects disappeared and canonical/current/owner/history/security invariants remain.

- [ ] **Step 2: Export populated deterministic fixture under the final schema.**

Retired transitional relations disappear only after formal retirement. If artifact compatibility is broken, increment explicit format/canonicalization version rather than silently overloading V1.

- [ ] **Step 3: Restore on fresh PostgreSQL 17.x disposable target from Git migrations.**

Verify preseed load modes, exact IDs, protected segments, RLS/ACL and typed scalar round-trip.

- [ ] **Step 4: Rebuild search and run full golden matrix.**

SearchDocument remains derived; current private helper stays if not explicitly replaced/retired.

- [ ] **Step 5: Re-run owner/security/frozen-snapshot assertions.**

No owner data loss or historical rewrite.

- [ ] **Step 6: Evaluate DR readiness with `FULL_DR` and an explicit caller-supplied RPO.**

Artifact validity and recovery eligibility remain separate.

- [ ] **Step 7: Reconcile repository migration ledger only from verified Production evidence.**

Never mark unapplied migration applied.

- [ ] **Step 8: Planner performs final Plan 7 closure review.**

Closure requires fresh exact-head CI, disposable restore/search proof, exact deployed/live retirement evidence, Production read-back if retirement was applied, zero unsupported legacy consumers, and explicit Planner closure. Do not begin Plan 8 automatically.

---

## Required implementation QA matrix

Every implementation PR reports exact-head status for applicable gates:

- Phase A / repository scope validation;
- lint/typecheck/unit/integration tests;
- snapshot/torn-export concurrency tests;
- lossless scalar + PostgreSQL round-trip tests;
- AES-GCM nonce/randomized-ciphertext tests;
- artifact validity versus RPO eligibility tests;
- chronological migration replay when SQL changes;
- DB lint + registered verification SQL when SQL changes;
- migration-ledger checks;
- preseed/load-mode tests;
- populated + zero-row restore verification;
- `CORE_PORTABLE` and deterministic-fixture `FULL_DR` profile evidence;
- search rebuild checksum + golden queries;
- RLS/ACL/security and governance-isolation tests;
- privacy/account-deletion coverage when owner state changes;
- production build/runtime QA where Product consumer code changes;
- exact deployment SHA/live compatibility evidence before destructive retirement;
- exact changed-file scope and migration-immutability evidence.

Skipped gates are reported as skipped, never success. Do not create temporary runtime/CI files merely to force irrelevant gates.

## Plan self-review

### Spec coverage

This plan covers:

- one-MVCC-snapshot authoritative export;
- lossless PostgreSQL transport before JS canonicalization;
- explicit load modes and migration-seeded row validation;
- current pre-retirement `food_items` compatibility preservation + FK-cycle reconstruction;
- deterministic plaintext semantic hashes separate from randomized encrypted transport;
- AES-256-GCM random nonce/key-custody contract;
- `CORE_PORTABLE` versus `FULL_DR` readiness;
- pure artifact validity versus caller-specific RPO eligibility;
- PostgreSQL 17.x/Supabase-role capability profile;
- governance/security non-reactivation and outbox-delivery isolation;
- raw source-evidence reference policy;
- canonical-first barcode and advisory duplicate-hint policy;
- non-canonical Egyptian suggestion boundary;
- heterogeneous legacy favorite reconciliation;
- Plan 6 personal-override cutover and zero/nonzero legacy-correction rule;
- `food_market_relevance` downgrade to RETIRE AFTER PRECONDITION;
- no long-lived reserved migration identities;
- expand → separately authorized DB apply → separately authorized deploy → live observe → exact preflight → Planner destructive approval → forward retirement → fresh read-back/re-proof.

### Placeholder / authority scan

No task may infer implementation, migration, Production, or deployment authority from this plan. Migration identities are intentionally allocated just-in-time. No unresolved root metadata is assigned an invented destination.

### Interface consistency

Lossless registry/canonicalizer → one-snapshot exporter → artifact validator + RPO evaluator → load-mode restore → assertion engine → protected `FULL_DR` encryption → search verifier → exact-head Workstream 1 evidence. Workstream 2 then consumes current-generation/search authority, applies backward-compatible expansion before deployment, proves the live deployed cutover, and only after exact approval performs contract/retirement and repeats the full portability proof.

Approval of this implementation plan does not execute any task or authorize implementation, Production mutation, deployment, destructive retirement, or Plan 8.
