# Food Catalog Plan 7 Workstream 1 Final Corrections Implementation Plan

> **For agentic workers:** This plan is executed inline by Classic ChatGPT under the Plaivra project constraints. Subagents, worktrees, Codex implementation, merge, deployment, Production writes, and Production migrations are forbidden for this correction pass.

**Goal:** Close the remaining Workstream 1 architecture/certification gaps while preserving all previously accepted Plan 7 behavior and keeping PR #178 Draft/Open/Unmerged.

**Architecture:** Keep one canonical portability registry as the source of restore policy, make Service execution binding explicitly environment-local, make Search runtime capture the sole rebuild orchestrator, execute the real NULL-current Search V2 RPC, and strengthen pointer activation to use Plan 3 canonical generation composition/validation semantics. Extend portability coverage for transitional owner favorites and strengthen source/target schema identity so manual constraint/policy/function drift cannot false-green certification.

**Tech Stack:** TypeScript/Node 24, PostgreSQL 17, Supabase migrations/RPCs, GitHub Actions, Vitest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-10-food-catalog-plan7-portability-retirement-design.md`, with the Planner’s 2026-09-14 Workstream 1 correction prompt as the stricter authority for this pass.

## Global Constraints

- Existing branch only: `feat/food-catalog-plan7-workstream1-portability`.
- Existing Draft PR only: #178; keep Draft/Open/Unmerged.
- Starting head: `b44e0c0810de815110a6bc6c86d4c4f214d2ade1`; base `bb8fa65668bc9b2467f93c170924a4ba1c120eee`.
- No Production writes, migrations, deployment, generation promotion, pointer movement, compatibility mutation, provider/Food population, Activity Catalog mutation, Workstream 2, retirement, or Plan 8.
- Every behavior correction follows focused RED -> GREEN -> neighboring verification.
- Package/lock authority stays unchanged unless an unavoidable implementation need is proven; otherwise dependency audit remains SKIPPED by scope.

---

### Task 1: Fail-closed restored Service execution binding

**Files:**
- Modify: `lib/food-catalog/portability/relation-registry.ts`
- Modify: `lib/food-catalog/portability/relation-registry.test.ts`
- Modify: `scripts/export-food-catalog-portable.mjs`
- Modify: `scripts/export-food-catalog-portable.test.mjs`
- Modify: `scripts/restore-food-catalog-portable.mjs`
- Modify: `scripts/restore-food-catalog-portable.test.mjs`
- Modify: `supabase/verification/food-catalog-plan7-portability-governance-outbox-fixture.sql`
- Create: `scripts/capture-food-catalog-restored-service-authority.mjs`
- Create: `scripts/capture-food-catalog-restored-service-authority.test.mjs`
- Modify: `.github/workflows/food-catalog-plan7-integrated-full-dr.yml`

**Interfaces:**
- Registry policy marks `food_catalog_governance_principals.service_identity_sha256` as environment-specific Service execution binding.
- Source artifact canonical material never contains the source Service execution hash.
- Restore materializes a cryptographically random, unreachable 64-hex binding for Service rows only; no preimage is persisted, logged, or returned.
- Principal/capability/audit IDs and historical state remain exact.

- [ ] Write regression tests proving the old source identity currently remains portable/reusable and requiring registry-driven environment binding semantics.
- [ ] Run focused tests on the exact RED head and record failure evidence.
- [ ] Implement canonical source neutralization plus restore-local unreachable binding without schema migration or capability revocation.
- [ ] Add realistic source identity fixture and restored-target executable rejection proof for source identity, authenticated user, and random Service identity; prove outbox stays pending/unclaimed and durable principal/capability history survives.
- [ ] Run focused GREEN tests plus integrated Service authority proof.

### Task 2: Single-owner Search V2 rebuild orchestration

**Files:**
- Modify: `scripts/capture-food-catalog-restored-search-runtime.mjs`
- Modify: `scripts/capture-food-catalog-restored-search-runtime.test.mjs`
- Create: `supabase/verification/food-catalog-plan7-portability-search-golden-fixture.sql`
- Modify: `supabase/verification/food-catalog-plan7-portability-search-golden-runtime.sql`

**Interfaces:**
- `capture-food-catalog-restored-search-runtime.mjs` is the only runtime rebuild orchestrator.
- Golden fixture SQL supplies transaction-local inputs only.
- Golden matrix SQL contains queries/assertions only and no rebuild call.
- `source-adversarial` rebuilds stale then current inside the golden transaction; `restored-authoritative` rebuilds current only and proves stale documents remain zero.

- [ ] Add tests that fail if golden matrix SQL contains rebuilds or authoritative orchestration contains a stale rebuild.
- [ ] Run RED and record exact failure evidence.
- [ ] Split golden fixture/query responsibilities and build mode-specific orchestration in the capture script.
- [ ] Run GREEN plus complete 20-case golden Search matrix.

### Task 3: Executable NULL-current canonical Search V2 proof

**Files:**
- Modify: `supabase/verification/food-catalog-plan7-null-current-search.sql`
- Modify: `scripts/run-database-verification.test.mjs`

**Interfaces:**
- Exact Git-migrated PostgreSQL 17 verification invokes `public.search_food_catalog_v2(...)` as an approved authenticated context.
- Expected result is exactly an empty canonical search payload with `items=[]` and `nextCursor=null` while current generation stays NULL and SearchDocuments/generations remain unchanged.
- No rebuild call occurs.

- [ ] Add a static contract requiring the real RPC and forbidding rebuild invocation/hand-authored success-only evidence.
- [ ] Run RED and record failure evidence.
- [ ] Update SQL to execute and assert the real RPC result plus before/after database invariants.
- [ ] Run GREEN through canonical database verification.

### Task 4: Plan 3-strength pre-pointer semantic authority

**Files:**
- Create or modify a small shared pure generation-composition checksum module under `lib/food-catalog/` if needed.
- Modify: `services/food-catalog/server/generation-builder.ts`
- Modify: `services/food-catalog/server/generation-builder.test.ts`
- Modify: `lib/food-catalog/portability/restore-assertions.ts`
- Modify: `lib/food-catalog/portability/restore-assertions.test.ts`
- Modify: `scripts/restore-food-catalog-portable.mjs`
- Modify: `scripts/food-catalog-plan7-pre-pointer-runtime.test.mjs`
- Create or modify a focused pre-pointer adversarial runtime script.
- Modify: `.github/workflows/food-catalog-plan7-integrated-full-dr.yml`

**Interfaces:**
- Plan 7 reuses the exact canonical Plan 3 composition checksum normalization rather than a third checksum interpretation.
- Pre-pointer gate checks actual restored Food/fact/verification/activation/redirect composition, recomputed checksum, report linkage/findings, promotion event and policy semantics before `RESTORE_POINTER_FIELDS_LAST`.

- [ ] Add RED tests for composition corruption, verification assertion corruption, activation authority corruption, and stored checksum/report corruption; each must require pointer unchanged.
- [ ] Run RED and record exact failure evidence.
- [ ] Extract/reuse the smallest pure Plan 3 checksum authority needed by both Plan 3 and Plan 7; preserve Plan 3 behavior/tests.
- [ ] Strengthen the semantic gate, including actual validation findings rather than stored counters alone.
- [ ] Run all four adversarial GREEN proofs and Plan 3 neighboring tests.

### Task 5: Fresh Codex P1s within Workstream 1

**Files:**
- Modify: `lib/food-catalog/portability/relation-registry.ts`
- Modify: `lib/food-catalog/portability/relation-registry.test.ts`
- Modify: `supabase/verification/food-catalog-plan7-portability-source-fixture.sql`
- Modify: `scripts/export-food-catalog-portable.mjs`
- Modify: `scripts/verify-food-catalog-portable-target.mjs`
- Modify corresponding tests.

**Interfaces:**
- `user_food_favorites(user_id, food_key)` is protected transitional FULL_DR owner state until Workstream 2 row-classified reconciliation; no blanket conversion to `food_favorites`.
- Source and target schema fingerprints share one definition covering Food-catalog-relevant columns plus constraints, RLS/policies, triggers, and function definitions/privileges needed for runtime semantics.

- [ ] Add RED registry/fixture tests for `user_food_favorites` and fingerprint tests proving non-column schema authority participates.
- [ ] Run RED and record exact failures.
- [ ] Implement protected exact preservation and shared stronger schema fingerprint identity.
- [ ] Run GREEN, export/restore readback equality, and security/runtime neighboring checks.

### Task 6: Final exact-head certification and evidence correction

**Files:**
- Modify once after all code verification: PR #178 body.

**Interfaces:**
- One linked FULL_DR chain: exact head -> MVCC source snapshot -> protected canonical artifact -> Git-migrated PG17 target -> restored source Service binding unavailable -> outbox normalization -> Plan 3-strength pre-pointer validation -> pointer last -> current-only restored Search rebuild -> golden matrix -> executable NULL-current RPC -> RLS/ACL -> mandatory assertions -> recovery eligibility -> sole final `drReady`.

- [ ] Run focused and neighboring tests after the final implementation diff.
- [ ] Run fresh Phase A, Portable QA, PR Quality, Integrated FULL_DR, Exercise Detail V2 Runtime QA, and Exercise Library Locale Runtime QA on the same exact candidate.
- [ ] Confirm dependency audit is SKIPPED by scope when package/lock files are unchanged.
- [ ] Re-read Production baseline with SELECT-only Supabase connector and report actual values, including the corrected taxonomy/market counts and evidence timestamp/source.
- [ ] Inspect exact commit range/diff and unresolved Codex review threads without resolving them.
- [ ] Update PR #178 body once with truthful final candidate/evidence, retaining Draft/Open/Unmerged.
