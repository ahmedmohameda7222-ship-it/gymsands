# Food Catalog Plan 7 Portability and Legacy Retirement Implementation Plan

> **For the Classic ChatGPT Implementation Chat:** execute this plan only after Planner approval, using repository connectors and GitHub Actions evidence. Do not assume a local checkout/shell, do not use Codex, and do not perform Production writes without a separately explicit authorization.

**Goal:** Build deterministic provider-neutral Food Catalog export/restore verification, prove derived search reconstruction and identity/security invariants on a disposable compatible PostgreSQL target, migrate all Product/database consumers off transitional authority, and only then retire approved legacy structures through forward migrations.

**Architecture:** Plan 7 remains one roadmap plan with two sequential internal workstreams. Workstream 1 builds portable logical export + restore/search verification without Production mutation. Workstream 2 first migrates consumers and proves zero unsupported dependencies, then performs only Planner-approved forward retirement and repeats the full restore proof against the retired schema.

**Tech Stack:** TypeScript/Node.js, PostgreSQL/Supabase SQL, Vitest, Node test scripts, GitHub Actions, existing Food Catalog Plan 1–6 domain services/RPCs, SHA-256 canonical evidence.

**Spec:** `docs/superpowers/specs/2026-09-10-food-catalog-plan7-portability-retirement-design.md`

**Discovery authority:** `docs/superpowers/plans/2026-09-10-food-catalog-plan7-discovery-inventory.md`

## Global Constraints

- Start implementation from the then-current `main`; re-read the Plan 7 design, inventory, parent architecture, roadmap, and master continuity before edits.
- Applied migrations remain immutable. Use forward migrations only.
- No Plan 8/USDA implementation, provider ingestion, Production Food population, activation, generation promotion, compatibility promotion, deployment, or Activity Catalog mutation.
- Production discovery/preflight is SELECT/read-only until a separate Planner authorization explicitly names an allowed Production mutation.
- Preserve exact Plaivra Food UUIDs and all stable authority/history identities required by the spec.
- Catalog Generation remains sole current-effective global authority.
- Historical consumer snapshots are never rewritten.
- Unknown nutrition remains `NULL`; no fabricated serving or generic unit conversion.
- SearchDocuments remain derived/rebuildable.
- Every verification failure is fail-closed.
- Workstream 2 destructive retirement cannot begin while any consumer/dependency matrix entry is unsupported or any live preflight differs from the approved expectation.
- Every candidate head must be verified by fresh GitHub Actions on the exact SHA; do not reuse stale success from another head.

---

# Workstream 1 — Portability / Backup / Export / Restore Verification

## Task 1: Freeze Planner policy decisions and exact implementation baseline

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-food-catalog-plan7-portability-retirement-design.md`
- Modify: `docs/superpowers/plans/2026-09-10-food-catalog-plan7-discovery-inventory.md`

**Interfaces:**
- Consumes: Planner decisions listed under the design's `Open Planner policy decisions` section.
- Produces: a reviewed policy block with exact target profile, protected-artifact policy, reauthorization policy, source-evidence retention policy, RPO/freshness rule, owner-data migration semantics, and Product-policy decisions needed by later tasks.

- [ ] **Step 1: Re-read current `main` and Production read-only state.**

Confirm current main SHA, migration ledger state, physical/latest Production migration, global catalog counts, current generation pointer, compatibility version/marker, and Activity Catalog separation. Stop if a newer migration or architecture doc supersedes Plan 7 assumptions.

- [ ] **Step 2: Record Planner-approved values explicitly.**

Replace open-decision text only with decisions the Planner actually approved. Do not infer encryption, PostgreSQL version, governance reactivation, barcode UX, duplicate UX, or legacy metadata semantics.

- [ ] **Step 3: Commit policy/documentation changes alone and run docs-scope CI.**

Expected: exact-head repository integrity and documentation checks succeed; no runtime/migration files change in this task.

## Task 2: Implement canonical portable artifact contract

**Files:**
- Create: `lib/food-catalog/portability/export-contract.ts`
- Create: `lib/food-catalog/portability/export-contract.test.ts`
- Create: `lib/food-catalog/portability/canonicalize.ts`
- Create: `lib/food-catalog/portability/canonicalize.test.ts`
- Create: `lib/food-catalog/portability/relation-registry.ts`
- Create: `lib/food-catalog/portability/relation-registry.test.ts`

**Interfaces:**
- Consumes: Plan 7 relation-classification matrix and approved policy block.
- Produces:
  - `PortableExportManifestV1`
  - `PortableSegmentDescriptorV1`
  - `canonicalizePortableValue(value): string`
  - `canonicalizePortableRow(row, columnOrder): string`
  - `hashPortableSegment(rows, contract): { byteSha256: string; semanticSha256: string; rowCount: number }`
  - `FOOD_CATALOG_PORTABLE_RELATIONS_V1` registry with classification, stable sort key, protected/excluded fields, required flag.

- [ ] **Step 1: Write failing tests for versioning and manifest rejection.**

Tests must prove unknown `formatVersion` or `canonicalizationVersion`, duplicate logical segment names, duplicate required relation declarations, missing required segment descriptors, malformed SHA-256, and secret/lease-token fields are rejected.

- [ ] **Step 2: Write failing canonicalization tests.**

Cover lowercase UUIDs, exact `NULL`, deterministic recursive JSON key ordering, numeric value canonicalization without binary-float rewriting, exact timestamp instants, ordered arrays versus declared set arrays, and stable compound-key ordering independent of source query order.

- [ ] **Step 3: Implement minimal canonicalization/manifest types and validators.**

The validator must be pure and fail closed. It must not know Supabase credentials or perform database writes.

- [ ] **Step 4: Encode the approved relation registry.**

Every Plan 1–6 relation from the discovery inventory must have one explicit classification. For mixed operational rows, list excluded/neutralized transient fields explicitly rather than exporting `*`.

- [ ] **Step 5: Verify zero-row contracts.**

A required empty segment must serialize deterministically with `rowCount=0` and non-optional empty-content hashes; absence of the segment is failure.

- [ ] **Step 6: Run focused unit tests and full typecheck in GitHub Actions.**

Expected: deterministic results on repeated randomized input ordering.

## Task 3: Build provider-neutral streaming export

**Files:**
- Create: `lib/food-catalog/portability/export-reader.ts`
- Create: `lib/food-catalog/portability/export-reader.test.ts`
- Create: `lib/food-catalog/portability/export-writer.ts`
- Create: `lib/food-catalog/portability/export-writer.test.ts`
- Create: `scripts/export-food-catalog-portable.mjs`
- Create: `scripts/export-food-catalog-portable.test.mjs`
- Create: `.github/workflows/food-catalog-portable-export-qa.yml`

**Interfaces:**
- Consumes: `FOOD_CATALOG_PORTABLE_RELATIONS_V1`, canonicalization/hash functions.
- Produces: a bundle directory/ZIP with `manifest.json`, deterministic segment files, protected segments only when authorized, and no derived SearchDocument dump.

- [ ] **Step 1: Write failing export tests against a deterministic fixture store.**

Fixture must include two Foods with deliberately shuffled rows, immutable facts, source records, generation composition, merge history, governance history, and owner personal overrides. Exporting the same logical state in different row orders must produce identical semantic hashes.

- [ ] **Step 2: Add explicit page-by-stable-key reader contract.**

The reader must page by approved stable key/composite key and reject duplicate/non-monotonic keys. It must not use offset ordering as semantic authority.

- [ ] **Step 3: Implement segment streaming and per-segment hashing.**

Do not load the future populated catalog into one in-memory JSON object. Write canonical NDJSON incrementally while hashing bytes/semantic rows.

- [ ] **Step 4: Implement protected segment handling only per approved policy.**

Personal override/security segments must never share plaintext output with the public/global bundle when encryption is required. A missing approved encryption/key provider fails export rather than silently writing plaintext.

- [ ] **Step 5: Implement secret/transient-field denylist and structural scanner.**

At minimum reject credentials, database URLs containing passwords, service-role/anon keys, provider API tokens, `lease_token`, and any relation field the registry marks `TRANSIENT / DO NOT EXPORT`.

- [ ] **Step 6: Generate deterministic manifest last.**

Manifest semantic root must commit to exact segment descriptors/hashes while excluding only explicitly volatile envelope fields.

- [ ] **Step 7: Add a GitHub Actions export QA workflow using disposable/local CI data only.**

The workflow must never connect to Production unless a later run is explicitly configured as read-only export evidence by Planner authorization. Default CI uses controlled fixtures.

## Task 4: Build artifact validator and disposable restore loader

**Files:**
- Create: `lib/food-catalog/portability/validate-artifact.ts`
- Create: `lib/food-catalog/portability/validate-artifact.test.ts`
- Create: `lib/food-catalog/portability/restore-plan.ts`
- Create: `lib/food-catalog/portability/restore-plan.test.ts`
- Create: `scripts/restore-food-catalog-portable.mjs`
- Create: `scripts/restore-food-catalog-portable.test.mjs`
- Create: `scripts/verify-food-catalog-portable-target.mjs`
- Create: `scripts/verify-food-catalog-portable-target.test.mjs`

**Interfaces:**
- Consumes: validated export bundle + exact target schema fingerprint.
- Produces: a disposable restored target and structured restore evidence; never a Production promotion.

- [ ] **Step 1: Write failure-first artifact tests.**

Cover corrupt segment, wrong version, missing authority segment, duplicate ID, semantic hash mismatch, unexpected segment, secret detection, stale artifact under approved RPO, and protected-owner mapping mismatch.

- [ ] **Step 2: Encode explicit restore phases.**

The restore plan must order registry/reference roots, stable Food identity anchors, source/canonical facts, audit/control plane, generations, pre-pointer verification, current pointer last, protected owner state, then derived rebuilds.

- [ ] **Step 3: Handle current `food_items` ↔ `food_source_records` non-deferrable cycle explicitly.**

For schema versions still containing `food_items.verified_source_record_id`, root identity rows load with that compatibility reference null, source records load next, then an explicitly verified compatibility reconstruction step may set it. Do not disable FK validation as the normal success path.

- [ ] **Step 4: Make partial restore visibly untrusted.**

Before final validation there must be no restored current-generation pointer that can make the partial target appear ready. Cancellation/retry either resumes from immutable segment hashes or recreates target; duplicate insert conflicts for stable IDs fail unless the existing row is hash-identical and the retry contract explicitly permits it.

- [ ] **Step 5: Validate stable identity sets before pointer restoration.**

Compare exact Food UUIDs and every stable authority/history identity class required by the spec. A missing/extra/regenerated UUID fails.

- [ ] **Step 6: Validate security/ownership before target trust.**

Prove RLS/grants/functions/constraints match the approved schema profile, protected owner rows map to exact target user UUIDs, and no transient lease/worker claim is active.

## Task 5: Implement restore assertion engine

**Files:**
- Create: `lib/food-catalog/portability/restore-assertions.ts`
- Create: `lib/food-catalog/portability/restore-assertions.test.ts`
- Create: `scripts/verify-food-catalog-restore.mjs`
- Create: `scripts/verify-food-catalog-restore.test.mjs`

**Interfaces:**
- Consumes: source export manifest/segments, restored target reader, schema/security fingerprint.
- Produces: `FoodCatalogRestoreVerificationReportV1` with explicit pass/fail per assertion and no ambiguous warnings-as-success.

- [ ] **Step 1: Implement byte/hash assertion classes.**

Verify segment bytes, semantic segment hashes, manifest root, stored generation/validation/ingestion/operation hashes, and source evidence checksum references where present.

- [ ] **Step 2: Implement exact identity/value assertions.**

Verify Food IDs, revision/fact/event/report/operation IDs, generation composition references, current pointer IDs/revision, policy versions, user ownership, and merge redirect pairs.

- [ ] **Step 3: Implement graph assertions.**

Verify nutrition/name/serving supersession/lineage, source lineage, verification predecessor chains, flattened redirect topology, active redirect targets, no self/cycle/chain, and generation-selected same-Food integrity.

- [ ] **Step 4: Implement historical consumer-reference assertions using fixtures/read-only reference extracts.**

Verify consumer snapshots are value-identical and their referenced Food IDs remain present. Never update Diary/Recipe/Saved Meal/Meal Plan snapshots as part of verification.

- [ ] **Step 5: Make report status fail closed.**

`ready=true` is emitted only if every mandatory assertion is successful and no unknown assertion/version exists.

## Task 6: Add deterministic search rebuild + golden-query restore verification

**Files:**
- Create: `lib/food-catalog/portability/search-restore-verifier.ts`
- Create: `lib/food-catalog/portability/search-restore-verifier.test.ts`
- Create: `scripts/verify-food-catalog-restored-search.mjs`
- Create: `scripts/verify-food-catalog-restored-search.test.mjs`
- Create: `test/fixtures/food-catalog/plan7-golden-search-v1.json`
- Modify: `.github/workflows/food-catalog-portable-export-qa.yml`

**Interfaces:**
- Consumes: restored current-generation authority and controlled owner-specific search fixture.
- Calls: `public.rebuild_food_catalog_search_projection_v2(uuid,text,text)` then `public.search_food_catalog_v2(...)`.
- Produces: rebuild checksum/document count + golden-query comparison evidence.

- [ ] **Step 1: Create a populated deterministic golden fixture.**

Use fixed UUIDs, timestamps, language/script contexts, market hierarchy, taxonomy, exact/alias names, nullable nutrition, one redirect case, favorites, recent/frequency logs, and separate My Foods. Do not use provider network calls.

- [ ] **Step 2: Assert current serving semantics.**

Global SearchDocument `serving_label` remains `NULL` unless a later separately approved serving-display selector exists. Nutrition basis does not become serving display.

- [ ] **Step 3: Rebuild only the exact restored generation/projection.**

Compare returned `documentCount` and `projectionChecksumSha256` to source-side deterministic evidence for the same canonical fixture.

- [ ] **Step 4: Run exact ordered golden queries.**

Cover exact name, alias, prefix, contains, language/script, direct/parent/GLOBAL market, category/cuisine current behavior, nullable numeric filters, presets, favorites, recent/frequency, My Foods, cursor page continuation, and cursor-context rejection.

- [ ] **Step 5: Prove stale generation isolation.**

Seed a previous generation projection in the disposable test and prove current search never returns it after the pointer selects the target generation.

- [ ] **Step 6: Add zero-row/uninitialized catalog test.**

With `current_generation_id=NULL`, expect no rebuild invocation and zero SearchDocuments; the portability proof succeeds if all required empty authority segments are valid.

## Task 7: Add protected owner/security portability and close privacy-export gap

**Files:**
- Create: `lib/food-catalog/portability/protected-segments.ts`
- Create: `lib/food-catalog/portability/protected-segments.test.ts`
- Modify: `lib/privacy/data-export.ts`
- Modify: `lib/privacy/data-export.test.ts` or the repository's exact current privacy-export test file discovered at implementation time
- Modify: account-deletion verification tests only if Plan 7 introduces new owner relations

**Interfaces:**
- Consumes: Planner-approved encryption and governance reauthorization policy.
- Produces: owner/security export segments and user-facing privacy export coverage for Plan 6 personal overrides.

- [ ] **Step 1: Add failing privacy-export tests for Plan 6 personal override state.**

Exact owner export must include `food_personal_overrides`, `food_personal_override_revisions`, and `food_personal_override_operations` for the requesting user only, preserving tombstones/revision IDs/pointer revision.

- [ ] **Step 2: Add cross-owner negative tests.**

User A export/restore must never contain or map User B override rows.

- [ ] **Step 3: Implement protected global portability segments per approved encryption policy.**

Governance identity/security history and owner data cannot fall back to plaintext if protected export is requested.

- [ ] **Step 4: Re-run canonical account-deletion tests.**

If no new tables are introduced, prove existing Plan 6 purge still covers all owner state. If new owner metadata is introduced, add it to the canonical purge via a separately reviewed forward migration in the same implementation phase before claiming privacy completeness.

## Task 8: Establish canonical Workstream 1 CI evidence

**Files:**
- Modify: `.github/workflows/food-catalog-portable-export-qa.yml`
- Create: `docs/architecture/food-catalog-portability-runbook.md`

**Interfaces:**
- Consumes: Tasks 2–7.
- Produces: exact-head artifact with export manifest, restore report, search report, security report, and source/target identity metadata.

- [ ] **Step 1: Run full chronological migration replay on disposable PostgreSQL.**

Expected: exact current migration chain succeeds; no Production target used.

- [ ] **Step 2: Export controlled populated fixture and zero-row fixture.**

Expected: deterministic repeated manifests/hashes for equivalent state.

- [ ] **Step 3: Restore each artifact into a freshly built disposable target from Git schema authority.**

Expected: all mandatory restore assertions and search verification pass.

- [ ] **Step 4: Add corruption matrix runs.**

Each deliberate corrupt/missing/duplicate/wrong-owner/stale/secret variant must fail before target trust.

- [ ] **Step 5: Publish canonical artifact evidence tied to exact head SHA.**

No Production apply, compatibility change, Food population, generation promotion, or deployment occurs.

**Workstream 1 completion gate:** Planner reviews a green exact-head portability artifact and approves beginning consumer migration. A green export/restore proof alone does **not** authorize retirement.

---

# Workstream 2 — Consumer Migration and Legacy Retirement

## Task 9: Cut new Food handoffs over to current-generation authority

**Files:**
- Modify: `services/nutrition-v1/server/food-handoff.ts`
- Modify: `services/nutrition-v1/server/food-handoff.test.ts`
- Modify: exact handoff route/MCP tests that assert resulting frozen payloads
- Use existing: `services/food-catalog/server/current-generation-service.ts`

**Interfaces:**
- Consumes: `resolveCurrentGenerationFoodForNewUse` and current-generation selected facts/trust.
- Produces: catalog Food handoff payloads whose new source facts are generation-authoritative while preserving existing frozen consumer snapshot schemas.

- [ ] **Step 1: Write failing tests proving handoff no longer reads flat current truth.**

Cover redirect to active survivor, deprecated/withdrawn rejection, selected nutrition/name/serving IDs, nullable nutrition, and no `MAX/latest` inference.

- [ ] **Step 2: Define exact compatibility projection used by handoff.**

Use only IDs selected by current generation. If selected serving-display authority is absent, do not fabricate `100 g`/`100 ml`; preserve the Product behavior explicitly approved by Planner.

- [ ] **Step 3: Replace `resolveCatalogFood` for `source='catalog'`.**

My Foods remain separate and unchanged.

- [ ] **Step 4: Migrate personal overlay from `food_personal_corrections` to approved Plan 6 personal override semantics.**

Preserve owner isolation and `NULL` values. If legacy rows require data migration, that migration is owner-preserving and separately verified before old reads disappear.

- [ ] **Step 5: Run Diary, Saved Meal, Recipe, and Meal Plan handoff tests.**

Expected: only new resolution changes; frozen historical rows are not rewritten.

## Task 10: Cut recipe verification to generation-selected verification/trust

**Files:**
- Modify: `services/nutrition-v1/server/recipe-published.ts`
- Modify: `services/nutrition-v1/server/recipe-workspace.ts`
- Modify: corresponding tests

**Interfaces:**
- Consumes: current-generation trust/assertion service.
- Produces: recipe current verification decisions without `food_items.is_verified`.

- [ ] **Step 1: Write failing tests for verified/revoked/missing assertion selections.**

A mutable root flag must not change outcome.

- [ ] **Step 2: Replace `getCatalogVerificationStates`.**

Batch behavior must be explicit/bounded so recipe reads do not regress into N+1 uncontrolled queries.

- [ ] **Step 3: Prove published historical recipe snapshots remain immutable.**

Current trust affects current decisions only; no historical nutrition/name snapshot rewrite.

## Task 11: Cut MCP, old browser, prompt-context, and admin quality reads to domain authority

**Files:**
- Modify: `lib/mcp/nutrition-v1-food-execution.ts`
- Modify: `lib/mcp/tool-executor-implementation.ts`
- Modify: `services/database/nutrition.ts`
- Modify: `components/meals/food-browser.tsx` and exact callers that still use `getGlobalFoods/getFoodCategories`
- Modify: `services/database/planned-meal-prompt-context.ts`
- Modify: `app/api/admin/quality/route.ts`
- Create or modify focused tests for each boundary

**Interfaces:**
- Consumes: `search_food_catalog_v2`, current-generation/domain read service, Planner-approved quality/prompt projections.
- Produces: no Product current-truth dependency on flat global fields scheduled for retirement.

- [ ] **Step 1: Migrate MCP global search from `searchCatalogFoodsByName`.**

Use logical/V2 search with explicit locale/market context and bounded result contract. Do not substitute provider search.

- [ ] **Step 2: Migrate old global browser/category functions.**

Remove runtime global fallback to `@/data/egyptian-foods` as canonical Food truth. My Foods/local UI fixtures may remain only where explicitly non-authoritative.

- [ ] **Step 3: Replace planned-meal prompt direct Food reads.**

Prompt context must receive generation-selected canonical data and preserve unknown fields as unknown.

- [ ] **Step 4: Replace Food portion of admin quality direct physical scan.**

Use a domain/quality read model that measures canonical generation/fact completeness rather than flat mirror completeness. Do not broaden into unrelated Exercise cleanup.

- [ ] **Step 5: Add repository contract test denying new direct global physical reads.**

Allowlist only low-level Food Catalog persistence/governance implementations that genuinely own the tables; Product/UI/MCP/admin consumers must go through approved boundaries.

## Task 12: Resolve advisory duplicate and barcode Product policy

**Files:**
- Modify only after Planner policy approval: `services/nutrition-v1/server/user-foods.ts`
- Modify relevant barcode UI/server route files only if Planner requires local canonical-first behavior in Plan 7
- Add focused tests

**Interfaces:**
- Consumes: Planner decisions #6/#7 from the spec.
- Produces: no name-only helper that can be mistaken for merge authority; barcode behavior that preserves local canonical GTIN authority without introducing Plan 8.

- [ ] **Step 1: Keep duplicate matching advisory.**

If retained, power the hint through approved domain search and label it as suggestion only. Never invoke merge/correction automatically.

- [ ] **Step 2: If local canonical-first barcode is approved, call `food_catalog_lookup_effective_barcode(text)` before provider-assisted UX.**

Provider result may seed search/curation only under existing policy; it never overrides canonical mapping. Do not implement USDA/provider ingestion.

## Task 13: Reconcile owner favorite and personal-correction compatibility data

**Files:**
- Modify: `services/meals/food-logging-speed.ts`
- Modify: `lib/privacy/data-export.ts`
- Modify: related favorite/personal override tests
- Reserve forward migration path after collision check: `supabase/migrations/20260911090000_food_catalog_plan7_owner_compatibility_reconciliation.sql`
- Create matching verification SQL: `supabase/verification/food-catalog-plan7-owner-compatibility-reconciliation.sql`

**Interfaces:**
- Consumes: Planner-approved mapping from `user_food_favorites(food_key)` to current `food_favorites(food_id)` and from `food_personal_corrections` to Plan 6 personal overrides.
- Produces: exact owner-preserving migrated state with replay/idempotency evidence.

- [ ] **Step 1: Before creating the reserved migration, verify no migration with that identity/path exists and no newer main migration makes ordering unsafe.**

If collision/order is unsafe, stop and have Planner amend the reserved migration identity; never silently rename an already-reviewed migration after application.

- [ ] **Step 2: Write failing migration/unit verification first.**

Cover existing owner rows, unmappable `food_key`, duplicate/current favorite collision, personal correction with partial `NULL` nutrition, tombstone semantics, and cross-owner rejection.

- [ ] **Step 3: Implement forward owner reconciliation only for approved mappings.**

Unmappable owner data must fail/record an explicit migration blocker; never discard it to reach zero rows.

- [ ] **Step 4: Update Product reads/writes and privacy export.**

After successful reconciliation no active Product path should require old owner tables.

- [ ] **Step 5: Keep old tables until post-cutover live evidence proves zero unsupported rows/readers.**

This task is reconciliation, not destructive retirement.

## Task 14: Forward-migrate database functions away from flat compatibility fields

**Files:**
- Reserve forward migration path after collision check: `supabase/migrations/20260911100000_food_catalog_plan7_database_authority_cutover.sql`
- Create: `supabase/verification/food-catalog-plan7-database-authority-cutover.sql`
- Modify/add SQL contract tests under `lib/product/`

**Interfaces:**
- Consumes: completed Product cutover, current canonical generation/governance/ingestion authority.
- Produces: current DB functions that no longer require retirement-candidate root fields except explicitly retained `food_items.id`/approved lifecycle write-plane state.

- [ ] **Step 1: Re-scan `pg_get_functiondef` and repository SQL at exact head.**

Freeze the exact function list referencing each candidate field.

- [ ] **Step 2: Write failing verification for each intended removed dependency.**

At minimum cover ingestion candidate persistence, duplicate resolution, lifecycle/merge guards, activation/generation functions, recipe preseed function, and old search. Do not alter a function whose replacement authority is not approved.

- [ ] **Step 3: Implement `CREATE OR REPLACE FUNCTION` changes forward-only.**

Preserve security definer/search path/grants/concurrency/idempotency semantics. Use canonical authority explicitly; no latest-row inference.

- [ ] **Step 4: Replace Plan 5 private rebuild helper only if its removal is approved.**

First implement an independent current public rebuild with identical corrected serving semantics and deterministic checksum, prove golden search equivalence, then the helper may become a retirement candidate. Otherwise KEEP it.

- [ ] **Step 5: Replay full migration chain and database verification.**

No Production application is implied by merge.

## Task 15: Run exact live retirement preflight and freeze destructive scope

**Files:**
- Create: `scripts/food-catalog-plan7-retirement-preflight.mjs`
- Create: `scripts/food-catalog-plan7-retirement-preflight.test.mjs`
- Create: `docs/architecture/food-catalog-plan7-retirement-evidence.md`

**Interfaces:**
- Consumes: exact candidate head, read-only Production target, discovery inventory query contract.
- Produces: signed/hashed read-only preflight evidence naming exactly which objects may be retired and why.

- [ ] **Step 1: Verify Production target identity and migration ledger.**

Stop on Activity Catalog, wrong project, pending/unresolved ledger, or unexpected latest migration.

- [ ] **Step 2: Verify candidate schema/data/dependencies/grants.**

Query information schema, constraints, functions, views, dependency catalogs, execution privileges, candidate row/non-null counts, current generation, and compatibility state.

- [ ] **Step 3: Verify repository consumers at exact candidate SHA.**

No non-historical Product/current-truth reference may remain for an object approved to drop.

- [ ] **Step 4: Verify owner-data migrations.**

Any old owner table scheduled for retirement must have zero unmapped rows and exact reconciliation evidence.

- [ ] **Step 5: Verify Workstream 1 restore artifact against this exact schema head.**

A stale portability proof from before consumer/schema cutover is insufficient.

- [ ] **Step 6: Planner approves exact destructive object list.**

Do not infer permission from a green preflight. This is a separate authorization gate.

## Task 16: Apply approved forward legacy retirement to repository only

**Files:**
- Reserve forward migration path after collision check: `supabase/migrations/20260911110000_food_catalog_plan7_legacy_retirement.sql`
- Create: `supabase/verification/food-catalog-plan7-legacy-retirement.sql`
- Modify: affected product/database contract tests
- Modify: `supabase/migration-ledger.json` only according to normal repository migration-ledger workflow; do not claim Production-applied state before actual authorized application

**Interfaces:**
- Consumes: Planner-approved exact object list from Task 15.
- Produces: forward-only repository schema retirement with no CASCADE surprises.

- [ ] **Step 1: Verify reserved migration identity is still safe before file creation.**

If collision/order changed, stop for plan amendment.

- [ ] **Step 2: Write migration tests before SQL.**

Assert only the approved columns/tables/functions/grants/policies are removed; `food_items.id`, canonical Plan 1–6 authority, current-generation service, barcode authority, user-owned retained models, historical consumer FKs/snapshots, and Activity Catalog remain intact.

- [ ] **Step 3: Implement explicit drops/constraint changes without `CASCADE`.**

Every dependency must already have been migrated. Any unexpected dependency makes replay fail.

- [ ] **Step 4: Preserve immutable historical migrations and audit rows.**

Do not edit applied Plan 1–6 migrations to pretend transitional structures never existed.

- [ ] **Step 5: Run chronological replay, DB lint, all verification SQL, unit/integration/script contracts, and build on exact head.**

Repository success does not authorize Production apply.

## Task 17: Re-prove portability on the retired schema

**Files:**
- Modify Plan 7 portable relation registry/tests if approved retired fields disappear from export format
- Modify `test/fixtures/food-catalog/plan7-golden-search-v1.json` only if schema representation changes without Product semantic change
- Modify `docs/architecture/food-catalog-portability-runbook.md`

**Interfaces:**
- Consumes: exact retired-schema candidate head.
- Produces: fresh export/restore/search/security evidence proving retirement did not break Plan 7 exit condition.

- [ ] **Step 1: Export populated deterministic fixture under the new schema.**

Retired compatibility fields must not remain silently required by format V1; if removal changes the artifact contract incompatibly, increment export format/version explicitly rather than overloading V1.

- [ ] **Step 2: Restore onto a fresh clean compatible PostgreSQL target from Git migrations.**

The previous root/source compatibility FK-cycle workaround should disappear if root verification compatibility was approved for retirement.

- [ ] **Step 3: Rebuild search and run the full golden matrix.**

Exact active IDs, nullable serving/nutrition behavior, redirects, language/market, pagination/cursor, and stale-generation isolation must pass.

- [ ] **Step 4: Re-run protected owner-state and frozen snapshot reference verification.**

No user-owned data or historical snapshot is rewritten/lost.

## Task 18: Production application and final closure remain separately authorized

**Files:**
- No predetermined file mutation in this task; use the repository's normal migration reconciliation/evidence documentation only after actual authorized Production actions.

**Interfaces:**
- Consumes: Planner-approved Production mutation authorization naming exact migration/blob/head/target.
- Produces: read-back/reconciliation evidence only if such authorization is separately issued.

- [ ] **Step 1: Do not apply any Plan 7 migration under this implementation plan alone.**

A merge is not Production authorization.

- [ ] **Step 2: If separately authorized later, freeze exact merged-main commit and migration Git blob before apply.**

Verify project target, migration history, schema drift, data preconditions, and portability evidence immediately before mutation.

- [ ] **Step 3: Apply each authorized forward migration exactly once, then read back.**

No Food population, provider ingestion, activation, generation promotion, compatibility promotion, deployment, or Activity Catalog mutation is bundled.

- [ ] **Step 4: Reconcile the repository migration ledger only from verified Production identity evidence.**

Never mark an unapplied migration applied.

- [ ] **Step 5: Final Plan 7 closure review.**

Closure requires fresh exact-head CI, successful disposable restore on the final schema, search rebuild/golden evidence, zero unsupported legacy consumers, Production read-back if Production retirement was authorized/applied, and explicit Planner closure.

---

## Required implementation QA matrix

Every implementation PR must report exact-head status for:

- Phase A / repository scope validation;
- lint/typecheck/unit/integration tests affected by the task;
- chronological migration replay when SQL changes;
- database lint + registered verification SQL when SQL changes;
- migration-ledger checks;
- portable artifact deterministic tests;
- restore corruption/failure tests;
- populated + zero-row restore verification;
- search rebuild checksum + golden-query verification;
- RLS/ACL/security verification;
- privacy/account-deletion coverage when owner state changes;
- production build/runtime QA where Product consumer code changes;
- exact changed-file scope and migration-immutability evidence.

A skipped required gate must be reported as skipped, not success. If a full workflow is required to exercise an otherwise path-skipped gate, trigger it only through an authorized workflow/review-state mechanism and restore PR state afterward.

## Plan self-review

### Spec coverage

This plan covers:

- versioned deterministic provider-neutral export;
- manifest/checksum/canonicalization contract;
- zero-row and future-scale behavior;
- protected user/security state;
- disposable clean-target restore from Git schema authority;
- exact identity/graph/security verification;
- current FK-cycle handling;
- Plan 5 rebuild/search/golden verification;
- privacy export gap;
- complete consumer cutover before retirement;
- owner-data reconciliation;
- database-function dependency cutover;
- read-only live retirement preflight;
- forward-only explicit retirement;
- final portability re-proof;
- separate Production authorization and closure.

### Placeholder scan

No implementation step authorizes unspecified behavior. Reserved future migration identities are concrete and must be collision/order-checked before creation; a collision requires an explicit plan amendment rather than silent renaming.

### Type/interface consistency

Portable contract flows from relation registry/canonicalizer → exporter → artifact validator/restore plan → restore assertion engine → search verifier → canonical CI evidence. Workstream 2 consumes the existing current-generation and Plan 5 public search/rebuild boundaries, then refreshes the same portability evidence after retirement.

Approval of this implementation plan does not execute any task or authorize Production mutation.
