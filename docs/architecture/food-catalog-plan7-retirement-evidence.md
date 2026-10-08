# Food Catalog Plan 7 — Retirement Preflight Evidence

**Status:** Task 16 read-only preflight in progress; **no destructive object is approved**
**Captured:** 2026-10-08
**Plaivra Production project:** `bkwezjxvapaeasfvlhvv`
**Deployed consumer-cutover artifact:** `a182923399a41faf5ca7b79d947a992e94cdd27a`
**Production deployment:** `dpl_A3C7RBuxBrFK2j5gSNwgJxoeze7T`

This document is Task 16 evidence only. It does not authorize SQL creation, destructive migration application, compatibility-marker promotion, Food population, generation promotion, Activity Catalog mutation, or Plan 8.

## Task 15 deployed cutover proof

Vercel reports the Production deployment as `READY`, sourced from branch `feat/food-catalog-plan7-production-closure` at exact commit `a182923399a41faf5ca7b79d947a992e94cdd27a`. The deployment owns the Production aliases `plaivra.com`, `app.plaivra.com`, and `www.plaivra.com`.

Read-only runtime proof after the deployment became READY:

- exact deployment `/api/version`: HTTP 200;
- canonical Production `https://plaivra.com/api/version`: HTTP 200;
- both report `commitSha = a182923399a41faf5ca7b79d947a992e94cdd27a`;
- `environment = production`;
- `artifactIdentityValid = true`;
- `releaseReady = true`;
- `migrationLedgerReconciliationState = reconciled`;
- pending / schema-untracked / unresolved = `0 / 0 / 0`;
- expected and live compatibility migration marker remain `20260724232734`;
- `/api/health`: HTTP 200 with the same exact commit;
- Vercel runtime error scan for the post-deploy window returned no runtime errors.

No compatibility marker was promoted as part of deployment.

## Live database state after cutover

Read-only Production inspection after deployment established:

- physical migration records: **128**;
- latest physical migration: `20261008022805_food_catalog_plan7_owner_reconciliation_expand`;
- `current_generation_id = NULL`;
- `pointer_revision = 0`;
- generation count = **0**;
- SearchDocument count = **0**;
- `food_items = 0`;
- `food_barcodes = 0`;
- `food_personal_corrections = 0`;
- `user_food_favorites = 1`;
- `food_favorites = 0`;
- Plan 6 Personal Override pointers = **0**.

Under the authenticated database boundary, canonical Search V2 returned exactly:

`{"items":[],"nextCursor":null}`

and a canonical barcode lookup for a valid GTIN returned no local mapping. The read-only transaction preserved generation/search counts and was rolled back.

## Owner-state disposition

The Task 13 owner-reconciliation classifier was run read-only against the current Production state.

Aggregate result:

- total legacy favorite rows: **1**;
- catalog mappable: **0**;
- catalog already mapped: **0**;
- My Food preserved: **0**;
- legacy text preserved: **0**;
- blocked: **1**;
- personal corrections: **0**.

Diagnostic mode exposed no owner ID or raw favorite key. The only diagnostic row is represented by stable SHA-256 row id:

`36343ec08f3a8e11773e8db42e513bba740fb6371f6faa9d16f878bd7dfb3b1e`

with disposition `blocked` and reason `malformed_key`.

Planner ruling: **`user_food_favorites` is retained owner state for Plan 7 closure**. The blocked row remains preserved exactly as-is; it is not a Plan 7 destructive candidate and does not globally block unrelated independently safe candidates. Catalog favorite authority remains `food_favorites`; My Food / retained legacy semantics remain `user_food_favorites`.

## Live database dependency evidence

Fresh function/view inspection established:

### `public.search_nutrition_food_library(...)`

The legacy function still exists. EXECUTE remains granted to:

- `authenticated`: yes;
- `service_role`: yes;
- `anon`: no.

Repository Product/MCP cutover does not prove that unknown external callers no longer use this still-granted database contract. External/live dependency clearance remains required before it can enter an approved destructive set.

### `food_aliases`

Current rows: **0**.

Live function reference:

- `search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)`.

Live view references: none observed.

Repository portability registry/dependency contracts still preserve this relation as transitional compatibility state. It is not currently retirement-safe.

### `food_market_relevance`

Current rows: **0**.

No live function or view reference was found in the current database scan. Repository portability registry/dependency contracts still preserve the relation, and the frozen Plan 7 policy requires explicit external/reporting/live dependency clearance. That clearance has not been established. Zero rows is not authorization.

### `food_personal_corrections`

Current rows: **0**.

Live function references remain:

- `private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)`;
- `private.nutrition_v1_final_review_core_purge_account_application_data_a(uuid)`;
- `search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)`.

The deployed Product handoff is on Plan 6 Personal Override authority, but the database still carries transitional legacy-correction compatibility and account-deletion dependencies. The table is therefore not retirement-safe yet.

## Repository consumer observation

Current non-historical repository search after the consumer cutover shows:

- `resolveCatalogFood`, `getCatalogVerificationStates`, `searchCatalogFoodsByName`, and `findCatalogDuplicateByName` survive in the dedicated legacy compatibility module and its tests rather than active Product handoffs;
- active `getGlobalFoods` / `getFoodCategories` APIs remain named compatibility-facing service functions, but their implementation uses current Search V2 authority;
- Food handoff no longer reads `food_personal_corrections`;
- barcode behavior uses `food_catalog_lookup_effective_barcode` before provider suggestion;
- recipe verification uses current generation/trust authority;
- portability/privacy contracts still intentionally mention transitional relations until formal retirement.

This is repository evidence only; it does not substitute for live/external dependency clearance.

## Exact-deployed FULL_DR gate — complete

The exact deployed artifact `a182923399a41faf5ca7b79d947a992e94cdd27a` was certified through a manual `workflow_dispatch` on temporary branch `cert/plan7-a1829233-full-dr`, which points exactly to that commit and contains no additional commit.

GitHub Actions run **37734481966**, job **113170815602**, completed **success**. Certification evidence includes:

- exact workflow head `a182923399a41faf5ca7b79d947a992e94cdd27a`;
- `FULL_DR` profile;
- chronological source and clean-target replay;
- **128** migration records in the certification target;
- PostgreSQL 17 target compatibility;
- protected-segment verification;
- restored Search V2 golden matrix with 20 cases;
- service/security isolation verification;
- `restoreVerified = true`;
- `searchVerified = true`;
- `securityVerified = true`;
- `recoveryEligible = true`;
- `drReady = true`.

The certification did not mutate Production.

## Current retirement disposition

The current read-only evidence does **not** support creating destructive SQL.

Known blockers / staged prerequisites include:

1. `food_personal_corrections` is zero-row but remains referenced by current Search V2 and the canonical account-purge implementation in Production;
2. `food_aliases` remains referenced by the retained old search function;
3. the old search function is still executable by authenticated/service-role callers and requires staged contract-disable evidence before any DROP can be reviewed;
4. `food_market_relevance` lacks the required external/reporting/live dependency clearance;
5. root `food_items` retirement candidates still require exact per-column dependency proof and Planner selection.

The blocked `user_food_favorites` row is retained owner state, not a prerequisite to mutate or a candidate to retire.

Accordingly, the Task 16 destructive set remains **not approved**. A separate repository-only non-destructive prerequisite migration, `20261008060000_food_catalog_plan7_retirement_prerequisite.sql`, is pending Planner review. It removes the two current legacy-correction runtime dependencies and revokes runtime EXECUTE on the retained old Search RPC without DROP/CASCADE or owner/catalog data mutation. It is not applied to Production. No Task 17 destructive migration identity is allocated.

## Machine preflight

`scripts/food-catalog-plan7-retirement-preflight.mjs` provides:

- `--emit-sql` for the read-only Production discovery query contract;
- `--evidence <json>` for fail-closed evaluation of deployment, migration, compatibility, owner, repository/live dependency, keep-object, historical-reference, and fresh `FULL_DR` evidence.

The evaluator can identify a clean subset for Planner review while leaving blocked candidates deferred. It always reports:

- `plannerApprovalRequired: true`;
- `destructiveSqlAuthorized: false`;
- `productionMutationAuthorized: false`.

A green preflight is evidence for Planner review only. It never self-authorizes Task 17.
