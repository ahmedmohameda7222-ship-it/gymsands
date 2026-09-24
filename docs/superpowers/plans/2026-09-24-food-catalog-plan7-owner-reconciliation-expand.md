# Food Catalog Plan 7 Tasks 13–14 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add deterministic owner-favorite reconciliation evidence and backward-compatible owner-aware Food Catalog search/MCP authority without destructive retirement or Production mutation.

**Architecture:** Task 13 keeps heterogeneous legacy favorite semantics intact and adds a pure classifier plus read-only aggregate reporter. Task 14 moves the existing V2 search implementation behind a private trusted-owner core, overlays only exact Plan 6 Personal Override nutrition, preserves the authenticated public signature, and adds service-role-only connection-derived MCP wrappers for search and point-read authority.

**Tech Stack:** TypeScript/Vitest, Node 24 scripts, PostgreSQL/Supabase migrations and verification SQL, GitHub Actions.

**Spec:** User-supplied Plan 7 Tasks 13–14 implementation brief dated 2026-09-24.

## Global Constraints

- Start from exact `main@306384cf12e99381c80f026780bee3cc2e60e1ce`.
- Catalog Generation remains sole current-effective global Food authority; My Foods remains separate owner authority; Plan 6 Personal Override remains current owner correction authority.
- Preserve NULL as unknown and numeric zero as zero. Do not fabricate serving/basis semantics or infer latest revisions.
- No automatic canonical merge, no caller-supplied owner authority, no service-role impersonation of `auth.uid()`, and no broad grants to protected owner tables.
- Expand/reconciliation only: no DROP, destructive ALTER, legacy deletion, retirement, Production apply/mutation, deployment, Activity Catalog change, or Task 15+ work.
- Existing four pending migrations remain unchanged and unapplied.

## Review Focus

- UUID collisions across global Food and owner Food sources fail closed as blocked rather than guessing.
- Malformed UUID-like favorite keys are blocked while valid text/log keys are preserved.
- Personal Override JSON null/missing nutrient falls back to canonical nutrition while numeric zero overrides it.
- MCP owner identity is derived only from an active, unrevoked connection row; no public bridge accepts `p_user_id`.
- Search cursor/ranking/filter/generation behavior remains byte-semantically equivalent outside the owner nutrition overlay.

### Task 1: Task 13 favorite reconciliation classifier

**Files:**
- Create: `lib/food-catalog/plan7-owner-reconciliation.ts`
- Create: `lib/food-catalog/plan7-owner-reconciliation.test.ts`

**Interfaces:**
- Consumes: legacy favorite rows plus resolved Catalog/My Food/existing canonical favorite evidence.
- Produces: `classifyOwnerFavorite` and `summarizeOwnerFavoriteReconciliation`.

- [ ] Write RED tests for Catalog mappable/already mapped, same-owner My Food, cross-owner My Food, deleted My Food, text key, malformed UUID-like key, unknown UUID, ambiguous collision, and duplicate rows.
- [ ] Run the focused test and confirm failure is from the missing classifier.
- [ ] Implement the minimal deterministic classifier; never fuzzy-match or convert preserved rows.
- [ ] Run focused tests GREEN and run the relevant unit suite.

### Task 2: Task 13 read-only report and product-boundary evidence

**Files:**
- Create: `scripts/report-food-catalog-plan7-owner-reconciliation.mjs`
- Create: `scripts/report-food-catalog-plan7-owner-reconciliation.test.mjs`
- Create: `docs/architecture/food-catalog-plan7-task13-owner-reconciliation.md`

**Interfaces:**
- Consumes: Task 1 classifier and read-only database rows.
- Produces aggregate default output `total/catalog_mappable/catalog_already_mapped/my_food_preserved/legacy_text_preserved/blocked` plus `personal_correction_count`; optional diagnostic identifiers only.

- [ ] Write RED report tests proving aggregate-only default, explicit diagnostic opt-in, and read-only query behavior.
- [ ] Implement a local/manual psql reporter using a repeatable-read read-only transaction and the shared classifier.
- [ ] Record that current browser My Food/text favorite semantics retain `user_food_favorites`; no blanket conversion is introduced.
- [ ] Run focused tests GREEN.

### Task 3: Task 14 SQL contract and expand migration

**Files:**
- Create: `lib/product/food-catalog-plan7-owner-reconciliation-expand.test.ts`
- Create: one just-in-time `supabase/migrations/<new>_food_catalog_owner_reconciliation_expand_authority.sql`
- Create: `supabase/verification/food-catalog-owner-reconciliation-expand-authority.sql`
- Modify: `scripts/run-database-verification.mjs`
- Modify: `supabase/migration-ledger.json`
- Modify: `docs/architecture/migration-ledger-reconciliation.md`
- Modify hard-coded pending-migration contract tests as required.

**Interfaces:**
- Produces private owner override resolver, unchanged authenticated point-read wrapper, service-role MCP point-read wrapper, private owner-aware V2 search core, unchanged public V2 search wrapper, and service-role MCP V2 search wrapper.

- [ ] Allocate the migration identity only after checking branch head, migration filenames, ledger, and latest applied Production authority.
- [ ] Write RED structural/contract tests for exact pointer integrity, eight-nutrient overlay, zero/null semantics, unchanged public signature, no legacy correction reference, MCP connection derivation, ACLs, and no impersonation/`p_user_id`.
- [ ] Run RED.
- [ ] Implement the additive migration and matching rollback-based verification SQL.
- [ ] Update ledger to five pending/unresolved entries without changing Production counts.
- [ ] Run focused GREEN, chronological replay, DB lint, full verification SQL, ledger check.

### Task 4: Task 14 MCP application wiring

**Files:**
- Modify: `services/nutrition-v1/server/food-library.ts`
- Modify: `services/nutrition-v1/server/personal-overrides.ts`
- Modify: `lib/mcp/nutrition-v1-food-execution.ts`
- Modify: `lib/mcp/nutrition-v1-saved-meal.ts`
- Modify: other MCP execution boundary only if current callers require it.
- Modify/create focused MCP tests.

**Interfaces:**
- Produces `listFoodLibraryForMcp` and `readCurrentPersonalOverrideForMcp`; reuses existing resolved selection/handoff functions.

- [ ] Write RED tests proving connection ID is passed to DB bridges, Catalog authority remains separate, My Food stays exact-owner scoped, and cross-owner/tool owner injection is impossible.
- [ ] Wire search/override reads to connection-derived RPCs and reuse existing resolved-authority selection/handoff logic.
- [ ] Run focused MCP suites GREEN and security regressions.

### Task 5: Dependency rescan, manual Production package, and exact-head verification

**Files:**
- Create: `scripts/report-food-catalog-plan7-db-dependencies.mjs`
- Create: `scripts/report-food-catalog-plan7-db-dependencies.test.mjs`
- Create: `docs/architecture/food-catalog-plan7-task14-production-preflight.md`

- [ ] Add deterministic repository dependency rescan for legacy Food/search/merge/activation/ingestion/recipe/grant/RLS/policy/trigger surfaces; do not retire anything.
- [ ] Add exact read-only Production preflight SQL: Personal Correction count first; favorite classification aggregates second; STOP language for nonzero corrections.
- [ ] Verify privacy export still covers legacy corrections, canonical favorites, Plan 6 revisions/pointers/operations, and member correction payloads.
- [ ] Run full unit/lint/typecheck/script/DB verification relevant to the branch.
- [ ] Open one Draft PR, never request Codex review, and inspect exact-head PR Quality, Phase A Diff Validation, Exercise Detail V2 Runtime QA, and Exercise Library Locale Runtime QA including every PR Quality sub-job.
