# Food Catalog Plan 9 — USDA Foundation Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, test-driven-development, systematic-debugging and verification-before-completion to implement task-by-task. Steps use checkboxes (`- [ ]`).

**Goal:** Import, review, activate and publish the approved locked USDA Foundation release to the existing Production canonical Food Catalog, preserving separate data-operation approval gates.

**Architecture:** Reuse Plan 8 source adapter, Plan 4 matching/ingestion commands, existing governance and Plan 3 activation/generation/public search. Add only a deterministic canary selector and a narrow authenticated review authority where verified missing.

**Tech Stack:** Node 24, TypeScript, Vitest, Vite SSR CLI, PostgreSQL 17 / Supabase, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-13-food-catalog-plan9-usda-rollout-design.md`

## Global constraints

- Production Main: `bkwezjxvapaeasfvlhvv`, not Activity project.
- Official 2026-04-30 Foundation ZIP: SHA-256 `186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a` / 469303 bytes.
- Preserve `plan8-1a0-v2`, configured nutrition mapping, exact cross-release NDB identity and null nutrition semantics.
- Migrations authorized after tests/replay; every persistent Production batch, ingestion, activation, and generation promotion requires separately approved evidence.
- No Plan 10, provider expansion, generic SQL importer or second Food Catalog.

## Review focus

- Snapshot changes between QA and DB dry run must invalidate reviewed manifest; test drift rejection.
- 1A1->1A2 with preexisting source identity must preserve canonical ID and prevent fact duplication; test match and idempotent persist.
- Missing-energy/malformed-NDB/negative-carbohydrate rows must stay draft/rejected, never leak into current generation; test search.
- Service role, anon and ordinary members must fail human approval; test authorization and direct-DML prohibition.
- Concurrent review and activation/promotion races must fail stale/CAS requests; test replay and operation-ID conflict.

### Task 1 — Capture live authority and deterministic 1A1

**Files:** `data/food-catalog/source-locks/plan9-1a1-match-index-2026-10-13.json`, `lib/food-catalog/ingestion/usda-foundation/canary.ts`, `canary.test.ts`, `scripts/food-catalog-plan9-1a1.ts`, `scripts/food-catalog-plan9-1a1-runner.mjs`, `.github/workflows/food-catalog-plan9-1a1.yml`.

- [ ] Write red selection tests: category stratification, 60/10/10, source identity and category evidence, shortage fail, shuffled input determinism.
- [ ] Run focused tests; verify red before writing selector.
- [ ] Implement deterministic cohort selector over accepted full-source canonical dry-run results.
- [ ] Verify exact official ZIP bytes/lock, explicit fresh index, manifest/semantic SHA and QA; refuse repository source-dir output.
- [ ] Download verified official release in isolated CI; replay twice and byte-compare; preserve artifact.
- [ ] Run focused ingestion suite and log actual SHA/counts; record that offline QA is not DB dry-run authority.
- [ ] Commit reviewed diff and source/index provenance.

### Task 2 — Narrow human batch review authorization

**Files:** new chronological `supabase/migrations/*food_catalog_plan9_batch_review_authority.sql`, `lib/product/*migration*.test.ts` and focused command-store tests. Do not edit prior migrations.

- [ ] Inspect current database policy pointer, governance capabilities, grants, trigger and migration ledger.
- [ ] Write failing adversarial SQL/privilege tests for unauthorized approval, missing reconciled DB run, stale SHA, operation reuse and concurrent approval.
- [ ] Implement human-only review/approve/reject RPC integrated with governance operations and immutable audit; use exact manifest/semantic/source+count binding.
- [ ] Verify security-definer path, revoke `PUBLIC` and `service_role`, grant only authenticated, enforce real `auth.uid()` and active principal; ensure no privileged generic UPDATE path.
- [ ] Replay clean chronological migrations, verify advisory and restored schema, committed migration and pre-apply recovery checkpoint.
- [ ] Apply migration to **Main Production only** under explicit Plan 9 migration authorization, read back and verify ledger/grants.
- [ ] Report unresolved owner/bootstrap issue separately rather than impersonating a principal.

### Task 3 — Exact 1A1 Production data gates

- [ ] Re-capture matching index and invalidate stale evidence; independently verify first 80 canary decisions.
- [ ] Present exact persistent batch/dry-run approval package; **stop until separately authorized**.
- [ ] Execute approved reconciled DB dry run via existing command, verify actual batch/run/reconciliation and security.
- [ ] Present and obtain exact 1A1 Production draft-ingestion authorization; execute, reconcile and read back stable draft facts.
- [ ] Independently validate eligibility and obtain Activation Set/Grant approval; activate only eligible subset.
- [ ] Build and validate first immutable generation and SearchDocuments; prove NULL-pointer recovery; obtain exact promotion authority and CAS-promote.
- [ ] Verify member-facing service search, correct missing-nutrient display and frozen consumers.

### Task 4 — Full Foundation 1A2 and closure

- [ ] Export new post-canary live match index; rebuild all 363 records including 1A1; verify existing canonical matches and 10 expected source rejects.
- [ ] Repeat independent source/manifest/semantic QA and register/dry-run under exact new authorization.
- [ ] Obtain separate 1A2 draft ingestion approval, execute with lease/reconciliation/idempotency, verify no duplicate source/facts.
- [ ] Obtain exact eligible activation authority, validate next immutable generation, search projection and obtain separate promotion authorization.
- [ ] Verify current pointer, member reads, audits, backup/restore, quality integration, full unit/lint/typecheck/build and exact-head CI.
- [ ] Independent code review and final Planner disposition with exact evidence and only verified claims.

**Status at plan creation:** Implementation branch established; no Food write, batch/run registration, schema migration, activation, generation promotion or Product deployment performed.
